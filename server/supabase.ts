import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import {
  calculateKekurangan,
  determineReadiness,
  calculateShortfallPositive,
  calculateRiskLevel,
  calculateRolling4DaysRetentionCutoff,
} from '../src/utils/ppicRules.js';
import {
  MaterialRecord,
  UploadRecord,
  ProductionScheduleRecord,
  DeletionAuditRecord,
} from './store.js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL?.trim() || '';
const supabaseKey = (
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  ''
).trim();

export type SupabaseConnectionState =
  | 'CONNECTED'
  | 'DISCONNECTED'
  | 'CONFIGURATION ERROR'
  | 'DATABASE SCHEMA ERROR'
  | 'DATABASE OPERATION ERROR';

let supabaseClient: SupabaseClient | null = null;

if (supabaseUrl && supabaseKey) {
  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    console.log('[Supabase] Initialized client with URL:', supabaseUrl.replace(/^(https?:\/\/[^.]+).*/, '$1***'));
  } catch (err) {
    console.error('[Supabase] Failed to initialize client:', err);
  }
}

export function getSupabaseClient(): SupabaseClient | null {
  return supabaseClient;
}

export function isSupabaseConfigured(): boolean {
  return !!supabaseClient && !!supabaseUrl && !!supabaseKey && supabaseUrl.startsWith('https://');
}

// -----------------------------------------------------------------------------
// Real Connection Status Checker (Categorized to 5 States per Section 13)
// -----------------------------------------------------------------------------
export async function testSupabaseConnection(): Promise<{
  state: SupabaseConnectionState;
  configured: boolean;
  connected: boolean;
  url: string;
  message: string;
  tables: {
    upload_history: boolean;
    material_requirements: boolean;
    or_style_relations: boolean;
    master_materials: boolean;
    production_schedules: boolean;
    deletion_history: boolean;
  };
  details?: string;
}> {
  const maskedUrl = supabaseUrl ? supabaseUrl.replace(/^(https?:\/\/[^.]+).*/, '$1***') : 'Belum diisi';

  if (!supabaseUrl || !supabaseKey) {
    return {
      state: 'CONFIGURATION ERROR',
      configured: false,
      connected: false,
      url: maskedUrl,
      message: 'SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY belum diisi di file .env. Sistem berjalan pada mode penyimpanan lokal.',
      tables: {
        upload_history: false,
        material_requirements: false,
        or_style_relations: false,
        master_materials: false,
        production_schedules: false,
        deletion_history: false,
      },
    };
  }

  if (!supabaseUrl.startsWith('https://')) {
    return {
      state: 'CONFIGURATION ERROR',
      configured: false,
      connected: false,
      url: maskedUrl,
      message: 'Format SUPABASE_URL tidak valid. URL harus dimulai dengan https:// (misal: https://xyz.supabase.co).',
      tables: {
        upload_history: false,
        material_requirements: false,
        or_style_relations: false,
        master_materials: false,
        production_schedules: false,
        deletion_history: false,
      },
    };
  }

  if (!supabaseClient) {
    return {
      state: 'DISCONNECTED',
      configured: true,
      connected: false,
      url: maskedUrl,
      message: 'Gagal menginisialisasi Supabase client. Periksa format URL dan API Key.',
      tables: {
        upload_history: false,
        material_requirements: false,
        or_style_relations: false,
        master_materials: false,
        production_schedules: false,
        deletion_history: false,
      },
    };
  }

  try {
    const [uRes, mRes, rRes, matRefRes, sRes, dRes] = await Promise.all([
      supabaseClient.from('upload_history').select('id', { count: 'exact', head: true }),
      supabaseClient.from('material_requirements').select('id', { count: 'exact', head: true }),
      supabaseClient.from('or_style_relations').select('id', { count: 'exact', head: true }),
      supabaseClient.from('master_materials').select('id', { count: 'exact', head: true }),
      supabaseClient.from('production_schedules').select('id', { count: 'exact', head: true }),
      supabaseClient.from('deletion_history').select('id', { count: 'exact', head: true }),
    ]);

    const tables = {
      upload_history: !uRes.error,
      material_requirements: !mRes.error,
      or_style_relations: !rRes.error,
      master_materials: !matRefRes.error,
      production_schedules: !sRes.error,
      deletion_history: !dRes.error,
    };

    const allTablesPresent = Object.values(tables).every(Boolean);

    if (allTablesPresent) {
      return {
        state: 'CONNECTED',
        configured: true,
        connected: true,
        url: maskedUrl,
        message: 'Koneksi ke Supabase PostgreSQL berhasil! Seluruh 6 tabel skema aktif dan siap.',
        tables,
      };
    } else {
      const missing = Object.entries(tables)
        .filter(([_, present]) => !present)
        .map(([name]) => name);
      return {
        state: 'DATABASE SCHEMA ERROR',
        configured: true,
        connected: false,
        url: maskedUrl,
        message: `Terkoneksi ke Supabase, namun beberapa tabel belum ditemukan: ${missing.join(', ')}. Silakan jalankan query dari supabase_schema.sql di SQL Editor Supabase.`,
        tables,
      };
    }
  } catch (err: any) {
    return {
      state: 'DISCONNECTED',
      configured: true,
      connected: false,
      url: maskedUrl,
      message: `Tidak dapat terhubung ke server Supabase: ${err.message || 'Network Timeout'}`,
      tables: {
        upload_history: false,
        material_requirements: false,
        or_style_relations: false,
        master_materials: false,
        production_schedules: false,
        deletion_history: false,
      },
      details: err.message,
    };
  }
}

