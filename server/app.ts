import express, { Request, Response, NextFunction } from 'express';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';
import { store, MaterialRecord, UploadRecord, ProductionScheduleRecord } from './store.js';
import {
  calculateKekurangan,
  determineReadiness,
  calculateShortfallPositive,
  parseMaterialCodeAndName,
  calculateRiskLevel,
  calculateRolling4DaysRetentionCutoff,
} from '../src/utils/ppicRules.js';
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
} from './supabase.js';

dotenv.config();

const app = express();

// -----------------------------------------------------------------------------
// GLOBAL MIDDLEWARES & CORS
// -----------------------------------------------------------------------------
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

app.use((req: Request, res: Response, next: NextFunction) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// Initialize Gemini Client
const geminiApiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey: geminiApiKey });

// -----------------------------------------------------------------------------
// CENTRALIZED API ROUTER
// Compatible with both standalone Node.js and Vercel Serverless Functions
// -----------------------------------------------------------------------------
const apiRouter = express.Router();

// 1. SYSTEM HEALTH & METADATA
apiRouter.get('/health', (_req: Request, res: Response) => {
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

// 2. SUPABASE REAL STATUS & DIAGNOSTICS
apiRouter.get('/supabase/status', async (_req: Request, res: Response) => {
  try {
    const result = await testSupabaseConnection();
    res.json(result);
  } catch (err: any) {
    res.status(500).json({
      state: 'SUPABASE_CONNECTION_ERROR',
      configured: false,
      connected: false,
      url: 'Error',
      message: err.message || 'Gagal mengecek status koneksi Supabase',
    });
  }
});

apiRouter.post('/supabase/run-diagnostic-suite', async (_req: Request, res: Response) => {
  try {
    const results = await runSupabaseDiagnosticSuite();
    res.json(results);
  } catch (err: any) {
    res.status(500).json({
      allPassed: false,
      totalDurationMs: 0,
      steps: [{
        step: 0,
        name: 'Suite Execution Failure',
        passed: false,
        durationMs: 0,
        message: err.message || 'Diagnostic suite failed to execute',
      }],
    });
  }
});

// 3. DASHBOARD AGGREGATED METRICS & PARETO
apiRouter.get('/dashboard/summary', async (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch dashboard summary' });
  }
});

// 4. UPLOAD HISTORY & STYLE AUTOCOMPLETE REFERENCE
apiRouter.get('/uploads', async (_req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch uploads' });
  }
});

apiRouter.get('/uploads/active-or-styles', async (_req: Request, res: Response) => {
  try {
    if (isSupabaseConfigured()) {
      try {
        const supaPairs = await getActiveOrStylesFromSupabase();
        return res.json(supaPairs);
      } catch (err: any) {
        console.warn('[Active OR/Styles Supabase fallback]:', err.message);
      }
    }

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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch active styles' });
  }
});

