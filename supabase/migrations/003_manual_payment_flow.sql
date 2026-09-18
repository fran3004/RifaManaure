-- ============================================================================
-- MIGRACIÓN 003: FLUJO DEFINITIVO DE PAGO MANUAL POR TRANSFERENCIA BANCARIA
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================

-- 1. Tabla de Cuentas de Pago Oficiales para Transferencias Manuales
CREATE TABLE IF NOT EXISTS public.payment_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name VARCHAR(100) NOT NULL, -- 'Nequi', 'Bancolombia', 'Daviplata', etc.
    account_type VARCHAR(50) DEFAULT 'savings', -- 'savings', 'current', 'digital_wallet'
    account_number VARCHAR(100) NOT NULL,
    account_holder VARCHAR(200) NOT NULL,
    holder_document_id VARCHAR(50),
    qr_code_url TEXT,
    instructions TEXT,
    is_active BOOLEAN DEFAULT true,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Habilitar RLS en payment_accounts
ALTER TABLE public.payment_accounts ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para payment_accounts
DROP POLICY IF EXISTS "Lectura pública de cuentas de pago activas" ON public.payment_accounts;
CREATE POLICY "Lectura pública de cuentas de pago activas" ON public.payment_accounts
    FOR SELECT USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "Administradores pueden gestionar cuentas de pago" ON public.payment_accounts;
CREATE POLICY "Administradores pueden gestionar cuentas de pago" ON public.payment_accounts
    FOR ALL TO authenticated
    USING (public.is_admin());

-- 2. Actualizar Tabla de Órdenes (Columna y Estados de Pago Manual)
-- Agregar columnas adicionales si no existen
ALTER TABLE public.orders 
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
    ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS verified_by UUID;

-- Actualizar restricción de estados para admitir pending_verification y paid
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_status_check;
ALTER TABLE public.orders ADD CONSTRAINT orders_status_check 
    CHECK (status IN ('pending', 'pending_verification', 'paid', 'completed', 'rejected', 'expired', 'cancelled', 'refunded'));

-- Permitir actualización pública de receipt_url y status al subir comprobante
DROP POLICY IF EXISTS "Compradores pueden adjuntar comprobante a su orden" ON public.orders;
CREATE POLICY "Compradores pueden adjuntar comprobante a su orden" ON public.orders
    FOR UPDATE USING (status IN ('pending', 'pending_verification'));

-- 3. Tabla de Auditoría de Acciones Administrativas
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action VARCHAR(100) NOT NULL, -- 'ORDER_APPROVED', 'ORDER_REJECTED', 'TICKET_RELEASE', etc.
    entity_type VARCHAR(50) NOT NULL, -- 'order', 'ticket', 'raffle', 'payment_account'
    entity_id VARCHAR(100) NOT NULL,
    performed_by UUID, -- ID del admin o NULL si es automático del sistema
    details JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Solo administradores pueden consultar bitácora de auditoría" ON public.audit_logs;
CREATE POLICY "Solo administradores pueden consultar bitácora de auditoría" ON public.audit_logs
    FOR SELECT TO authenticated
    USING (public.is_admin());

-- ============================================================================
-- FUNCIONES TRANSACCIONALES BACKEND (SEGURIDAD Y CONCURRENCIA)
-- ============================================================================

-- A. Función para que el comprador envíe su comprobante de pago
CREATE OR REPLACE FUNCTION public.submit_order_receipt(
    p_order_id UUID,
    p_receipt_url TEXT,
    p_payment_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
BEGIN
    -- Bloquear la orden para actualización concurrente
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra especificada no existe.'
        );
    END IF;

    IF v_order.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden ya se encuentra en estado ' || v_order.status || ' y no puede recibir comprobantes.'
        );
    END IF;

    -- Actualizar orden al estado pendiente de verificación
    UPDATE public.orders
    SET receipt_url = p_receipt_url,
        payment_gateway_id = COALESCE(p_payment_reference, payment_gateway_id),
        status = 'pending_verification',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- Asegurar que los tickets sigan asociados a la orden
    UPDATE public.tickets
    SET order_id = p_order_id,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'pending_verification',
        'message', 'Comprobante recibido con éxito. En espera de verificación administrativa.'
    );
END;
$$;

