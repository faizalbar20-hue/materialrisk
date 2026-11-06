import fs from 'fs';
import path from 'path';
import { calculateKekurangan, determineReadiness, calculateShortfallPositive, calculateRolling4DaysRetentionCutoff } from '../src/utils/ppicRules.js';

export interface UploadRecord {
  id: string;
  or_number: string;
  style: string;
  update_date: string;
  upload_time: string;
  status: 'pending' | 'processing' | 'partial_failure' | 'completed' | 'failed';
  total_rows: number;
  success_rows: number;
  failed_rows: number;
  checkpoint_batch: number;
  file_name: string;
}

export interface MaterialRecord {
  id: string;
  upload_id: string;
  or_number: string;
  style: string;
  update_date: string;
  material_code: string;
  material_name: string;
  kebutuhan: number;
  diterima: number;
  kekurangan: number; // Formula: Diterima - Kebutuhan
  satuan: string;
  status_kesiapan: 'READY' | 'BELUM READY';
  raw_display_name: string;
  is_flagged_for_review: boolean;
  created_at: string;
}

export interface ProductionScheduleRecord {
  id: string;
  or_number: string;
  style: string;
  line_produksi: string;
  target_produksi: number;
  tanggal_mulai: string;
  tanggal_selesai: string;
  notes?: string;
  created_at: string;
}

export interface DeletionAuditRecord {
  id: string;
  action_type: 'ROLLING_4_DAYS_PURGE' | 'MANUAL_OR_PURGE' | 'SELECTIVE_DELETE';
  records_affected: number;
  details: string;
  confirmed_by: string;
  timestamp: string;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const STORE_FILE = path.join(DATA_DIR, 'ppic_store.json');

class PPICDataStore {
  public uploads: UploadRecord[] = [];
  public materials: MaterialRecord[] = [];
  public schedules: ProductionScheduleRecord[] = [];
  public auditLogs: DeletionAuditRecord[] = [];

  constructor() {
    this.init();
  }

  private init() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }

