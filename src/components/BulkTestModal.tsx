import React, { useState } from 'react';
import { Zap, Server, CheckCircle2, RefreshCw, AlertTriangle, Database } from 'lucide-react';
import { generateBulkTestData } from '../services/api';

interface BulkTestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBulkSuccess: () => void;
}

export const BulkTestModal: React.FC<BulkTestModalProps> = ({
  isOpen,
  onClose,
  onBulkSuccess,
}) => {
  if (!isOpen) return null;

  const [count, setCount] = useState<number>(20000);
  const [orPrefix, setOrPrefix] = useState('OR-STRESS');
  const [styleName, setStyleName] = useState('ST-BENCHMARK-20K');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    addedRows: number;
    totalDatabaseRows: number;
    orNumber: string;
    style: string;
  } | null>(null);

  const handleGenerate = async (targetCount: number) => {
    try {
      setLoading(true);
      setResult(null);
      const res = await generateBulkTestData(targetCount, orPrefix, styleName);
      setResult(res);
      onBulkSuccess();
    } catch (err: any) {
      alert(`Gagal generate bulk test: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-yellow-500/20 border border-yellow-500/30 flex items-center justify-center text-yellow-400">
              <Zap className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Pengujian High-Volume (20.000 - 40.000 Baris)</span>
                <span className="text-[10px] bg-yellow-500/20 text-yellow-300 border border-yellow-500/30 px-2 py-0.5 rounded font-mono">
                  Benchmark Suite
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Uji append-only tanpa menimpa data historis (Target akumulasi 40.000 baris)
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
        <div className="p-5 space-y-4 text-xs text-slate-300">
          <div className="bg-slate-850 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-xs text-slate-300 leading-relaxed">
              Modul ini memungkinkan Anda menguji spesifikasi sistem PPIC:
              <ul className="list-disc list-inside mt-1.5 space-y-1 text-slate-400">
                <li>Memasukkan 20.000 baris data material dalam 1 siklus upload.</li>
                <li>Menjalankan upload 20.000 baris kedua hingga mencapai akumulasi <strong>40.000 baris</strong>.</li>
                <li>Memverifikasi data lama tidak tertimpa dan paginasi/pencarian server tetap responsif.</li>
              </ul>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Prefix Nomor OR:</label>
                <input
                  type="text"
                  value={orPrefix}
                  onChange={e => setOrPrefix(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-white font-mono"
                />
              </div>

              <div>
                <label className="text-slate-300 font-medium block mb-1">Nama Style Pengujian:</label>
                <input
                  type="text"
                  value={styleName}
                  onChange={e => setStyleName(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded text-blue-300 font-bold"
                />
              </div>
            </div>
          </div>

          {result && (
            <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-4 space-y-1">
              <div className="flex items-center gap-2 text-emerald-300 font-bold text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                <span>Pengujian Sukses Disimpan ke Database!</span>
              </div>
              <div className="text-xs text-slate-300 pt-1 space-y-0.5">
                <div>Baris Baru Ditambahkan: <strong className="text-white font-mono">{result.addedRows.toLocaleString('id-ID')} baris</strong></div>
                <div>Total Akumulasi Seluruh Database: <strong className="text-emerald-400 font-mono text-sm">{result.totalDatabaseRows.toLocaleString('id-ID')} baris</strong></div>
                <div>No. OR: <span className="font-mono text-slate-300">{result.orNumber}</span> · Style: <span className="font-semibold text-blue-300">{result.style}</span></div>
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3 pt-2">
            <button
              onClick={() => handleGenerate(5000)}
              disabled={loading}
              className="py-2.5 bg-slate-800 hover:bg-slate-750 border border-slate-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4 text-blue-400" />}
              <span>Uji 5.000 Baris</span>
            </button>

            <button
              onClick={() => handleGenerate(20000)}
              disabled={loading}
              className="py-2.5 bg-gradient-to-r from-yellow-600 to-amber-600 hover:from-yellow-500 hover:to-amber-500 text-white rounded-lg font-bold flex items-center justify-center gap-2 shadow-lg transition active:scale-95 disabled:opacity-50"
            >
              {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4 text-white" />}
              <span>Uji 20.000 Baris (Target 40k)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
