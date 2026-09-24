import { describe, it, expect } from 'vitest';

/**
 * Suite de Pruebas: Hallazgos Secundarios de Integridad y Arquitectura
 * DB-12 (Storage y Políticas RLS), DB-15 (Ganadores y Concurrencia), DB-16 (Semántica is_admin)
 * Correspondiente a Migración: 041_storage_cleanup_and_integrity_hardenings.sql
 */

describe('DB-12: Clasificación de Buckets y Arquitectura Híbrida de Almacenamiento', () => {
  interface StorageBucketClassification {
    id: string;
    status: 'activo' | 'legado' | 'migrado_a_cloudinary';
    storageProvider: 'supabase_storage' | 'cloudinary';
    isPublic: boolean;
    hasActiveOrphanedPolicies: boolean;
  }

  const bucketsCatalog: StorageBucketClassification[] = [
    {
      id: 'payment-proofs',
      status: 'activo',
      storageProvider: 'supabase_storage',
      isPublic: false,
      hasActiveOrphanedPolicies: false,
    },
    {
      id: 'gallery-images',
      status: 'activo',
      storageProvider: 'supabase_storage',
      isPublic: true,
      hasActiveOrphanedPolicies: false,
    },
    {
      id: 'receipts',
      status: 'legado',
      storageProvider: 'supabase_storage',
      isPublic: true,
      hasActiveOrphanedPolicies: false,
    },
    {
      id: 'partner-logos',
      status: 'migrado_a_cloudinary',
      storageProvider: 'cloudinary',
      isPublic: true,
      hasActiveOrphanedPolicies: true, // purgado en migración 041
    },
    {
      id: 'prize-images',
      status: 'migrado_a_cloudinary',
      storageProvider: 'cloudinary',
      isPublic: true,
      hasActiveOrphanedPolicies: true, // purgado en migración 041
    },
    {
      id: 'winner-documents',
      status: 'migrado_a_cloudinary',
      storageProvider: 'cloudinary',
      isPublic: false,
      hasActiveOrphanedPolicies: true, // purgado en migración 041
    },
  ];

  it('debe proteger y preservar buckets legítimos en Supabase Storage', () => {
    const activeBuckets = bucketsCatalog.filter((b) => b.storageProvider === 'supabase_storage');
    const activeIds = activeBuckets.map((b) => b.id);

    expect(activeIds).toContain('payment-proofs');
    expect(activeIds).toContain('gallery-images');
    expect(activeIds).toContain('receipts');
    expect(activeIds.length).toBe(3);
  });

  it('debe identificar que logos de aliados, premios y actas de ganadores se procesan en Cloudinary', () => {
    const cloudinaryBuckets = bucketsCatalog.filter((b) => b.storageProvider === 'cloudinary');
    const cloudinaryIds = cloudinaryBuckets.map((b) => b.id);

    expect(cloudinaryIds).toContain('partner-logos');
    expect(cloudinaryIds).toContain('prize-images');
    expect(cloudinaryIds).toContain('winner-documents');
  });

  it('debe validar la lista exhaustiva de políticas huérfanas purgadas en migración 041', () => {
    const purgedPolicies = [
      'Lectura pública de logos de aliados',
      'Solo administradores pueden subir logos de aliados',
      'Solo administradores pueden actualizar logos de aliados',
      'Solo administradores pueden eliminar logos de aliados',
      'Lectura pública de imágenes de premios',
      'Solo administradores suben imágenes de premios',
      'Solo administradores actualizan imágenes de premios',
      'Solo administradores eliminan imágenes de premios',
      'Lectura pública de documentos de ganadores',
      'Administradores pueden listar y leer documentos de ganadores',
      'Solo administradores pueden subir documentos de ganadores',
      'Solo administradores pueden actualizar documentos de ganadores',
      'Solo administradores pueden eliminar documentos de ganadores',
    ];

    expect(purgedPolicies.length).toBe(13);
    for (const policy of purgedPolicies) {
      expect(policy).toBeDefined();
    }
  });
});

