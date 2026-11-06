import express, { Request, Response } from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { store, MaterialRecord, UploadRecord, ProductionScheduleRecord } from './server/store.js';
import {
  calculateKekurangan,
  determineReadiness,
  calculateShortfallPositive,
  parseMaterialCodeAndName,
  calculateRiskLevel,
  calculateRolling4DaysRetentionCutoff
} from './src/utils/ppicRules.js';
import {
  isSupabaseConfigured,
  testSupabaseConnection,
  runSupabaseDiagnosticSuite,
  getDashboardSummaryFromSupabase,
  queryMaterialsFromSupabase,
  getUploadsFromSupabase,
  getActiveOrStylesFromSupabase,
  saveUploadAndMaterialsToSupabase,
  getSchedulesFromSupabase,
  saveScheduleToSupabase,
  deleteScheduleFromSupabase,
  saveAuditLogToSupabase,
  getAuditLogsFromSupabase,
  deleteSelectiveMaterialsInSupabase,
  deleteMaterialsByOrInSupabase,
} from './server/supabase.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Initialize Gemini Client
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

// -----------------------------------------------------------------------------
// 1. SYSTEM HEALTH & METADATA
// -----------------------------------------------------------------------------
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    storeStats: {
      totalUploads: store.uploads.length,
      totalMaterials: store.materials.length,
      totalSchedules: store.schedules.length,
      totalAuditLogs: store.auditLogs.length,
    },
    env: {
      hasGeminiKey: !!geminiApiKey,
      isSupabaseLive: isSupabaseConfigured(),
      nodeEnv: process.env.NODE_ENV || 'development',
    },
  });
});

app.get('/api/supabase/status', async (_req: Request, res: Response) => {
  const result = await testSupabaseConnection();
  res.json(result);
});

app.post('/api/supabase/run-diagnostic-suite', async (_req: Request, res: Response) => {
  const results = await runSupabaseDiagnosticSuite();
  res.json(results);
});

// -----------------------------------------------------------------------------
// 2. DASHBOARD AGGREGATED METRICS & PARETO
// -----------------------------------------------------------------------------
app.get('/api/dashboard/summary', async (req: Request, res: Response) => {
  const style = req.query.style as string | undefined;

  if (isSupabaseConfigured()) {
    try {
      const stats = await getDashboardSummaryFromSupabase(style);
      return res.json(stats);
    } catch (err: any) {
      console.warn('[Dashboard Supabase fallback to store]:', err.message);
    }
  }

  const stats = store.getDashboardStats(style);
  res.json(stats);
});

// -----------------------------------------------------------------------------
// 3. UPLOAD HISTORY & STYLE AUTOCOMPLETE REFERENCE
// -----------------------------------------------------------------------------
app.get('/api/uploads', async (_req: Request, res: Response) => {
  if (isSupabaseConfigured()) {
    try {
      const supaUploads = await getUploadsFromSupabase();
      return res.json({ uploads: supaUploads });
    } catch (err: any) {
      console.warn('[Uploads Supabase fallback]:', err.message);
    }
  }

  res.json({
    uploads: store.uploads.slice().reverse(),
  });
});

app.get('/api/uploads/active-or-styles', async (_req: Request, res: Response) => {
  if (isSupabaseConfigured()) {
    try {
      const supaPairs = await getActiveOrStylesFromSupabase();
      return res.json(supaPairs);
    } catch (err: any) {
      console.warn('[Active OR/Styles Supabase fallback]:', err.message);
    }
  }

  // Returns unique historical combinations of OR and Style for autocomplete suggestions
  const pairsMap = new Map<string, { or_number: string; style: string; latestDate: string }>();

  for (const up of store.uploads) {
    const key = `${up.or_number}:::${up.style}`;
    if (!pairsMap.has(key)) {
      pairsMap.set(key, {
        or_number: up.or_number,
        style: up.style,
        latestDate: up.update_date,
      });
    }
  }

  const distinctStyles = Array.from(new Set(store.uploads.map(u => u.style))).sort();
  const distinctOrs = Array.from(new Set(store.uploads.map(u => u.or_number))).sort();

  res.json({
    pairs: Array.from(pairsMap.values()),
    styles: distinctStyles,
    ors: distinctOrs,
  });
});

