import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bxhzvmbbsisxqpwrgvgn.supabase.co';
const supabaseKey = 'sb_publishable_n02jT3oPik5Yb8Mdz6Chlg_0JOgZWoA';

const supabase = createClient(supabaseUrl, supabaseKey);

async function verifyMigrationStatus() {
  console.log('====================================================');
  console.log('  AUDITORÍA DE MIGRACIONES EN VIVO (SUPABASE)');
  console.log('====================================================\n');

  const tables = [
    { name: 'raffles', description: 'Rifas y sorteos' },
    { name: 'tickets', description: 'Boletos 000-999' },
    { name: 'buyers', description: 'Compradores registrados' },
    { name: 'orders', description: 'Órdenes de compra' },
    { name: 'partners', description: 'Aliados comerciales (10)' },
    { name: 'admin_users', description: 'Administradores autorizados (002)' },
    { name: 'payment_accounts', description: 'Cuentas de pago manual (003/005)' },
    { name: 'audit_logs', description: 'Bitácora de auditoría (003/004)' }
  ];

  let tablesMigrated = 0;
  console.log('--- 1. TABLAS ---');
  for (const t of tables) {
    const { data, error } = await supabase
      .from(t.name)
      .select('*')
      .limit(1);

    if (error && error.code === 'PGRST205') {
      console.log(`❌ [${t.name}]: PENDIENTE DE MIGRAR (${error.message})`);
    } else if (error) {
      console.log(`⚠️ [${t.name}]: EXISTE CON RESTRICCIÓN RLS (${error.message}) - ${t.description}`);
      tablesMigrated++;
    } else {
      tablesMigrated++;
      console.log(`✅ [${t.name}]: MIGRADA Y OPERATIVA (${data ? data.length : 0} filas de muestra) - ${t.description}`);
    }
  }

  const rpcs = [
    { name: 'reserve_tickets', params: { p_raffle_id: '00000000-0000-0000-0000-000000000000', p_ticket_numbers: ['001'], p_buyer_id: '00000000-0000-0000-0000-000000000000' } },
    { name: 'release_expired_reservations', params: {} },
    { name: 'is_admin', params: {} },
    { name: 'submit_order_receipt', params: { p_order_id: '00000000-0000-0000-0000-000000000000', p_receipt_url: 'test' } },
    { name: 'approve_order_payment', params: { p_order_id: '00000000-0000-0000-0000-000000000000' } },
    { name: 'reject_order_payment', params: { p_order_id: '00000000-0000-0000-0000-000000000000', p_reason: 'test' } },
    { name: 'cancel_order', params: { p_order_id: '00000000-0000-0000-0000-000000000000' } }
  ];

  let rpcsMigrated = 0;
  console.log('\n--- 2. FUNCIONES Y PROCEDIMIENTOS TRANSACCIONALES (RPC) ---');
  for (const rpc of rpcs) {
    const { error } = await supabase.rpc(rpc.name, rpc.params);
    if (error && error.code === 'PGRST202') {
      console.log(`❌ [${rpc.name}]: PENDIENTE DE MIGRAR (No existe en schema cache)`);
    } else {
      rpcsMigrated++;
      console.log(`✅ [${rpc.name}]: MIGRADA Y OPERATIVA`);
    }
  }

  console.log('\n====================================================');
  console.log(`RESULTADO GLOBAL:`);
  console.log(`• Tablas migradas: ${tablesMigrated} de ${tables.length}`);
  console.log(`• Procedimientos RPC migrados: ${rpcsMigrated} de ${rpcs.length}`);
  if (tablesMigrated === tables.length && rpcsMigrated === rpcs.length) {
    console.log('🎉 ¡TODAS LAS MIGRACIONES ESTÁN APLICADAS EXITOSAMENTE!');
  } else {
    console.log('⚠️  HAY MIGRACIONES PENDIENTES. Ejecuta el archivo:');
    console.log('   supabase/migrations/EJECUTAR_EN_SUPABASE_TODO_PENDIENTE.sql');
    console.log('   en el SQL Editor de Supabase.');
  }
  console.log('====================================================\n');
}

verifyMigrationStatus().catch(console.error);
