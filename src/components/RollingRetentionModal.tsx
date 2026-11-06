import React, { useState, useEffect } from 'react';
import { Clock, ShieldAlert, CheckCircle2, AlertTriangle, RefreshCw, Trash2, History } from 'lucide-react';
import { simulateRolling4DaysRetention, executeRolling4DaysRetention, fetchAuditLogs } from '../services/api';
import { DeletionAuditLog } from '../types/ppic';

interface RollingRetentionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onPurgeSuccess: () => void;
}

export const RollingRetentionModal: React.FC<RollingRetentionModalProps> = ({
  isOpen,
  onClose,
  onPurgeSuccess,
}) => {
  if (!isOpen) return null;

  const [loading, setLoading] = useState(true);
  const [simulation, setSimulation] = useState<{
    cutoffDate: string;
    retentionDays: number;
    expiredUploadCount: number;
    expiredMaterialCount: number;
    sampleExpiredUploads: Array<{
      id: string;
      or_number: string;
      style: string;
      upload_time: string;
      total_rows: number;
    }>;
  } | null>(null);

  const [auditLogs, setAuditLogs] = useState<DeletionAuditLog[]>([]);
  const [confirmedBy, setConfirmedBy] = useState('PPIC System Admin');
  const [isExecuting, setIsExecuting] = useState(false);

  const loadSimulation = async () => {
    try {
      setLoading(true);
      const [simRes, logsRes] = await Promise.all([
        simulateRolling4DaysRetention(),
        fetchAuditLogs(),
      ]);
      setSimulation(simRes);
      setAuditLogs(logsRes.logs);
    } catch (err: any) {
      alert(`Gagal menjalankan simulasi: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSimulation();
  }, []);

  const handleExecutePurge = async () => {
    if (!confirm(`Konfirmasi eksekusi Rolling 4 Hari? ${simulation?.expiredMaterialCount || 0} baris data material di luar jendela retensi 4 hari akan dibersihkan.`)) {
      return;
    }

    try {
      setIsExecuting(true);
      const res = await executeRolling4DaysRetention(confirmedBy);
      alert(`Pembersihan sukses: ${res.purgedMaterialsCount} baris material dan ${res.purgedUploadsCount} upload telah dibersihkan.`);
      onPurgeSuccess();
      loadSimulation();
    } catch (err: any) {
      alert(`Gagal mengeksekusi retensi: ${err.message}`);
    } finally {
      setIsExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-2xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Manajemen Retensi: Rolling 4 Hari</span>
                <span className="text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2 py-0.5 rounded font-mono">
                  Kebijakan Retensi Aktif
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Pembersihan data historis yang melewati batas 4 hari berdasarkan waktu upload
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center"
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs text-slate-300 flex-1">
          {loading ? (
            <div className="py-12 text-center text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
              Menghitung simulasi batas retensi 4 hari...
            </div>
          ) : simulation ? (
            <>
              {/* Simulation Result Card */}
              <div className="bg-slate-850 border border-slate-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-white flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 text-amber-400" />
                    <span>Hasil Simulasi Data Terdampak</span>
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">
                    Cutoff: {new Date(simulation.cutoffDate).toLocaleString('id-ID')}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <div className="text-[11px] text-slate-400">Upload Melewati 4 Hari</div>
                    <div className="text-xl font-bold font-mono text-amber-400 mt-1">
                      {simulation.expiredUploadCount}
                    </div>
                  </div>
                  <div className="p-3 bg-slate-900 border border-slate-800 rounded-lg">
                    <div className="text-[11px] text-slate-400">Baris Material Terdampak</div>
                    <div className="text-xl font-bold font-mono text-red-400 mt-1">
                      {simulation.expiredMaterialCount}
                    </div>
                  </div>
                </div>

                {simulation.sampleExpiredUploads.length > 0 && (
                  <div className="mt-3">
                    <div className="text-[11px] font-semibold text-slate-400 mb-1">
                      Daftar Upload Teridentifikasi Melewati Batas:
                    </div>
                    <div className="space-y-1">
                      {simulation.sampleExpiredUploads.map(up => (
                        <div
                          key={up.id}
                          className="bg-slate-900 px-3 py-1.5 rounded border border-slate-800 flex items-center justify-between font-mono text-[11px]"
                        >
                          <div>
                            <span className="text-white font-bold">{up.or_number}</span> ·{' '}
                            <span className="text-blue-400">{up.style}</span>
                          </div>
                          <div className="text-slate-400">
                            {new Date(up.upload_time).toLocaleDateString('id-ID')} ({up.total_rows} baris)
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Execution Form */}
              <div className="bg-slate-850 border border-slate-800 rounded-xl p-4 space-y-3">
                <div>
                  <label className="text-slate-300 font-medium block mb-1">Nama Petugas Konfirmasi Audit:</label>
                  <input
                    type="text"
                    value={confirmedBy}
                    onChange={e => setConfirmedBy(e.target.value)}
                    className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-slate-200"
                  />
                </div>

                <button
                  onClick={handleExecutePurge}
                  disabled={simulation.expiredMaterialCount === 0 || isExecuting}
                  className="w-full py-2.5 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-md transition"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>
                    {simulation.expiredMaterialCount === 0
                      ? 'Tidak Ada Data Melewati 4 Hari'
                      : `Konfirmasi & Bersihkan ${simulation.expiredMaterialCount} Baris`}
                  </span>
                </button>
              </div>

              {/* Recent Audit Logs */}
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-blue-400" />
                  <span>Log Audit Pembersihan Terakhir</span>
                </h4>
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {auditLogs.map(log => (
                    <div
                      key={log.id}
                      className="bg-slate-900 p-2.5 rounded-lg border border-slate-800 text-[11px] space-y-0.5"
                    >
                      <div className="flex items-center justify-between text-slate-400">
                        <span className="font-semibold text-slate-200">{log.action_type}</span>
                        <span className="font-mono">{new Date(log.timestamp).toLocaleString('id-ID')}</span>
                      </div>
                      <p className="text-slate-300">{log.details}</p>
                      <div className="text-[10px] text-slate-400">
                        Petugas: <strong className="text-white">{log.confirmed_by}</strong> · Terimbas:{' '}
                        <span className="text-red-400 font-bold">{log.records_affected} baris</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
};
