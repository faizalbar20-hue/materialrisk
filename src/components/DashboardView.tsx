import React, { useEffect, useState } from 'react';
import {
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Package,
  Layers,
  ArrowUpRight,
  RefreshCw,
  FileSpreadsheet,
  Calendar,
  AlertCircle,
} from 'lucide-react';
import { DashboardStats } from '../types/ppic';
import { fetchDashboardSummary, fetchActiveOrStyles } from '../services/api';

interface DashboardViewProps {
  currentStyle: string;
  onStyleSelect: (style: string) => void;
  onNavigateMenu: (menu: 'upload' | 'master' | 'schedule' | 'risk' | 'ai') => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  currentStyle,
  onStyleSelect,
  onNavigateMenu,
}) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [availableStyles, setAvailableStyles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [summaryData, orStyleData] = await Promise.all([
        fetchDashboardSummary(currentStyle),
        fetchActiveOrStyles(),
      ]);
      setStats(summaryData);
      setAvailableStyles(orStyleData.styles);
    } catch (err: any) {
      setError(err.message || 'Gagal memuat ringkasan dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [currentStyle]);

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(num);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Controls */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-blue-600/5 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400 mb-1">
              <span>PPIC Operation Dashboard</span>
              <span>·</span>
              <span className="text-slate-400">Real-Time Aggregation</span>
            </div>
            <h2 className="text-2xl font-bold text-white tracking-tight">
              Monitoring Kesiapan Material &amp; Alur Produksi
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Rumus Baku PPIC: <strong className="text-slate-200">Kekurangan = Diterima - Kebutuhan</strong>. 
              Status dinyatakan <span className="text-emerald-400 font-semibold">READY</span> jika Kekurangan ≥ 0, 
              dan <span className="text-amber-400 font-semibold">BELUM READY</span> jika Kekurangan &lt; 0.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onNavigateMenu('schedule')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-600/25 transition active:scale-95"
            >
              <Calendar className="w-4 h-4" />
              <span>Jadwal Produksi</span>
            </button>
            <button
              onClick={() => onNavigateMenu('risk')}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-semibold flex items-center gap-2 shadow-lg shadow-red-600/25 transition active:scale-95"
            >
              <AlertTriangle className="w-4 h-4" />
              <span>Tinjau Risiko</span>
            </button>
            <button
              onClick={loadData}
              disabled={loading}
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs border border-slate-700 transition"
              title="Refresh Data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Style Filter Bar */}
        <div className="mt-5 pt-4 border-t border-slate-800 flex items-center gap-2 overflow-x-auto pb-1 text-xs">
          <span className="text-slate-400 font-medium whitespace-nowrap">Filter Cepat Style:</span>
          <button
            onClick={() => onStyleSelect('')}
            className={`px-3 py-1 rounded-md font-semibold transition ${
              !currentStyle
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Semua Style
          </button>
          {availableStyles.map(st => (
            <button
              key={st}
              onClick={() => onStyleSelect(st)}
              className={`px-3 py-1 rounded-md font-semibold transition whitespace-nowrap ${
                currentStyle === st
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {loading && !stats ? (
        <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
          <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm font-medium">Mengagregasi data material dari database...</p>
        </div>
      ) : error ? (
        <div className="p-4 bg-red-900/20 border border-red-800 rounded-xl text-red-200 text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          <span>{error}</span>
        </div>
      ) : stats ? (
        <>
          {/* Key Metrics Cards Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Card 1: Total Kebutuhan */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Total Kebutuhan Material</span>
                <Package className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-white tracking-tight">
                {formatNumber(stats.totalKebutuhan)}
              </div>
              <div className="mt-2 text-[11px] text-slate-400 flex items-center gap-1.5">
                <span>Total akumulasi Order Lines</span>
              </div>
            </div>

            {/* Card 2: Total Diterima */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Total Material Diterima</span>
                <CheckCircle className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-2xl font-bold font-mono text-emerald-400 tracking-tight">
                {formatNumber(stats.totalDiterima)}
              </div>
              <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Rasio Kesiapan:</span>
                <span className="font-semibold text-emerald-400">{stats.readinessRatio}%</span>
              </div>
            </div>

            {/* Card 3: Total Kekurangan (Formula Diterima - Kebutuhan) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Total Kekurangan (Diterima - Butuh)</span>
                <AlertTriangle className={`w-4 h-4 ${stats.totalKekurangan < 0 ? 'text-red-400' : 'text-emerald-400'}`} />
              </div>
              <div className={`text-2xl font-bold font-mono tracking-tight ${
                stats.totalKekurangan < 0 ? 'text-red-400' : 'text-emerald-400'
              }`}>
                {stats.totalKekurangan > 0 ? `+${formatNumber(stats.totalKekurangan)}` : formatNumber(stats.totalKekurangan)}
              </div>
              <div className="mt-2 text-[11px] text-slate-400">
                {stats.totalKekurangan < 0 ? (
                  <span className="text-red-300 font-medium">Defisit perlu pengadaan vendor</span>
                ) : (
                  <span className="text-emerald-400 font-medium">Material mencukupi jadwal</span>
                )}
              </div>
            </div>

            {/* Card 4: Kesiapan Item & OR/Style */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-medium">Status Kesiapan Komponen</span>
                <Layers className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex items-baseline gap-3">
                <div className="text-xl font-bold font-mono text-emerald-400">
                  {stats.countReady} <span className="text-xs font-sans text-slate-400 font-normal">READY</span>
                </div>
                <div className="text-slate-600">/</div>
                <div className="text-xl font-bold font-mono text-amber-400">
                  {stats.countBelumReady} <span className="text-xs font-sans text-slate-400 font-normal">BELUM</span>
                </div>
              </div>
              <div className="mt-2 text-[11px] text-slate-400 flex items-center justify-between">
                <span>Cakupan:</span>
                <span className="font-semibold text-slate-300">{stats.jumlahOr} OR · {stats.jumlahStyle} Style</span>
              </div>
            </div>
          </div>

          {/* Charts Row: Requirement vs Received & Readiness Gauge */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Chart 1: Kebutuhan vs Diterima per Style */}
            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Komparasi Kebutuhan vs Kuantitas Diterima
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Evaluasi pemenuhan volume material berdasarkan Style aktif
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-blue-500 rounded-sm"></span>
                    <span className="text-slate-300">Kebutuhan</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-3 h-3 bg-emerald-500 rounded-sm"></span>
                    <span className="text-slate-300">Diterima</span>
                  </div>
                </div>
              </div>

              {stats.requirementVsReceivedByStyle.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  Tidak ada data untuk ditampilkan.
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  {stats.requirementVsReceivedByStyle.map((item, idx) => {
                    const maxVal = Math.max(item.kebutuhan, item.diterima, 1);
                    const reqPct = Math.round((item.kebutuhan / maxVal) * 100);
                    const recPct = Math.round((item.diterima / maxVal) * 100);

                    return (
                      <div key={idx} className="space-y-1.5">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold text-white">{item.style}</span>
                          <span className="text-slate-400 font-mono">
                            {formatNumber(item.diterima)} / {formatNumber(item.kebutuhan)}
                            {item.kekurangan < 0 && (
                              <span className="text-red-400 ml-1.5 font-bold">
                                ({formatNumber(item.kekurangan)})
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="space-y-1">
                          {/* Kebutuhan Bar */}
                          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 transition-all duration-500"
                              style={{ width: `${reqPct}%` }}
                            />
                          </div>
                          {/* Diterima Bar */}
                          <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 transition-all duration-500"
                              style={{ width: `${recPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Chart 2: Status Kesiapan Komponen Donut/Gauge */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-sm font-bold text-white tracking-tight">
                  Status Kesiapan Komponen
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Distribusi proporsi READY vs BELUM READY
                </p>
              </div>

              <div className="py-6 flex flex-col items-center justify-center">
                <div className="relative w-40 h-40 flex items-center justify-center">
                  {/* Circular SVG Donut */}
                  <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="#1e293b"
                      strokeWidth="12"
                      fill="transparent"
                    />
                    <circle
                      cx="50"
                      cy="50"
                      r="40"
                      stroke="#10b981"
                      strokeWidth="12"
                      fill="transparent"
                      strokeDasharray="251.2"
                      strokeDashoffset={251.2 - (251.2 * (stats.countReady / (stats.totalItems || 1)))}
                      strokeLinecap="round"
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-2xl font-bold font-mono text-white">
                      {stats.totalItems > 0 ? Math.round((stats.countReady / stats.totalItems) * 100) : 100}%
                    </span>
                    <span className="text-[10px] text-slate-400 uppercase font-semibold">Siap Produksi</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 w-full mt-6 text-center border-t border-slate-800 pt-4">
                  <div className="p-2 bg-emerald-950/30 border border-emerald-900/40 rounded-lg">
                    <div className="text-xs font-semibold text-emerald-400">READY</div>
                    <div className="text-lg font-bold font-mono text-emerald-300 mt-0.5">
                      {stats.countReady}
                    </div>
                  </div>
                  <div className="p-2 bg-amber-950/30 border border-amber-900/40 rounded-lg">
                    <div className="text-xs font-semibold text-amber-400">BELUM READY</div>
                    <div className="text-lg font-bold font-mono text-amber-300 mt-0.5">
                      {stats.countBelumReady}
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={() => onNavigateMenu('master')}
                className="w-full py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-medium rounded-lg border border-slate-700 flex items-center justify-center gap-1.5 transition"
              >
                <span>Buka Master Data Rekap Material</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Pareto Chart 80/20 Kekurangan Material */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-bold text-white tracking-tight">
                    Pareto Chart Kekurangan Material (Aturan 80/20)
                  </h3>
                  <span className="text-[10px] font-semibold bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded">
                    Prioritas Pengadaan
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Mengidentifikasi 20% item material yang menyumbang 80% total defisit kekurangan
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 bg-red-500 rounded-sm"></span>
                  <span className="text-slate-300">Volume Defisit</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-0.5 bg-yellow-400"></span>
                  <span className="text-slate-300">Kumulatif %</span>
                </div>
              </div>
            </div>

            {stats.paretoChart.length === 0 ? (
              <div className="py-12 text-center text-slate-500 text-xs">
                Tidak ada kekurangan material pada filter saat ini. Seluruh material dalam kondisi READY.
              </div>
            ) : (
              <div className="space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-800/80 text-slate-300 uppercase tracking-wider font-semibold text-[11px]">
                      <tr>
                        <th className="py-2.5 px-3">Rank</th>
                        <th className="py-2.5 px-3">Kode Material</th>
                        <th className="py-2.5 px-3">Nama Material</th>
                        <th className="py-2.5 px-3">Style</th>
                        <th className="py-2.5 px-3 text-right">Kekurangan Aktual</th>
                        <th className="py-2.5 px-3">Satuan</th>
                        <th className="py-2.5 px-3 text-right">Kumulatif %</th>
                        <th className="py-2.5 px-3 w-40">Distribusi Pareto</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800 font-mono">
                      {stats.paretoChart.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-800/50 transition">
                          <td className="py-2.5 px-3 font-bold text-slate-400 font-sans">
                            #{idx + 1}
                          </td>
                          <td className="py-2.5 px-3 font-bold text-blue-400">
                            {item.code}
                          </td>
                          <td className="py-2.5 px-3 font-sans text-slate-200">
                            {item.name}
                          </td>
                          <td className="py-2.5 px-3 font-sans text-slate-300">
                            {item.style}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-red-400">
                            -{formatNumber(item.shortfall)}
                          </td>
                          <td className="py-2.5 px-3 font-sans text-slate-400">
                            {item.satuan}
                          </td>
                          <td className="py-2.5 px-3 text-right font-bold text-yellow-400">
                            {item.cumulativePercent}%
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden flex">
                              <div
                                className="bg-red-500 h-full"
                                style={{ width: `${Math.min(100, item.cumulativePercent)}%` }}
                              />
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
};
