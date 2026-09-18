-- ==============================================================================
-- Migración 023: Endurecimiento Integral de Seguridad y Corrección de Linter
-- PLATAFORMA "MANAURE VIVE"
-- ==============================================================================
-- Esta migración resuelve exhaustivamente las advertencias del Supabase Database Linter:
-- 1. function_search_path_mutable: Fija `SET search_path = public, pg_temp` en
--    todas las funciones, triggers y RPCs del sistema.
-- 2. rls_policy_always_true: Elimina las políticas INSERT públicas permisivas (WITH CHECK true)
--    en public.buyers y public.orders, restringiendo la inserción directa a administradores
--    y canalizando las compras de usuarios exclusivamente a través de create_order_secure.
-- 3. public_bucket_allows_listing: Restringe el SELECT en storage.objects para
--    los buckets 'receipts' y 'winner-documents' exclusivamente a administradores,
--    evitando el listado no autorizado del contenido del bucket mientras se
--    mantiene la descarga directa de archivos vía URLs públicas.
-- 4. anon_security_definer_function_executable & authenticated_security_definer_function_executable:
--    Revoca permisos de ejecución a PUBLIC y anon en todas las RPCs administrativas
--    y funciones trigger internas, concediendo acceso únicamente a roles autorizados.
-- ==============================================================================

-- ==============================================================================
-- SECCIÓN 1: CORRECCIÓN DE POLÍTICAS RLS EN TABLAS (rls_policy_always_true)
-- ==============================================================================

-- 1.1 Restringir inserción directa en public.buyers (solo administradores o RPCs con SECURITY DEFINER)
DROP POLICY IF EXISTS "Creación pública de compradores" ON public.buyers;
DROP POLICY IF EXISTS "Compradores pueden registrarse al crear orden" ON public.buyers;
DROP POLICY IF EXISTS "Solo administradores pueden insertar compradores directamente" ON public.buyers;

CREATE POLICY "Solo administradores pueden insertar compradores directamente"
ON public.buyers
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));

-- 1.2 Restringir inserción directa en public.orders (solo administradores o RPCs con SECURITY DEFINER)
DROP POLICY IF EXISTS "Creación pública de órdenes" ON public.orders;
DROP POLICY IF EXISTS "Usuarios pueden crear orden" ON public.orders;
DROP POLICY IF EXISTS "Solo administradores pueden insertar órdenes directamente" ON public.orders;

CREATE POLICY "Solo administradores pueden insertar órdenes directamente"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (public.is_admin(auth.uid()));


-- ==============================================================================
-- SECCIÓN 2: CORRECCIÓN DE POLÍTICAS DE STORAGE (public_bucket_allows_listing)
-- ==============================================================================

-- 2.1 Bucket 'receipts': Eliminar SELECT público amplio y restringir a administradores
DROP POLICY IF EXISTS "Lectura pública de comprobantes" ON storage.objects;
DROP POLICY IF EXISTS "Administradores pueden listar y leer comprobantes" ON storage.objects;

CREATE POLICY "Administradores pueden listar y leer comprobantes"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'receipts' AND public.is_admin(auth.uid())
);

-- 2.2 Bucket 'winner-documents': Eliminar SELECT público amplio y restringir a administradores
DROP POLICY IF EXISTS "Lectura pública de documentos de ganadores" ON storage.objects;
DROP POLICY IF EXISTS "Administradores pueden listar y leer documentos de ganadores" ON storage.objects;

CREATE POLICY "Administradores pueden listar y leer documentos de ganadores"
ON storage.objects
FOR SELECT
TO authenticated
USING (
    bucket_id = 'winner-documents' AND public.is_admin(auth.uid())
);


-- ==============================================================================
-- SECCIÓN 3: FUNCIONES TRIGGER INTERNAS CON search_path SEGURO Y PERMISOS ESTRICTOS
-- ==============================================================================

-- 3.1 Trigger fn_payment_proofs_updated_at
CREATE OR REPLACE FUNCTION public.fn_payment_proofs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_payment_proofs_updated_at() FROM PUBLIC, anon, authenticated;

-- 3.2 Trigger fn_payment_accounts_updated_at
CREATE OR REPLACE FUNCTION public.fn_payment_accounts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_payment_accounts_updated_at() FROM PUBLIC, anon, authenticated;

-- 3.3 Trigger fn_audit_payment_accounts
CREATE OR REPLACE FUNCTION public.fn_audit_payment_accounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_action VARCHAR(100);
    v_details JSONB;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_action := 'PAYMENT_ACCOUNT_CREATED';
        v_details := jsonb_build_object(
            'bank_name', NEW.bank_name,
            'account_type', NEW.account_type,
            'account_number', NEW.account_number,
            'account_holder', NEW.account_holder,
            'is_active', NEW.is_active,
            'display_order', NEW.display_order
        );
        INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
        VALUES (v_action, 'payment_account', NEW.id::TEXT, auth.uid(), v_details);
        RETURN NEW;

    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.is_active IS DISTINCT FROM NEW.is_active THEN
            v_action := CASE WHEN NEW.is_active THEN 'PAYMENT_ACCOUNT_ACTIVATED' ELSE 'PAYMENT_ACCOUNT_DEACTIVATED' END;
        ELSE
            v_action := 'PAYMENT_ACCOUNT_UPDATED';
        END IF;

        v_details := jsonb_build_object(
            'bank_name', NEW.bank_name,
            'account_type', NEW.account_type,
            'account_number', NEW.account_number,
            'account_holder', NEW.account_holder,
            'is_active_old', OLD.is_active,
            'is_active_new', NEW.is_active,
            'display_order', NEW.display_order
        );
        INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
        VALUES (v_action, 'payment_account', NEW.id::TEXT, auth.uid(), v_details);
        RETURN NEW;

    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'PAYMENT_ACCOUNT_DELETED';
        v_details := jsonb_build_object(
            'bank_name', OLD.bank_name,
            'account_number', OLD.account_number,
            'account_holder', OLD.account_holder
        );
        INSERT INTO public.audit_logs (action, entity_type, entity_id, performed_by, details)
        VALUES (v_action, 'payment_account', OLD.id::TEXT, auth.uid(), v_details);
        RETURN OLD;
    END IF;

    RETURN NULL;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_audit_payment_accounts() FROM PUBLIC, anon, authenticated;

-- 3.4 Trigger fn_validate_order_status_transition
CREATE OR REPLACE FUNCTION public.fn_validate_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- REGLA 1: No permitir transición directa de 'pending' a 'paid'/'completed' sin comprobante o referencia
    IF OLD.status = 'pending' AND NEW.status IN ('paid', 'completed') THEN
        IF NEW.receipt_url IS NULL AND NEW.payment_gateway_id IS NULL THEN
            RAISE EXCEPTION 'Transición inválida: No se puede aprobar una orden pendiente sin comprobante o referencia de pago.';
        END IF;
    END IF;

    -- REGLA 2: No permitir revertir una orden 'paid' o 'completed'
    IF OLD.status IN ('paid', 'completed') AND NEW.status IN ('pending', 'pending_verification', 'expired', 'rejected') THEN
        RAISE EXCEPTION 'Integridad violada: Una orden pagada y confirmada (%) no puede retroceder al estado %.', OLD.reference, NEW.status;
    END IF;

    -- REGLA 3: No permitir que órdenes 'expired', 'rejected' o 'cancelled' pasen a 'paid' directamente
    IF OLD.status IN ('expired', 'rejected', 'cancelled') AND NEW.status IN ('paid', 'completed') THEN
        RAISE EXCEPTION 'Integridad violada: Una orden % (%) no puede reactivarse directamente como pagada.', OLD.status, OLD.reference;
    END IF;

    -- Registro en auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        'ORDER_STATUS_' || UPPER(NEW.status),
        'order',
        NEW.id::TEXT,
        NEW.verified_by,
        jsonb_build_object(
            'reference', NEW.reference,
            'previous_status', OLD.status,
            'new_status', NEW.status,
            'total_amount', NEW.total_amount,
            'ticket_count', NEW.ticket_count,
            'rejection_reason', NEW.rejection_reason,
            'receipt_url', NEW.receipt_url
        )
    );

    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_validate_order_status_transition() FROM PUBLIC, anon, authenticated;