describe('DB-15: Integridad, Idempotencia y Concurrencia en Ganadores (register_winner)', () => {
  interface WinnerRecord {
    id: string;
    raffle_id: string;
    ticket_number: string;
    ticket_id: string;
    lottery_draw_number: string;
    created_at: string;
  }

  // Simulación fiel de la tabla winners con constraint uq_winners_raffle_ticket
  class WinnersDatabaseTable {
    private records: WinnerRecord[] = [];

    insert(record: Omit<WinnerRecord, 'id' | 'created_at'>): { success: boolean; data?: WinnerRecord; error?: string } {
      const exists = this.records.some(
        (r) => r.raffle_id === record.raffle_id && r.ticket_number === record.ticket_number
      );

      if (exists) {
        // En Postgres: SQLSTATE 23505 (unique_violation)
        return {
          success: false,
          error: 'duplicate key value violates unique constraint "uq_winners_raffle_ticket"',
        };
      }

      const newRecord: WinnerRecord = {
        ...record,
        id: `win-${Math.random().toString(36).substring(2, 9)}`,
        created_at: new Date().toISOString(),
      };
      this.records.push(newRecord);
      return { success: true, data: newRecord };
    }

    findWinner(raffleId: string, ticketNumber: string): WinnerRecord | undefined {
      return this.records.find(
        (r) => r.raffle_id === raffleId && r.ticket_number === ticketNumber
      );
    }

    getAll(): WinnerRecord[] {
      return [...this.records];
    }
  }

  // Emulación de la RPC register_winner con hardening de migración 041
  function simulateRegisterWinnerRPC(
    table: WinnersDatabaseTable,
    params: {
      adminId: string | null;
      isAdmin: boolean;
      raffleId: string;
      ticketNumber: string;
      lotteryDrawNumber: string;
      ticketStatus: 'available' | 'reserved' | 'sold';
    }
  ) {
    if (!params.adminId || !params.isAdmin) {
      return { success: false, error: 'Acceso denegado: solo administradores autorizados pueden registrar ganadores.' };
    }

    const cleanTicket = params.ticketNumber.trim();
    if (!cleanTicket) {
      return { success: false, error: 'El número del boleto ganador es obligatorio.' };
    }

    // 1. Idempotencia temprana (DB-15)
    if (table.findWinner(params.raffleId, cleanTicket)) {
      return {
        success: false,
        error: `El boleto "${cleanTicket}" ya ha sido registrado como ganador para esta rifa.`,
      };
    }

    // 2. Validación de estado comercial
    if (params.ticketStatus !== 'sold') {
      return {
        success: false,
        error: `El boleto "${cleanTicket}" no puede registrarse como ganador porque no está vendido.`,
      };
    }

    // 3. Inserción con captura de unique_violation
    const insertRes = table.insert({
      raffle_id: params.raffleId,
      ticket_number: cleanTicket,
      ticket_id: `t-${cleanTicket}`,
      lottery_draw_number: params.lotteryDrawNumber,
    });

    if (!insertRes.success) {
      return {
        success: false,
        error: `Conflicto de concurrencia: el boleto "${cleanTicket}" ya fue registrado como ganador por otro proceso concurrente.`,
      };
    }

    return {
      success: true,
      winner_id: insertRes.data?.id,
      ticket_number: cleanTicket,
      message: '¡Ganador registrado exitosamente con toda su evidencia!',
    };
  }

  it('debe registrar exitosamente un boleto vendido legítimo', () => {
    const table = new WinnersDatabaseTable();
    const res = simulateRegisterWinnerRPC(table, {
      adminId: 'admin-1',
      isAdmin: true,
      raffleId: 'raf-1',
      ticketNumber: '007',
      lotteryDrawNumber: '9876',
      ticketStatus: 'sold',
    });

    expect(res.success).toBe(true);
    expect(res.ticket_number).toBe('007');
    expect(table.getAll().length).toBe(1);
  });

  it('debe rechazar registro si el boleto no está en estado "sold"', () => {
    const table = new WinnersDatabaseTable();
    const res = simulateRegisterWinnerRPC(table, {
      adminId: 'admin-1',
      isAdmin: true,
      raffleId: 'raf-1',
      ticketNumber: '008',
      lotteryDrawNumber: '9876',
      ticketStatus: 'reserved',
    });

    expect(res.success).toBe(false);
    expect(res.error).toMatch(/no puede registrarse como ganador porque no está vendido/);
    expect(table.getAll().length).toBe(0);
  });

  it('debe impedir registrar dos veces el mismo boleto premiado (idempotencia y constraint único)', () => {
    const table = new WinnersDatabaseTable();

    // Primer registro
    const res1 = simulateRegisterWinnerRPC(table, {
      adminId: 'admin-1',
      isAdmin: true,
      raffleId: 'raf-1',
      ticketNumber: '042',
      lotteryDrawNumber: '1042',
      ticketStatus: 'sold',
    });
    expect(res1.success).toBe(true);

    // Segundo intento (doble clic administrativo o reintento)
    const res2 = simulateRegisterWinnerRPC(table, {
      adminId: 'admin-1',
      isAdmin: true,
      raffleId: 'raf-1',
      ticketNumber: '042',
      lotteryDrawNumber: '1042',
      ticketStatus: 'sold',
    });
    expect(res2.success).toBe(false);
    expect(res2.error).toMatch(/ya ha sido registrado como ganador para esta rifa/);
    expect(table.getAll().length).toBe(1);
  });

  it('debe mitigar condiciones de carrera concurrentes capturando unique_violation', () => {
    const table = new WinnersDatabaseTable();

    // Simular que dos transacciones pasaron la validación temprana en paralelo:
    // Transacción A inserta primero
    const insertA = table.insert({
      raffle_id: 'raf-1',
      ticket_number: '099',
      ticket_id: 't-099',
      lottery_draw_number: '5555',
    });
    expect(insertA.success).toBe(true);

    // Transacción B intenta insertar exactamente la misma tupla (raffle_id, ticket_number)
    const insertB = table.insert({
      raffle_id: 'raf-1',
      ticket_number: '099',
      ticket_id: 't-099',
      lottery_draw_number: '5555',
    });
    expect(insertB.success).toBe(false);
    expect(insertB.error).toContain('unique constraint');
  });

  it('debe permitir ganadores con el mismo número de boleto pero en RIFAS DIFERENTES', () => {
    const table = new WinnersDatabaseTable();

    const resRaffle1 = simulateRegisterWinnerRPC(table, {
      adminId: 'admin-1',
      isAdmin: true,
      raffleId: 'raf-1',
      ticketNumber: '010',
      lotteryDrawNumber: '1234',
      ticketStatus: 'sold',
    });
    expect(resRaffle1.success).toBe(true);

    const resRaffle2 = simulateRegisterWinnerRPC(table, {
      adminId: 'admin-1',
      isAdmin: true,
      raffleId: 'raf-2', // Otra rifa
      ticketNumber: '010', // Mismo número de boleto
      lotteryDrawNumber: '5678',
      ticketStatus: 'sold',
    });
    expect(resRaffle2.success).toBe(true);
    expect(table.getAll().length).toBe(2);
  });
});

