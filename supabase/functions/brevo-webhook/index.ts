import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import { handleBrevoWebhook } from "./handler.ts";

/**
 * ==============================================================================
 * SUPABASE EDGE FUNCTION: brevo-webhook
 * ==============================================================================
 * Receptor seguro y autoritativo para webhooks de eventos transaccionales de Brevo.
 *
 * REGLAS INFRANQUEABLES:
 * 1. NO modificar estados financieros ni la tabla 'orders' (status, pagos, montos).
 * 2. NO aprobar ni rechazar órdenes.
 * 3. SOLO actualizar la trazabilidad de entrega en 'notification_logs'.
 * 4. Validar rigurosamente el secreto de autenticación configurado (BREVO_WEBHOOK_SECRET).
 * 5. Prevenir regresiones destructivas de estado (ej: delivered -> sent).
 * ==============================================================================
 */

serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const webhookSecret = Deno.env.get("BREVO_WEBHOOK_SECRET") || "";

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error(
      "[brevo-webhook] Error de configuración: SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY no configurados en el entorno."
    );
    return new Response(
      JSON.stringify({
        success: false,
        error: "Error interno: variables de entorno del servidor no configuradas.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return await handleBrevoWebhook(req, adminClient, webhookSecret);
});