-- 3.5 Trigger fn_validate_ticket_status_transition
CREATE OR REPLACE FUNCTION public.fn_validate_ticket_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order_status VARCHAR(50);
BEGIN
    IF OLD.status = NEW.status THEN
        RETURN NEW;
    END IF;

    -- Ningún boleto puede marcarse como 'sold' si la orden no está en 'paid' o 'completed'
    IF NEW.status = 'sold' THEN
        IF NEW.order_id IS NULL THEN
            RAISE EXCEPTION 'Violación de Integridad: No se puede marcar el boleto % como "sold" sin asociarlo a una orden.', NEW.number;
        END IF;

        SELECT status INTO v_order_status
        FROM public.orders
        WHERE id = NEW.order_id;

        IF v_order_status IS NULL OR v_order_status NOT IN ('paid', 'completed') THEN
            RAISE EXCEPTION 'Violación de Seguridad: El boleto % no puede pasar a "sold" porque la orden asociada (%) se encuentra en estado "%". Solo se admite orden en estado "paid".', 
                NEW.number, NEW.order_id, COALESCE(v_order_status, 'inexistente');
        END IF;
    END IF;

    -- Limpiar reservas al volver a 'available'
    IF NEW.status = 'available' THEN
        NEW.reserved_at := NULL;
        NEW.reservation_expires_at := NULL;
        NEW.buyer_id := NULL;
        NEW.order_id := NULL;
    END IF;

    -- Registro en auditoría
    IF NEW.status = 'sold' OR (OLD.status = 'reserved' AND NEW.status = 'available' AND OLD.order_id IS NOT NULL) THEN
        INSERT INTO public.audit_logs (
            action,
            entity_type,
            entity_id,
            performed_by,
            details
        ) VALUES (
            'TICKET_' || UPPER(NEW.status),
            'ticket',
            NEW.id::TEXT,
            NULL,
            jsonb_build_object(
                'ticket_number', NEW.number,
                'previous_status', OLD.status,
                'new_status', NEW.status,
                'order_id', COALESCE(NEW.order_id, OLD.order_id)
            )
        );
    END IF;

    RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fn_validate_ticket_status_transition() FROM PUBLIC, anon, authenticated;

-- 3.6 Trigger sync_admin_user_id
CREATE OR REPLACE FUNCTION public.sync_admin_user_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  UPDATE public.admin_users
  SET user_id = NEW.id,
      updated_at = NOW()
  WHERE LOWER(email) = LOWER(NEW.email)
    AND (user_id IS NULL OR user_id = NEW.id);
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.sync_admin_user_id() FROM PUBLIC, anon, authenticated;