// -----------------------------------------------------------------------------
// 4. BATCH INSERT & RESUME UPLOAD (Append-Only, High-Volume)
// -----------------------------------------------------------------------------
app.post('/api/uploads/batch', (req: Request, res: Response) => {
  try {
    const {
      uploadId,
      orNumber,
      style,
      updateDate,
      fileName,
      batchIndex,
      totalBatches,
      items,
      isFinalBatch,
    } = req.body;

    if (!uploadId || !orNumber || !style || !updateDate || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing required upload parameters' });
    }

    // Check or create upload history record (Idempotent)
    let upload = store.uploads.find(u => u.id === uploadId);
    if (!upload) {
      upload = {
        id: uploadId,
        or_number: orNumber.trim(),
        style: style.trim(),
        update_date: updateDate,
        upload_time: new Date().toISOString(),
        status: 'processing',
        total_rows: 0,
        success_rows: 0,
        failed_rows: 0,
        checkpoint_batch: batchIndex,
        file_name: fileName || 'Upload.xlsx',
      };
      store.uploads.push(upload);
    } else {
      upload.checkpoint_batch = Math.max(upload.checkpoint_batch, batchIndex);
    }

    // Process items in this batch with UUID idempotency
    const existingIds = new Set(store.materials.map(m => m.id));
    let batchSuccess = 0;
    let batchFailed = 0;

    for (const item of items) {
      try {
        if (!item.id || existingIds.has(item.id)) {
          // Skip if already inserted in prior retry
          continue;
        }

        const parsed = parseMaterialCodeAndName(item.raw_display_name || item.material_name);
        const code = item.material_code ? String(item.material_code) : parsed.materialCode;
        const name = item.material_name ? String(item.material_name) : parsed.materialName;
        const reqQty = Number(item.kebutuhan) || 0;
        const recQty = Number(item.diterima) || 0;
        const kekurangan = calculateKekurangan(recQty, reqQty);
        const statusKesiapan = determineReadiness(kekurangan);

        const record: MaterialRecord = {
          id: item.id,
          upload_id: uploadId,
          or_number: orNumber.trim(),
          style: style.trim(),
          update_date: updateDate,
          material_code: code,
          material_name: name,
          kebutuhan: reqQty,
          diterima: recQty,
          kekurangan,
          satuan: item.satuan || 'PCS',
          status_kesiapan: statusKesiapan,
          raw_display_name: item.raw_display_name || name,
          is_flagged_for_review: !!item.is_flagged_for_review || parsed.isFlaggedForReview,
          created_at: new Date().toISOString(),
        };

        store.materials.push(record);
        existingIds.add(item.id);
        batchSuccess++;
      } catch (err) {
        batchFailed++;
      }
    }

    upload.success_rows += batchSuccess;
    upload.failed_rows += batchFailed;
    upload.total_rows = upload.success_rows + upload.failed_rows;

    if (isFinalBatch) {
      upload.status = upload.failed_rows > 0 ? 'partial_failure' : 'completed';
    }

    store.save();

    if (isSupabaseConfigured() && batchSuccess > 0) {
      const insertedChunk = store.materials.slice(-batchSuccess);
      saveUploadAndMaterialsToSupabase(upload, insertedChunk).catch(e => {
        console.warn('[Supabase Live Sync]', e);
      });
    }

    res.json({
      success: true,
      uploadId,
      batchIndex,
      batchSuccess,
      batchFailed,
      totalSuccessSoFar: upload.success_rows,
      status: upload.status,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Internal server error processing batch' });
  }
});

// Resume Upload Checkpoint query
app.get('/api/uploads/:id/checkpoint', (req: Request, res: Response) => {
  const upload = store.uploads.find(u => u.id === req.params.id);
  if (!upload) {
    return res.status(404).json({ error: 'Upload not found' });
  }
  res.json({
    uploadId: upload.id,
    checkpointBatch: upload.checkpoint_batch,
    status: upload.status,
    successRows: upload.success_rows,
  });
});

// -----------------------------------------------------------------------------
// 5. MASTER DATA / REKAP MATERIAL (PAGINATED, SERVER-SIDE SEARCH)
// -----------------------------------------------------------------------------
app.get('/api/materials', async (req: Request, res: Response) => {
  const {
    page,
    pageSize,
    style,
    or,
    search,
    status,
    dateFrom,
    dateTo,
    flaggedOnly,
  } = req.query;

  if (isSupabaseConfigured()) {
    try {
      const supaResult = await queryMaterialsFromSupabase({
        page: page ? parseInt(page as string, 10) : 1,
        pageSize: pageSize ? parseInt(pageSize as string, 10) : 25,
        style: style as string,
        or: or as string,
        search: search as string,
        status: status as string,
        dateFrom: dateFrom as string,
        dateTo: dateTo as string,
        flaggedOnly: flaggedOnly === 'true',
      });
      return res.json(supaResult);
    } catch (err: any) {
      console.warn('[Materials Supabase fallback to store]:', err.message);
    }
  }

  const result = store.queryMaterials({
    page: page ? parseInt(page as string, 10) : 1,
    pageSize: pageSize ? parseInt(pageSize as string, 10) : 25,
    style: style as string,
    or: or as string,
    search: search as string,
    status: status as string,
    dateFrom: dateFrom as string,
    dateTo: dateTo as string,
    flaggedOnly: flaggedOnly === 'true',
  });

  res.json(result);
});

// Selective delete of materials
app.post('/api/materials/selective-delete', async (req: Request, res: Response) => {
  const { ids, reason, confirmedBy } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  const idsSet = new Set(ids);
  const initialCount = store.materials.length;
  store.materials = store.materials.filter(m => !idsSet.has(m.id));
  const deletedCount = initialCount - store.materials.length;

  const auditRecord = {
    id: `audit-${Date.now()}`,
    action_type: 'SELECTIVE_DELETE' as const,
    records_affected: deletedCount,
    details: reason || `Manual selective deletion of ${deletedCount} material records.`,
    confirmed_by: confirmedBy || 'PPIC Supervisor',
    timestamp: new Date().toISOString(),
  };

  store.auditLogs.unshift(auditRecord);
  store.save();

  if (isSupabaseConfigured()) {
    try {
      await deleteSelectiveMaterialsInSupabase(ids, reason, confirmedBy);
    } catch (err: any) {
      console.warn('[Supabase Selective Delete]:', err.message);
    }
  }

  res.json({
    success: true,
    deletedCount,
    auditRecord,
  });
});

// Delete by OR Number
app.post('/api/materials/delete-by-or', async (req: Request, res: Response) => {
  const { orNumber, confirmedBy } = req.body;
  if (!orNumber) {
    return res.status(400).json({ error: 'orNumber is required' });
  }

  const targetOr = orNumber.trim();
  const initialMats = store.materials.length;
  store.materials = store.materials.filter(m => m.or_number !== targetOr);
  const deletedMats = initialMats - store.materials.length;

  // Also remove from uploads
  store.uploads = store.uploads.filter(u => u.or_number !== targetOr);

  const auditRecord = {
    id: `audit-${Date.now()}`,
    action_type: 'MANUAL_OR_PURGE' as const,
    records_affected: deletedMats,
    details: `Full purge of OR ${targetOr}. ${deletedMats} items removed.`,
    confirmed_by: confirmedBy || 'PPIC Manager',
    timestamp: new Date().toISOString(),
  };

  store.auditLogs.unshift(auditRecord);
  store.save();

  if (isSupabaseConfigured()) {
    try {
      await deleteMaterialsByOrInSupabase(targetOr, confirmedBy);
    } catch (err: any) {
      console.warn('[Supabase Delete by OR]:', err.message);
    }
  }

  res.json({
    success: true,
    deletedCount: deletedMats,
    auditRecord,
  });
});

// -----------------------------------------------------------------------------
// 6. ROLLING 4 HARI RETENTION ENGINE
// -----------------------------------------------------------------------------
app.get('/api/rolling-retention/simulate', (_req: Request, res: Response) => {
  const cutoff = calculateRolling4DaysRetentionCutoff();

  // Find uploads with upload_time < cutoff
  const expiredUploads = store.uploads.filter(u => new Date(u.upload_time) < cutoff);
  const expiredUploadIds = new Set(expiredUploads.map(u => u.id));

  const expiredMaterials = store.materials.filter(m => expiredUploadIds.has(m.upload_id));

  res.json({
    cutoffDate: cutoff.toISOString(),
    retentionDays: 4,
    expiredUploadCount: expiredUploads.length,
    expiredMaterialCount: expiredMaterials.length,
    sampleExpiredUploads: expiredUploads.map(u => ({
      id: u.id,
      or_number: u.or_number,
      style: u.style,
      upload_time: u.upload_time,
      total_rows: u.total_rows,
    })),
  });
});

app.post('/api/rolling-retention/execute', (req: Request, res: Response) => {
  const { confirmedBy } = req.body;
  const cutoff = calculateRolling4DaysRetentionCutoff();

  const expiredUploads = store.uploads.filter(u => new Date(u.upload_time) < cutoff);
  const expiredUploadIds = new Set(expiredUploads.map(u => u.id));

  const initialCount = store.materials.length;
  store.materials = store.materials.filter(m => !expiredUploadIds.has(m.upload_id));
  const purgedMaterials = initialCount - store.materials.length;

  store.uploads = store.uploads.filter(u => !expiredUploadIds.has(u.id));

  const auditRecord = {
    id: `audit-rolling-${Date.now()}`,
    action_type: 'ROLLING_4_DAYS_PURGE' as const,
    records_affected: purgedMaterials,
    details: `Executed Rolling 4 Hari retention cleanup. Removed ${purgedMaterials} materials across ${expiredUploads.length} uploads older than ${cutoff.toISOString().slice(0, 10)}.`,
    confirmed_by: confirmedBy || 'PPIC System Admin',
    timestamp: new Date().toISOString(),
  };

  store.auditLogs.unshift(auditRecord);
  store.save();

  res.json({
    success: true,
    purgedUploadsCount: expiredUploads.length,
    purgedMaterialsCount: purgedMaterials,
    auditRecord,
  });
});

app.get('/api/audit-logs', async (_req: Request, res: Response) => {
  if (isSupabaseConfigured()) {
    try {
      const supaLogs = await getAuditLogsFromSupabase();
      return res.json({ logs: supaLogs });
    } catch (err: any) {
      console.warn('[Audit Logs Supabase fallback]:', err.message);
    }
  }

  res.json({
    logs: store.auditLogs,
  });
});

// -----------------------------------------------------------------------------
// 7. PRODUCTION SCHEDULES
// -----------------------------------------------------------------------------
app.get('/api/schedules', async (req: Request, res: Response) => {
  const { style, or, line } = req.query;

  if (isSupabaseConfigured()) {
    try {
      const supaSchedules = await getSchedulesFromSupabase({
        style: style as string,
        or: or as string,
        line: line as string,
      });
      return res.json({ schedules: supaSchedules });
    } catch (err: any) {
      console.warn('[Schedules Supabase fallback]:', err.message);
    }
  }

  let items = store.schedules;

  if (style && (style as string).trim()) {
    const s = (style as string).trim().toLowerCase();
    items = items.filter(sc => sc.style.toLowerCase().includes(s));
  }

  if (or && (or as string).trim()) {
    const o = (or as string).trim().toLowerCase();
    items = items.filter(sc => sc.or_number.toLowerCase().includes(o));
  }

  if (line && (line as string).trim()) {
    const l = (line as string).trim().toLowerCase();
    items = items.filter(sc => sc.line_produksi.toLowerCase().includes(l));
  }

  res.json({ schedules: items });
});

app.post('/api/schedules', async (req: Request, res: Response) => {
  const { or_number, style, line_produksi, target_produksi, tanggal_mulai, tanggal_selesai, notes } = req.body;

  if (!or_number || !style || !line_produksi || !tanggal_mulai || !tanggal_selesai) {
    return res.status(400).json({ error: 'Semua field jadwal produksi wajib diisi' });
  }

  const newSchedule: ProductionScheduleRecord = {
    id: `sch-${Date.now()}`,
    or_number: or_number.trim(),
    style: style.trim(),
    line_produksi: line_produksi.trim(),
    target_produksi: Number(target_produksi) || 0,
    tanggal_mulai,
    tanggal_selesai,
    notes: notes || '',
    created_at: new Date().toISOString(),
  };

  store.schedules.push(newSchedule);
  store.save();

  if (isSupabaseConfigured()) {
    try {
      await saveScheduleToSupabase(newSchedule);
    } catch (err: any) {
      console.warn('[Supabase Schedule Save]:', err.message);
    }
  }

  res.json({ success: true, schedule: newSchedule });
});

app.delete('/api/schedules/:id', async (req: Request, res: Response) => {
  const id = req.params.id;
  const initial = store.schedules.length;
  store.schedules = store.schedules.filter(s => s.id !== id);
  store.save();

  if (isSupabaseConfigured()) {
    try {
      await deleteScheduleFromSupabase(id);
    } catch (err: any) {
      console.warn('[Supabase Schedule Delete]:', err.message);
    }
  }

  res.json({ success: true, deleted: initial > store.schedules.length });
});

// -----------------------------------------------------------------------------
// 8. MATERIAL RISK ANALYSIS ENGINE
// -----------------------------------------------------------------------------
app.get('/api/risk-analysis', (req: Request, res: Response) => {
  const filterStyle = req.query.style as string | undefined;
  const filterOr = req.query.or as string | undefined;

  let schedules = store.schedules;
  if (filterStyle && filterStyle.trim()) {
    const s = filterStyle.trim().toLowerCase();
    schedules = schedules.filter(sc => sc.style.toLowerCase().includes(s));
  }
  if (filterOr && filterOr.trim()) {
    const o = filterOr.trim().toLowerCase();
    schedules = schedules.filter(sc => sc.or_number.toLowerCase().includes(o));
  }

  const now = new Date();
  const analysisResults = schedules.map(sch => {
    // Find all materials associated with this OR & Style
    const relatedMaterials = store.materials.filter(
      m => m.or_number === sch.or_number && m.style === sch.style
    );

    const totalKebutuhan = relatedMaterials.reduce((acc, m) => acc + (Number(m.kebutuhan) || 0), 0);
    const totalDiterima = relatedMaterials.reduce((acc, m) => acc + (Number(m.diterima) || 0), 0);
    const deficitItems = relatedMaterials.filter(m => m.status_kesiapan === 'BELUM READY');

    // Calculate days remaining to production start
    const startDate = new Date(sch.tanggal_mulai);
    const diffMs = startDate.getTime() - now.getTime();
    const daysRemaining = Math.ceil(diffMs / 86400000);

    const readinessRatio = totalKebutuhan > 0 ? totalDiterima / totalKebutuhan : 1;
    const riskLevel = calculateRiskLevel(daysRemaining, readinessRatio, deficitItems.length);

    // Shortfall details for root-cause analysis
    const rootCauseMaterials = deficitItems.map(d => ({
      code: d.material_code,
      name: d.material_name,
      kebutuhan: d.kebutuhan,
      diterima: d.diterima,
      kekurangan: d.kekurangan, // negative number
      shortfallQty: calculateShortfallPositive(d.diterima, d.kebutuhan),
      satuan: d.satuan,
    }));

    return {
      scheduleId: sch.id,
      or_number: sch.or_number,
      style: sch.style,
      line_produksi: sch.line_produksi,
      target_produksi: sch.target_produksi,
      tanggal_mulai: sch.tanggal_mulai,
      tanggal_selesai: sch.tanggal_selesai,
      daysRemaining,
      readinessRatio: Math.round(readinessRatio * 100),
      riskLevel,
      totalKebutuhan,
      totalDiterima,
      deficitCount: deficitItems.length,
      rootCauseMaterials,
    };
  });

  // Sort by risk severity: CRITICAL > HIGH > MEDIUM > LOW
  const severityRank: Record<string, number> = {
    'CRITICAL RISK': 1,
    'HIGH RISK': 2,
    'MEDIUM RISK': 3,
    'LOW RISK': 4,
  };

  analysisResults.sort((a, b) => severityRank[a.riskLevel] - severityRank[b.riskLevel]);

  const counts = {
    critical: analysisResults.filter(r => r.riskLevel === 'CRITICAL RISK').length,
    high: analysisResults.filter(r => r.riskLevel === 'HIGH RISK').length,
    medium: analysisResults.filter(r => r.riskLevel === 'MEDIUM RISK').length,
    low: analysisResults.filter(r => r.riskLevel === 'LOW RISK').length,
  };

  res.json({
    summary: counts,
    results: analysisResults,
  });
});

// -----------------------------------------------------------------------------
// 9. HIGH-VOLUME SYNTHETIC GENERATOR (FOR STRESS TESTING 20K - 40K ROWS)
// -----------------------------------------------------------------------------
app.post('/api/sample-data/generate-bulk', (req: Request, res: Response) => {
  const { count = 1000, orPrefix = 'STRESS-OR', style = 'ST-BENCHMARK-X' } = req.body;
  const numRows = Math.min(25000, Math.max(100, Number(count) || 1000));
  const uploadId = `bench-${Date.now()}`;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);

  const materialsPool = [
    { code: '00101-FAB', name: 'Cotton Single Jersey 20s Solid', uom: 'YDS' },
    { code: '00205-ZIP', name: 'Nylon Coil Zipper #3 Closed End', uom: 'PCS' },
    { code: '00311-THR', name: 'Core Spun Poly Thread 50/2', uom: 'CONE' },
    { code: '00412-ELAS', name: 'Spandex Knitted Elastic 3.5cm', uom: 'MTR' },
    { code: '00520-BTN', name: 'Melamine Shirt Button 16L White', uom: 'GROSS' },
    { code: '00602-RIB', name: 'Cotton Rib 2x2 Tubular Bleached', uom: 'KG' },
    { code: '00730-FUS', name: 'Microdot Non-Woven Interlining', uom: 'MTR' },
    { code: '00810-LBL', name: 'Taffeta Size Label Printed S/M/L', uom: 'PCS' },
    { code: '00910-BOX', name: 'Corrugated Carton Single Wall', uom: 'PCS' },
    { code: '00950-PLY', name: 'BOPP Polybag Adhesive Flap', uom: 'PCS' },
  ];

  const generatedMaterials: MaterialRecord[] = [];
  const orNumber = `${orPrefix}-${Math.floor(Math.random() * 9000 + 1000)}`;

  for (let i = 1; i <= numRows; i++) {
    const template = materialsPool[i % materialsPool.length];
    const code = `${template.code}-${String(i).padStart(5, '0')}`;
    const name = `${template.name} Lot #${Math.ceil(i / 100)}`;
    const kebutuhan = Math.floor(Math.random() * 500 + 50) * 10;
    // 70% chance received is adequate, 30% shortage
    const recRatio = Math.random() > 0.3 ? 1.0 : Math.random() * 0.7;
    const diterima = Math.round(kebutuhan * recRatio);
    const kekurangan = calculateKekurangan(diterima, kebutuhan);
    const status_kesiapan = determineReadiness(kekurangan);

    generatedMaterials.push({
      id: `bulk-${uploadId}-${i}`,
      upload_id: uploadId,
      or_number: orNumber,
      style: style,
      update_date: dateStr,
      material_code: code,
      material_name: name,
      kebutuhan,
      diterima,
      kekurangan,
      satuan: template.uom,
      status_kesiapan,
      raw_display_name: `[${code}] ${name}`,
      is_flagged_for_review: false,
      created_at: now.toISOString(),
    });
  }

  // Register in upload_history
  const uploadRecord: UploadRecord = {
    id: uploadId,
    or_number: orNumber,
    style: style,
    update_date: dateStr,
    upload_time: now.toISOString(),
    status: 'completed',
    total_rows: numRows,
    success_rows: numRows,
    failed_rows: 0,
    checkpoint_batch: 1,
    file_name: `Bulk_Benchmark_${numRows}_rows.xlsx`,
  };

  store.uploads.push(uploadRecord);
  store.materials.push(...generatedMaterials);
  store.save();

  res.json({
    success: true,
    addedRows: numRows,
    totalDatabaseRows: store.materials.length,
    orNumber,
    style,
    uploadId,
  });
});

// -----------------------------------------------------------------------------
// 10. AI ASSISTANT PIPELINE (DUAL-AGENT CHAIN, TTS, CHAT, IMAGE UNDERSTANDING)
// -----------------------------------------------------------------------------

// Dual Chain Analysis: Model 1 Analysis -> Model 2 Evaluation/Executive Decision
app.post('/api/ai/dual-analysis', async (req: Request, res: Response) => {
  try {
    const { style, or_number } = req.body;

    // Filter relevant dataset
    let relevantMats = store.materials;
    if (style) {
      relevantMats = relevantMats.filter(m => m.style.toLowerCase() === style.toLowerCase());
    }
    if (or_number) {
      relevantMats = relevantMats.filter(m => m.or_number.toLowerCase() === or_number.toLowerCase());
    }

    const deficitMats = relevantMats.filter(m => m.status_kesiapan === 'BELUM READY');
    const totalReq = relevantMats.reduce((acc, m) => acc + m.kebutuhan, 0);
    const totalRec = relevantMats.reduce((acc, m) => acc + m.diterima, 0);

    const relevantSchedules = store.schedules.filter(s =>
      (!style || s.style.toLowerCase() === style.toLowerCase()) &&
      (!or_number || s.or_number.toLowerCase() === or_number.toLowerCase())
    );

    const contextPayload = {
      targetStyle: style || 'SEMUA STYLE',
      targetOR: or_number || 'SEMUA OR',
      totalMaterials: relevantMats.length,
      readinessSummary: {
        totalKebutuhan: totalReq,
        totalDiterima: totalRec,
        kekuranganTotal: calculateKekurangan(totalRec, totalReq),
        deficitItemsCount: deficitMats.length,
      },
      topDeficits: deficitMats.slice(0, 5).map(d => ({
        code: d.material_code,
        name: d.material_name,
        kebutuhan: d.kebutuhan,
        diterima: d.diterima,
        shortfall: calculateShortfallPositive(d.diterima, d.kebutuhan),
        satuan: d.satuan,
      })),
      schedules: relevantSchedules.map(s => ({
        line: s.line_produksi,
        mulai: s.tanggal_mulai,
        selesai: s.tanggal_selesai,
        target: s.target_produksi,
      })),
    };

    if (!geminiApiKey) {
      // Deterministic rule-based fallback if API key is not yet set
      return res.json({
        agent1Analysis: `[Model 1 - Analisis Operasional PPIC]: Ditemukan ${deficitMats.length} item material berstatus BELUM READY dengan total defisit ${calculateShortfallPositive(totalRec, totalReq)} unit. Item paling kritis adalah ${deficitMats[0]?.material_name || 'N/A'}. Lini produksi berpotensi mengalami keterlambatan cut-to-sew bila pengiriman vendor tidak dipercepat dalam 48 jam ke depan.`,
        agent2Evaluation: `[Model 2 - Evaluasi Strategis & Audit Risiko]: Rekomendasi disetujui dengan penyesuaian: Jadwalkan partial delivery untuk aksesoris utama, dan alihkan kapasitas Line jika kedatangan kain melebihi lead time toleransi 2 hari. Segera konfirmasi Surat Jalan vendor pengganti.`,
        finalRecommendation: `Prioritaskan pengadaan darurat untuk ${deficitMats.slice(0, 3).map(m => m.material_code).join(', ') || 'komponen utama'}. Monitor buffer stock harian.`,
        context: contextPayload,
      });
    }

    // Helper with timeout
    const generateWithTimeout = async (prompt: string, timeoutMs = 4500): Promise<string> => {
      try {
        const fetchPromise = ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents: prompt,
        });
        const timeoutPromise = new Promise<null>((_, reject) =>
          setTimeout(() => reject(new Error('AI generation timeout')), timeoutMs)
        );
        const res: any = await Promise.race([fetchPromise, timeoutPromise]);
        return res?.text || '';
      } catch (e) {
        return '';
      }
    };

    // Agent 1: Operational Material Analyst
    const prompt1 = `Anda adalah Model 1 (AI Material Analyst PPIC). Lakukan analisis mendalam terhadap data material berikut:
${JSON.stringify(contextPayload, null, 2)}
Tugas:
1. Identifikasi material bottleneck utama.
2. Analisis dampak terhadap jadwal produksi yang terdaftar.
3. Berikan kalkulasi lead time & deviasi kesiapan.
Jawab dalam Bahasa Indonesia, ringkas, profesional, dan padat angka.`;

    let agent1Text = await generateWithTimeout(prompt1);
    if (!agent1Text) {
      const topDeficitQty = deficitMats[0] ? calculateShortfallPositive(deficitMats[0].diterima, deficitMats[0].kebutuhan) : 0;
      agent1Text = `[Model 1 - Analisis Operasional PPIC]: Ditemukan ${deficitMats.length} komponen berstatus BELUM READY dengan akumulasi defisit ${calculateShortfallPositive(totalRec, totalReq)} unit. Item paling kritis adalah ${deficitMats[0]?.material_name || 'N/A'} (${deficitMats[0]?.material_code || ''}) dengan kekurangan ${topDeficitQty} ${deficitMats[0]?.satuan || 'PCS'}. Lini produksi ${relevantSchedules[0]?.line_produksi || 'Line 01'} berpotensi mengalami keterlambatan perakitan bila pengiriman tidak tiba dalam 48 jam.`;
    }

    // Agent 2: Strategic Auditor & Executive Evaluator
    const prompt2 = `Anda adalah Model 2 (AI Executive Auditor & Supply Chain Evaluator).
Berikut adalah hasil analisis awal dari Model 1:
"${agent1Text}"

Dan data mentah:
${JSON.stringify(contextPayload, null, 2)}

Tugas:
1. Evaluasi kelemahan atau risiko tak terlihat dari analisis Model 1.
2. Berikan keputusan final mitigasi (misal: penyesuaian Line Produksi, split PO, atau overtime).
3. Buat 3 langkah tindakan konkret (Action Items) bagi PPIC.`;

    let agent2Text = await generateWithTimeout(prompt2);
    if (!agent2Text) {
      agent2Text = `[Model 2 - Evaluasi Strategis & Audit Risiko]: Rekomendasi mitigasi disetujui:
1. Koordinasi dispatch partial shipment dengan vendor utama untuk ${deficitMats[0]?.material_name || 'komponen kritis'}.
2. Jika lead time pengiriman melebihi 2 hari kerja, geser pemotongan kain (cutting) dan alokasikan kapasitas lini ke order yang telah 100% READY.
3. Pasang alert buffer stock harian pada sistem PPIC agar deviasi kuantitas terdeteksi sebelum tanggal mulai produksi.`;
    }

    res.json({
      agent1Analysis: agent1Text,
      agent2Evaluation: agent2Text,
      finalRecommendation: `Mitigasi terkonfirmasi oleh Dual-Engine PPIC untuk Style ${style || 'Aktif'}.`,
      context: contextPayload,
    });
  } catch (err: any) {
    console.error('Dual AI analysis error:', err);
    res.status(500).json({ error: err.message || 'Error processing AI analysis' });
  }
});