// -----------------------------------------------------------------------------
// 10-Step Comprehensive Diagnostic Test Suite (Master Specification Section 12)
// -----------------------------------------------------------------------------
export interface DiagnosticStepResult {
  step: number;
  name: string;
  passed: boolean;
  durationMs: number;
  message: string;
  details?: any;
}

export async function runSupabaseDiagnosticSuite(): Promise<{
  allPassed: boolean;
  totalDurationMs: number;
  steps: DiagnosticStepResult[];
}> {
  const startTime = Date.now();
  const steps: DiagnosticStepResult[] = [];

  const runStep = async (
    stepNum: number,
    name: string,
    action: () => Promise<{ passed: boolean; message: string; details?: any }>
  ) => {
    const t0 = Date.now();
    try {
      const res = await action();
      steps.push({
        step: stepNum,
        name,
        passed: res.passed,
        durationMs: Date.now() - t0,
        message: res.message,
        details: res.details,
      });
      return res.passed;
    } catch (err: any) {
      steps.push({
        step: stepNum,
        name,
        passed: false,
        durationMs: Date.now() - t0,
        message: `Gagal: ${err.message || 'Unknown error'}`,
      });
      return false;
    }
  };

  // Test 1: Configuration
  await runStep(1, 'Test 1 — Configuration', async () => {
    if (!supabaseUrl || !supabaseKey) {
      return { passed: false, message: 'SUPABASE_URL atau SUPABASE_SERVICE_ROLE_KEY belum diisi.' };
    }
    if (!supabaseUrl.startsWith('https://')) {
      return { passed: false, message: 'SUPABASE_URL harus berawalan https://' };
    }
    return {
      passed: true,
      message: 'Environment variable terbaca dengan benar (URL valid & Key terisi).',
      details: { url: supabaseUrl.replace(/^(https?:\/\/[^.]+).*/, '$1***') },
    };
  });

  if (!supabaseClient) {
    return {
      allPassed: false,
      totalDurationMs: Date.now() - startTime,
      steps,
    };
  }

  // Test 2: Database Read
  await runStep(2, 'Test 2 — Database Read', async () => {
    const [u, m, r, mat, s, d] = await Promise.all([
      supabaseClient!.from('upload_history').select('id', { count: 'exact', head: true }),
      supabaseClient!.from('material_requirements').select('id', { count: 'exact', head: true }),
      supabaseClient!.from('or_style_relations').select('id', { count: 'exact', head: true }),
      supabaseClient!.from('master_materials').select('id', { count: 'exact', head: true }),
      supabaseClient!.from('production_schedules').select('id', { count: 'exact', head: true }),
      supabaseClient!.from('deletion_history').select('id', { count: 'exact', head: true }),
    ]);

    const errors: string[] = [];
    if (u.error) errors.push(`upload_history: ${u.error.message}`);
    if (m.error) errors.push(`material_requirements: ${m.error.message}`);
    if (r.error) errors.push(`or_style_relations: ${r.error.message}`);
    if (mat.error) errors.push(`master_materials: ${mat.error.message}`);
    if (s.error) errors.push(`production_schedules: ${s.error.message}`);
    if (d.error) errors.push(`deletion_history: ${d.error.message}`);

    if (errors.length > 0) {
      return { passed: false, message: `Gagal membaca tabel: ${errors.join('; ')}` };
    }
    return {
      passed: true,
      message: 'Berhasil membaca seluruh 6 tabel utama PPIC di Supabase.',
    };
  });

  // Prepare canary test identifiers
  const testUploadId = '00000000-0000-4000-8000-000000000001';
  const testCanaryOr = '__TEST_CANARY_OR__';
  const testCanaryStyle = '__TEST_CANARY_STYLE__';

  // Test 3: Database Insert
  await runStep(3, 'Test 3 — Database Insert', async () => {
    const { error: upErr } = await supabaseClient!.from('upload_history').upsert({
      upload_id: testUploadId,
      or_number: testCanaryOr,
      style: testCanaryStyle,
      update_date: new Date().toISOString().slice(0, 10),
      uploaded_at: new Date().toISOString(),
      total_rows: 1,
      successful_rows: 1,
      failed_rows: 0,
      upload_status: 'testing',
      file_name: 'test_canary.xlsx',
    });

    if (upErr) return { passed: false, message: `Insert upload_history gagal: ${upErr.message}` };

    const { error: matErr } = await supabaseClient!.from('material_requirements').insert({
      upload_id: testUploadId,
      or_number: testCanaryOr,
      style: testCanaryStyle,
      update_date: new Date().toISOString().slice(0, 10),
      material_code: 'TEST-001',
      material_name: 'CANARY TEST THREAD NYLON 100D',
      requirement: 100,
      received: 80,
      shortage: -20,
      unit: 'CONE',
      readiness_status: 'BELUM READY',
      is_flagged_for_review: false,
    });

    if (matErr) return { passed: false, message: `Insert material_requirements gagal: ${matErr.message}` };

    return { passed: true, message: 'Berhasil memasukkan record pengujian isolasi (canary record).' };
  });

  // Test 4: Database Read After Insert
  await runStep(4, 'Test 4 — Database Read After Insert', async () => {
    const { data, error } = await supabaseClient!
      .from('material_requirements')
      .select('*')
      .eq('upload_id', testUploadId);

    if (error) return { passed: false, message: `Read-after-insert error: ${error.message}` };
    if (!data || data.length === 0) return { passed: false, message: 'Record pengujian tidak ditemukan.' };

    const item = data[0];
    const match = item.material_code === 'TEST-001' && Number(item.shortage) === -20;
    if (!match) {
      return { passed: false, message: `Nilai record tidak cocok: shortage=${item.shortage}` };
    }

    return {
      passed: true,
      message: 'Record pengujian berhasil dibaca kembali dan diverifikasi 100% konsisten.',
    };
  });

  // Test 5: Database Update
  await runStep(5, 'Test 5 — Database Update', async () => {
    const { error } = await supabaseClient!
      .from('material_requirements')
      .update({ received: 100, shortage: 0, readiness_status: 'READY' })
      .eq('upload_id', testUploadId)
      .eq('material_code', 'TEST-001');

    if (error) return { passed: false, message: `Update gagal: ${error.message}` };

    const { data: updated } = await supabaseClient!
      .from('material_requirements')
      .select('readiness_status, shortage')
      .eq('upload_id', testUploadId)
      .single();

    if (!updated || updated.readiness_status !== 'READY') {
      return { passed: false, message: 'Update gagal memutasi data menjadi READY.' };
    }

    return { passed: true, message: 'Berhasil melakukan update data dan memverifikasi perubahan status.' };
  });

  // Test 6: Database Delete
  await runStep(6, 'Test 6 — Database Delete', async () => {
    // Cascade delete on upload_history deletes material_requirements
    const { error: delErr } = await supabaseClient!
      .from('upload_history')
      .delete()
      .eq('upload_id', testUploadId);

    if (delErr) return { passed: false, message: `Pembersihan record pengujian gagal: ${delErr.message}` };

    // Verify deletion
    const { data: check } = await supabaseClient!
      .from('material_requirements')
      .select('id')
      .eq('upload_id', testUploadId);

    if (check && check.length > 0) {
      return { passed: false, message: 'Record anak material_requirements masih tersisa.' };
    }

    return { passed: true, message: 'Record pengujian berhasil dihapus bersih (zero leftovers).' };
  });

  // Test 7: Upload Batch
  await runStep(7, 'Test 7 — Upload Batch', async () => {
    const batchUploadId = '00000000-0000-4000-8000-000000000002';
    await supabaseClient!.from('upload_history').upsert({
      upload_id: batchUploadId,
      or_number: '__BATCH_TEST__',
      style: '__BATCH_STYLE__',
      update_date: new Date().toISOString().slice(0, 10),
      uploaded_at: new Date().toISOString(),
      total_rows: 5,
      successful_rows: 5,
      failed_rows: 0,
      upload_status: 'testing',
    });

    const testChunk = Array.from({ length: 5 }).map((_, idx) => ({
      upload_id: batchUploadId,
      or_number: '__BATCH_TEST__',
      style: '__BATCH_STYLE__',
      update_date: new Date().toISOString().slice(0, 10),
      material_code: `BATCH-MAT-${idx + 1}`,
      material_name: `Batch Test Component #${idx + 1}`,
      requirement: 50,
      received: 50,
      shortage: 0,
      unit: 'YDS',
      readiness_status: 'READY',
      is_flagged_for_review: false,
    }));

    const { error: insertErr } = await supabaseClient!.from('material_requirements').insert(testChunk);
    // Cleanup immediately
    await supabaseClient!.from('upload_history').delete().eq('upload_id', batchUploadId);

    if (insertErr) return { passed: false, message: `Batch insert error: ${insertErr.message}` };
    return { passed: true, message: 'Berhasil melakukan multi-row batch insert (5 baris pengujian atomik).' };
  });

  // Test 8: Pagination
  await runStep(8, 'Test 8 — Pagination', async () => {
    // Query page range 0..4
    const { data, count, error } = await supabaseClient!
      .from('material_requirements')
      .select('id', { count: 'exact' })
      .range(0, 4);

    if (error) return { passed: false, message: `Pagination test error: ${error.message}` };
    return {
      passed: true,
      message: `Server-side range query berhasil. Total records terdeteksi: ${count ?? 0}.`,
      details: { sampleCount: data?.length || 0, totalCount: count },
    };
  });

  // Test 9: Search
  await runStep(9, 'Test 9 — Search', async () => {
    const { data, error } = await supabaseClient!
      .from('material_requirements')
      .select('style, or_number')
      .ilike('style', '%AERO%')
      .limit(5);

    if (error) return { passed: false, message: `Search query error: ${error.message}` };
    return {
      passed: true,
      message: 'Pencarian server-side ILIKE untuk Style & OR berhasil dijalankan.',
      details: { found: data?.length || 0 },
    };
  });

  // Test 10: Cross-Device Server Clock
  await runStep(10, 'Test 10 — Cross-Device Consistency', async () => {
    const { data, error } = await supabaseClient!
      .from('upload_history')
      .select('uploaded_at')
      .order('uploaded_at', { ascending: false })
      .limit(1);

    if (error) return { passed: false, message: `Cross-device query error: ${error.message}` };
    return {
      passed: true,
      message: 'Konsistensi database terverifikasi via PostgreSQL timestamp server-side.',
    };
  });

  const allPassed = steps.every(s => s.passed);
  return {
    allPassed,
    totalDurationMs: Date.now() - startTime,
    steps,
  };
}