-- ==============================================================================
-- SECCIÓN 4: FUNCIONES DE VERIFICACIÓN DE ROL (is_admin, is_superadmin)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.is_admin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = p_user_id OR LOWER(email) = (SELECT LOWER(email) FROM auth.users WHERE id = p_user_id))
      AND is_active = true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.is_superadmin(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.admin_users
    WHERE (user_id = p_user_id OR LOWER(email) = (SELECT LOWER(email) FROM auth.users WHERE id = p_user_id))
      AND role = 'superadmin'
      AND is_active = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_admin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_superadmin(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_superadmin(UUID) TO authenticated, service_role;

-- ==============================================================================
-- LIMPIEZA DE FUNCIONES OBSOLETAS O REDUNDANTES
-- ==============================================================================
DROP FUNCTION IF EXISTS public.confirm_order_payment(UUID, TEXT, JSONB);
DROP FUNCTION IF EXISTS public.confirm_order_payment(UUID);
DROP FUNCTION IF EXISTS public.confirm_order_payment;
DROP FUNCTION IF EXISTS public.submit_order_receipt(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.submit_order_receipt(UUID, TEXT, VARCHAR);
DROP FUNCTION IF EXISTS public.submit_order_receipt(UUID, TEXT);
DROP FUNCTION IF EXISTS public.rls_auto_enable() CASCADE;


-- ==============================================================================
-- SECCIÓN 5: RPCS ADMINISTRATIVAS (HARDENING search_path + REVOKE/GRANT)
-- ==============================================================================

-- 5.1 admin_block_ticket
CREATE OR REPLACE FUNCTION public.admin_block_ticket(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT 'Bloqueado preventivamente por administración'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ticket RECORD;
    v_order RECORD;
    v_admin_uid UUID := auth.uid();
BEGIN
    IF NOT public.is_admin(v_admin_uid) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: Se requieren privilegios de administrador.'
        );
    END IF;

    IF p_reason IS NULL OR TRIM(p_reason) = '' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Debe especificar un motivo claro para bloquear el boleto.'
        );
    END IF;

    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto especificado no existe.'
        );
    END IF;

    IF v_ticket.status = 'sold' THEN
        IF v_ticket.order_id IS NOT NULL THEN
            SELECT * INTO v_order
            FROM public.orders
            WHERE id = v_ticket.order_id;

            IF v_order.status IN ('paid', 'completed') THEN
                RETURN jsonb_build_object(
                    'success', false,
                    'error', 'Acción bloqueada: No se puede modificar o bloquear un boleto ya vendido con orden pagada (' || v_order.reference || ').'
                );
            END IF;
        ELSE
            RETURN jsonb_build_object(
                'success', false,
                'error', 'Acción bloqueada: No se puede bloquear un boleto marcado como vendido.'
            );
        END IF;
    END IF;

    IF v_ticket.status = 'blocked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto número ' || v_ticket.number || ' ya se encuentra bloqueado.'
        );
    END IF;

    UPDATE public.tickets
    SET
        status = 'blocked',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        'TICKET_BLOCKED_BY_ADMIN',
        'ticket',
        p_ticket_id::TEXT,
        v_admin_uid,
        jsonb_build_object(
            'ticket_number', v_ticket.number,
            'previous_status', v_ticket.status,
            'new_status', 'blocked',
            'reason', TRIM(p_reason),
            'previous_order_id', v_ticket.order_id,
            'previous_buyer_id', v_ticket.buyer_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Boleto ' || v_ticket.number || ' bloqueado exitosamente.',
        'ticket_number', v_ticket.number
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_block_ticket(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_block_ticket(UUID, TEXT) TO authenticated, service_role;

-- 5.2 admin_unblock_ticket
CREATE OR REPLACE FUNCTION public.admin_unblock_ticket(
    p_ticket_id UUID,
    p_reason TEXT DEFAULT 'Desbloqueado por administración para habilitar venta'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_ticket RECORD;
    v_admin_uid UUID := auth.uid();
BEGIN
    IF NOT public.is_admin(v_admin_uid) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: Se requieren privilegios de administrador.'
        );
    END IF;

    SELECT * INTO v_ticket
    FROM public.tickets
    WHERE id = p_ticket_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto especificado no existe.'
        );
    END IF;

    IF v_ticket.status != 'blocked' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto número ' || v_ticket.number || ' no está bloqueado (estado actual: ' || v_ticket.status || ').'
        );
    END IF;

    UPDATE public.tickets
    SET
        status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE id = p_ticket_id;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details
    ) VALUES (
        'TICKET_UNBLOCKED_BY_ADMIN',
        'ticket',
        p_ticket_id::TEXT,
        v_admin_uid,
        jsonb_build_object(
            'ticket_number', v_ticket.number,
            'previous_status', 'blocked',
            'new_status', 'available',
            'reason', TRIM(p_reason)
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'message', 'Boleto ' || v_ticket.number || ' desbloqueado y disponible para la venta.',
        'ticket_number', v_ticket.number
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_unblock_ticket(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_unblock_ticket(UUID, TEXT) TO authenticated, service_role;

-- 5.3 admin_create_raffle
CREATE OR REPLACE FUNCTION public.admin_create_raffle(
    p_title TEXT,
    p_slug TEXT,
    p_description TEXT,
    p_ticket_price NUMERIC,
    p_total_tickets INTEGER,
    p_max_tickets_per_buyer INTEGER,
    p_draw_date TIMESTAMPTZ,
    p_lottery_reference TEXT,
    p_status TEXT DEFAULT 'draft'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_new_raffle public.raffles%ROWTYPE;
    v_title_clean VARCHAR(255);
    v_slug_clean VARCHAR(100);
    v_desc_clean TEXT;
    v_lottery_clean VARCHAR(150);
    v_pad_length INTEGER := 3;
BEGIN
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden crear rifas.'
        );
    END IF;

    v_title_clean := NULLIF(TRIM(p_title), '');
    v_slug_clean := LOWER(TRIM(COALESCE(p_slug, '')));
    v_desc_clean := NULLIF(TRIM(p_description), '');
    v_lottery_clean := NULLIF(TRIM(p_lottery_reference), '');

    IF v_title_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El título de la rifa es obligatorio.');
    END IF;

    IF v_slug_clean = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El identificador slug es obligatorio.');
    END IF;

    IF v_desc_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La descripción del premio es obligatoria.');
    END IF;

    IF v_lottery_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La lotería de referencia es obligatoria.');
    END IF;

    IF p_ticket_price IS NULL OR p_ticket_price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El precio del boleto debe ser mayor a 0 COP.');
    END IF;

    IF p_total_tickets IS NULL OR p_total_tickets < 10 OR p_total_tickets > 10000 THEN
        RETURN jsonb_build_object('success', false, 'error', 'La emisión total de boletos debe estar entre 10 y 10.000 boletos.');
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El límite de boletos por comprador debe ser mayor a 0.');
    END IF;

    IF p_draw_date IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La fecha del sorteo es obligatoria.');
    END IF;

    IF p_status NOT IN ('draft', 'active', 'paused', 'closed', 'finished') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estado de rifa inválido.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.raffles WHERE slug = v_slug_clean) THEN
        RETURN jsonb_build_object('success', false, 'error', 'Ya existe una rifa con el slug especificado: ' || v_slug_clean);
    END IF;

    IF p_status = 'active' THEN
        UPDATE public.raffles
        SET status = 'paused',
            updated_at = NOW()
        WHERE status = 'active';
    END IF;

    INSERT INTO public.raffles (
        title,
        slug,
        description,
        ticket_price,
        total_tickets,
        max_tickets_per_buyer,
        draw_date,
        lottery_reference,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_title_clean,
        v_slug_clean,
        v_desc_clean,
        p_ticket_price,
        p_total_tickets,
        p_max_tickets_per_buyer,
        p_draw_date,
        v_lottery_clean,
        p_status,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_new_raffle;

    IF p_total_tickets > 1000 THEN
        v_pad_length := 4;
    ELSE
        v_pad_length := 3;
    END IF;

    INSERT INTO public.tickets (raffle_id, number, status)
    SELECT
        v_new_raffle.id,
        LPAD(s::TEXT, v_pad_length, '0'),
        'available'
    FROM generate_series(0, p_total_tickets - 1) AS s
    ON CONFLICT (raffle_id, number) DO NOTHING;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'RAFFLE_CREATED',
        'raffles',
        v_new_raffle.id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'title', v_new_raffle.title,
            'slug', v_new_raffle.slug,
            'ticket_price', v_new_raffle.ticket_price,
            'total_tickets', v_new_raffle.total_tickets,
            'draw_date', v_new_raffle.draw_date,
            'lottery_reference', v_new_raffle.lottery_reference,
            'status', v_new_raffle.status,
            'created_by_admin', v_admin_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'raffle', jsonb_build_object(
            'id', v_new_raffle.id,
            'title', v_new_raffle.title,
            'slug', v_new_raffle.slug,
            'description', v_new_raffle.description,
            'ticket_price', v_new_raffle.ticket_price,
            'total_tickets', v_new_raffle.total_tickets,
            'max_tickets_per_buyer', v_new_raffle.max_tickets_per_buyer,
            'draw_date', v_new_raffle.draw_date,
            'lottery_reference', v_new_raffle.lottery_reference,
            'status', v_new_raffle.status,
            'created_at', v_new_raffle.created_at
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_create_raffle(TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_create_raffle(TEXT, TEXT, TEXT, NUMERIC, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TEXT) TO authenticated, service_role;

-- 5.4 admin_update_raffle
CREATE OR REPLACE FUNCTION public.admin_update_raffle(
    p_raffle_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_ticket_price NUMERIC,
    p_draw_date TIMESTAMPTZ,
    p_lottery_reference TEXT,
    p_status TEXT,
    p_max_tickets_per_buyer INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_old_raffle public.raffles%ROWTYPE;
    v_new_raffle public.raffles%ROWTYPE;
    v_title_clean VARCHAR(255);
    v_desc_clean TEXT;
    v_lottery_clean VARCHAR(150);
BEGIN
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden modificar rifas.'
        );
    END IF;

    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El ID de la rifa es obligatorio.');
    END IF;

    v_title_clean := NULLIF(TRIM(p_title), '');
    v_desc_clean := NULLIF(TRIM(p_description), '');
    v_lottery_clean := NULLIF(TRIM(p_lottery_reference), '');

    IF v_title_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El título de la rifa no puede estar vacío.');
    END IF;

    IF v_desc_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La descripción del premio no puede estar vacía.');
    END IF;

    IF v_lottery_clean IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La lotería de referencia es obligatoria.');
    END IF;

    IF p_ticket_price IS NULL OR p_ticket_price <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El precio del boleto debe ser mayor a 0 COP.');
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'El límite máximo de boletos por comprador debe ser mayor a 0.');
    END IF;

    IF p_draw_date IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'La fecha del sorteo es obligatoria.');
    END IF;

    IF p_status NOT IN ('draft', 'active', 'paused', 'closed', 'finished') THEN
        RETURN jsonb_build_object('success', false, 'error', 'Estado de rifa inválido. Permitidos: draft, active, paused, closed, finished.');
    END IF;

    SELECT * INTO v_old_raffle
    FROM public.raffles
    WHERE id = p_raffle_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe en el sistema.');
    END IF;

    IF p_status = 'active' AND v_old_raffle.status <> 'active' THEN
        UPDATE public.raffles
        SET status = 'paused',
            updated_at = NOW()
        WHERE id <> p_raffle_id AND status = 'active';
    END IF;

    UPDATE public.raffles
    SET title = v_title_clean,
        description = v_desc_clean,
        ticket_price = p_ticket_price,
        draw_date = p_draw_date,
        lottery_reference = v_lottery_clean,
        status = p_status,
        max_tickets_per_buyer = p_max_tickets_per_buyer,
        updated_at = NOW()
    WHERE id = p_raffle_id
    RETURNING * INTO v_new_raffle;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'RAFFLE_UPDATED',
        'raffles',
        p_raffle_id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'previous_values', jsonb_build_object(
                'title', v_old_raffle.title,
                'ticket_price', v_old_raffle.ticket_price,
                'draw_date', v_old_raffle.draw_date,
                'lottery_reference', v_old_raffle.lottery_reference,
                'status', v_old_raffle.status,
                'max_tickets_per_buyer', v_old_raffle.max_tickets_per_buyer
            ),
            'new_values', jsonb_build_object(
                'title', v_new_raffle.title,
                'ticket_price', v_new_raffle.ticket_price,
                'draw_date', v_new_raffle.draw_date,
                'lottery_reference', v_new_raffle.lottery_reference,
                'status', v_new_raffle.status,
                'max_tickets_per_buyer', v_new_raffle.max_tickets_per_buyer
            ),
            'updated_by_admin', v_admin_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'raffle', jsonb_build_object(
            'id', v_new_raffle.id,
            'title', v_new_raffle.title,
            'slug', v_new_raffle.slug,
            'description', v_new_raffle.description,
            'ticket_price', v_new_raffle.ticket_price,
            'total_tickets', v_new_raffle.total_tickets,
            'max_tickets_per_buyer', v_new_raffle.max_tickets_per_buyer,
            'draw_date', v_new_raffle.draw_date,
            'lottery_reference', v_new_raffle.lottery_reference,
            'status', v_new_raffle.status,
            'updated_at', v_new_raffle.updated_at
        )
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_raffle(UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, INTEGER) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_raffle(UUID, TEXT, TEXT, NUMERIC, TIMESTAMPTZ, TEXT, TEXT, INTEGER) TO authenticated, service_role;

-- 5.5 admin_update_buyer
CREATE OR REPLACE FUNCTION public.admin_update_buyer(
    p_buyer_id UUID,
    p_full_name TEXT,
    p_phone TEXT,
    p_email TEXT,
    p_city TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_buyer RECORD;
    v_clean_name TEXT;
    v_clean_phone TEXT;
    v_clean_email TEXT;
    v_clean_city TEXT;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: se requieren privilegios de administrador.'
        );
    END IF;

    v_clean_name  := TRIM(COALESCE(p_full_name, ''));
    v_clean_phone := TRIM(COALESCE(p_phone, ''));
    v_clean_email := LOWER(TRIM(COALESCE(p_email, '')));
    v_clean_city  := TRIM(COALESCE(p_city, ''));

    IF v_clean_name = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El nombre completo es obligatorio.');
    END IF;

    IF v_clean_phone = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El número de teléfono es obligatorio.');
    END IF;

    IF v_clean_email = '' OR v_clean_email NOT LIKE '%_@_%._%' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El correo electrónico suministrado no tiene un formato válido.');
    END IF;

    IF v_clean_city = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El municipio o ciudad es obligatorio.');
    END IF;

    SELECT * INTO v_buyer
    FROM public.buyers
    WHERE id = p_buyer_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El comprador especificado no existe en la base de datos.'
        );
    END IF;

    UPDATE public.buyers
    SET full_name = v_clean_name,
        phone = v_clean_phone,
        email = v_clean_email,
        city = v_clean_city,
        updated_at = NOW()
    WHERE id = p_buyer_id;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'BUYER_UPDATED',
        'buyers',
        p_buyer_id::TEXT,
        auth.uid(),
        jsonb_build_object(
            'document_id', v_buyer.document_id,
            'old_full_name', v_buyer.full_name,
            'new_full_name', v_clean_name,
            'old_phone', v_buyer.phone,
            'new_phone', v_clean_phone,
            'old_email', v_buyer.email,
            'new_email', v_clean_email,
            'old_city', v_buyer.city,
            'new_city', v_clean_city
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'buyer_id', p_buyer_id,
        'full_name', v_clean_name,
        'document_id', v_buyer.document_id,
        'phone', v_clean_phone,
        'email', v_clean_email,
        'city', v_clean_city
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_buyer(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_buyer(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

-- 5.6 admin_update_system_settings
CREATE OR REPLACE FUNCTION public.admin_update_system_settings(
    p_reservation_duration_minutes INTEGER,
    p_max_tickets_per_buyer INTEGER,
    p_support_whatsapp_number TEXT,
    p_support_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_old_settings public.system_settings%ROWTYPE;
    v_new_settings public.system_settings%ROWTYPE;
    v_whatsapp_clean VARCHAR(30);
    v_email_clean VARCHAR(150);
BEGIN
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden modificar los parámetros del sistema.'
        );
    END IF;

    IF p_reservation_duration_minutes IS NULL OR p_reservation_duration_minutes < 1 OR p_reservation_duration_minutes > 120 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El tiempo de reserva debe estar comprendido entre 1 y 120 minutos.'
        );
    END IF;

    IF p_max_tickets_per_buyer IS NULL OR p_max_tickets_per_buyer < 1 OR p_max_tickets_per_buyer > 1000 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El límite de boletos por comprador debe estar comprendido entre 1 y 1.000 boletos.'
        );
    END IF;

    v_whatsapp_clean := NULLIF(TRIM(p_support_whatsapp_number), '');
    v_email_clean := NULLIF(LOWER(TRIM(p_support_email)), '');

    SELECT * INTO v_old_settings
    FROM public.system_settings
    WHERE id = 1
    FOR UPDATE;

    INSERT INTO public.system_settings (
        id,
        reservation_duration_minutes,
        max_tickets_per_buyer,
        support_whatsapp_number,
        support_email,
        updated_at,
        updated_by
    ) VALUES (
        1,
        p_reservation_duration_minutes,
        p_max_tickets_per_buyer,
        v_whatsapp_clean,
        v_email_clean,
        NOW(),
        v_admin_id
    )
    ON CONFLICT (id) DO UPDATE SET
        reservation_duration_minutes = EXCLUDED.reservation_duration_minutes,
        max_tickets_per_buyer = EXCLUDED.max_tickets_per_buyer,
        support_whatsapp_number = EXCLUDED.support_whatsapp_number,
        support_email = EXCLUDED.support_email,
        updated_at = NOW(),
        updated_by = v_admin_id
    RETURNING * INTO v_new_settings;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'SYSTEM_SETTINGS_UPDATED',
        'system_settings',
        '1',
        v_admin_id,
        jsonb_build_object(
            'previous_values', jsonb_build_object(
                'reservation_duration_minutes', v_old_settings.reservation_duration_minutes,
                'max_tickets_per_buyer', v_old_settings.max_tickets_per_buyer,
                'support_whatsapp_number', v_old_settings.support_whatsapp_number,
                'support_email', v_old_settings.support_email
            ),
            'new_values', jsonb_build_object(
                'reservation_duration_minutes', v_new_settings.reservation_duration_minutes,
                'max_tickets_per_buyer', v_new_settings.max_tickets_per_buyer,
                'support_whatsapp_number', v_new_settings.support_whatsapp_number,
                'support_email', v_new_settings.support_email
            )
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'settings', jsonb_build_object(
            'id', v_new_settings.id,
            'reservation_duration_minutes', v_new_settings.reservation_duration_minutes,
            'max_tickets_per_buyer', v_new_settings.max_tickets_per_buyer,
            'support_whatsapp_number', v_new_settings.support_whatsapp_number,
            'support_email', v_new_settings.support_email,
            'updated_at', v_new_settings.updated_at,
            'updated_by', v_new_settings.updated_by
        ),
        'message', 'Parámetros del sistema actualizados exitosamente.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_system_settings(INTEGER, INTEGER, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_update_system_settings(INTEGER, INTEGER, TEXT, TEXT) TO authenticated, service_role;

-- 5.7 approve_order_payment
CREATE OR REPLACE FUNCTION public.approve_order_payment(
    p_order_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_updated_tickets_count INTEGER;
    v_admin_id UUID;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador';
    END IF;

    v_admin_id := auth.uid();

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra no existe.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden ya se encuentra aprobada y pagada anteriormente.'
        );
    END IF;

    UPDATE public.orders
    SET status = 'paid',
        verified_at = NOW(),
        verified_by = v_admin_id,
        rejection_reason = NULL,
        updated_at = NOW()
    WHERE id = p_order_id;

    UPDATE public.payment_proofs
    SET status = 'approved',
        verified_by = v_admin_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    UPDATE public.tickets
    SET status = 'sold',
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    GET DIAGNOSTICS v_updated_tickets_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'paid',
        'tickets_sold_count', v_updated_tickets_count,
        'message', 'Pago aprobado con éxito. Boletos marcados como vendidos definitivamente.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.approve_order_payment(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_order_payment(UUID) TO authenticated, service_role;

-- 5.8 reject_order_payment
CREATE OR REPLACE FUNCTION public.reject_order_payment(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Comprobante no válido o transferencia no confirmada'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_released_tickets_count INTEGER;
    v_admin_id UUID;
BEGIN
    IF NOT public.is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Acceso denegado: se requiere rol de administrador';
    END IF;

    v_admin_id := auth.uid();

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra no existe.'
        );
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Una orden que ya fue pagada no puede ser rechazada arbitrariamente.'
        );
    END IF;

    UPDATE public.orders
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_at = NOW(),
        verified_by = v_admin_id,
        updated_at = NOW()
    WHERE id = p_order_id;

    UPDATE public.payment_proofs
    SET status = 'rejected',
        rejection_reason = p_reason,
        verified_by = v_admin_id,
        verified_at = NOW(),
        updated_at = NOW()
    WHERE order_id = p_order_id;

    UPDATE public.tickets
    SET status = 'available',
        buyer_id = NULL,
        order_id = NULL,
        reserved_at = NULL,
        reservation_expires_at = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    GET DIAGNOSTICS v_released_tickets_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'rejected',
        'released_tickets_count', v_released_tickets_count,
        'message', 'Pago rechazado. Boletos liberados y disponibles para la venta.'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.reject_order_payment(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_order_payment(UUID, TEXT) TO authenticated, service_role;

-- 5.9 register_winner
CREATE OR REPLACE FUNCTION public.register_winner(
    p_raffle_id UUID,
    p_ticket_number TEXT,
    p_lottery_draw_number TEXT,
    p_draw_date TIMESTAMPTZ DEFAULT NOW(),
    p_official_act_url TEXT DEFAULT NULL,
    p_delivery_photos TEXT[] DEFAULT '{}',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_admin_id UUID := auth.uid();
    v_ticket RECORD;
    v_buyer_id UUID;
    v_order_id UUID;
    v_winner public.winners%ROWTYPE;
    v_raffle_title TEXT;
    v_clean_ticket_number TEXT;
    v_clean_lottery_number TEXT;
BEGIN
    IF v_admin_id IS NULL OR NOT public.is_admin(v_admin_id) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Acceso denegado: solo administradores autorizados pueden registrar ganadores.'
        );
    END IF;

    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El ID de la rifa es obligatorio.');
    END IF;

    v_clean_ticket_number := TRIM(COALESCE(p_ticket_number, ''));
    IF v_clean_ticket_number = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El número del boleto ganador es obligatorio.');
    END IF;

    v_clean_lottery_number := TRIM(COALESCE(p_lottery_draw_number, ''));
    IF v_clean_lottery_number = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El número de sorteo de la lotería oficial es obligatorio.');
    END IF;

    SELECT title INTO v_raffle_title
    FROM public.raffles
    WHERE id = p_raffle_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe.');
    END IF;

    SELECT 
        t.id AS ticket_id,
        t.number AS ticket_number,
        t.status AS ticket_status,
        t.order_id AS ticket_order_id,
        t.buyer_id AS ticket_buyer_id,
        o.id AS order_id,
        o.buyer_id AS order_buyer_id,
        o.reference AS order_reference,
        o.status AS order_status,
        b.id AS buyer_id,
        b.full_name AS buyer_name,
        b.document_id AS buyer_document,
        b.phone AS buyer_phone,
        b.email AS buyer_email,
        b.city AS buyer_city
    INTO v_ticket
    FROM public.tickets t
    LEFT JOIN public.orders o ON o.id = t.order_id
    LEFT JOIN public.buyers b ON b.id = COALESCE(t.buyer_id, o.buyer_id)
    WHERE t.raffle_id = p_raffle_id 
      AND (t.number = v_clean_ticket_number OR t.number = LPAD(v_clean_ticket_number, 3, '0'))
    FOR UPDATE OF t;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El número de boleto "' || v_clean_ticket_number || '" no existe en la emisión de esta rifa.'
        );
    END IF;

    IF v_ticket.ticket_status <> 'sold' THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El boleto "' || v_ticket.ticket_number || '" no puede registrarse como ganador porque no está vendido (Estado actual: ' || v_ticket.ticket_status || '). Solo boletos con pago confirmado pueden ser ganadores.'
        );
    END IF;

    v_order_id := COALESCE(v_ticket.ticket_order_id, v_ticket.order_id);
    v_buyer_id := COALESCE(v_ticket.ticket_buyer_id, v_ticket.order_buyer_id, v_ticket.buyer_id);

    IF v_order_id IS NULL OR v_buyer_id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'No se encontró la orden de compra o los datos del comprador vinculados a este boleto.'
        );
    END IF;

    INSERT INTO public.winners (
        raffle_id,
        order_id,
        buyer_id,
        ticket_id,
        ticket_number,
        lottery_draw_number,
        draw_date,
        official_act_url,
        delivery_photos,
        notes,
        registered_by,
        created_at,
        updated_at
    ) VALUES (
        p_raffle_id,
        v_order_id,
        v_buyer_id,
        v_ticket.ticket_id,
        v_ticket.ticket_number,
        v_clean_lottery_number,
        COALESCE(p_draw_date, NOW()),
        NULLIF(TRIM(p_official_act_url), ''),
        COALESCE(p_delivery_photos, '{}'),
        NULLIF(TRIM(p_notes), ''),
        v_admin_id,
        NOW(),
        NOW()
    )
    RETURNING * INTO v_winner;

    UPDATE public.raffles
    SET status = 'finished',
        updated_at = NOW()
    WHERE id = p_raffle_id;

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        performed_by,
        details,
        created_at
    ) VALUES (
        'WINNER_REGISTERED',
        'winners',
        v_winner.id::TEXT,
        v_admin_id,
        jsonb_build_object(
            'raffle_id', p_raffle_id,
            'raffle_title', v_raffle_title,
            'ticket_number', v_ticket.ticket_number,
            'lottery_draw_number', v_clean_lottery_number,
            'buyer_id', v_buyer_id,
            'buyer_name', v_ticket.buyer_name,
            'buyer_document', v_ticket.buyer_document,
            'order_id', v_order_id,
            'order_reference', v_ticket.order_reference,
            'draw_date', v_winner.draw_date,
            'official_act_url', v_winner.official_act_url,
            'registered_by_admin', v_admin_id
        ),
        NOW()
    );

    RETURN jsonb_build_object(
        'success', true,
        'winner_id', v_winner.id,
        'ticket_number', v_winner.ticket_number,
        'lottery_draw_number', v_winner.lottery_draw_number,
        'draw_date', v_winner.draw_date,
        'buyer_name', v_ticket.buyer_name,
        'buyer_document', v_ticket.buyer_document,
        'order_reference', v_ticket.order_reference,
        'message', '¡Ganador registrado exitosamente con toda su evidencia!'
    );
