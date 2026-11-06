import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Plus,
  Trash2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Clock,
  Layers,
  Search,
  CheckCircle2,
  Info,
} from 'lucide-react';
import { ProductionSchedule } from '../types/ppic';
import { fetchSchedules, createSchedule, deleteSchedule, fetchActiveOrStyles } from '../services/api';
import { isProductionNonWorkingDay, INDONESIAN_HOLIDAYS } from '../utils/ppicRules';

interface ProductionScheduleViewProps {
  currentStyle: string;
  onStyleSelect: (style: string) => void;
  onNavigateToRisk: () => void;
}

export const ProductionScheduleView: React.FC<ProductionScheduleViewProps> = ({
  currentStyle,
  onStyleSelect,
  onNavigateToRisk,
}) => {
  const [schedules, setSchedules] = useState<ProductionSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [orNumber, setOrNumber] = useState('');
  const [style, setStyle] = useState(currentStyle);
  const [lineProduksi, setLineProduksi] = useState('Line 01');
  const [targetProduksi, setTargetProduksi] = useState<number>(3000);
  const [tanggalMulai, setTanggalMulai] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [tanggalSelesai, setTanggalSelesai] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 8);
    return d.toISOString().slice(0, 10);
  });
  const [notes, setNotes] = useState('');

  // Autocomplete references
  const [historyStyles, setHistoryStyles] = useState<string[]>([]);
  const [historyOrs, setHistoryOrs] = useState<string[]>([]);

  // Calendar month navigation
  const [activeMonthDate, setActiveMonthDate] = useState(() => new Date(2026, 10, 1)); // November 2026

  // Filters
  const [lineFilter, setLineFilter] = useState('ALL');
  const [searchSchedule, setSearchSchedule] = useState('');

  const loadSchedules = async () => {
    try {
      setLoading(true);
      const [res, hist] = await Promise.all([
        fetchSchedules({ style: currentStyle }),
        fetchActiveOrStyles(),
      ]);
      setSchedules(res.schedules);
      setHistoryStyles(hist.styles);
      setHistoryOrs(hist.ors);
    } catch (err) {
      console.error('Error fetching schedules:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedules();
  }, [currentStyle]);

  useEffect(() => {
    if (currentStyle) {
      setStyle(currentStyle);
    }
  }, [currentStyle]);

  const handleCreateSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orNumber.trim() || !style.trim() || !tanggalMulai || !tanggalSelesai) {
      alert('Semua field wajib diisi.');
      return;
    }

    try {
      await createSchedule({
        or_number: orNumber.trim(),
        style: style.trim(),
        line_produksi: lineProduksi,
        target_produksi: targetProduksi,
        tanggal_mulai: tanggalMulai,
        tanggal_selesai: tanggalSelesai,
        notes,
      });

      // Clear form after success as required
      setOrNumber('');
      setStyle('');
      setTargetProduksi(2500);
      setNotes('');
      alert('Jadwal produksi berhasil ditambahkan!');
      loadSchedules();
    } catch (err: any) {
      alert(`Gagal membuat jadwal: ${err.message}`);
    }
  };

  const handleDeleteSchedule = async (id: string) => {
    if (confirm('Hapus jadwal produksi ini?')) {
      try {
        await deleteSchedule(id);
        loadSchedules();
      } catch (err) {
        alert('Gagal menghapus jadwal.');
      }
    }
  };

  // Calendar calculations
  const year = activeMonthDate.getFullYear();
  const month = activeMonthDate.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const monthName = activeMonthDate.toLocaleString('id-ID', { month: 'long', year: 'numeric' });

  const productionLines = ['Line 01', 'Line 02', 'Line 03', 'Line 04', 'Line 05'];

  const filteredLines = lineFilter === 'ALL' ? productionLines : [lineFilter];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400 mb-1">
              <span>Perencanaan Lini Manufaktur</span>
              <span>·</span>
              <span className="text-slate-400">Kalender Produksi Bulanan</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Penjadwalan Produksi (Production Schedule)
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Memetakan OR dan Style ke Lini Produksi. Hari Minggu dan Tanggal Merah ditandai secara khusus 
              dan tidak dihitung sebagai hari kerja produksi. Header Line tetap terlihat saat kalender di-scroll.
            </p>
          </div>

          <button
            onClick={onNavigateToRisk}
            className="px-4 py-2 bg-red-600/90 hover:bg-red-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg shadow-red-600/20 transition active:scale-95"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Cek Risiko Kekurangan Material</span>
          </button>
        </div>
      </div>

      {/* Schedule Form & Control */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Form Add Schedule */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            <Plus className="w-4 h-4 text-blue-400" />
            <span>Tambah Jadwal Produksi Baru</span>
          </h3>

          <form onSubmit={handleCreateSchedule} className="space-y-3 text-xs">
            {/* Nomor OR */}
            <div>
              <label className="text-slate-300 font-medium block mb-1">Nomor OR:</label>
              <input
                type="text"
                value={orNumber}
                onChange={e => setOrNumber(e.target.value)}
                placeholder="Contoh: OR-2026-0891"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono focus:ring-2 focus:ring-blue-500"
                required
              />
              {historyOrs.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto py-1 text-[10px]">
                  <span className="text-slate-400">Pilih:</span>
                  {historyOrs.slice(0, 3).map(o => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => setOrNumber(o)}
                      className="px-1.5 py-0.5 bg-slate-800 text-slate-300 rounded hover:bg-blue-600/30"
                    >
                      {o}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Style */}
            <div>
              <label className="text-slate-300 font-medium block mb-1">Style:</label>
              <input
                type="text"
                value={style}
                onChange={e => setStyle(e.target.value)}
                placeholder="Contoh: ST-AERO-2026"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-semibold focus:ring-2 focus:ring-blue-500"
                required
              />
              {historyStyles.length > 0 && (
                <div className="flex items-center gap-1 overflow-x-auto py-1 text-[10px]">
                  <span className="text-slate-400">Pilih:</span>
                  {historyStyles.slice(0, 3).map(st => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setStyle(st)}
                      className="px-1.5 py-0.5 bg-slate-800 text-blue-300 rounded hover:bg-blue-600/30"
                    >
                      {st}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Line Produksi */}
            <div>
              <label className="text-slate-300 font-medium block mb-1">Line Produksi:</label>
              <select
                value={lineProduksi}
                onChange={e => setLineProduksi(e.target.value)}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500"
              >
                {productionLines.map(line => (
                  <option key={line} value={line}>{line}</option>
                ))}
              </select>
            </div>

            {/* Target Produksi */}
            <div>
              <label className="text-slate-300 font-medium block mb-1">Target Produksi (Pcs):</label>
              <input
                type="number"
                value={targetProduksi}
                onChange={e => setTargetProduksi(Number(e.target.value))}
                min={1}
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white font-mono focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>

            {/* Tanggal Mulai & Selesai */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-slate-300 font-medium block mb-1">Tanggal Mulai:</label>
                <input
                  type="date"
                  value={tanggalMulai}
                  onChange={e => setTanggalMulai(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs font-mono"
                  required
                />
              </div>
              <div>
                <label className="text-slate-300 font-medium block mb-1">Tanggal Selesai:</label>
                <input
                  type="date"
                  value={tanggalSelesai}
                  onChange={e => setTanggalSelesai(e.target.value)}
                  className="w-full px-2 py-1.5 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs font-mono"
                  required
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <label className="text-slate-300 font-medium block mb-1">Catatan Operasional:</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Misal: Prioritas ekspor, tunggu aksesoris"
                className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300"
              />
            </div>

            <button
              type="submit"
              className="w-full mt-3 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold text-xs shadow-md shadow-blue-600/30 transition active:scale-95 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Simpan Jadwal Produksi</span>
            </button>
          </form>
        </div>

        {/* Calendar View Area */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
                <CalendarIcon className="w-4 h-4 text-blue-400" />
                <span>Gantt Kalender Produksi: {monthName}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Kolom tanggal merah &amp; Minggu di-highlight otomatis
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
                title="Bulan Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setActiveMonthDate(new Date(2026, 10, 1))}
                className="px-2.5 py-1 text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 font-semibold"
              >
                Bulan Ini
              </button>
              <button
                onClick={() => setActiveMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
                className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700"
                title="Bulan Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 text-xs text-slate-400 flex-wrap">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-red-950/80 border border-red-700 rounded-sm"></span>
              <span>Hari Minggu / Libur Nasional</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 bg-blue-600 rounded-sm"></span>
              <span>Bar Jadwal Produksi Aktif</span>
            </div>
          </div>

          {/* Interactive Scrollable Grid with Sticky Line Column */}
          <div className="border border-slate-800 rounded-xl overflow-x-auto max-h-[460px]">
            <table className="text-xs border-collapse w-full">
              <thead>
                <tr className="bg-slate-850 text-slate-300 border-b border-slate-800">
                  {/* Sticky Line Header */}
                  <th className="sticky left-0 z-20 bg-slate-850 px-3 py-2.5 text-left font-bold min-w-[120px] border-r border-slate-800 text-white shadow-md">
                    Line Produksi
                  </th>
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const dayNum = i + 1;
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                    const holidayInfo = isProductionNonWorkingDay(dateStr);

                    return (
                      <th
                        key={dayNum}
                        className={`px-2 py-2 text-center font-mono min-w-[34px] border-r border-slate-800/80 ${
                          holidayInfo.isNonWorking
                            ? 'bg-red-950/40 text-red-400 font-bold'
                            : 'text-slate-400'
                        }`}
                        title={holidayInfo.reason || `Hari ${dayNum}`}
                      >
                        <div>{dayNum}</div>
                        <div className="text-[9px] font-sans opacity-70">
                          {new Date(dateStr).toLocaleDateString('id-ID', { weekday: 'narrow' })}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredLines.map(line => {
                  const lineSchedules = schedules.filter(s => s.line_produksi === line);

                  return (
                    <tr key={line} className="hover:bg-slate-850/40">
                      {/* Sticky Line Column */}
                      <td className="sticky left-0 z-10 bg-slate-900 px-3 py-3 font-bold text-white border-r border-slate-800 shadow-sm whitespace-nowrap">
                        <div className="flex items-center justify-between">
                          <span>{line}</span>
                          <span className="text-[10px] text-slate-400 font-normal">
                            ({lineSchedules.length})
                          </span>
                        </div>
                      </td>

                      {/* Days Grid Cells */}
                      {Array.from({ length: daysInMonth }).map((_, i) => {
                        const dayNum = i + 1;
                        const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
                        const holidayInfo = isProductionNonWorkingDay(dateStr);

                        // Check if any schedule covers this day
                        const activeSched = lineSchedules.find(s => {
                          return dateStr >= s.tanggal_mulai && dateStr <= s.tanggal_selesai;
                        });

                        return (
                          <td
                            key={dayNum}
                            className={`p-1 text-center border-r border-slate-800/60 relative ${
                              holidayInfo.isNonWorking ? 'bg-red-950/20' : ''
                            }`}
                          >
                            {activeSched && (
                              <div
                                onClick={() => onStyleSelect(activeSched.style)}
                                className="w-full h-7 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-semibold flex items-center justify-center p-0.5 cursor-pointer shadow-sm truncate"
                                title={`${activeSched.style} (${activeSched.or_number}) - Target: ${activeSched.target_produksi} pcs`}
                              >
                                {dayNum === Number(activeSched.tanggal_mulai.slice(8, 10)) ? (
                                  <span className="truncate px-1 font-bold">{activeSched.style}</span>
                                ) : (
                                  <span className="w-1.5 h-1.5 bg-white/70 rounded-full"></span>
                                )}
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Schedules List for fast deletion or inspection */}
          <div className="pt-2">
            <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
              Daftar Jadwal Produksi Aktif ({schedules.length})
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {schedules.map(s => (
                <div
                  key={s.id}
                  className="bg-slate-800/60 border border-slate-700/80 rounded-lg p-3 text-xs flex items-center justify-between"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-white">{s.style}</span>
                      <span className="text-[10px] bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded font-mono">
                        {s.line_produksi}
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono">
                      OR: {s.or_number} · Target: {s.target_produksi} pcs
                    </div>
                    <div className="text-[10px] text-slate-400">
                      {s.tanggal_mulai} s/d {s.tanggal_selesai}
                    </div>
                  </div>

                  <button
                    onClick={() => handleDeleteSchedule(s.id)}
                    className="p-1.5 text-slate-400 hover:text-red-400 rounded hover:bg-slate-700 transition"
                    title="Hapus Jadwal"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
