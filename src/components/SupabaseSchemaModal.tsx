import React, { useState, useEffect } from 'react';
import {
  Database,
  Copy,
  Check,
  ShieldCheck,
  Terminal,
  Server,
  RefreshCw,
  AlertCircle,
  ExternalLink,
  PlayCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Layers,
} from 'lucide-react';
import {
  checkSupabaseStatus,
  runSupabaseDiagnosticSuite,
  SupabaseStatusResult,
  DiagnosticStep,
} from '../services/api';

interface SupabaseSchemaModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SupabaseSchemaModal: React.FC<SupabaseSchemaModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'guide' | 'diagnostics' | 'sql'>('guide');
  const [copiedSql, setCopiedSql] = useState(false);
  const [copiedEnv, setCopiedEnv] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [status, setStatus] = useState<SupabaseStatusResult | null>(null);

  // Diagnostic suite state
  const [runningSuite, setRunningSuite] = useState(false);
  const [suiteResult, setSuiteResult] = useState<{
    allPassed: boolean;
    totalDurationMs: number;
    steps: DiagnosticStep[];
  } | null>(null);

  const checkStatus = async () => {
    try {
      setLoadingStatus(true);
      const res = await checkSupabaseStatus();
      setStatus(res);
    } catch (err: any) {
      setStatus({
        state: 'DISCONNECTED',
        configured: false,
        connected: false,
        url: '',
        message: 'Gagal mengecek status backend.',
      });
    } finally {
      setLoadingStatus(false);
    }
  };

  const handleRunDiagnostics = async () => {
    try {
      setRunningSuite(true);
      const res = await runSupabaseDiagnosticSuite();
      setSuiteResult(res);
      // Re-check status after diagnostics
      await checkStatus();
    } catch (err: any) {
      alert(`Gagal menjalankan diagnostik: ${err.message}`);
    } finally {
      setRunningSuite(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  const envTemplate = `# SUPABASE ENVIRONMENT VARIABLES (AKUN B)
# Masukkan Project URL dan Service Role Key Anda
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."`;

  const sqlCode = `-- ==============================================================================
-- SUPABASE POSTGRESQL SCHEMA MIGRATION FOR PPIC EXPERIMENTAL PROJECT (AKUN B)
-- High-Volume Architecture (~20,000 - 600,000+ rows/month)
-- Append-only upload history, indexed Style & OR search, idempotent batch inserts
-- Conforms strictly to Master Specification Sections 4 & 5
-- ==============================================================================

-- 0. Enable UUID extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==============================================================================
-- 1. TABLE A: UPLOAD HISTORY (Histori setiap proses upload)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS upload_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID UNIQUE NOT NULL,
    or_number TEXT NOT NULL,
    style TEXT NOT NULL,
    update_date DATE NOT NULL,
    uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    total_rows INTEGER NOT NULL DEFAULT 0,
    successful_rows INTEGER NOT NULL DEFAULT 0,
    failed_rows INTEGER NOT NULL DEFAULT 0,
    upload_status TEXT NOT NULL DEFAULT 'completed',
    checkpoint_batch INTEGER NOT NULL DEFAULT 0,
    file_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_upload_history_uploaded_at ON upload_history(uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_upload_history_upload_id ON upload_history(upload_id);
CREATE INDEX IF NOT EXISTS idx_upload_history_or_number ON upload_history(or_number);
CREATE INDEX IF NOT EXISTS idx_upload_history_style ON upload_history(style);
CREATE INDEX IF NOT EXISTS idx_upload_history_or_style ON upload_history(or_number, style);

-- ==============================================================================
-- 2. TABLE B: MATERIAL REQUIREMENTS (Detail material setiap upload - Append Only)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS material_requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES upload_history(upload_id) ON DELETE CASCADE,
    or_number TEXT NOT NULL,
    style TEXT NOT NULL,
    update_date DATE NOT NULL,
    material_code TEXT NOT NULL, -- TEXT ensures preservation of leading zeros (e.g. '00123')
    material_name TEXT NOT NULL,
    requirement NUMERIC(15, 4) NOT NULL DEFAULT 0,
    received NUMERIC(15, 4) NOT NULL DEFAULT 0,
    -- Rumus Baku PPIC: shortage = received - requirement
    shortage NUMERIC(15, 4) NOT NULL,
    unit TEXT NOT NULL DEFAULT 'PCS',
    -- Status Kesiapan: shortage >= 0 => 'READY', shortage < 0 => 'BELUM READY'
    readiness_status TEXT NOT NULL CHECK (readiness_status IN ('READY', 'BELUM READY')),
    raw_display_name TEXT,
    is_flagged_for_review BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_mat_req_upload_id ON material_requirements(upload_id);
CREATE INDEX IF NOT EXISTS idx_mat_req_style ON material_requirements(style);
CREATE INDEX IF NOT EXISTS idx_mat_req_or_number ON material_requirements(or_number);
CREATE INDEX IF NOT EXISTS idx_mat_req_matcode ON material_requirements(material_code);
CREATE INDEX IF NOT EXISTS idx_mat_req_update_date ON material_requirements(update_date DESC);
CREATE INDEX IF NOT EXISTS idx_mat_req_readiness ON material_requirements(readiness_status);

-- ==============================================================================
-- 3. TABLE C: OR_STYLE_RELATIONS (Relasi OR dan Style untuk Autocomplete)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS or_style_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    or_number TEXT NOT NULL,
    style TEXT NOT NULL,
    latest_update_date DATE,
    upload_count INTEGER NOT NULL DEFAULT 1,
    last_used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_or_style_or ON or_style_relations(or_number);
CREATE INDEX IF NOT EXISTS idx_or_style_style ON or_style_relations(style);

-- ==============================================================================
-- 4. TABLE D: MASTER_MATERIALS (Referensi katalog material)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS master_materials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_code TEXT NOT NULL UNIQUE,
    material_name TEXT NOT NULL,
    unit TEXT NOT NULL DEFAULT 'PCS',
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_master_materials_code ON master_materials(material_code);

-- ==============================================================================
-- 5. TABLE E: PRODUCTION_SCHEDULES (Jadwal produksi & target)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS production_schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    or_number TEXT NOT NULL,
    style TEXT NOT NULL,
    production_start DATE NOT NULL,
    production_end DATE NOT NULL,
    production_line TEXT NOT NULL,
    target_production NUMERIC NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prod_sched_style ON production_schedules(style);
CREATE INDEX IF NOT EXISTS idx_prod_sched_or ON production_schedules(or_number);
CREATE INDEX IF NOT EXISTS idx_prod_sched_dates ON production_schedules(production_start, production_end);

-- ==============================================================================
-- 6. TABLE F: DELETION_HISTORY (Audit Trail Penghapusan & Rolling 4 Hari)
-- ==============================================================================
CREATE TABLE IF NOT EXISTS deletion_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    action_type TEXT NOT NULL,
    records_affected INTEGER NOT NULL,
    details TEXT,
    confirmed_by TEXT NOT NULL DEFAULT 'PPIC Operator',
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deletion_history_time ON deletion_history(deleted_at DESC);

-- ==============================================================================
-- 7. ROW LEVEL SECURITY (RLS) POLICIES (Backend Service Role Access)
-- ==============================================================================
ALTER TABLE upload_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE or_style_relations ENABLE ROW LEVEL SECURITY;
ALTER TABLE master_materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE deletion_history ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    DROP POLICY IF EXISTS "Allow service role full access" ON upload_history;
    CREATE POLICY "Allow service role full access" ON upload_history FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow service role full access" ON material_requirements;
    CREATE POLICY "Allow service role full access" ON material_requirements FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow service role full access" ON or_style_relations;
    CREATE POLICY "Allow service role full access" ON or_style_relations FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow service role full access" ON master_materials;
    CREATE POLICY "Allow service role full access" ON master_materials FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow service role full access" ON production_schedules;
    CREATE POLICY "Allow service role full access" ON production_schedules FOR ALL TO service_role USING (true) WITH CHECK (true);

    DROP POLICY IF EXISTS "Allow service role full access" ON deletion_history;
    CREATE POLICY "Allow service role full access" ON deletion_history FOR ALL TO service_role USING (true) WITH CHECK (true);
END $$;`;

  const handleCopySql = () => {
    navigator.clipboard.writeText(sqlCode);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  const handleCopyEnv = () => {
    navigator.clipboard.writeText(envTemplate);
    setCopiedEnv(true);
    setTimeout(() => setCopiedEnv(false), 2000);
  };

  // State color mapping per Section 13
  const getStateColor = (state?: string) => {
    switch (state) {
      case 'CONNECTED':
        return {
          bg: 'bg-emerald-950/30 border-emerald-800/50 text-emerald-300',
          badge: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40',
          dot: 'bg-emerald-400 animate-pulse',
        };
      case 'DATABASE SCHEMA ERROR':
        return {
          bg: 'bg-amber-950/30 border-amber-800/50 text-amber-300',
          badge: 'bg-amber-500/20 text-amber-400 border-amber-500/40',
          dot: 'bg-amber-400',
        };
      case 'CONFIGURATION ERROR':
        return {
          bg: 'bg-blue-950/30 border-blue-800/50 text-blue-300',
          badge: 'bg-blue-500/20 text-blue-400 border-blue-500/40',
          dot: 'bg-blue-400',
        };
      case 'DATABASE OPERATION ERROR':
      case 'DISCONNECTED':
      default:
        return {
          bg: 'bg-rose-950/30 border-rose-800/50 text-rose-300',
          badge: 'bg-rose-500/20 text-rose-400 border-rose-500/40',
          dot: 'bg-rose-400',
        };
    }
  };

  const stateStyle = getStateColor(status?.state);

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-white">
                  Integrasi Database Supabase PostgreSQL (Akun B)
                </h3>
                <span className={`text-[10px] px-2 py-0.5 rounded font-mono border ${stateStyle.badge}`}>
                  {status?.state || 'MENGECEK...'}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Arsitektur: Frontend → Backend API (Server-Side Service Role) → Supabase PostgreSQL.
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {/* Tab Controls */}
        <div className="px-5 py-2.5 border-b border-slate-800 bg-slate-900 flex items-center gap-2 text-xs">
          <button
            onClick={() => setActiveTab('guide')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              activeTab === 'guide'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Panduan 4 Langkah &amp; Status
          </button>

          <button
            onClick={() => setActiveTab('diagnostics')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'diagnostics'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Suite 10 Pengujian Database</span>
            {suiteResult && (
              <span className={`w-2 h-2 rounded-full ${suiteResult.allPassed ? 'bg-emerald-400' : 'bg-rose-400'}`} />
            )}
          </button>

          <button
            onClick={() => setActiveTab('sql')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition ${
              activeTab === 'sql'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            Skema SQL DDL (Tabel A - F)
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-300 flex-1">
          {activeTab === 'guide' && (
            <div className="space-y-4">
              {/* Connection Status Card */}
              <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${stateStyle.bg}`}>
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-bold text-sm text-white">
                    <span className={`w-2.5 h-2.5 rounded-full ${stateStyle.dot}`}></span>
                    <span>Status: {status?.state || 'MENGECEK KONEKSI...'}</span>
                  </div>
                  <p className="text-xs text-slate-300 max-w-xl">
                    {status?.message}
                  </p>
                  {status?.configured && (
                    <div className="text-[11px] font-mono text-slate-400 mt-1">
                      Target URL: <span className="text-blue-300 font-semibold">{status.url}</span>
                    </div>
                  )}

                  {/* Table presence checklist */}
                  {status?.tables && (
                    <div className="mt-2 pt-2 border-t border-slate-800 grid grid-cols-2 sm:grid-cols-3 gap-1.5 text-[11px]">
                      {Object.entries(status.tables).map(([tbl, isOk]) => (
                        <div key={tbl} className="flex items-center gap-1.5 font-mono">
                          {isOk ? (
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5 text-rose-400" />
                          )}
                          <span className={isOk ? 'text-slate-300' : 'text-rose-300 font-semibold'}>{tbl}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex sm:flex-col gap-2 flex-shrink-0">
                  <button
                    onClick={checkStatus}
                    disabled={loadingStatus}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold flex items-center gap-1.5 border border-slate-700 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingStatus ? 'animate-spin' : ''}`} />
                    <span>Periksa Status</span>
                  </button>

                  <button
                    onClick={() => {
                      setActiveTab('diagnostics');
                      handleRunDiagnostics();
                    }}
                    className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold flex items-center gap-1.5 transition"
                  >
                    <PlayCircle className="w-3.5 h-3.5" />
                    <span>Uji 10 Langkah</span>
                  </button>
                </div>
              </div>

              {/* 4-Step Connection Guide */}
              <div className="bg-slate-850 border border-slate-800 rounded-xl p-5 space-y-4">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>Panduan Langkah Integrasi Supabase Akun B</span>
                </h4>

                <div className="space-y-3.5">
                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs">
                      1
                    </div>
                    <div>
                      <strong className="text-white block font-semibold">Buat Project Baru di Supabase Akun B</strong>
                      <p className="text-slate-400 mt-0.5">
                        Buka tab <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer" className="text-blue-400 underline inline-flex items-center gap-0.5">Supabase Dashboard <ExternalLink className="w-3 h-3 inline" /></a>, pastikan berada di Akun B Anda, dan pilih project baru yang ingin dihubungkan.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs">
                      2
                    </div>
                    <div>
                      <strong className="text-white block font-semibold">Jalankan Skema SQL di SQL Editor Supabase</strong>
                      <p className="text-slate-400 mt-0.5">
                        Buka menu <strong>SQL Editor</strong> di dashboard Supabase Anda. Buka tab <strong>"Skema SQL DDL"</strong> di atas, klik tombol <strong>"Salin Seluruh SQL"</strong>, lalu tempel (*paste*) dan tekan <strong>Run</strong>. Seluruh 6 tabel (`upload_history`, `material_requirements`, `or_style_relations`, `master_materials`, `production_schedules`, `deletion_history`) akan terbuat otomatis.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs">
                      3
                    </div>
                    <div>
                      <strong className="text-white block font-semibold">Salin URL &amp; Service Role Key</strong>
                      <p className="text-slate-400 mt-0.5">
                        Di dashboard Supabase, buka menu <strong>Project Settings</strong> → <strong>API</strong>. Salin <strong>Project URL</strong> dan <strong>service_role secret</strong>. *(Jangan gunakan anon key untuk operasi backend berkapasitas besar).*
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3">
                    <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center flex-shrink-0 text-xs">
                      4
                    </div>
                    <div>
                      <strong className="text-white block font-semibold">Masukkan ke Environment Variables</strong>
                      <p className="text-slate-400 mt-0.5">
                        Tambahkan ke file <code>.env</code> aplikasi atau panel Environment Variables di hosting Anda:
                      </p>
                      <div className="mt-2 bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono text-[11px] text-blue-300 relative">
                        <pre>{envTemplate}</pre>
                        <button
                          onClick={handleCopyEnv}
                          className="absolute right-2 top-2 px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-[10px] flex items-center gap-1 transition"
                        >
                          {copiedEnv ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          <span>{copiedEnv ? 'Tersalin' : 'Salin'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'diagnostics' && (
            <div className="space-y-4">
              <div className="bg-slate-850 border border-slate-800 rounded-xl p-4 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-white flex items-center gap-2">
                    <ShieldCheck className="w-4 h-4 text-blue-400" />
                    <span>10-Step Comprehensive Diagnostic Test Suite (Spesifikasi Bagian 12)</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Menguji konfigurasi, pembacaan, canary insertion, update, delete, batching, pagination, search, dan sinkronisasi cross-device.
                  </p>
                </div>

                <button
                  onClick={handleRunDiagnostics}
                  disabled={runningSuite}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white rounded-lg font-bold flex items-center gap-2 transition"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${runningSuite ? 'animate-spin' : ''}`} />
                  <span>{runningSuite ? 'Menjalankan Uji...' : 'Jalankan 10 Pengujian'}</span>
                </button>
              </div>

              {suiteResult ? (
                <div className="space-y-3">
                  <div className={`p-3 rounded-xl border flex items-center justify-between ${
                    suiteResult.allPassed
                      ? 'bg-emerald-950/20 border-emerald-800/50 text-emerald-300'
                      : 'bg-rose-950/20 border-rose-800/50 text-rose-300'
                  }`}>
                    <div className="flex items-center gap-2 font-semibold">
                      {suiteResult.allPassed ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                      ) : (
                        <XCircle className="w-5 h-5 text-rose-400" />
                      )}
                      <span>
                        {suiteResult.allPassed
                          ? 'SELURUH 10 PENGUJIAN DATABASE BERHASIL LOLOS!'
                          : 'BEBERAPA PENGUJIAN GAGAL — Periksa log di bawah.'}
                      </span>
                    </div>
                    <span className="text-xs font-mono opacity-80">
                      Total Durasi: {suiteResult.totalDurationMs}ms
                    </span>
                  </div>

                  <div className="space-y-2">
                    {suiteResult.steps.map((st) => (
                      <div
                        key={st.step}
                        className={`p-3 rounded-lg border flex items-start justify-between gap-3 ${
                          st.passed
                            ? 'bg-slate-900 border-slate-800'
                            : 'bg-rose-950/20 border-rose-900/40'
                        }`}
                      >
                        <div className="flex items-start gap-2.5">
                          {st.passed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-400 mt-0.5 flex-shrink-0" />
                          ) : (
                            <XCircle className="w-4 h-4 text-rose-400 mt-0.5 flex-shrink-0" />
                          )}
                          <div>
                            <div className="font-bold text-white text-xs">{st.name}</div>
                            <p className="text-[11px] text-slate-400 mt-0.5">{st.message}</p>
                            {st.details && (
                              <pre className="text-[10px] text-blue-300 font-mono mt-1 bg-slate-950 p-1.5 rounded">
                                {JSON.stringify(st.details, null, 2)}
                              </pre>
                            )}
                          </div>
                        </div>

                        <span className="text-[10px] font-mono text-slate-500 whitespace-nowrap">
                          {st.durationMs}ms
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-xl space-y-2">
                  <PlayCircle className="w-10 h-10 text-slate-600 mx-auto" />
                  <div className="font-semibold text-white">Belum Ada Pengujian yang Dijalankan</div>
                  <p className="text-xs text-slate-400 max-w-md mx-auto">
                    Klik tombol "Jalankan 10 Pengujian" untuk memverifikasi kesiapan penuh database Supabase Anda dari hulu ke hilir.
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'sql' && (
            <div className="space-y-3">
              <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-300">
                  <ShieldCheck className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                  <span>
                    Skema DDL mencakup 6 tabel: <code>upload_history</code>, <code>material_requirements</code>, <code>or_style_relations</code>, <code>master_materials</code>, <code>production_schedules</code>, dan <code>deletion_history</code>.
                  </span>
                </div>
                <button
                  onClick={handleCopySql}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition ml-3 whitespace-nowrap"
                >
                  {copiedSql ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  <span>{copiedSql ? 'Tersalin!' : 'Salin Seluruh SQL'}</span>
                </button>
              </div>

              <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 overflow-x-auto max-h-[50vh]">
                <pre className="font-mono text-[11px] text-blue-300 leading-relaxed whitespace-pre">
                  {sqlCode}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