END;
$$;

REVOKE ALL ON FUNCTION public.register_winner(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT[], TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_winner(UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT[], TEXT) TO authenticated, service_role;


-- ==============================================================================
-- SECCIÓN 6: RPCS PÚBLICAS CLIENTE (search_path SEGURO + PERMISOS PÚBLICOS)
-- ==============================================================================

-- 6.1 verify_public_order_or_tickets
CREATE OR REPLACE FUNCTION public.verify_public_order_or_tickets(p_search_term TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_term TEXT;
    v_is_reference BOOLEAN;
    v_is_numeric BOOLEAN;
    v_results JSONB := '[]'::jsonb;
BEGIN
    v_clean_term := TRIM(p_search_term);
    
    IF v_clean_term IS NULL OR v_clean_term = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'El término de búsqueda no puede estar vacío.', 'orders', '[]'::jsonb);
    END IF;

    v_is_reference := (UPPER(v_clean_term) LIKE 'MV-%' OR v_clean_term ~* '[A-Z]');
    v_is_numeric := (v_clean_term ~ '^[0-9]+$');

    IF v_is_reference THEN
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', o.id,
                    'reference', o.reference,
                    'status', o.status,
                    'createdAt', o.created_at,
                    'totalAmount', o.total_amount,
                    'ticketCount', o.ticket_count,
                    'rejectionReason', CASE WHEN o.status = 'rejected' THEN o.rejection_reason ELSE NULL END,
                    'maskedBuyerName', CASE 
                        WHEN b.full_name IS NULL OR b.full_name = '' THEN 'Comprador'
                        WHEN position(' ' in TRIM(b.full_name)) > 0 THEN 
                            split_part(TRIM(b.full_name), ' ', 1) || ' ' || substring(split_part(TRIM(b.full_name), ' ', 2) from 1 for 1) || '.'
                        ELSE 
                            TRIM(b.full_name)
                    END,
                    'maskedDocumentId', CASE
                        WHEN b.document_id IS NULL OR length(TRIM(b.document_id)) <= 4 THEN '***'
                        WHEN length(TRIM(b.document_id)) <= 6 THEN 
                            substring(TRIM(b.document_id) from 1 for 2) || '***' || substring(TRIM(b.document_id) from length(TRIM(b.document_id)) for 1)
                        ELSE
                            substring(TRIM(b.document_id) from 1 for 4) || '***' || substring(TRIM(b.document_id) from length(TRIM(b.document_id)) - 1 for 2)
                    END,
                    'raffle', jsonb_build_object(
                        'title', r.title,
                        'drawDate', r.draw_date,
                        'lotteryReference', r.lottery_reference
                    ),
                    'tickets', (
                        SELECT COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'number', t.number,
                                    'status', t.status
                                ) ORDER BY t.number ASC
                            ),
                            '[]'::jsonb
                        )
                        FROM public.tickets t
                        WHERE t.order_id = o.id
                    )
                ) ORDER BY o.created_at DESC
            ),
            '[]'::jsonb
        ) INTO v_results
        FROM public.orders o
        LEFT JOIN public.buyers b ON b.id = o.buyer_id
        LEFT JOIN public.raffles r ON r.id = o.raffle_id
        WHERE o.reference ILIKE '%' || v_clean_term || '%'
        LIMIT 5;

    ELSIF v_is_numeric THEN
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', o.id,
                    'reference', o.reference,
                    'status', o.status,
                    'createdAt', o.created_at,
                    'totalAmount', o.total_amount,
                    'ticketCount', o.ticket_count,
                    'rejectionReason', CASE WHEN o.status = 'rejected' THEN o.rejection_reason ELSE NULL END,
                    'maskedBuyerName', CASE 
                        WHEN b.full_name IS NULL OR b.full_name = '' THEN 'Comprador'
                        WHEN position(' ' in TRIM(b.full_name)) > 0 THEN 
                            split_part(TRIM(b.full_name), ' ', 1) || ' ' || substring(split_part(TRIM(b.full_name), ' ', 2) from 1 for 1) || '.'
                        ELSE 
                            TRIM(b.full_name)
                    END,
                    'maskedDocumentId', CASE
                        WHEN b.document_id IS NULL OR length(TRIM(b.document_id)) <= 4 THEN '***'
                        WHEN length(TRIM(b.document_id)) <= 6 THEN 
                            substring(TRIM(b.document_id) from 1 for 2) || '***' || substring(TRIM(b.document_id) from length(TRIM(b.document_id)) for 1)
                        ELSE
                            substring(TRIM(b.document_id) from 1 for 4) || '***' || substring(TRIM(b.document_id) from length(TRIM(b.document_id)) - 1 for 2)
                    END,
                    'raffle', jsonb_build_object(
                        'title', r.title,
                        'drawDate', r.draw_date,
                        'lotteryReference', r.lottery_reference
                    ),
                    'tickets', (
                        SELECT COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'number', t.number,
                                    'status', t.status
                                ) ORDER BY t.number ASC
                            ),
                            '[]'::jsonb
                        )
                        FROM public.tickets t
                        WHERE t.order_id = o.id
                    )
                ) ORDER BY o.created_at DESC
            ),
            '[]'::jsonb
        ) INTO v_results
        FROM public.orders o
        JOIN public.buyers b ON b.id = o.buyer_id
        LEFT JOIN public.raffles r ON r.id = o.raffle_id
        WHERE b.document_id = v_clean_term
        LIMIT 10;
    ELSE
        SELECT COALESCE(
            jsonb_agg(
                jsonb_build_object(
                    'id', o.id,
                    'reference', o.reference,
                    'status', o.status,
                    'createdAt', o.created_at,
                    'totalAmount', o.total_amount,
                    'ticketCount', o.ticket_count,
                    'rejectionReason', CASE WHEN o.status = 'rejected' THEN o.rejection_reason ELSE NULL END,
                    'maskedBuyerName', CASE 
                        WHEN b.full_name IS NULL OR b.full_name = '' THEN 'Comprador'
                        WHEN position(' ' in TRIM(b.full_name)) > 0 THEN 
                            split_part(TRIM(b.full_name), ' ', 1) || ' ' || substring(split_part(TRIM(b.full_name), ' ', 2) from 1 for 1) || '.'
                        ELSE 
                            TRIM(b.full_name)
                    END,
                    'maskedDocumentId', CASE
                        WHEN b.document_id IS NULL OR length(TRIM(b.document_id)) <= 4 THEN '***'
                        WHEN length(TRIM(b.document_id)) <= 6 THEN 
                            substring(TRIM(b.document_id) from 1 for 2) || '***' || substring(TRIM(b.document_id) from length(TRIM(b.document_id)) for 1)
                        ELSE
                            substring(TRIM(b.document_id) from 1 for 4) || '***' || substring(TRIM(b.document_id) from length(TRIM(b.document_id)) - 1 for 2)
                    END,
                    'raffle', jsonb_build_object(
                        'title', r.title,
                        'drawDate', r.draw_date,
                        'lotteryReference', r.lottery_reference
                    ),
                    'tickets', (
                        SELECT COALESCE(
                            jsonb_agg(
                                jsonb_build_object(
                                    'number', t.number,
                                    'status', t.status
                                ) ORDER BY t.number ASC
                            ),
                            '[]'::jsonb
                        )
                        FROM public.tickets t
                        WHERE t.order_id = o.id
                    )
                ) ORDER BY o.created_at DESC
            ),
            '[]'::jsonb
        ) INTO v_results
        FROM public.orders o
        LEFT JOIN public.buyers b ON b.id = o.buyer_id
        LEFT JOIN public.raffles r ON r.id = o.raffle_id
        WHERE o.reference ILIKE '%' || v_clean_term || '%'
        LIMIT 5;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'searchTerm', v_clean_term,
        'searchedBy', CASE WHEN v_is_reference THEN 'reference' ELSE 'document' END,
        'orders', v_results
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_public_order_or_tickets(TEXT) TO anon, authenticated, service_role;