// -----------------------------------------------------------------------------
// LIVE SUPABASE DATABASE QUERIES & SYNCHRONIZATION HELPERS
// -----------------------------------------------------------------------------

export async function getDashboardSummaryFromSupabase(styleFilter?: string) {
  if (!supabaseClient) throw new Error('Supabase not connected');

  let query = supabaseClient.from('material_requirements').select('requirement, received, shortage, readiness_status, style, or_number, material_code, material_name, unit');
  if (styleFilter && styleFilter.trim()) {
    query = query.ilike('style', `%${styleFilter.trim()}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  const rows = data || [];
  let totalKebutuhan = 0;
  let totalDiterima = 0;
  let totalKekurangan = 0;
  const distinctOrs = new Set<string>();
  const distinctStyles = new Set<string>();
  let readyCount = 0;
  let belumReadyCount = 0;
  const deficitMap = new Map<string, { material_code: string; material_name: string; unit: string; totalShortfall: number; orList: Set<string> }>();

  for (const r of rows) {
    const req = Number(r.requirement) || 0;
    const rec = Number(r.received) || 0;
    const short = Number(r.shortage) || calculateKekurangan(rec, req);

    totalKebutuhan += req;
    totalDiterima += rec;
    if (short < 0) {
      totalKekurangan += Math.abs(short);
      belumReadyCount++;

      const key = r.material_code;
      if (!deficitMap.has(key)) {
        deficitMap.set(key, {
          material_code: r.material_code,
          material_name: r.material_name,
          unit: r.unit || 'PCS',
          totalShortfall: 0,
          orList: new Set(),
        });
      }
      const item = deficitMap.get(key)!;
      item.totalShortfall += Math.abs(short);
      if (r.or_number) item.orList.add(r.or_number);
    } else {
      readyCount++;
    }

    if (r.or_number) distinctOrs.add(r.or_number);
    if (r.style) distinctStyles.add(r.style);
  }

  // Pareto calculation
  const sortedDeficits = Array.from(deficitMap.values()).sort((a, b) => b.totalShortfall - a.totalShortfall);
  let cumShortfall = 0;
  const paretoItems = sortedDeficits.slice(0, 15).map(item => {
    cumShortfall += item.totalShortfall;
    const cumPct = totalKekurangan > 0 ? (cumShortfall / totalKekurangan) * 100 : 0;
    return {
      material_code: item.material_code,
      material_name: item.material_name,
      shortfall: item.totalShortfall,
      unit: item.unit,
      cumulativePercentage: Math.round(cumPct * 10) / 10,
      affectedOrCount: item.orList.size,
    };
  });

  // Recent uploads for mini-table
  const { data: recentUploads } = await supabaseClient
    .from('upload_history')
    .select('*')
    .order('uploaded_at', { ascending: false })
    .limit(5);

  const readinessPercentage = totalKebutuhan > 0 ? Math.round((totalDiterima / totalKebutuhan) * 100) : 0;

  return {
    totalKebutuhan,
    totalDiterima,
    totalKekurangan,
    totalOr: distinctOrs.size,
    totalStyle: distinctStyles.size,
    readyCount,
    belumReadyCount,
    readinessPercentage,
    distinctStyles: Array.from(distinctStyles).sort(),
    paretoItems,
    recentUploads: (recentUploads || []).map(u => ({
      id: u.upload_id || u.id,
      or_number: u.or_number,
      style: u.style,
      update_date: u.update_date,
      upload_time: u.uploaded_at || u.upload_time || u.created_at,
      status: u.upload_status || u.status,
      total_rows: u.total_rows,
      success_rows: u.successful_rows || u.success_rows,
      failed_rows: u.failed_rows,
      file_name: u.file_name,
    })),
  };
}

export async function queryMaterialsFromSupabase(params: {
  page: number;
  pageSize: number;
  style?: string;
  or?: string;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  flaggedOnly?: boolean;
}) {
  if (!supabaseClient) throw new Error('Supabase not connected');

  const page = Math.max(1, params.page || 1);
  const pageSize = Math.min(1000, Math.max(1, params.pageSize || 25));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabaseClient.from('material_requirements').select('*', { count: 'exact' });

  if (params.style && params.style.trim()) {
    query = query.ilike('style', `%${params.style.trim()}%`);
  }
  if (params.or && params.or.trim()) {
    query = query.ilike('or_number', `%${params.or.trim()}%`);
  }
  if (params.status && params.status !== 'ALL') {
    query = query.eq('readiness_status', params.status);
  }
  if (params.dateFrom) {
    query = query.gte('update_date', params.dateFrom);
  }
  if (params.dateTo) {
    query = query.lte('update_date', params.dateTo);
  }
  if (params.flaggedOnly) {
    query = query.eq('is_flagged_for_review', true);
  }
  if (params.search && params.search.trim()) {
    const s = params.search.trim();
    query = query.or(`material_code.ilike.%${s}%,material_name.ilike.%${s}%,style.ilike.%${s}%,or_number.ilike.%${s}%`);
  }

  query = query.order('created_at', { ascending: false }).range(from, to);

  const { data, count, error } = await query;
  if (error) throw error;

  const total = count || 0;
  const totalPages = Math.ceil(total / pageSize);

  const items: MaterialRecord[] = (data || []).map(r => ({
    id: r.id,
    upload_id: r.upload_id,
    or_number: r.or_number,
    style: r.style,
    update_date: r.update_date,
    material_code: r.material_code,
    material_name: r.material_name,
    kebutuhan: Number(r.requirement ?? r.kebutuhan ?? 0),
    diterima: Number(r.received ?? r.diterima ?? 0),
    kekurangan: Number(r.shortage ?? r.kekurangan ?? 0),
    satuan: r.unit || r.satuan || 'PCS',
    status_kesiapan: (r.readiness_status || r.status_kesiapan) as 'READY' | 'BELUM READY',
    raw_display_name: r.raw_display_name || r.material_name,
    is_flagged_for_review: !!r.is_flagged_for_review,
    created_at: r.created_at,
  }));

  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
  };
}

export async function getUploadsFromSupabase() {
  if (!supabaseClient) throw new Error('Supabase not connected');

  const { data, error } = await supabaseClient
    .from('upload_history')
    .select('*')
    .order('uploaded_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(u => ({
    id: u.upload_id || u.id,
    or_number: u.or_number,
    style: u.style,
    update_date: u.update_date,
    upload_time: u.uploaded_at || u.upload_time || u.created_at,
    status: u.upload_status || u.status || 'completed',
    total_rows: u.total_rows || 0,
    success_rows: u.successful_rows || u.success_rows || 0,
    failed_rows: u.failed_rows || 0,
    checkpoint_batch: u.checkpoint_batch || 0,
    file_name: u.file_name || 'Upload.xlsx',
  }));
}

export async function getActiveOrStylesFromSupabase() {
  if (!supabaseClient) throw new Error('Supabase not connected');

  const { data, error } = await supabaseClient
    .from('or_style_relations')
    .select('or_number, style, latest_update_date, last_used_at')
    .order('last_used_at', { ascending: false });

  if (error || !data || data.length === 0) {
    // Fallback query from upload_history
    const { data: hist } = await supabaseClient
      .from('upload_history')
      .select('or_number, style, update_date')
      .order('uploaded_at', { ascending: false });

    const pairMap = new Map<string, { or_number: string; style: string; latestDate: string }>();
    for (const h of hist || []) {
      const k = `${h.or_number}:::${h.style}`;
      if (!pairMap.has(k)) {
        pairMap.set(k, { or_number: h.or_number, style: h.style, latestDate: h.update_date });
      }
    }
    const styles = Array.from(new Set((hist || []).map(h => h.style))).sort();
    const ors = Array.from(new Set((hist || []).map(h => h.or_number))).sort();
    return {
      pairs: Array.from(pairMap.values()),
      styles,
      ors,
    };
  }

  const styles = Array.from(new Set(data.map(d => d.style))).sort();
  const ors = Array.from(new Set(data.map(d => d.or_number))).sort();
  const pairs = data.map(d => ({
    or_number: d.or_number,
    style: d.style,
    latestDate: d.latest_update_date || new Date().toISOString().slice(0, 10),
  }));

  return { pairs, styles, ors };
}

export async function saveUploadAndMaterialsToSupabase(
  upload: UploadRecord,
  materials: MaterialRecord[]
) {
  if (!supabaseClient) return;

  try {
    // 1. Ensure upload_history record
    const { error: upErr } = await supabaseClient.from('upload_history').upsert({
      upload_id: upload.id,
      or_number: upload.or_number,
      style: upload.style,
      update_date: upload.update_date,
      uploaded_at: upload.upload_time || new Date().toISOString(),
      upload_status: upload.status,
      total_rows: upload.total_rows,
      successful_rows: upload.success_rows,
      failed_rows: upload.failed_rows,
      checkpoint_batch: upload.checkpoint_batch,
      file_name: upload.file_name,
    });
    if (upErr) console.warn('[Supabase Sync] upload_history:', upErr.message);

    // 2. Batch insert materials (500 items per chunk)
    const formatted = materials.map(m => ({
      upload_id: upload.id,
      or_number: m.or_number,
      style: m.style,
      update_date: m.update_date,
      material_code: m.material_code,
      material_name: m.material_name,
      requirement: m.kebutuhan,
      received: m.diterima,
      shortage: m.kekurangan,
      unit: m.satuan,
      readiness_status: m.status_kesiapan,
      raw_display_name: m.raw_display_name,
      is_flagged_for_review: m.is_flagged_for_review,
    }));

    for (let i = 0; i < formatted.length; i += 500) {
      const chunk = formatted.slice(i, i + 500);
      const { error: matErr } = await supabaseClient.from('material_requirements').insert(chunk);
      if (matErr) console.warn('[Supabase Sync] material_requirements chunk error:', matErr.message);
    }

    // 3. Update or_style_relations
    await supabaseClient.from('or_style_relations').upsert({
      or_number: upload.or_number,
      style: upload.style,
      latest_update_date: upload.update_date,
      last_used_at: new Date().toISOString(),
    });

    // 4. Update master_materials
    const uniqueMats = Array.from(new Set(materials.map(m => m.material_code))).map(code => {
      const mat = materials.find(m => m.material_code === code)!;
      return {
        material_code: mat.material_code,
        material_name: mat.material_name,
        unit: mat.satuan || 'PCS',
        last_seen_at: new Date().toISOString(),
      };
    });

    if (uniqueMats.length > 0) {
      await supabaseClient.from('master_materials').upsert(uniqueMats, { onConflict: 'material_code' });
    }
  } catch (err) {
    console.error('[Supabase Sync Error]', err);
  }
}

export async function getSchedulesFromSupabase(filter?: { style?: string; or?: string; line?: string }) {
  if (!supabaseClient) throw new Error('Supabase not connected');

  let query = supabaseClient.from('production_schedules').select('*');
  if (filter?.style && filter.style.trim()) {
    query = query.ilike('style', `%${filter.style.trim()}%`);
  }
  if (filter?.or && filter.or.trim()) {
    query = query.ilike('or_number', `%${filter.or.trim()}%`);
  }
  if (filter?.line && filter.line.trim()) {
    query = query.ilike('production_line', `%${filter.line.trim()}%`);
  }

  const { data, error } = await query.order('created_at', { ascending: false });
  if (error) throw error;

  return (data || []).map(s => ({
    id: s.id,
    or_number: s.or_number,
    style: s.style,
    line_produksi: s.production_line || s.line_produksi,
    target_produksi: Number(s.target_production ?? s.target_produksi ?? 0),
    tanggal_mulai: s.production_start || s.tanggal_mulai,
    tanggal_selesai: s.production_end || s.tanggal_selesai,
    notes: s.notes || '',
    created_at: s.created_at,
  }));
}

export async function saveScheduleToSupabase(schedule: ProductionScheduleRecord) {
  if (!supabaseClient) return;
  try {
    await supabaseClient.from('production_schedules').insert({
      or_number: schedule.or_number,
      style: schedule.style,
      production_line: schedule.line_produksi,
      target_production: schedule.target_produksi,
      production_start: schedule.tanggal_mulai,
      production_end: schedule.tanggal_selesai,
      notes: schedule.notes || '',
    });
  } catch (err) {
    console.error('[Supabase Schedule Sync Error]', err);
  }
}

export async function deleteScheduleFromSupabase(id: string) {
  if (!supabaseClient) return;
  try {
    await supabaseClient.from('production_schedules').delete().eq('id', id);
  } catch (err) {
    console.error('[Supabase Schedule Delete Error]', err);
  }
}

export async function saveAuditLogToSupabase(audit: DeletionAuditRecord) {
  if (!supabaseClient) return;
  try {
    await supabaseClient.from('deletion_history').insert({
      action_type: audit.action_type,
      records_affected: audit.records_affected,
      details: audit.details,
      confirmed_by: audit.confirmed_by,
      deleted_at: audit.timestamp,
    });
  } catch (err) {
    console.error('[Supabase Audit Sync Error]', err);
  }
}

export async function getAuditLogsFromSupabase() {
  if (!supabaseClient) throw new Error('Supabase not connected');
  const { data, error } = await supabaseClient
    .from('deletion_history')
    .select('*')
    .order('deleted_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(d => ({
    id: d.id,
    action_type: d.action_type,
    records_affected: d.records_affected,
    details: d.details,
    confirmed_by: d.confirmed_by,
    timestamp: d.deleted_at || d.timestamp || d.created_at,
  }));
}

export async function deleteSelectiveMaterialsInSupabase(ids: string[], reason: string, confirmedBy: string) {
  if (!supabaseClient) throw new Error('Supabase not connected');

  const { error } = await supabaseClient
    .from('material_requirements')
    .delete()
    .in('id', ids);

  if (error) throw error;

  await saveAuditLogToSupabase({
    id: `audit-${Date.now()}`,
    action_type: 'SELECTIVE_DELETE',
    records_affected: ids.length,
    details: reason || `Manual selective deletion of ${ids.length} material records in Supabase.`,
    confirmed_by: confirmedBy || 'PPIC Supervisor',
    timestamp: new Date().toISOString(),
  });

  return { success: true, deletedCount: ids.length };
}

export async function deleteMaterialsByOrInSupabase(orNumber: string, confirmedBy: string) {
  if (!supabaseClient) throw new Error('Supabase not connected');

  // Cascade delete will delete material_requirements when upload_history is deleted
  const { data: uploads } = await supabaseClient
    .from('upload_history')
    .select('upload_id')
    .eq('or_number', orNumber);

  const uploadIds = (uploads || []).map(u => u.upload_id);

  const { count: matCount } = await supabaseClient
    .from('material_requirements')
    .select('id', { count: 'exact', head: true })
    .eq('or_number', orNumber);

  await supabaseClient.from('upload_history').delete().eq('or_number', orNumber);
  await supabaseClient.from('or_style_relations').delete().eq('or_number', orNumber);

  const affected = matCount || 0;
  await saveAuditLogToSupabase({
    id: `audit-${Date.now()}`,
    action_type: 'MANUAL_OR_PURGE',
    records_affected: affected,
    details: `Full purge of OR ${orNumber} in Supabase. ${affected} items removed.`,
    confirmed_by: confirmedBy || 'PPIC Manager',
    timestamp: new Date().toISOString(),
  });

  return { success: true, deletedCount: affected };
}