// 5. BATCH INSERT & RESUME UPLOAD (Append-Only)
apiRouter.post('/uploads/batch', (req: Request, res: Response) => {
  try {
    const {
      uploadId,
      orNumber,
      style,
      updateDate,
      fileName,
      batchIndex,
      items,
      isFinalBatch,
    } = req.body;

    if (!uploadId || !orNumber || !style || !updateDate || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing required upload parameters (uploadId, orNumber, style, updateDate, items)' });
    }

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

    const existingIds = new Set(store.materials.map(m => m.id));
    let batchSuccess = 0;
    let batchFailed = 0;

    for (const item of items) {
      try {
        if (!item.id || existingIds.has(item.id)) {
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

apiRouter.get('/uploads/:id/checkpoint', (req: Request, res: Response) => {
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

// 6. MASTER DATA / REKAP MATERIAL (Paginated, Searchable)
apiRouter.get('/materials', async (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to query materials' });
  }
});

apiRouter.post('/materials/selective-delete', async (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete materials' });
  }
});

apiRouter.post('/materials/delete-by-or', async (req: Request, res: Response) => {
  try {
    const { orNumber, confirmedBy } = req.body;
    if (!orNumber) {
      return res.status(400).json({ error: 'orNumber is required' });
    }

    const targetOr = orNumber.trim();
    const initialMats = store.materials.length;
    store.materials = store.materials.filter(m => m.or_number !== targetOr);
    const deletedMats = initialMats - store.materials.length;

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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to purge by OR' });
  }
});

// 7. ROLLING 4 HARI RETENTION ENGINE
apiRouter.get('/rolling-retention/simulate', (_req: Request, res: Response) => {
  try {
    const cutoff = calculateRolling4DaysRetentionCutoff();

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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to simulate retention' });
  }
});

apiRouter.post('/rolling-retention/execute', (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to execute retention cleanup' });
  }
});

apiRouter.get('/audit-logs', async (_req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch audit logs' });
  }
});

// 8. PRODUCTION SCHEDULES
apiRouter.get('/schedules', async (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to fetch schedules' });
  }
});

apiRouter.post('/schedules', async (req: Request, res: Response) => {
  try {
    const { or_number, style, line_produksi, target_produksi, tanggal_mulai, tanggal_selesai, notes } = req.body;

    if (!or_number || !style || !line_produksi || !tanggal_mulai || !tanggal_selesai) {
      return res.status(400).json({ error: 'Semua field jadwal produksi (or_number, style, line_produksi, tanggal_mulai, tanggal_selesai) wajib diisi' });
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to save schedule' });
  }
});

apiRouter.delete('/schedules/:id', async (req: Request, res: Response) => {
  try {
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to delete schedule' });
  }
});

// 9. MATERIAL RISK ANALYSIS ENGINE
apiRouter.get('/risk-analysis', (req: Request, res: Response) => {
  try {
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
      const relatedMaterials = store.materials.filter(
        m => m.or_number === sch.or_number && m.style === sch.style
      );

      const totalKebutuhan = relatedMaterials.reduce((acc, m) => acc + (Number(m.kebutuhan) || 0), 0);
      const totalDiterima = relatedMaterials.reduce((acc, m) => acc + (Number(m.diterima) || 0), 0);
      const deficitItems = relatedMaterials.filter(m => m.status_kesiapan === 'BELUM READY');

      const startDate = new Date(sch.tanggal_mulai);
      const diffMs = startDate.getTime() - now.getTime();
      const daysRemaining = Math.ceil(diffMs / 86400000);

      const readinessRatio = totalKebutuhan > 0 ? totalDiterima / totalKebutuhan : 1;
      const riskLevel = calculateRiskLevel(daysRemaining, readinessRatio, deficitItems.length);

      const rootCauseMaterials = deficitItems.map(d => ({
        code: d.material_code,
        name: d.material_name,
        kebutuhan: d.kebutuhan,
        diterima: d.diterima,
        kekurangan: d.kekurangan,
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
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to run risk analysis' });
  }
});

// 10. BULK TEST DATA GENERATOR
apiRouter.post('/sample-data/generate-bulk', (req: Request, res: Response) => {
  try {
    const { count = 20000, orPrefix = 'OR-TEST', style = 'ST-SYNTHETIC' } = req.body;
    const numRows = Math.min(Math.max(100, Number(count)), 40000);

    const uploadId = `u-bulk-${Date.now()}`;
    const orNumber = `${orPrefix}-${Date.now().toString().slice(-4)}`;
    const updateDate = new Date().toISOString().slice(0, 10);

    const sampleComponents = [
      { code: 'FAB-CTN-01', name: 'Cotton Combed 30s Reaktif Black', uom: 'YDS', reqBase: 5000 },
      { code: 'THD-POL-40', name: 'Polyester Sewing Thread 40/2', uom: 'CONE', reqBase: 250 },
      { code: 'BTN-PLT-18', name: 'Polyester Button 18L Smoke Grey', uom: 'GROSS', reqBase: 120 },
      { code: 'ZIP-MET-05', name: 'Metal Zipper #5 Antique Brass 18cm', uom: 'PCS', reqBase: 2400 },
      { code: 'LBL-SAT-MN', name: 'Woven Satin Main Label 45x20mm', uom: 'PCS', reqBase: 2500 },
      { code: 'ELT-WVN-25', name: 'Elastic Webbing Band 25mm White', uom: 'MTR', reqBase: 800 },
      { code: 'PKT-CTN-WT', name: 'Pocketing Twill TC 65/35 White', uom: 'YDS', reqBase: 1200 },
      { code: 'RVT-CPR-09', name: 'Copper Jeans Rivet 9mm Embossed', uom: 'PCS', reqBase: 4800 },
    ];

    const newMaterials: MaterialRecord[] = [];
    for (let i = 0; i < numRows; i++) {
      const comp = sampleComponents[i % sampleComponents.length];
      const variance = (i % 7) * 10;
      const req = comp.reqBase + variance;
      const rec = i % 4 === 0 ? Math.floor(req * 0.7) : req;
      const short = calculateKekurangan(rec, req);
      const ready = determineReadiness(short);

      newMaterials.push({
        id: `mat-bulk-${uploadId}-${i + 1}`,
        upload_id: uploadId,
        or_number: orNumber,
        style: style,
        update_date: updateDate,
        material_code: `${comp.code}-${String(i + 1).padStart(5, '0')}`,
        material_name: `${comp.name} [Lot #${(i % 50) + 1}]`,
        kebutuhan: req,
        diterima: rec,
        kekurangan: short,
        satuan: comp.uom,
        status_kesiapan: ready,
        raw_display_name: `[${comp.code}-${String(i + 1).padStart(5, '0')}] ${comp.name}`,
        is_flagged_for_review: false,
        created_at: new Date().toISOString(),
      });
    }

    const uploadRecord: UploadRecord = {
      id: uploadId,
      or_number: orNumber,
      style: style,
      update_date: updateDate,
      upload_time: new Date().toISOString(),
      status: 'completed',
      total_rows: numRows,
      success_rows: numRows,
      failed_rows: 0,
      checkpoint_batch: Math.ceil(numRows / 1000),
      file_name: `Bulk_Generated_${numRows}_Rows.xlsx`,
    };

    store.uploads.push(uploadRecord);
    store.materials.push(...newMaterials);
    store.save();

    res.json({
      success: true,
      message: `Berhasil menambahkan ${numRows} baris data sintetis. Total material dalam memori saat ini: ${store.materials.length} baris.`,
      uploadRecord,
      generatedCount: numRows,
      currentTotalMaterials: store.materials.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Failed to generate bulk data' });
  }
});

// 11. AI COPILOT ASSISTANT & MULTIMODAL
apiRouter.post('/ai/dual-analysis', async (req: Request, res: Response) => {
  try {
    const { style, or_number } = req.body;
    let relevantMats = store.materials;
    if (style) relevantMats = relevantMats.filter(m => m.style.toLowerCase().includes(String(style).toLowerCase()));
    if (or_number) relevantMats = relevantMats.filter(m => m.or_number.toLowerCase().includes(String(or_number).toLowerCase()));

    const deficitMats = relevantMats.filter(m => m.status_kesiapan === 'BELUM READY');
    const totalReq = relevantMats.reduce((acc, m) => acc + m.kebutuhan, 0);
    const totalRec = relevantMats.reduce((acc, m) => acc + m.diterima, 0);

    const contextText = `Data PPIC:
Total Material: ${relevantMats.length}
Total Kebutuhan: ${totalReq}
Total Diterima: ${totalRec}
Kekurangan: ${totalRec - totalReq}
Defisit Terbanyak: ${deficitMats.slice(0, 5).map(m => `${m.material_name} (${calculateShortfallPositive(m.diterima, m.kebutuhan)} ${m.satuan})`).join(', ')}`;

    if (!geminiApiKey) {
      return res.json({
        model1Operational: `[Simulasi Offline Analisis Operasional]: Terdeteksi ${deficitMats.length} material belum ready untuk Style ${style || 'Semua'}. Segera terbitkan Purchase Expediting Form ke supplier benang dan kain untuk menutup defisit.`,
        model2Auditor: `[Simulasi Offline Audit Eksekutif]: Verifikasi kesesuaian formula Kekurangan = Diterima - Kebutuhan menunjukkan integritas 100%. Risiko keterlambatan jadwal line cutting tergolong moderat jika pasokan tiba dalam 48 jam.`,
      });
    }

    const [resp1, resp2] = await Promise.all([
      ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: `Anda adalah Model 1 - PPIC Operational Expediter. Berikan rencana aksi taktis 3 poin ringkas untuk mengatasi kekurangan material berikut:\n${contextText}`,
      }),
      ai.models.generateContent({
        model: 'gemini-2.5-pro',
        contents: `Anda adalah Model 2 - Executive Supply Chain Risk Auditor. Berikan penilaian risiko finansial dan operasional kritis untuk pimpinan pabrik:\n${contextText}`,
      }),
    ]);

    res.json({
      model1Operational: resp1.text || 'Tidak ada analisis operasional yang dihasilkan.',
      model2Auditor: resp2.text || 'Tidak ada analisis audit yang dihasilkan.',
    });
  } catch (err: any) {
    console.error('AI analysis error:', err);
    res.status(500).json({ error: err.message || 'AI analysis failed' });
  }
});

apiRouter.post('/ai/chat', async (req: Request, res: Response) => {
  try {
    const { messages, currentStyle, currentOr } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const lastMsg = messages[messages.length - 1].text;
    const sysPrompt = `Anda adalah Co-Pilot PPIC Senior untuk PPIC Material Recapitulation.
Aturan:
1. Kekurangan = Diterima - Kebutuhan.
2. Kekurangan >= 0 => READY.
3. Kekurangan < 0 => BELUM READY.
Konteks Style: ${currentStyle || 'Semua'}, OR: ${currentOr || 'Semua'}.
Jawab profesional, padat, dan solutif.`;

    if (!geminiApiKey) {
      return res.json({
        reply: `[Simulasi Offline]: Saya memantau data PPIC untuk Style "${currentStyle || 'Semua'}". Anda menanyakan: "${lastMsg}". Sistem siap membantu koordinasi supply chain dan analisis risiko kekurangan material.`,
      });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: `${sysPrompt}\n\nPertanyaan Pengguna: ${lastMsg}`,
    });

    res.json({
      reply: response.text || 'Maaf, tidak dapat menghasilkan jawaban saat ini.',
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Chat failed' });
  }
});

apiRouter.post('/ai/tts', async (req: Request, res: Response) => {
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
      contents: text.slice(0, 500),
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
    res.status(500).json({ error: err.message || 'TTS generation failed' });
  }
});

apiRouter.post('/ai/analyze-image', async (req: Request, res: Response) => {
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
    res.status(500).json({ error: err.message || 'Failed to analyze image' });
  }
});

// -----------------------------------------------------------------------------
// DUAL MOUNTING:
// Supports both `https://domain.com/api/...` AND rewrites that stripped `/api`
// -----------------------------------------------------------------------------
app.use('/api', apiRouter);
app.use(apiRouter);

// JSON 404 for unhandled API endpoints (prevents HTML NOT_FOUND error)
app.use('/api/*', (_req: Request, res: Response) => {
  res.status(404).json({
    error: 'Endpoint API tidak ditemukan',
    path: _req.originalUrl,
  });
});

export { app, apiRouter };
export default app;
