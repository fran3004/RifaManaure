-- ============================================================================
-- MIGRACIÓN 005: GESTIÓN INTEGRAL DE CUENTAS DE PAGO MANUAL
-- PLATAFORMA "MANAURE VIVE"
-- ============================================================================

-- 1. Asegurar Estructura de la Tabla public.payment_accounts
CREATE TABLE IF NOT EXISTS public.payment_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    bank_name VARCHAR(100) NOT NULL,
    account_type VARCHAR(50) DEFAULT 'savings',
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

-- 2. Políticas de Seguridad RLS
-- Lectura pública: Únicamente cuentas activas (o administradores para previsualización)
DROP POLICY IF EXISTS "Lectura pública de cuentas de pago activas" ON public.payment_accounts;
CREATE POLICY "Lectura pública de cuentas de pago activas" ON public.payment_accounts
    FOR SELECT USING (is_active = true OR public.is_admin());

-- Gestión administrativa total: SELECT, INSERT, UPDATE, DELETE para administradores autenticados
DROP POLICY IF EXISTS "Administradores pueden gestionar cuentas de pago" ON public.payment_accounts;
CREATE POLICY "Administradores pueden gestionar cuentas de pago" ON public.payment_accounts
    FOR ALL TO authenticated
    USING (public.is_admin())
    WITH CHECK (public.is_admin());

-- 3. Trigger para updated_at automático
CREATE OR REPLACE FUNCTION public.fn_payment_accounts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_accounts_updated_at ON public.payment_accounts;
CREATE TRIGGER trg_payment_accounts_updated_at
    BEFORE UPDATE ON public.payment_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_payment_accounts_updated_at();

-- 4. Trigger para Auditoría Automática de Cambios en Cuentas de Pago
CREATE OR REPLACE FUNCTION public.fn_audit_payment_accounts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
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

DROP TRIGGER IF EXISTS trg_audit_payment_accounts ON public.payment_accounts;
CREATE TRIGGER trg_audit_payment_accounts
    AFTER INSERT OR UPDATE OR DELETE ON public.payment_accounts
    FOR EACH ROW
    EXECUTE FUNCTION public.fn_audit_payment_accounts();

-- NOTA CRÍTICA:
-- NO se insertan datos bancarios ficticios ni números de prueba.
-- Los datos bancarios reales serán ingresados posteriormente por el administrador desde el panel.

