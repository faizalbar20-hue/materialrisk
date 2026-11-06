export type ReadinessStatus = 'READY' | 'BELUM READY';
export type RiskCategory = 'CRITICAL RISK' | 'HIGH RISK' | 'MEDIUM RISK' | 'LOW RISK';

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
  kekurangan: number; // Diterima - Kebutuhan
  satuan: string;
  status_kesiapan: ReadinessStatus;
  raw_display_name: string;
  is_flagged_for_review: boolean;
  created_at: string;
}

export interface ProductionSchedule {
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

export interface DashboardStats {
  totalKebutuhan: number;
  totalDiterima: number;
  totalKekurangan: number;
  jumlahOr: number;
  jumlahStyle: number;
  countReady: number;
  countBelumReady: number;
  totalItems: number;
  readinessRatio: number;
  paretoChart: Array<{
    code: string;
    name: string;
    shortfall: number;
    satuan: string;
    style: string;
    cumulativePercent: number;
  }>;
  requirementVsReceivedByStyle: Array<{
    style: string;
    kebutuhan: number;
    diterima: number;
    kekurangan: number;
  }>;
}

export interface RiskAnalysisItem {
  scheduleId: string;
  or_number: string;
  style: string;
  line_produksi: string;
  target_produksi: number;
  tanggal_mulai: string;
  tanggal_selesai: string;
  daysRemaining: number;
  readinessRatio: number;
  riskLevel: RiskCategory;
  totalKebutuhan: number;
  totalDiterima: number;
  deficitCount: number;
  rootCauseMaterials: Array<{
    code: string;
    name: string;
    kebutuhan: number;
    diterima: number;
    kekurangan: number;
    shortfallQty: number;
    satuan: string;
  }>;
}

export interface DeletionAuditLog {
  id: string;
  action_type: 'ROLLING_4_DAYS_PURGE' | 'MANUAL_OR_PURGE' | 'SELECTIVE_DELETE';
  records_affected: number;
  details: string;
  confirmed_by: string;
  timestamp: string;
}