    if (fs.existsSync(STORE_FILE)) {
      try {
        const raw = fs.readFileSync(STORE_FILE, 'utf-8');
        const data = JSON.parse(raw);
        this.uploads = data.uploads || [];
        this.materials = data.materials || [];
        this.schedules = data.schedules || [];
        this.auditLogs = data.auditLogs || [];
      } catch (err) {
        console.error('Error loading store, re-seeding...', err);
        this.seedInitialData();
      }
    } else {
      this.seedInitialData();
    }
  }

  public save() {
    try {
      fs.writeFileSync(
        STORE_FILE,
        JSON.stringify({
          uploads: this.uploads,
          materials: this.materials,
          schedules: this.schedules,
          auditLogs: this.auditLogs,
        }),
        'utf-8'
      );
    } catch (err) {
      console.error('Failed to write store file:', err);
    }
  }

  public seedInitialData() {
    const now = new Date();
    const dStr = (offsetDays: number) => {
      const d = new Date(now.getTime() - offsetDays * 86400000);
      return d.toISOString().slice(0, 10);
    };

    const upload1Id = 'u-001-aero';
    const upload2Id = 'u-002-sport';
    const upload3Id = 'u-003-denim';
    const uploadOldId = 'u-004-archive-old';

    this.uploads = [
      {
        id: upload1Id,
        or_number: 'OR-2026-0891',
        style: 'ST-AERO-2026',
        update_date: dStr(1),
        upload_time: new Date(now.getTime() - 1 * 86400000).toISOString(),
        status: 'completed',
        total_rows: 6,
        success_rows: 6,
        failed_rows: 0,
        checkpoint_batch: 1,
        file_name: 'PO_Export_OR0891_Aero.xlsx',
      },
      {
        id: upload2Id,
        or_number: 'OR-2026-0892',
        style: 'ST-SPORT-V2',
        update_date: dStr(2),
        upload_time: new Date(now.getTime() - 2 * 86400000).toISOString(),
        status: 'completed',
        total_rows: 5,
        success_rows: 5,
        failed_rows: 0,
        checkpoint_batch: 1,
        file_name: 'PO_Export_OR0892_Sport.xlsx',
      },
      {
        id: upload3Id,
        or_number: 'OR-2026-0893',
        style: 'ST-POLO-ELITE',
        update_date: dStr(0),
        upload_time: now.toISOString(),
        status: 'completed',
        total_rows: 5,
        success_rows: 5,
        failed_rows: 0,
        checkpoint_batch: 1,
        file_name: 'PO_Export_OR0893_Polo.xlsx',
      },
      {
        id: uploadOldId,
        or_number: 'OR-2026-0870',
        style: 'ST-VINTAGE-99',
        update_date: dStr(6),
        upload_time: new Date(now.getTime() - 6 * 86400000).toISOString(),
        status: 'completed',
        total_rows: 3,
        success_rows: 3,
        failed_rows: 0,
        checkpoint_batch: 1,
        file_name: 'PO_Export_Archive_Old.xlsx',
      },
    ];

    const rawMaterialsList = [
      // ST-AERO-2026 (OR-2026-0891)
      { upload_id: upload1Id, or: 'OR-2026-0891', style: 'ST-AERO-2026', date: dStr(1), code: '00104-FAB', name: 'Cotton Combed 30s Black Reactive', req: 4500, rec: 4500, uom: 'YDS', raw: '[00104-FAB] Cotton Combed 30s Black Reactive' },
      { upload_id: upload1Id, or: 'OR-2026-0891', style: 'ST-AERO-2026', date: dStr(1), code: '00105-RIB', name: 'Rib Spandex 1x1 Matching Black', req: 850, rec: 500, uom: 'KG', raw: '[00105-RIB] Rib Spandex 1x1 Matching Black' },
      { upload_id: upload1Id, or: 'OR-2026-0891', style: 'ST-AERO-2026', date: dStr(1), code: '00210-ZIP', name: 'Metal Zipper #5 YKK Gunmetal 20cm', req: 3200, rec: 1800, uom: 'PCS', raw: '00210-ZIP - Metal Zipper #5 YKK Gunmetal 20cm' },
      { upload_id: upload1Id, or: 'OR-2026-0891', style: 'ST-AERO-2026', date: dStr(1), code: '00340-THR', name: 'Sewing Thread Poly 40/2 Black #001', req: 240, rec: 240, uom: 'CONE', raw: '00340-THR : Sewing Thread Poly 40/2 Black #001' },
      { upload_id: upload1Id, or: 'OR-2026-0891', style: 'ST-AERO-2026', date: dStr(1), code: '00890-LBL', name: 'Woven Satin Main Label Aero Tech', req: 3200, rec: 3200, uom: 'PCS', raw: '[00890-LBL] Woven Satin Main Label Aero Tech' },
      { upload_id: upload1Id, or: 'OR-2026-0891', style: 'ST-AERO-2026', date: dStr(1), code: '00912-PLY', name: 'Polybag OPP Self-Adhesive 30x40cm', req: 3200, rec: 1200, uom: 'PCS', raw: '00912-PLY Polybag OPP Self-Adhesive 30x40cm' },

      // ST-SPORT-V2 (OR-2026-0892)
      { upload_id: upload2Id, or: 'OR-2026-0892', style: 'ST-SPORT-V2', date: dStr(2), code: '00412-DRY', name: 'Polyester Dryfit Milano 150gsm Navy', req: 5200, rec: 5200, uom: 'YDS', raw: '[00412-DRY] Polyester Dryfit Milano 150gsm Navy' },
      { upload_id: upload2Id, or: 'OR-2026-0892', style: 'ST-SPORT-V2', date: dStr(2), code: '00415-DRY', name: 'Polyester Dryfit Milano Neon Lime Accent', req: 1100, rec: 400, uom: 'YDS', raw: '[00415-DRY] Polyester Dryfit Milano Neon Lime Accent' },
      { upload_id: upload2Id, or: 'OR-2026-0892', style: 'ST-SPORT-V2', date: dStr(2), code: '00550-ELS', name: 'Jacquard Elastic Band 4cm Sport Active', req: 2800, rec: 1400, uom: 'MTR', raw: '00550-ELS - Jacquard Elastic Band 4cm Sport Active' },
      { upload_id: upload2Id, or: 'OR-2026-0892', style: 'ST-SPORT-V2', date: dStr(2), code: '00342-THR', name: 'Spun Poly Thread Navy High Tenacity', req: 180, rec: 180, uom: 'CONE', raw: '00342-THR / Spun Poly Thread Navy High Tenacity' },
      { upload_id: upload2Id, or: 'OR-2026-0892', style: 'ST-SPORT-V2', date: dStr(2), code: '00895-LBL', name: 'Heat Transfer Care Label Reflective', req: 2800, rec: 2800, uom: 'PCS', raw: '[00895-LBL] Heat Transfer Care Label Reflective' },

      // ST-POLO-ELITE (OR-2026-0893)
      { upload_id: upload3Id, or: 'OR-2026-0893', style: 'ST-POLO-ELITE', date: dStr(0), code: '00601-PIQ', name: 'Cotton CVC Pique 24s Maroon Red', req: 3800, rec: 3800, uom: 'YDS', raw: '[00601-PIQ] Cotton CVC Pique 24s Maroon Red' },
      { upload_id: upload3Id, or: 'OR-2026-0893', style: 'ST-POLO-ELITE', date: dStr(0), code: '00605-COL', name: 'Jacquard Knit Collar Flat Knit Maroon', req: 2400, rec: 2400, uom: 'PCS', raw: '[00605-COL] Jacquard Knit Collar Flat Knit Maroon' },
      { upload_id: upload3Id, or: 'OR-2026-0893', style: 'ST-POLO-ELITE', date: dStr(0), code: '00710-BTN', name: 'Mother of Pearl 4-Hole Button 18L', req: 7500, rec: 7500, uom: 'PCS', raw: '00710-BTN : Mother of Pearl 4-Hole Button 18L' },
      { upload_id: upload3Id, or: 'OR-2026-0893', style: 'ST-POLO-ELITE', date: dStr(0), code: '00720-FUS', name: 'Woven Interlining Fusible 25D Collar', req: 600, rec: 350, uom: 'MTR', raw: '00720-FUS - Woven Interlining Fusible 25D Collar' },
      { upload_id: upload3Id, or: 'OR-2026-0893', style: 'ST-POLO-ELITE', date: dStr(0), code: '00920-CTN', name: 'Master Shipping Carton 5-Ply 60x40x40', req: 120, rec: 120, uom: 'PCS', raw: '00920-CTN Master Shipping Carton 5-Ply 60x40x40' },

      // ST-VINTAGE-99 (Old upload > 4 days for testing Rolling 4 Hari)
      { upload_id: uploadOldId, or: 'OR-2026-0870', style: 'ST-VINTAGE-99', date: dStr(6), code: '00088-DNM', name: 'Heavy Twill 14oz Washed Indigo', req: 2000, rec: 2000, uom: 'YDS', raw: '[00088-DNM] Heavy Twill 14oz Washed Indigo' },
      { upload_id: uploadOldId, or: 'OR-2026-0870', style: 'ST-VINTAGE-99', date: dStr(6), code: '00089-RIV', name: 'Copper Rivet 9mm Embossed Vintage', req: 8000, rec: 8000, uom: 'PCS', raw: '00089-RIV : Copper Rivet 9mm Embossed Vintage' },
      { upload_id: uploadOldId, or: 'OR-2026-0870', style: 'ST-VINTAGE-99', date: dStr(6), code: '00090-LTH', name: 'Genuine Leather Back Patch 7x5cm', req: 1000, rec: 1000, uom: 'PCS', raw: '[00090-LTH] Genuine Leather Back Patch 7x5cm' },
    ];

    let idx = 1;
    this.materials = rawMaterialsList.map(m => {
      const kekurangan = calculateKekurangan(m.rec, m.req);
      const status_kesiapan = determineReadiness(kekurangan);
      return {
        id: `mat-${idx++}`,
        upload_id: m.upload_id,
        or_number: m.or,
        style: m.style,
        update_date: m.date,
        material_code: m.code,
        material_name: m.name,
        kebutuhan: m.req,
        diterima: m.rec,
        kekurangan,
        satuan: m.uom,
        status_kesiapan,
        raw_display_name: m.raw,
        is_flagged_for_review: false,
        created_at: new Date(now.getTime() - (idx * 3600000)).toISOString(),
      };
    });

    // Production Schedules
    this.schedules = [
      {
        id: 'sch-01',
        or_number: 'OR-2026-0891',
        style: 'ST-AERO-2026',
        line_produksi: 'Line 01',
        target_produksi: 3000,
        tanggal_mulai: dStr(-2), // Starts in 2 days (urgent!)
        tanggal_selesai: dStr(-8),
        notes: 'Prioritas ekspor Q4. Cek ketersediaan zipper dan rib.',
        created_at: now.toISOString(),
      },
      {
        id: 'sch-02',
        or_number: 'OR-2026-0892',
        style: 'ST-SPORT-V2',
        line_produksi: 'Line 03',
        target_produksi: 2600,
        tanggal_mulai: dStr(-5), // Starts in 5 days
        tanggal_selesai: dStr(-12),
        notes: 'Menunggu pengiriman kain neon lime dan karet pinggang.',
        created_at: now.toISOString(),
      },
      {
        id: 'sch-03',
        or_number: 'OR-2026-0893',
        style: 'ST-POLO-ELITE',
        line_produksi: 'Line 02',
        target_produksi: 2200,
        tanggal_mulai: dStr(-9), // Starts in 9 days
        tanggal_selesai: dStr(-15),
        notes: 'Material hampir 90% ready, jadwal stabil.',
        created_at: now.toISOString(),
      },
    ];

    this.auditLogs = [
      {
        id: 'audit-init-01',
        action_type: 'ROLLING_4_DAYS_PURGE',
        records_affected: 0,
        details: 'Initial system audit logging initialized. Rolling 4 Hari retention policy active.',
        confirmed_by: 'System Bootstrap',
        timestamp: now.toISOString(),
      },
    ];

    this.save();
  }

  // Multi-criteria search and server-side pagination
  public queryMaterials(params: {
    page?: number;
    pageSize?: number;
    style?: string;
    or?: string;
    search?: string;
    status?: string;
    dateFrom?: string;
    dateTo?: string;
    flaggedOnly?: boolean;
  }) {
    const page = Math.max(1, Number(params.page) || 1);
    const pageSize = Math.max(1, Math.min(1000, Number(params.pageSize) || 25));

    let filtered = [...this.materials];

    // Style filter (case-insensitive)
    if (params.style && params.style.trim()) {
      const q = params.style.trim().toLowerCase();
      filtered = filtered.filter(m => m.style.toLowerCase().includes(q));
    }

    // OR filter
    if (params.or && params.or.trim()) {
      const q = params.or.trim().toLowerCase();
      filtered = filtered.filter(m => m.or_number.toLowerCase().includes(q));
    }

    // General search (Style, OR, Code, Name)
    if (params.search && params.search.trim()) {
      const q = params.search.trim().toLowerCase();
      filtered = filtered.filter(m =>
        m.style.toLowerCase().includes(q) ||
        m.or_number.toLowerCase().includes(q) ||
        m.material_code.toLowerCase().includes(q) ||
        m.material_name.toLowerCase().includes(q)
      );
    }

    // Status filter
    if (params.status && params.status !== 'ALL') {
      filtered = filtered.filter(m => m.status_kesiapan === params.status);
    }

    // Date range
    if (params.dateFrom) {
      filtered = filtered.filter(m => m.update_date >= params.dateFrom!);
    }
    if (params.dateTo) {
      filtered = filtered.filter(m => m.update_date <= params.dateTo!);
    }

    if (params.flaggedOnly) {
      filtered = filtered.filter(m => m.is_flagged_for_review);
    }

    const total = filtered.length;
    const totalPages = Math.ceil(total / pageSize) || 1;
    const startIndex = (page - 1) * pageSize;
    const paginatedItems = filtered.slice(startIndex, startIndex + pageSize);

    return {
      items: paginatedItems,
      total,
      page,
      pageSize,
      totalPages,
    };
  }

  // Dashboard Aggregations
  public getDashboardStats(filterStyle?: string) {
    let mats = this.materials;
    if (filterStyle && filterStyle.trim()) {
      const s = filterStyle.trim().toLowerCase();
      mats = mats.filter(m => m.style.toLowerCase().includes(s));
    }

    let totalKebutuhan = 0;
    let totalDiterima = 0;
    let countReady = 0;
    let countBelumReady = 0;
    const distinctOr = new Set<string>();
    const distinctStyle = new Set<string>();
    const shortfallByMaterial: Record<string, { code: string; name: string; shortfall: number; satuan: string; style: string }> = {};

    for (const m of mats) {
      totalKebutuhan += Number(m.kebutuhan) || 0;
      totalDiterima += Number(m.diterima) || 0;
      if (m.status_kesiapan === 'READY') {
        countReady++;
      } else {
        countBelumReady++;
      }
      distinctOr.add(m.or_number);
      distinctStyle.add(m.style);

      // Shortfall for Pareto (Positive shortage)
      const deficit = calculateShortfallPositive(m.diterima, m.kebutuhan);
      if (deficit > 0) {
        const key = `${m.material_code}_${m.material_name}`;
        if (!shortfallByMaterial[key]) {
          shortfallByMaterial[key] = {
            code: m.material_code,
            name: m.material_name,
            shortfall: 0,
            satuan: m.satuan,
            style: m.style,
          };
        }
        shortfallByMaterial[key].shortfall += deficit;
      }
    }

    // Formula Kekurangan = Diterima - Kebutuhan
    const totalKekurangan = calculateKekurangan(totalDiterima, totalKebutuhan);

    // Prepare Pareto items (sorted by shortfall descending)
    const sortedShortfalls = Object.values(shortfallByMaterial).sort((a, b) => b.shortfall - a.shortfall);
    const sumShortfall = sortedShortfalls.reduce((acc, curr) => acc + curr.shortfall, 0);

    let cumulative = 0;
    const paretoChart = sortedShortfalls.slice(0, 10).map(item => {
      cumulative += item.shortfall;
      const cumulativePercent = sumShortfall > 0 ? Math.round((cumulative / sumShortfall) * 1000) / 10 : 0;
      return {
        ...item,
        cumulativePercent,
      };
    });

    // Requirement vs Received by Style
    const styleBreakdownMap: Record<string, { style: string; kebutuhan: number; diterima: number; kekurangan: number }> = {};
    for (const m of mats) {
      if (!styleBreakdownMap[m.style]) {
        styleBreakdownMap[m.style] = { style: m.style, kebutuhan: 0, diterima: 0, kekurangan: 0 };
      }
      styleBreakdownMap[m.style].kebutuhan += Number(m.kebutuhan) || 0;
      styleBreakdownMap[m.style].diterima += Number(m.diterima) || 0;
    }

    const requirementVsReceivedByStyle = Object.values(styleBreakdownMap).map(item => ({
      ...item,
      kekurangan: calculateKekurangan(item.diterima, item.kebutuhan),
    }));

    return {
      totalKebutuhan: Math.round(totalKebutuhan * 100) / 100,
      totalDiterima: Math.round(totalDiterima * 100) / 100,
      totalKekurangan,
      jumlahOr: distinctOr.size,
      jumlahStyle: distinctStyle.size,
      countReady,
      countBelumReady,
      totalItems: mats.length,
      readinessRatio: totalKebutuhan > 0 ? Math.round((totalDiterima / totalKebutuhan) * 100) : 100,
      paretoChart,
      requirementVsReceivedByStyle,
    };
  }
}

export const store = new PPICDataStore();
