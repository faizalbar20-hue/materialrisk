import { DashboardStats, MaterialRecord, ProductionSchedule, RiskCategory, UploadRecord, DeletionAuditLog } from '../types/ppic';

export async function fetchHealth() {
  const res = await fetch('/api/health');
  if (!res.ok) throw new Error('Failed to fetch health');
  return res.json();
}

export type SupabaseConnectionState =
  | 'CONNECTED'
  | 'SUPABASE_CONNECTION_ERROR'
  | 'CONFIGURATION_ERROR'
  | 'DATABASE_SCHEMA_ERROR'
  | 'BACKEND_ROUTE_ERROR';

export interface SupabaseStatusResult {
  state: SupabaseConnectionState;
  configured: boolean;
  connected: boolean;
  url: string;
  message: string;
  tables?: {
    upload_history: boolean;
    material_requirements: boolean;
    or_style_relations: boolean;
    master_materials: boolean;
    production_schedules: boolean;
    deletion_history: boolean;
  };
  details?: string;
}

export interface DiagnosticStep {
  step: number;
  name: string;
  passed: boolean;
  durationMs: number;
  message: string;
  details?: any;
}

export async function checkSupabaseStatus(): Promise<SupabaseStatusResult> {
  try {
    const res = await fetch('/api/supabase/status');
    if (!res.ok) {
      return {
        state: 'BACKEND_ROUTE_ERROR',
        configured: false,
        connected: false,
        url: 'HTTP ' + res.status,
        message: `Backend API route error (HTTP ${res.status}: ${res.statusText}). Endpoint /api/supabase/status tidak ditemukan atau mengembalikan error pada host ini.`,
      };
    }
    return await res.json();
  } catch (err: any) {
    return {
      state: 'BACKEND_ROUTE_ERROR',
      configured: false,
      connected: false,
      url: 'Network Error',
      message: `Tidak dapat menghubungi backend API: ${err.message || 'Network error'}. Pastikan server backend /api aktif.`,
    };
  }
}

export async function runSupabaseDiagnosticSuite(): Promise<{
  allPassed: boolean;
  totalDurationMs: number;
  steps: DiagnosticStep[];
}> {
  const res = await fetch('/api/supabase/run-diagnostic-suite', { method: 'POST' });
  if (!res.ok) throw new Error('Failed to run Supabase diagnostic suite');
  return res.json();
}

export async function fetchDashboardSummary(style?: string): Promise<DashboardStats> {
  const url = style ? `/api/dashboard/summary?style=${encodeURIComponent(style)}` : '/api/dashboard/summary';
  const res = await fetch(url);
  if (!res.ok) throw new Error('Failed to fetch dashboard summary');
  return res.json();
}

export async function fetchUploadHistory(): Promise<{ uploads: UploadRecord[] }> {
  const res = await fetch('/api/uploads');
  if (!res.ok) throw new Error('Failed to fetch uploads');
  return res.json();
}

export async function fetchActiveOrStyles(): Promise<{
  pairs: Array<{ or_number: string; style: string; latestDate: string }>;
  styles: string[];
  ors: string[];
}> {
  const res = await fetch('/api/uploads/active-or-styles');
  if (!res.ok) throw new Error('Failed to fetch active OR/styles');
  return res.json();
}

export async function uploadBatch(payload: {
  uploadId: string;
  orNumber: string;
  style: string;
  updateDate: string;
  fileName: string;
  batchIndex: number;
  totalBatches: number;
  items: any[];
  isFinalBatch: boolean;
}) {
  const res = await fetch('/api/uploads/batch', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to upload batch');
  }
  return res.json();
}