-- 6.2 submit_payment_proof
CREATE OR REPLACE FUNCTION public.submit_payment_proof(
    p_order_id UUID,
    p_file_path TEXT,
    p_file_name TEXT,
    p_file_size INTEGER,
    p_mime_type VARCHAR(100),
    p_payment_reference TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_proof_id UUID;
BEGIN
    -- 1. Validar existencia y bloquear orden concurrentemente
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden de compra especificada no existe en el sistema.'
        );
    END IF;

    -- 2. Validar estado correcto de la orden
    IF v_order.status NOT IN ('pending', 'pending_verification') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La orden se encuentra en estado "' || v_order.status || '" y no admite nuevos comprobantes.'
        );
    END IF;

    -- 3. Validar correspondencia de la ruta del archivo con la orden objetivo
    IF NOT (
        p_file_path LIKE 'proofs/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE 'proofs/%/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE '%/' || p_order_id::TEXT || '/%'
        OR p_file_path LIKE 'data:image/%'
        OR p_file_path LIKE 'data:application/pdf%'
    ) THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'La ruta del comprobante no corresponde al identificador de la orden que se intenta procesar.'
        );
    END IF;

    -- 4. Validar formato de archivo y tamaño (5 MB máximo)
    IF p_mime_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf') THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'Formato de archivo no permitido. Solo se admiten JPG, PNG, WEBP o PDF.'
        );
    END IF;

    IF p_file_size > 5242880 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'El archivo excede el tamaño máximo permitido de 5 MB.'
        );
    END IF;

    -- 5. Insertar registro en public.payment_proofs
    INSERT INTO public.payment_proofs (
        raffle_id,
        order_id,
        buyer_id,
        file_path,
        file_name,
        file_size,
        mime_type,
        status,
        payment_reference
    ) VALUES (
        v_order.raffle_id,
        p_order_id,
        v_order.buyer_id,
        p_file_path,
        p_file_name,
        p_file_size,
        p_mime_type,
        'pending',
        p_payment_reference
    )
    RETURNING id INTO v_proof_id;

    -- 6. Actualizar orden al estado 'pending_verification' y asociar el comprobante
    UPDATE public.orders
    SET receipt_url = p_file_path,
        payment_gateway_id = COALESCE(p_payment_reference, payment_gateway_id),
        status = 'pending_verification',
        updated_at = NOW()
    WHERE id = p_order_id;

    -- 7. Proteger los boletos vinculados a esta orden
    UPDATE public.tickets
    SET order_id = p_order_id,
        updated_at = NOW()
    WHERE order_id = p_order_id OR (buyer_id = v_order.buyer_id AND status = 'reserved');

    -- 8. Registrar evento en auditoría
    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        'PAYMENT_PROOF_SUBMITTED',
        'order',
        p_order_id::TEXT,
        jsonb_build_object(
            'proof_id', v_proof_id,
            'reference', v_order.reference,
            'file_name', p_file_name,
            'file_size', p_file_size,
            'mime_type', p_mime_type,
            'payment_reference', p_payment_reference
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'proof_id', v_proof_id,
        'order_id', p_order_id,
        'status', 'pending_verification',
        'message', 'Comprobante enviado correctamente. Tu pago está pendiente de verificación.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_payment_proof(UUID, TEXT, TEXT, INTEGER, VARCHAR, TEXT) TO anon, authenticated, service_role;

-- 6.3 cancel_order
CREATE OR REPLACE FUNCTION public.cancel_order(
    p_order_id UUID,
    p_reason TEXT DEFAULT 'Cancelación por el usuario'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_order RECORD;
    v_tickets_released INTEGER;
BEGIN
    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Orden no encontrada.');
    END IF;

    IF v_order.status IN ('paid', 'completed') THEN
        RETURN jsonb_build_object('success', false, 'error', 'No se puede cancelar una orden ya pagada.');
    END IF;

    UPDATE public.orders
    SET status = 'cancelled',
        rejection_reason = p_reason,
        updated_at = NOW()
    WHERE id = p_order_id;

    UPDATE public.tickets
    SET status = 'available',
        reserved_at = NULL,
        reservation_expires_at = NULL,
        buyer_id = NULL,
        order_id = NULL,
        updated_at = NOW()
    WHERE order_id = p_order_id;

    GET DIAGNOSTICS v_tickets_released = ROW_COUNT;

    RETURN jsonb_build_object(
        'success', true,
        'order_id', p_order_id,
        'status', 'cancelled',
        'tickets_released', v_tickets_released
    );
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_order(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_order(UUID, TEXT) TO authenticated, service_role;

-- 6.4 release_expired_reservations
CREATE OR REPLACE FUNCTION public.release_expired_reservations()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_released_count INTEGER;
BEGIN
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

REVOKE ALL ON FUNCTION public.release_expired_reservations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_expired_reservations() TO authenticated, service_role;

-- 6.6 reserve_tickets
CREATE OR REPLACE FUNCTION public.reserve_tickets(
    p_raffle_id UUID,
    p_ticket_numbers TEXT[],
    p_buyer_id UUID,
    p_duration_minutes INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := NOW();
    v_sys_duration INTEGER;
    v_effective_duration INTEGER;
    v_expires_at TIMESTAMPTZ;
    v_available_count INTEGER;
    v_requested_count INTEGER := array_length(p_ticket_numbers, 1);
    v_failed_numbers TEXT[];
BEGIN
    SELECT reservation_duration_minutes INTO v_sys_duration
    FROM public.system_settings
    WHERE id = 1;

    v_effective_duration := COALESCE(p_duration_minutes, v_sys_duration, 10);
    v_expires_at := v_now + (v_effective_duration || ' minutes')::INTERVAL;

    PERFORM public.release_expired_reservations();

    WITH locked_available AS (
        SELECT id, number
        FROM public.tickets
        WHERE raffle_id = p_raffle_id
          AND number = ANY(p_ticket_numbers)
          AND status = 'available'
        FOR UPDATE
    )
    SELECT count(*), array_agg(number)
    INTO v_available_count, v_failed_numbers
    FROM locked_available;

    IF v_available_count < v_requested_count THEN
        SELECT array_agg(num)
        INTO v_failed_numbers
        FROM unnest(p_ticket_numbers) AS num
        WHERE num NOT IN (
            SELECT number FROM public.tickets
            WHERE raffle_id = p_raffle_id
              AND number = ANY(p_ticket_numbers)
              AND status = 'available'
        );

        RETURN jsonb_build_object(
            'success', false,
            'reserved_count', 0,
            'failed_numbers', COALESCE(v_failed_numbers, ARRAY[]::TEXT[]),
            'reservation_expires_at', NULL
        );
    END IF;

    UPDATE public.tickets
    SET status = 'reserved',
        reserved_at = v_now,
        reservation_expires_at = v_expires_at,
        buyer_id = p_buyer_id,
        updated_at = v_now
    WHERE raffle_id = p_raffle_id
      AND number = ANY(p_ticket_numbers)
      AND status = 'available';

    RETURN jsonb_build_object(
        'success', true,
        'reserved_count', v_requested_count,
        'failed_numbers', ARRAY[]::TEXT[],
        'reservation_expires_at', v_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.reserve_tickets(UUID, TEXT[], UUID, INTEGER) TO anon, authenticated, service_role;

-- 6.7 create_order_secure
CREATE OR REPLACE FUNCTION public.create_order_secure(
    p_raffle_id UUID,
    p_ticket_numbers TEXT[],
    p_buyer_data JSONB,
    p_payment_method VARCHAR(30) DEFAULT 'transfer_manual',
    p_contact_preference VARCHAR(20) DEFAULT 'both'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_raffle RECORD;
    v_sys_duration INTEGER;
    v_sys_max_tickets INTEGER;
    v_allowed_max_tickets INTEGER;
    v_buyer_id UUID;
    v_order_id UUID;
    v_reference VARCHAR(50);
    v_total_amount NUMERIC(12, 2);
    v_ticket_count INTEGER;
    v_available_count INTEGER;
    v_failed_numbers TEXT[];
    v_expires_at TIMESTAMPTZ;
    v_doc_id TEXT;
    v_full_name TEXT;
    v_phone TEXT;
    v_email TEXT;
    v_city TEXT;
BEGIN
    IF p_raffle_id IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'El identificador de la rifa es requerido.');
    END IF;

    v_ticket_count := COALESCE(array_length(p_ticket_numbers, 1), 0);
    IF v_ticket_count <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'Debe seleccionar al menos un número de boleto.');
    END IF;

    SELECT reservation_duration_minutes, max_tickets_per_buyer
    INTO v_sys_duration, v_sys_max_tickets
    FROM public.system_settings
    WHERE id = 1;

    v_sys_duration := COALESCE(v_sys_duration, 10);
    v_sys_max_tickets := COALESCE(v_sys_max_tickets, 20);
    v_expires_at := NOW() + (v_sys_duration || ' minutes')::INTERVAL;

    SELECT id, title, ticket_price, max_tickets_per_buyer, status
    INTO v_raffle
    FROM public.raffles
    WHERE id = p_raffle_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa especificada no existe.');
    END IF;

    IF v_raffle.status NOT IN ('active') THEN
        RETURN jsonb_build_object('success', false, 'error', 'La rifa no se encuentra activa para la venta.');
    END IF;

    v_allowed_max_tickets := COALESCE(v_raffle.max_tickets_per_buyer, v_sys_max_tickets, 20);
    IF v_ticket_count > v_allowed_max_tickets THEN
        RETURN jsonb_build_object('success', false, 'error', 'Excede el límite máximo de ' || v_allowed_max_tickets || ' boletos por compra.');
    END IF;

    v_total_amount := v_raffle.ticket_price * v_ticket_count;

    v_doc_id := TRIM(COALESCE(p_buyer_data->>'documentId', p_buyer_data->>'document_id', ''));
    v_full_name := TRIM(COALESCE(p_buyer_data->>'fullName', p_buyer_data->>'full_name', ''));
    v_phone := TRIM(COALESCE(p_buyer_data->>'phone', ''));
    v_email := LOWER(TRIM(COALESCE(p_buyer_data->>'email', '')));
    v_city := TRIM(COALESCE(p_buyer_data->>'city', 'Manaure'));

    IF v_doc_id = '' OR v_full_name = '' OR v_phone = '' OR v_email = '' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Todos los datos del comprador son obligatorios (nombre, cédula, celular y correo).');
    END IF;

    INSERT INTO public.buyers (full_name, document_id, phone, email, city, updated_at)
    VALUES (v_full_name, v_doc_id, v_phone, v_email, v_city, NOW())
    ON CONFLICT (document_id) DO NOTHING
    RETURNING id INTO v_buyer_id;

    IF v_buyer_id IS NULL THEN
        SELECT id INTO v_buyer_id
        FROM public.buyers
        WHERE document_id = v_doc_id;
    END IF;

    PERFORM public.release_expired_reservations();

    WITH locked_tickets AS (
        SELECT id, number
        FROM public.tickets
        WHERE raffle_id = p_raffle_id
          AND number = ANY(p_ticket_numbers)
          AND (status = 'available' OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW()))
        FOR UPDATE
    )
    SELECT count(*), array_agg(number)
    INTO v_available_count, v_failed_numbers
    FROM locked_tickets;

    IF v_available_count < v_ticket_count THEN
        SELECT array_agg(num)
        INTO v_failed_numbers
        FROM unnest(p_ticket_numbers) AS num
        WHERE num NOT IN (
            SELECT number FROM public.tickets
            WHERE raffle_id = p_raffle_id
              AND number = ANY(p_ticket_numbers)
              AND (status = 'available' OR (status = 'reserved' AND buyer_id = v_buyer_id AND reservation_expires_at >= NOW()))
        );

        RETURN jsonb_build_object(
            'success', false,
            'error', 'Uno o más números ya no se encuentran disponibles.',
            'failed_numbers', COALESCE(v_failed_numbers, ARRAY[]::TEXT[])
        );
    END IF;

    v_reference := 'MV-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || CLOCK_TIMESTAMP()::TEXT) FROM 1 FOR 8));

    INSERT INTO public.orders (
        raffle_id,
        buyer_id,
        reference,
        total_amount,
        ticket_count,
        status,
        payment_method,
        contact_preference
    ) VALUES (
        p_raffle_id,
        v_buyer_id,
        v_reference,
        v_total_amount,
        v_ticket_count,
        'pending',
        COALESCE(p_payment_method, 'transfer_manual'),
        COALESCE(p_contact_preference, 'both')
    )
    RETURNING id INTO v_order_id;

    UPDATE public.tickets
    SET status = 'reserved',
        reserved_at = NOW(),
        reservation_expires_at = v_expires_at,
        buyer_id = v_buyer_id,
        order_id = v_order_id,
        updated_at = NOW()
    WHERE raffle_id = p_raffle_id
      AND number = ANY(p_ticket_numbers);

    INSERT INTO public.audit_logs (
        action,
        entity_type,
        entity_id,
        details
    ) VALUES (
        'ORDER_CREATED_SECURE',
        'orders',
        v_order_id::TEXT,
        jsonb_build_object(
            'reference', v_reference,
            'buyer_id', v_buyer_id,
            'ticket_count', v_ticket_count,
            'total_amount', v_total_amount,
            'reservation_expires_at', v_expires_at,
            'reservation_duration_minutes', v_sys_duration
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'order_id', v_order_id,
        'reference', v_reference,
        'buyer_id', v_buyer_id,
        'total_amount', v_total_amount,
        'ticket_count', v_ticket_count,
        'reservation_expires_at', v_expires_at
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_order_secure(UUID, TEXT[], JSONB, VARCHAR, VARCHAR) TO anon, authenticated, service_role;