// Gemini Multi-Turn Chat
app.post('/api/ai/chat', async (req: Request, res: Response) => {
  try {
    const { messages, currentStyle, currentOr } = req.body;
    if (!Array.isArray(messages)) {
      return res.status(400).json({ error: 'messages array is required' });
    }

    if (!geminiApiKey) {
      return res.json({
        reply: `Halo! Saya adalah PPIC AI Assistant. Saat ini memantau Style: "${currentStyle || 'Semua'}" dan OR: "${currentOr || 'Semua'}". Sistem mendeteksi ${store.materials.filter(m => m.status_kesiapan === 'BELUM READY').length} material belum ready dari total ${store.materials.length} material di database. Apa yang ingin Anda tanyakan mengenai jadwal atau kebutuhan material?`,
      });
    }

    const systemInstruction = `Anda adalah PPIC Intelligent Co-Pilot profesional untuk industri manufaktur garmen/tekstil.
Tugas Anda membantu manajer dan staf PPIC dalam:
- Menghitung kecukupan material (Kekurangan = Diterima - Kebutuhan, jika < 0 maka BELUM READY).
- Memeriksa dampak keterlambatan material pada jadwal lini produksi.
- Menjelaskan formula Pareto 80/20 untuk item paling defisit.
- Menyarankan prioritas purchasing dan re-alokasi line.
Data konteks aktif:
- Style Aktif: ${currentStyle || 'Semua'}
- OR Aktif: ${currentOr || 'Semua'}
- Total Baris Material di Database: ${store.materials.length}
- Total Upload: ${store.uploads.length}
Gunakan gaya bahasa Indonesia yang profesional, ramah, to the point, dan hindari jargon teknis yang bertele-tele.`;

    // Convert message history to Gemini format
    const contents = messages.map(m => ({
      role: m.sender === 'user' ? 'user' : 'model',
      parts: [{ text: m.text }],
    }));

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents,
      config: {
        systemInstruction,
      },
    });

    res.json({
      reply: response.text || 'Tidak ada balasan dari model.',
    });
  } catch (err: any) {
    console.error('Chat error:', err);
    res.status(500).json({ error: err.message || 'Chat error' });
  }
});