export async function fetchMaterials(params: {
  page?: number;
  pageSize?: number;
  style?: string;
  or?: string;
  search?: string;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  flaggedOnly?: boolean;
}): Promise<{
  items: MaterialRecord[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}> {
  const query = new URLSearchParams();
  if (params.page) query.set('page', String(params.page));
  if (params.pageSize) query.set('pageSize', String(params.pageSize));
  if (params.style) query.set('style', params.style);
  if (params.or) query.set('or', params.or);
  if (params.search) query.set('search', params.search);
  if (params.status) query.set('status', params.status);
  if (params.dateFrom) query.set('dateFrom', params.dateFrom);
  if (params.dateTo) query.set('dateTo', params.dateTo);
  if (params.flaggedOnly) query.set('flaggedOnly', 'true');

  const res = await fetch(`/api/materials?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch materials');
  return res.json();
}

export async function deleteSelectiveMaterials(ids: string[], reason: string, confirmedBy: string) {
  const res = await fetch('/api/materials/selective-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, reason, confirmedBy }),
  });
  if (!res.ok) throw new Error('Failed to delete materials');
  return res.json();
}

export async function deleteMaterialsByOr(orNumber: string, confirmedBy: string) {
  const res = await fetch('/api/materials/delete-by-or', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orNumber, confirmedBy }),
  });
  if (!res.ok) throw new Error('Failed to purge OR');
  return res.json();
}

export async function simulateRolling4DaysRetention() {
  const res = await fetch('/api/rolling-retention/simulate');
  if (!res.ok) throw new Error('Failed to simulate rolling retention');
  return res.json();
}

export async function executeRolling4DaysRetention(confirmedBy: string) {
  const res = await fetch('/api/rolling-retention/execute', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirmedBy }),
  });
  if (!res.ok) throw new Error('Failed to execute rolling retention');
  return res.json();
}

export async function fetchAuditLogs(): Promise<{ logs: DeletionAuditLog[] }> {
  const res = await fetch('/api/audit-logs');
  if (!res.ok) throw new Error('Failed to fetch audit logs');
  return res.json();
}

export async function fetchSchedules(params?: { style?: string; or?: string; line?: string }): Promise<{ schedules: ProductionSchedule[] }> {
  const query = new URLSearchParams();
  if (params?.style) query.set('style', params.style);
  if (params?.or) query.set('or', params.or);
  if (params?.line) query.set('line', params.line);

  const res = await fetch(`/api/schedules?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch schedules');
  return res.json();
}

export async function createSchedule(payload: Omit<ProductionSchedule, 'id' | 'created_at'>) {
  const res = await fetch('/api/schedules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to create schedule');
  }
  return res.json();
}

export async function deleteSchedule(id: string) {
  const res = await fetch(`/api/schedules/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error('Failed to delete schedule');
  return res.json();
}

export async function fetchRiskAnalysis(params?: { style?: string; or?: string }): Promise<{
  summary: { critical: number; high: number; medium: number; low: number };
  results: any[];
}> {
  const query = new URLSearchParams();
  if (params?.style) query.set('style', params.style);
  if (params?.or) query.set('or', params.or);

  const res = await fetch(`/api/risk-analysis?${query.toString()}`);
  if (!res.ok) throw new Error('Failed to fetch risk analysis');
  return res.json();
}

export async function generateBulkTestData(count: number, orPrefix: string, style: string) {
  const res = await fetch('/api/sample-data/generate-bulk', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ count, orPrefix, style }),
  });
  if (!res.ok) throw new Error('Failed to generate bulk data');
  return res.json();
}

export async function requestDualAiAnalysis(style?: string, or_number?: string) {
  const res = await fetch('/api/ai/dual-analysis', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ style, or_number }),
  });
  if (!res.ok) throw new Error('AI analysis failed');
  return res.json();
}

export async function sendChatMessage(messages: Array<{ sender: 'user' | 'model'; text: string }>, currentStyle?: string, currentOr?: string) {
  const res = await fetch('/api/ai/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, currentStyle, currentOr }),
  });
  if (!res.ok) throw new Error('Failed to send chat message');
  return res.json();
}

export async function synthesizeTts(text: string): Promise<{ audioBase64: string; mimeType: string }> {
  const res = await fetch('/api/ai/tts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'TTS synthesis failed');
  }
  return res.json();
}

export async function analyzeImage(imageBase64: string, mimeType: string, prompt?: string) {
  const res = await fetch('/api/ai/analyze-image', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageBase64, mimeType, prompt }),
  });
  if (!res.ok) throw new Error('Failed to analyze image');
  return res.json();
}