-- B. Función Transaccional Backend: APROBAR PAGO
CREATE OR REPLACE FUNCTION public.approve_order_payment(
    p_order_id UUID,
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_ticket_count INTEGER;
    v_tickets_updated INTEGER;
BEGIN
    -- 1. Bloquear orden a nivel de fila (FOR UPDATE)
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden no existe.'
        );
    END IF;

    IF v_order.status = 'paid' OR v_order.status = 'completed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Esta orden ya fue aprobada previamente.'
        );
    END IF;

    -- 2. Marcar orden como 'paid'
    UPDATE public.orders
    SET status = 'paid',
        verified_at = NOW(),
        verified_by = p_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 3. Marcar todos los tickets asociados a la orden como 'sold' de forma permanente
    UPDATE public.tickets
    SET status = 'sold',
        reservation_expires_at = NULL,
        buyer_id = v_order.buyer_id,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_tickets_updated = ROW_COUNT;

    -- 4. Registrar en la bitácora de auditoría
    INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
    VALUES (
        'ORDER_APPROVED',
        'order',
        p_order_id::TEXT,
        p_admin_id,
        jsonb_build_object(
            'order_reference', v_order.reference,
            'total_amount', v_order.total_amount,
            'tickets_count', v_tickets_updated,
            'buyer_id', v_order.buyer_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'paid',
        'tickets_sold', v_tickets_updated,
        'message', 'Pago aprobado exitosamente. Boletos marcados como vendidos.'
    );
END;
$$;

-- C. Función Transaccional Backend: RECHAZAR PAGO
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Comprobante no coincide con la transferencia bancaria',
    p_admin_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_tickets_released INTEGER;
BEGIN
    -- 1. Bloquear orden a nivel de fila (FOR UPDATE)
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden no existe.'
        );
    END IF;

    IF v_order.status = 'paid' OR v_order.status = 'completed' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No se puede rechazar una orden que ya está marcada como pagada/vendida.'
        );
    END IF;

    -- 2. Marcar orden como 'rejected'
    UPDATE public.orders
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_at = NOW(),
        verified_by = p_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 3. Liberar inmediatamente todos los tickets asociados para que queden 'available'
    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_tickets_released = ROW_COUNT;

    -- 4. Registrar en la bitácora de auditoría
    INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
    VALUES (
        'ORDER_REJECTED',
        'order',
        p_order_id::TEXT,
        p_admin_id,
        jsonb_build_object(
            'order_reference', v_order.reference,
            'rejection_reason', p_reason,
            'tickets_released', v_tickets_released,
            'buyer_id', v_order.buyer_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected',
        'tickets_released', v_tickets_released,
        'message', 'Orden rechazada correctamente. Los boletos han sido liberados y están disponibles nuevamente.'
    );
END;
$$;

-- D. Actualización de release_expired_reservations() para PROTEGER órdenes en pending_verification
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_released_count INTEGER;
BEGIN
    -- Liberar ÚNICAMENTE boletos cuya reserva expiró Y cuya orden NO está en pending_verification ni pagada
    UPDATE public.tickets t
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE t.status = 'reserved'
      AND t.reservation_expires_at < NOW()
      AND (
          t.order_id IS NULL 
          OR EXISTS (
              SELECT 1 FROM public.orders o
              WHERE o.id = t.order_id
                AND o.status = 'pending'
          )
      )
      AND NOT EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = t.order_id
            AND o.status IN ('pending_verification', 'paid', 'completed')
      );

    -- Marcar como expiradas las órdenes que quedaron en pending cuyo tiempo límite expiró
    UPDATE public.orders o
    SET status = 'expired',
        updated_at = NOW()
    WHERE o.status = 'pending'
      AND NOT EXISTS (
          SELECT 1 FROM public.tickets t
          WHERE t.order_id = o.id AND t.status = 'reserved'
      );

    GET DIAGNOSTICS v_released_count = ROW_COUNT;
    RETURN v_released_count;
END;
$$;

-- ============================================================================
-- SEED DATA DE CUENTAS DE PAGO OFICIALES (MANAURE VIVE)
-- ============================================================================
INSERT INTO public.payment_accounts (bank_name, account_type, account_number, account_holder, holder_document_id, instructions, display_order)
VALUES
    ('Nequi', 'digital_wallet', '314 832 9494', 'Manaure Vive Ecoturismo', '901.845.123-1', 'Transferir exactamente el valor total de la orden. Enviar captura legible del comprobante.', 1),
    ('Daviplata', 'digital_wallet', '314 832 9494', 'Manaure Vive Ecoturismo', '901.845.123-1', 'Transferencia directa desde Daviplata o cualquier banco vía PSE/Transfiya.', 2),
    ('Bancolombia', 'savings', '123-456789-00', 'Manaure Vive Ecoturismo SAS', '901.845.123-1', 'Cuenta de Ahorros Bancolombia. Transferencia gratuita desde App Bancolombia.', 3)
ON CONFLICT DO NOTHING;