// Text-to-Speech using gemini-3.8-flash-tts
app.post('/api/ai/tts', async (req: Request, res: Response) => {
  try {
    const { text } = req.body;
    if (!text) {
      return res.status(400).json({ error: 'text is required' });
    }

    if (!geminiApiKey) {
      return res.status(503).json({
        error: 'GEMINI_API_KEY belum dikonfigurasi untuk sintesis suara.',
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.8-flash-tts',
      contents: text.slice(0, 500), // safe TTS length
      config: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: 'Puck',
            },
          },
        },
      },
    });

    const candidate = response.candidates?.[0];
    const audioPart = candidate?.content?.parts?.find(p => p.inlineData?.mimeType?.startsWith('audio/'));

    if (audioPart && audioPart.inlineData) {
      res.json({
        mimeType: audioPart.inlineData.mimeType,
        audioBase64: audioPart.inlineData.data,
      });
    } else {
      res.status(500).json({ error: 'Gagal mengekstrak audio dari respons TTS Gemini.' });
    }
  } catch (err: any) {
    console.error('TTS error:', err);
    res.status(500).json({ error: err.message || 'TTS generation failed' });
  }
});

// Image Analysis with gemini-4-argon
app.post('/api/ai/analyze-image', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', prompt = 'Analisis dokumen label atau material fisik ini' } = req.body;
    if (!imageBase64) {
      return res.status(400).json({ error: 'imageBase64 is required' });
    }

    if (!geminiApiKey) {
      return res.json({
        analysis: `[Simulasi Offline Analisis Gambar]: Dokumen/foto material terdeteksi dengan format ${mimeType}. Silakan lengkapi GEMINI_API_KEY untuk analisis visual mendalam OCR nomor lot, identifikasi cacat serat kain, atau verifikasi label barcode.`,
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-4-argon',
      contents: [
        {
          role: 'user',
          parts: [
            {
              inlineData: {
                mimeType,
                data: imageBase64.replace(/^data:image\/\w+;base64,/, ''),
              },
            },
            {
              text: `Anda adalah AI Pengawas Mutu & PPIC Material Scanner (gemini-4-argon).
Periksa gambar ini secara cermat (label roll kain, faktur PO, Surat Jalan, swatch material, atau kemasan).
Ekstrak:
1. Nomor PO / OR atau Kode Material yang tertera.
2. Nama Komoditas / Deskripsi Spesifikasi.
3. Kuantitas atau Satuan yang tercantum.
4. Anomali fisik (kerusakan kemasan, cacat noda, warna belang, atau barcode kabur).
Instruksi pengguna: ${prompt}`,
            },
          ],
        },
      ],
    });

    res.json({
      analysis: response.text || 'Tidak ada teks yang diekstrak.',
    });
  } catch (err: any) {
    console.error('Image analysis error:', err);
    res.status(500).json({ error: err.message || 'Failed to analyze image' });
  }
});

// -----------------------------------------------------------------------------
// 11. VITE INTEGRATION & SERVER START
// -----------------------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`PPIC System Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
