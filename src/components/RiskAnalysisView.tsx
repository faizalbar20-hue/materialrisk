import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  Clock,
  Sparkles,
  ChevronDown,
  ChevronUp,
  RefreshCw,
  Package,
  Layers,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';
import { RiskAnalysisItem, RiskCategory } from '../types/ppic';
import { fetchRiskAnalysis } from '../services/api';

interface RiskAnalysisViewProps {
  currentStyle: string;
  onStyleSelect: (style: string) => void;
  onOpenAiForStyle: (style: string, orNumber: string) => void;
}

export const RiskAnalysisView: React.FC<RiskAnalysisViewProps> = ({
  currentStyle,
  onStyleSelect,
  onOpenAiForStyle,
}) => {
  const [data, setData] = useState<{
    summary: { critical: number; high: number; medium: number; low: number };
    results: RiskAnalysisItem[];
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchRiskAnalysis({ style: currentStyle });
      setData(res);
      // Auto expand the first critical item if available
      if (res.results.length > 0) {
        setExpandedId(res.results[0].scheduleId);
      }
    } catch (err) {
      console.error('Failed to load risk analysis:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentStyle]);

  const getRiskBadge = (level: RiskCategory) => {
    switch (level) {
      case 'CRITICAL RISK':
        return {
          bg: 'bg-red-500/20 text-red-300 border border-red-500/30',
          dot: 'bg-red-500',
        };
      case 'HIGH RISK':
        return {
          bg: 'bg-amber-500/20 text-amber-300 border border-amber-500/30',
          dot: 'bg-amber-500',
        };
      case 'MEDIUM RISK':
        return {
          bg: 'bg-yellow-500/20 text-yellow-300 border border-yellow-500/30',
          dot: 'bg-yellow-500',
        };
      case 'LOW RISK':
        return {
          bg: 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30',
          dot: 'bg-emerald-500',
        };
    }
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 }).format(num);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-red-400 mb-1">
              <span>Early Warning System</span>
              <span>·</span>
              <span className="text-slate-400">Analisis Keterlambatan Komponen</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Material Risk Analysis &amp; Bottleneck Control
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Mengevaluasi risiko lini produksi secara otomatis berdasarkan sisa hari mulai produksi, 
              rasio kesiapan material, dan daftar komponen defisit penyebab hambatan (root-cause).
            </p>
          </div>

          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-slate-700 transition"
            title="Refresh Analisis"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary KPI Badges */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="bg-red-950/20 border border-red-900/40 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-900/40 flex items-center justify-center text-red-400 font-bold">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-red-300 font-semibold">CRITICAL RISK</div>
              <div className="text-2xl font-bold font-mono text-red-400 mt-0.5">
                {data.summary.critical}
              </div>
            </div>
          </div>

          <div className="bg-amber-950/20 border border-amber-900/40 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-900/40 flex items-center justify-center text-amber-400 font-bold">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-amber-300 font-semibold">HIGH RISK</div>
              <div className="text-2xl font-bold font-mono text-amber-400 mt-0.5">
                {data.summary.high}
              </div>
            </div>
          </div>

          <div className="bg-yellow-950/20 border border-yellow-900/40 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-900/40 flex items-center justify-center text-yellow-400 font-bold">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-yellow-300 font-semibold">MEDIUM RISK</div>
              <div className="text-2xl font-bold font-mono text-yellow-400 mt-0.5">
                {data.summary.medium}
              </div>
            </div>
          </div>

          <div className="bg-emerald-950/20 border border-emerald-900/40 rounded-xl p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-900/40 flex items-center justify-center text-emerald-400 font-bold">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <div>
              <div className="text-xs text-emerald-300 font-semibold">LOW RISK (READY)</div>
              <div className="text-2xl font-bold font-mono text-emerald-400 mt-0.5">
                {data.summary.low}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Risk Cards List */}
      <div className="space-y-4">
        {loading && !data ? (
          <div className="p-12 text-center text-slate-400">
            <RefreshCw className="w-8 h-8 animate-spin mx-auto text-blue-500 mb-2" />
            Menganalisis matriks risiko jadwal &amp; material...
          </div>
        ) : !data || data.results.length === 0 ? (
          <div className="p-12 bg-slate-900 border border-slate-800 rounded-xl text-center text-slate-500 text-xs">
            Tidak ada jadwal produksi yang membutuhkan analisis risiko saat ini.
          </div>
        ) : (
          data.results.map(item => {
            const isExpanded = expandedId === item.scheduleId;
            const badge = getRiskBadge(item.riskLevel);

            return (
              <div
                key={item.scheduleId}
                className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm transition"
              >
                {/* Header row */}
                <div
                  onClick={() => setExpandedId(isExpanded ? null : item.scheduleId)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-850/60 transition"
                >
                  <div className="flex items-start gap-4">
                    <div
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 whitespace-nowrap ${badge.bg}`}
                    >
                      <span className={`w-2 h-2 rounded-full ${badge.dot}`}></span>
                      <span>{item.riskLevel}</span>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-base font-bold text-white">{item.style}</span>
                        <span className="text-xs text-slate-400 font-mono">({item.or_number})</span>
                        <span className="text-xs bg-slate-800 text-slate-300 border border-slate-700 px-2 py-0.5 rounded font-mono">
                          {item.line_produksi}
                        </span>
                      </div>

                      <div className="text-xs text-slate-400 mt-1 flex items-center gap-3 flex-wrap">
                        <span>Target: <strong className="text-slate-200">{item.target_produksi} pcs</strong></span>
                        <span>·</span>
                        <span>Mulai: <strong className="text-slate-200 font-mono">{item.tanggal_mulai}</strong></span>
                        <span>·</span>
                        <span className="flex items-center gap-1 text-amber-300 font-semibold">
                          <Clock className="w-3.5 h-3.5" />
                          <span>
                            {item.daysRemaining > 0
                              ? `Tersisa ${item.daysRemaining} hari lagi`
                              : item.daysRemaining === 0
                              ? 'Mulai Hari Ini!'
                              : `Terlewat ${Math.abs(item.daysRemaining)} hari`}
                          </span>
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <div className="text-xs text-slate-400">Rasio Kesiapan</div>
                      <div className="text-lg font-bold font-mono text-emerald-400">
                        {item.readinessRatio}%
                      </div>
                      <div className="text-[10px] text-red-400 font-semibold">
                        {item.deficitCount} Komponen Defisit
                      </div>
                    </div>

                    <button
                      onClick={e => {
                        e.stopPropagation();
                        onOpenAiForStyle(item.style, item.or_number);
                      }}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-md shadow-indigo-600/30 transition transform active:scale-95"
                      title="Minta AI mengevaluasi bottleneck ini"
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Mitigasi AI</span>
                    </button>

                    <button className="text-slate-400 hover:text-white p-1">
                      {isExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                    </button>
                  </div>
                </div>

                {/* Expanded Root-Cause Shortage Table */}
                {isExpanded && (
                  <div className="border-t border-slate-800 bg-slate-950/60 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <AlertTriangle className="w-4 h-4 text-red-400" />
                        <span>Komponen Penyebab Risiko Keterlambatan (Root-Cause Shortages):</span>
                      </h4>
                      <span className="text-xs text-slate-400 font-mono">
                        Formula: Kekurangan = Diterima - Kebutuhan (&lt; 0)
                      </span>
                    </div>

                    {item.rootCauseMaterials.length === 0 ? (
                      <div className="p-4 bg-emerald-950/20 border border-emerald-900/40 rounded-lg text-xs text-emerald-300 flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        <span>Seluruh material telah 100% diterima di gudang. Tidak ada defisit komponen.</span>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-slate-800">
                        <table className="w-full text-xs text-left">
                          <thead className="bg-slate-850 text-slate-300 uppercase text-[10px] font-semibold">
                            <tr>
                              <th className="py-2.5 px-3">Kode Material</th>
                              <th className="py-2.5 px-3">Deskripsi Komponen</th>
                              <th className="py-2.5 px-3 text-right">Kebutuhan</th>
                              <th className="py-2.5 px-3 text-right">Diterima</th>
                              <th className="py-2.5 px-3 text-right">Kekurangan (Baku)</th>
                              <th className="py-2.5 px-3 text-right">Defisit Aktual</th>
                              <th className="py-2.5 px-3">Satuan</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800 font-mono">
                            {item.rootCauseMaterials.map((mat, idx) => (
                              <tr key={idx} className="hover:bg-slate-800/40">
                                <td className="py-2 px-3 font-bold text-red-400">
                                  {mat.code}
                                </td>
                                <td className="py-2 px-3 font-sans text-slate-200">
                                  {mat.name}
                                </td>
                                <td className="py-2 px-3 text-right text-slate-300 font-medium">
                                  {formatNumber(mat.kebutuhan)}
                                </td>
                                <td className="py-2 px-3 text-right text-emerald-400 font-medium">
                                  {formatNumber(mat.diterima)}
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-red-400">
                                  {formatNumber(mat.kekurangan)}
                                </td>
                                <td className="py-2 px-3 text-right font-bold text-amber-400">
                                  {formatNumber(mat.shortfallQty)}
                                </td>
                                <td className="py-2 px-3 text-slate-400 font-sans">
                                  {mat.satuan}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
