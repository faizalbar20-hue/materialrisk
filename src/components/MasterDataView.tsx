import React, { useState, useEffect } from 'react';
import * as XLSX from 'xlsx';
import {
  Search,
  Filter,
  Trash2,
  Download,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  Calendar,
  Layers,
  ArrowUpDown,
  History,
  FileSpreadsheet,
} from 'lucide-react';
import { MaterialRecord, UploadRecord } from '../types/ppic';
import {
  fetchMaterials,
  deleteSelectiveMaterials,
  deleteMaterialsByOr,
  fetchUploadHistory,
} from '../services/api';

interface MasterDataViewProps {
  currentStyle: string;
  onStyleSelect: (style: string) => void;
}

export const MasterDataView: React.FC<MasterDataViewProps> = ({
  currentStyle,
  onStyleSelect,
}) => {
  const [materials, setMaterials] = useState<MaterialRecord[]>([]);
  const [totalRecords, setTotalRecords] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [totalPages, setTotalPages] = useState(1);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [orFilter, setOrFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Upload History Modal
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [uploadHistory, setUploadHistory] = useState<UploadRecord[]>([]);

  // Deletion modals
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteReason, setDeleteReason] = useState('Pembersihan data manual');
  const [deleteMode, setDeleteMode] = useState<'selective' | 'or'>('selective');
  const [orToDelete, setOrToDelete] = useState('');

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await fetchMaterials({
        page,
        pageSize,
        style: currentStyle,
        or: orFilter,
        search: searchQuery,
        status: statusFilter,
        dateFrom,
        dateTo,
        flaggedOnly,
      });

      setMaterials(res.items);
      setTotalRecords(res.total);
      setTotalPages(res.totalPages);
      setSelectedIds(new Set());
    } catch (err) {
      console.error('Error fetching materials:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [page, pageSize, currentStyle, orFilter, statusFilter, dateFrom, dateTo, flaggedOnly]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    loadData();
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(materials.map(m => m.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleExecuteDelete = async () => {
    try {
      if (deleteMode === 'selective') {
        const ids = Array.from(selectedIds);
        if (ids.length === 0) return;
        await deleteSelectiveMaterials(ids, deleteReason, 'PPIC Supervisor');
        alert(`Berhasil menghapus ${ids.length} baris material.`);
      } else {
        if (!orToDelete.trim()) return;
        await deleteMaterialsByOr(orToDelete.trim(), 'PPIC Manager');
        alert(`Berhasil menghapus seluruh transaksi untuk OR: ${orToDelete}`);
      }
      setShowDeleteModal(false);
      loadData();
    } catch (err: any) {
      alert(`Gagal menghapus data: ${err.message}`);
    }
  };

  const handleOpenUploadHistory = async () => {
    try {
      const res = await fetchUploadHistory();
      setUploadHistory(res.uploads);
      setShowHistoryModal(true);
    } catch (err) {
      alert('Gagal mengambil riwayat upload.');
    }
  };

  const handleExportTable = () => {
    const exportData = materials.map(m => ({
      'Tanggal Update': m.update_date,
      'No. OR': m.or_number,
      'Style': m.style,
      'Kode Material': m.material_code,
      'Nama Material': m.material_name,
      'Kebutuhan': m.kebutuhan,
      'Diterima': m.diterima,
      'Kekurangan': m.kekurangan,
      'Satuan': m.satuan,
      'Status Kesiapan': m.status_kesiapan,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rekap Material');
    XLSX.writeFile(wb, `PPIC_Rekap_Material_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(num);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400 mb-1">
              <span>Master Rekapitulasi</span>
              <span>·</span>
              <span className="text-slate-400">Total {totalRecords} Baris Aktif</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Master Data &amp; Rekapitulasi Kebutuhan Material
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Tabel 10 kolom dengan paginasi server-side dan pencarian multi-kriteria. Menampilkan riwayat upload tanpa menimpa data historis.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpenUploadHistory}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-2 transition"
            >
              <History className="w-4 h-4 text-blue-400" />
              <span>Histori Batch Upload</span>
            </button>

            <button
              onClick={handleExportTable}
              className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-2 transition"
            >
              <Download className="w-4 h-4 text-emerald-400" />
              <span>Export Excel</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          {/* General search */}
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && loadData()}
              placeholder="Cari Style, No. OR, Kode Material, atau Nama..."
              className="w-full pl-9 pr-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Status filter */}
          <div>
            <select
              value={statusFilter}
              onChange={e => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">Semua Status Kesiapan</option>
              <option value="READY">READY (Kekurangan ≥ 0)</option>
              <option value="BELUM READY">BELUM READY (Kekurangan &lt; 0)</option>
            </select>
          </div>

          {/* Page size */}
          <div>
            <select
              value={pageSize}
              onChange={e => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={10}>10 Baris per Halaman</option>
              <option value={25}>25 Baris per Halaman</option>
              <option value={50}>50 Baris per Halaman</option>
              <option value={100}>100 Baris per Halaman</option>
              <option value={500}>500 Baris per Halaman</option>
              <option value={1000}>1.000 Baris (High-Volume)</option>
            </select>
          </div>
        </div>

        {/* Date and specific filters */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800 text-xs">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 text-slate-400">
              <span>Tanggal:</span>
              <input
                type="date"
                value={dateFrom}
                onChange={e => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs font-mono"
              />
              <span>s/d</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-slate-200 text-xs font-mono"
              />
            </div>

            <label className="flex items-center gap-2 cursor-pointer text-slate-300">
              <input
                type="checkbox"
                checked={flaggedOnly}
                onChange={e => {
                  setFlaggedOnly(e.target.checked);
                  setPage(1);
                }}
                className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-800"
              />
              <span className="text-amber-400 font-medium">Hanya Baris Perlu Pemeriksaan</span>
            </label>
          </div>

          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <button
                onClick={() => {
                  setDeleteMode('selective');
                  setShowDeleteModal(true);
                }}
                className="px-3 py-1.5 bg-red-600/20 text-red-300 border border-red-500/30 rounded-lg text-xs font-semibold flex items-center gap-1.5 hover:bg-red-600/30 transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Hapus {selectedIds.size} Baris Terpilih</span>
              </button>
            )}

            <button
              onClick={loadData}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition"
              title="Refresh Tabel"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
      </div>

      {/* 10-Column Master Data Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-800/90 text-slate-300 uppercase tracking-wider font-semibold text-[11px] border-b border-slate-800">
              <tr>
                <th className="py-3 px-3 w-8">
                  <input
                    type="checkbox"
                    checked={materials.length > 0 && selectedIds.size === materials.length}
                    onChange={handleSelectAll}
                    className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-800"
                  />
                </th>
                <th className="py-3 px-3 whitespace-nowrap">1. Tanggal Update</th>
                <th className="py-3 px-3 whitespace-nowrap">2. No. OR</th>
                <th className="py-3 px-3 whitespace-nowrap">3. Style</th>
                <th className="py-3 px-3 whitespace-nowrap">4. Kode Material</th>
                <th className="py-3 px-3">5. Nama Material</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">6. Kebutuhan</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">7. Diterima</th>
                <th className="py-3 px-3 text-right whitespace-nowrap">8. Kekurangan</th>
                <th className="py-3 px-3 whitespace-nowrap">9. Satuan</th>
                <th className="py-3 px-3 whitespace-nowrap">10. Status Kesiapan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 font-mono">
              {loading && materials.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-400 font-sans">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto text-blue-500 mb-2" />
                    Memuat data material dari server...
                  </td>
                </tr>
              ) : materials.length === 0 ? (
                <tr>
                  <td colSpan={11} className="py-12 text-center text-slate-500 font-sans">
                    Tidak ditemukan data yang sesuai dengan pencarian atau filter saat ini.
                  </td>
                </tr>
              ) : (
                materials.map(m => (
                  <tr
                    key={m.id}
                    className={`hover:bg-slate-800/40 transition ${
                      selectedIds.has(m.id) ? 'bg-blue-950/20' : ''
                    }`}
                  >
                    <td className="py-2.5 px-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(m.id)}
                        onChange={() => handleToggleRow(m.id)}
                        className="rounded border-slate-700 text-blue-600 focus:ring-blue-500 bg-slate-800"
                      />
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">
                      {m.update_date}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-slate-300 whitespace-nowrap">
                      {m.or_number}
                    </td>
                    <td className="py-2.5 px-3 font-semibold text-blue-400 font-sans whitespace-nowrap">
                      <button
                        onClick={() => onStyleSelect(m.style)}
                        className="hover:underline text-left"
                        title="Klik untuk filter Style ini di seluruh aplikasi"
                      >
                        {m.style}
                      </button>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-slate-200 whitespace-nowrap">
                      {m.material_code}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-300 max-w-xs truncate" title={m.material_name}>
                      {m.material_name}
                      {m.is_flagged_for_review && (
                        <span className="ml-1 text-[10px] text-amber-400 font-medium">
                          (Perlu Cek)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300 font-medium">
                      {formatNumber(m.kebutuhan)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-medium">
                      {formatNumber(m.diterima)}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold ${
                        m.kekurangan < 0 ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {m.kekurangan > 0 ? `+${formatNumber(m.kekurangan)}` : formatNumber(m.kekurangan)}
                    </td>
                    <td className="py-2.5 px-3 text-slate-400 font-sans">
                      {m.satuan}
                    </td>
                    <td className="py-2.5 px-3 font-sans whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          m.status_kesiapan === 'READY'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {m.status_kesiapan}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        <div className="p-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-400">
          <div>
            Menampilkan baris {(page - 1) * pageSize + 1} -{' '}
            {Math.min(page * pageSize, totalRecords)} dari total{' '}
            <strong className="text-white">{totalRecords}</strong> baris material
          </div>

          <div className="flex items-center gap-1.5">
            <button
              disabled={page <= 1}
              onClick={() => setPage(1)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded border border-slate-700 transition"
            >
              Pertama
            </button>
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => Math.max(1, p - 1))}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded border border-slate-700 transition"
            >
              Prev
            </button>

            <span className="px-3 py-1 bg-slate-800 text-white font-bold rounded border border-slate-700">
              {page} / {totalPages}
            </span>

            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded border border-slate-700 transition"
            >
              Next
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(totalPages)}
              className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded border border-slate-700 transition"
            >
              Terakhir
            </button>
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-red-400">
              <div className="w-10 h-10 rounded-full bg-red-950/50 flex items-center justify-center border border-red-900/50">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-base font-bold text-white">Konfirmasi Penghapusan Data</h4>
                <p className="text-xs text-slate-400">Tindakan ini akan dicatat ke dalam audit log</p>
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 font-medium">Alasan Penghapusan (Wajib Audit):</label>
                <input
                  type="text"
                  value={deleteReason}
                  onChange={e => setDeleteReason(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-slate-200"
                />
              </div>

              {deleteMode === 'selective' ? (
                <p className="text-slate-300">
                  Anda akan menghapus <strong className="text-red-400">{selectedIds.size} baris</strong> material yang dipilih.
                </p>
              ) : (
                <div>
                  <label className="text-slate-300 font-medium">Nomor OR yang akan dibersihkan:</label>
                  <input
                    type="text"
                    value={orToDelete}
                    onChange={e => setOrToDelete(e.target.value)}
                    placeholder="Contoh: OR-2026-0891"
                    className="w-full mt-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded text-white font-mono"
                  />
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setShowDeleteModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium"
              >
                Batal
              </button>
              <button
                onClick={handleExecuteDelete}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg text-xs font-bold shadow-md shadow-red-600/30"
              >
                Ya, Konfirmasi Hapus
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload History Modal */}
      {showHistoryModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 max-w-3xl w-full shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h4 className="text-base font-bold text-white flex items-center gap-2">
                  <History className="w-5 h-5 text-blue-400" />
                  <span>Histori Batch Upload Tanpa Menimpa</span>
                </h4>
                <p className="text-xs text-slate-400 mt-0.5">
                  Daftar seluruh upload file dengan UUID, status, dan jumlah baris transaksi
                </p>
              </div>
              <button
                onClick={() => setShowHistoryModal(false)}
                className="text-slate-400 hover:text-white text-sm px-2 py-1 bg-slate-800 rounded"
              >
                ✕
              </button>
            </div>

            <div className="overflow-y-auto flex-1 text-xs">
              <table className="w-full text-left">
                <thead className="bg-slate-800/80 text-slate-300 uppercase text-[10px] tracking-wider sticky top-0">
                  <tr>
                    <th className="p-2.5">Waktu Upload</th>
                    <th className="p-2.5">No. OR</th>
                    <th className="p-2.5">Style</th>
                    <th className="p-2.5">Nama File</th>
                    <th className="p-2.5 text-right">Sukses</th>
                    <th className="p-2.5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 font-mono">
                  {uploadHistory.map(up => (
                    <tr key={up.id} className="hover:bg-slate-800/40">
                      <td className="p-2.5 text-slate-400 whitespace-nowrap">
                        {new Date(up.upload_time).toLocaleString('id-ID')}
                      </td>
                      <td className="p-2.5 font-bold text-slate-200">{up.or_number}</td>
                      <td className="p-2.5 font-bold text-blue-400 font-sans">{up.style}</td>
                      <td className="p-2.5 font-sans text-slate-300 max-w-xs truncate">{up.file_name}</td>
                      <td className="p-2.5 text-right font-bold text-emerald-400">{up.success_rows}</td>
                      <td className="p-2.5 font-sans">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-500/20 text-emerald-300">
                          {up.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