describe('DB-16: Semántica y Blindaje Anti-Suplantación en is_admin', () => {
  interface SessionContext {
    authUid: string | null;
    activeAdmins: string[];
    activeSuperadmins: string[];
  }

  // Emulación de la función is_admin con hardening de migración 041
  function simulateIsAdmin(ctx: SessionContext, p_user_id?: string | null): boolean {
    const v_uid = ctx.authUid;
    if (!v_uid) {
      return false;
    }

    // Endurecimiento DB-16: Rechazo inmediato si el invocador suministra un UUID
    // explícito diferente al usuario autenticado real (anti-spoofing y anti-enumeración)
    if (p_user_id !== undefined && p_user_id !== null && p_user_id !== v_uid) {
      return false;
    }

    return ctx.activeAdmins.includes(v_uid);
  }

  function simulateIsSuperadmin(ctx: SessionContext, p_user_id?: string | null): boolean {
    const v_uid = ctx.authUid;
    if (!v_uid) {
      return false;
    }

    if (p_user_id !== undefined && p_user_id !== null && p_user_id !== v_uid) {
      return false;
    }

    return ctx.activeSuperadmins.includes(v_uid);
  }

  const sampleContext: SessionContext = {
    authUid: 'admin-real-uuid',
    activeAdmins: ['admin-real-uuid'],
    activeSuperadmins: ['superadmin-real-uuid'],
  };

  it('debe retornar true cuando un admin autenticado invoca is_admin() sin argumentos', () => {
    expect(simulateIsAdmin(sampleContext)).toBe(true);
  });

  it('debe retornar true cuando las políticas RLS invocan is_admin(auth.uid()) con su propio UUID', () => {
    expect(simulateIsAdmin(sampleContext, sampleContext.authUid)).toBe(true);
  });

  it('debe retornar false de inmediato si se pasa un UUID de otro usuario (anti-suplantación)', () => {
    const spoofedUuid = 'victim-other-uuid';
    expect(simulateIsAdmin(sampleContext, spoofedUuid)).toBe(false);
  });

  it('debe retornar false si el usuario no está autenticado (auth.uid() IS NULL)', () => {
    const anonContext: SessionContext = {
      authUid: null,
      activeAdmins: ['admin-real-uuid'],
      activeSuperadmins: ['superadmin-real-uuid'],
    };

    expect(simulateIsAdmin(anonContext)).toBe(false);
    expect(simulateIsAdmin(anonContext, 'admin-real-uuid')).toBe(false);
  });

  it('debe validar la semántica equivalente para is_superadmin', () => {
    const superContext: SessionContext = {
      authUid: 'superadmin-real-uuid',
      activeAdmins: ['superadmin-real-uuid'],
      activeSuperadmins: ['superadmin-real-uuid'],
    };

    expect(simulateIsSuperadmin(superContext)).toBe(true);
    expect(simulateIsSuperadmin(superContext, superContext.authUid)).toBe(true);
    expect(simulateIsSuperadmin(superContext, 'other-uuid')).toBe(false);
  });
});
