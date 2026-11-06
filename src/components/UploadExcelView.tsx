import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  UploadCloud,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Play,
  RotateCcw,
  Download,
  Info,
  Clock,
  ShieldCheck,
  Check,
  Pause,
} from 'lucide-react';
import {
  calculateKekurangan,
  determineReadiness,
  parseMaterialCodeAndName,
} from '../utils/ppicRules';
import { fetchActiveOrStyles, uploadBatch } from '../services/api';

interface ParsedPreviewRow {
  id: string;
  material_code: string;
  material_name: string;
  kebutuhan: number;
  diterima: number;
  kekurangan: number;
  satuan: string;
  status_kesiapan: 'READY' | 'BELUM READY';
  raw_display_name: string;
  is_flagged_for_review: boolean;
}

interface UploadExcelViewProps {
  onUploadSuccess: () => void;
}

export const UploadExcelView: React.FC<UploadExcelViewProps> = ({ onUploadSuccess }) => {
  // Form states
  const [orNumber, setOrNumber] = useState('');
  const [style, setStyle] = useState('');
  const [updateDate, setUpdateDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  // Autocomplete reference
  const [historyPairs, setHistoryPairs] = useState<Array<{ or_number: string; style: string; latestDate: string }>>([]);
  const [historyStyles, setHistoryStyles] = useState<string[]>([]);
  const [historyOrs, setHistoryOrs] = useState<string[]>([]);

  // Parsing & Preview states
  const [isParsing, setIsParsing] = useState(false);
  const [parseWarnings, setParseWarnings] = useState<string[]>([]);
  const [parsedRows, setParsedRows] = useState<ParsedPreviewRow[]>([]);
  const [previewPage, setPreviewPage] = useState(1);
  const pageSize = 15;

  // Batching & Resume states
  const [batchSize, setBatchSize] = useState<number>(500);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadPaused, setUploadPaused] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<{
    uploadId: string;
    currentBatch: number;
    totalBatches: number;
    processedRows: number;
    totalRows: number;
    failedRows: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cancelBatchRef = useRef(false);

  // Load past OR and Style reference for autocomplete
  useEffect(() => {
    fetchActiveOrStyles()
      .then(data => {
        setHistoryPairs(data.pairs);
        setHistoryStyles(data.styles);
        setHistoryOrs(data.ors);
      })
      .catch(() => {});

    // Check localStorage for active unfinished upload checkpoint to support resume after refresh
    try {
      const savedCheckpoint = localStorage.getItem('ppic_active_upload_checkpoint');
      if (savedCheckpoint) {
        const parsed = JSON.parse(savedCheckpoint);
        if (parsed && parsed.rows && parsed.rows.length > 0) {
          setUploadProgress(parsed.progress);
          setParsedRows(parsed.rows);
          setOrNumber(parsed.orNumber);
          setStyle(parsed.style);
          setUpdateDate(parsed.updateDate);
        }
      }
    } catch (_) {}
  }, []);

  // Handle file drop & selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processSelectedFile(e.target.files[0]);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  };

  const processSelectedFile = async (file: File) => {
    setSelectedFile(file);
    setIsParsing(true);
    setParseWarnings([]);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length < 2) {
        throw new Error('File Excel tidak memiliki baris data yang cukup.');
      }

      // Search for header row
      let headerRowIndex = 0;
      let colIndices = {
        product: -1,
        qty: -1,
        received: -1,
        uom: -1,
      };

      for (let r = 0; r < Math.min(jsonData.length, 15); r++) {
        const row = jsonData[r];
        if (!Array.isArray(row)) continue;

        row.forEach((cellVal, cIdx) => {
          if (!cellVal) return;
          const s = String(cellVal).trim().toLowerCase();

          // Product / Display Name
          if (
            s.includes('order lines / product / display name') ||
            s.includes('product / display name') ||
            s.includes('display name') ||
            s === 'product' ||
            s === 'item' ||
            s === 'material'
          ) {
            colIndices.product = cIdx;
          }

          // Quantity
          if (
            s === 'order lines / quantity' ||
            s === 'quantity' ||
            s === 'kebutuhan' ||
            s === 'qty' ||
            s === 'order qty'
          ) {
            colIndices.qty = cIdx;
          }

          // Recieved Qty / Received Qty (supports spelling variations)
          if (
            s.includes('recieved qty') ||
            s.includes('received qty') ||
            s === 'diterima' ||
            s === 'qty received' ||
            s === 'qty recieved'
          ) {
            colIndices.received = cIdx;
          }

          // Unit of Measure
          if (
            s.includes('unit of measure / display name') ||
            s.includes('product unit of measure') ||
            s.includes('uom') ||
            s === 'satuan' ||
            s === 'unit'
          ) {
            colIndices.uom = cIdx;
          }
        });

        if (colIndices.product !== -1 && colIndices.qty !== -1) {
          headerRowIndex = r;
          break;
        }
      }

      if (colIndices.product === -1 || colIndices.qty === -1) {
        throw new Error(
          'Kolom wajib tidak ditemukan. Pastikan ada kolom "Product / Display Name" dan "Quantity".'
        );
      }

      const warnings: string[] = [];
      if (colIndices.received === -1) {
        warnings.push('Kolom "Recieved Qty" tidak ditemukan. Nilai diterima dianggap 0.');
      }
      if (colIndices.uom === -1) {
        warnings.push('Kolom "Satuan" tidak ditemukan. Satuan default "PCS" digunakan.');
      }

      // Parse data rows
      const rows: ParsedPreviewRow[] = [];
      const nowStr = Date.now().toString(36);

      for (let r = headerRowIndex + 1; r < jsonData.length; r++) {
        const row = jsonData[r];
        if (!Array.isArray(row) || row.length === 0) continue;

        const rawProduct = row[colIndices.product];
        if (!rawProduct || String(rawProduct).trim() === '') {
          // Ignore completely empty lines
          continue;
        }

        const rawQty = colIndices.qty !== -1 ? row[colIndices.qty] : 0;
        const rawRec = colIndices.received !== -1 ? row[colIndices.received] : 0;
        const rawUom = colIndices.uom !== -1 ? row[colIndices.uom] : 'PCS';

        const kebutuhan = Math.max(0, Number(rawQty) || 0);
        const diterima = Math.max(0, Number(rawRec) || 0);
        const kekurangan = calculateKekurangan(diterima, kebutuhan);
        const status_kesiapan = determineReadiness(kekurangan);

        const parsed = parseMaterialCodeAndName(String(rawProduct));

        rows.push({
          id: `row-${nowStr}-${r}`,
          material_code: parsed.materialCode,
          material_name: parsed.materialName,
          kebutuhan,
          diterima,
          kekurangan,
          satuan: String(rawUom || 'PCS').trim().toUpperCase(),
          status_kesiapan,
          raw_display_name: parsed.rawDisplayName,
          is_flagged_for_review: parsed.isFlaggedForReview,
        });
      }

      const flaggedCount = rows.filter(r => r.is_flagged_for_review).length;
      if (flaggedCount > 0) {
        warnings.push(`${flaggedCount} baris memiliki format kode tidak baku dan ditandai untuk pemeriksaan.`);
      }

      setParseWarnings(warnings);
      setParsedRows(rows);
      setPreviewPage(1);
    } catch (err: any) {
      alert(`Gagal memproses file Excel: ${err.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  // Generate Sample Excel File
  const handleDownloadTemplate = () => {
    const sampleData = [
      [
        'Order Lines / Product / Display Name',
        'Order Lines / Quantity',
        'Order Lines / Recieved Qty',
        'Order Lines / Product Unit of Measure / Display Name',
      ],
      ['[00104-FAB] Cotton Combed 30s Black Reactive', 4500, 4500, 'YDS'],
      ['[00105-RIB] Rib Spandex 1x1 Matching Black', 850, 500, 'KG'],
      ['00210-ZIP - Metal Zipper #5 YKK Gunmetal 20cm', 3200, 1800, 'PCS'],
      ['00340-THR : Sewing Thread Poly 40/2 Black #001', 240, 240, 'CONE'],
      ['[00890-LBL] Woven Satin Main Label Aero Tech', 3200, 3200, 'PCS'],
      ['00912-PLY Polybag OPP Self-Adhesive 30x40cm', 3200, 1200, 'PCS'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Order Lines');
    XLSX.writeFile(wb, 'Template_PO_PPIC_Order_Lines.xlsx');
  };

  // Batch commit handler with resume capability
  const handleStartBatchUpload = async () => {
    if (!orNumber.trim()) {
      alert('Nomor OR wajib diisi secara manual.');
      return;
    }
    if (!style.trim()) {
      alert('Style wajib diisi secara manual sebagai identitas utama PPIC.');
      return;
    }
    if (parsedRows.length === 0) {
      alert('Tidak ada baris material untuk diupload.');
      return;
    }

    setIsUploading(true);
    setUploadPaused(false);
    cancelBatchRef.current = false;

    const totalRows = parsedRows.length;
    const totalBatches = Math.ceil(totalRows / batchSize);
    const uploadId = uploadProgress?.uploadId || `up-${Date.now()}`;
    const startBatchIndex = uploadProgress ? uploadProgress.currentBatch : 0;

    let processedCount = uploadProgress ? uploadProgress.processedRows : 0;
    let failedCount = uploadProgress ? uploadProgress.failedRows : 0;

    for (let b = startBatchIndex; b < totalBatches; b++) {
      if (cancelBatchRef.current) {
        setUploadPaused(true);
        break;
      }

      const startIndex = b * batchSize;
      const batchItems = parsedRows.slice(startIndex, startIndex + batchSize);
      const isFinalBatch = b === totalBatches - 1;

      try {
        const res = await uploadBatch({
          uploadId,
          orNumber: orNumber.trim(),
          style: style.trim(),
          updateDate,
          fileName: selectedFile?.name || 'Manual_Upload.xlsx',
          batchIndex: b + 1,
          totalBatches,
          items: batchItems,
          isFinalBatch,
        });

        processedCount += res.batchSuccess || batchItems.length;
        failedCount += res.batchFailed || 0;

        const currentProgress = {
          uploadId,
          currentBatch: b + 1,
          totalBatches,
          processedRows: processedCount,
          totalRows,
          failedRows: failedCount,
        };

        setUploadProgress(currentProgress);

        // Save checkpoint in localStorage so user can refresh browser and resume
        localStorage.setItem(
          'ppic_active_upload_checkpoint',
          JSON.stringify({
            progress: currentProgress,
            rows: parsedRows,
            orNumber,
            style,
            updateDate,
          })
        );
      } catch (err: any) {
        console.error(`Error uploading batch ${b + 1}:`, err);
        alert(`Koneksi terganggu pada batch ${b + 1}. Upload dijeda. Anda dapat melanjutkan kapan saja.`);
        setUploadPaused(true);
        break;
      }
    }

    if (!cancelBatchRef.current && processedCount >= totalRows) {
      // Completed successfully
      localStorage.removeItem('ppic_active_upload_checkpoint');
      setUploadProgress(null);
      setIsUploading(false);
      alert(`Berhasil menyimpan ${totalRows} baris material untuk OR ${orNumber} dan Style ${style}!`);
      // Reset form
      setParsedRows([]);
      setSelectedFile(null);
      setOrNumber('');
      setStyle('');
      onUploadSuccess();
    } else {
      setIsUploading(false);
    }
  };

  const handlePauseUpload = () => {
    cancelBatchRef.current = true;
    setUploadPaused(true);
  };

  const handleResetUpload = () => {
    if (confirm('Batalkan dan hapus checkpoint upload saat ini?')) {
      localStorage.removeItem('ppic_active_upload_checkpoint');
      setUploadProgress(null);
      setParsedRows([]);
      setSelectedFile(null);
      setIsUploading(false);
      setUploadPaused(false);
    }
  };

  const paginatedPreview = parsedRows.slice(
    (previewPage - 1) * pageSize,
    previewPage * pageSize
  );
  const totalPreviewPages = Math.ceil(parsedRows.length / pageSize) || 1;

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400 mb-1">
              <span>Modul Input Data</span>
              <span>·</span>
              <span className="text-slate-400">Append-Only Tanpa Menimpa</span>
            </div>
            <h2 className="text-xl font-bold text-white tracking-tight">
              Upload File Purchase Order Order Lines
            </h2>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              Setiap upload merepresentasikan 1 OR dan 1 Style. Data lama disimpan sebagai histori permanen 
              dan tidak akan ditimpa. Mendukung resume batch upload untuk dataset besar hingga puluhan ribu baris.
            </p>
          </div>

          <button
            onClick={handleDownloadTemplate}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-750 text-slate-200 border border-slate-700 rounded-lg text-xs font-semibold flex items-center gap-2 transition"
          >
            <Download className="w-4 h-4 text-emerald-400" />
            <span>Download Template Excel</span>
          </button>
        </div>
      </div>

      {/* Upload & Form Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Form: OR, Style, Date */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4">
          <h3 className="text-sm font-bold text-white tracking-tight flex items-center gap-2">
            <span>Identitas Form Upload</span>
            <span className="text-[10px] text-red-400 font-normal">*Wajib Diisi</span>
          </h3>

          {/* OR Input */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>Nomor OR</span>
              <span className="text-[10px] text-slate-400 font-mono">Manual (Bukan No PO)</span>
            </label>
            <input
              type="text"
              value={orNumber}
              onChange={e => setOrNumber(e.target.value)}
              placeholder="Contoh: OR-2026-0895"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
            {historyOrs.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto py-1 text-[10px]">
                <span className="text-slate-400 whitespace-nowrap">Referensi:</span>
                {historyOrs.slice(0, 3).map(o => (
                  <button
                    key={o}
                    type="button"
                    onClick={() => setOrNumber(o)}
                    className="px-1.5 py-0.5 bg-slate-800 hover:bg-blue-600/30 text-slate-300 rounded border border-slate-700 font-mono transition"
                  >
                    {o}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Style Input (Crucial requirement: Manual, never guessed from PO) */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>Style (Identitas Utama PPIC)</span>
              <span className="text-[10px] text-blue-400 font-medium">Input Manual</span>
            </label>
            <input
              type="text"
              value={style}
              onChange={e => setStyle(e.target.value)}
              placeholder="Contoh: ST-AERO-2026"
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
            />
            {historyStyles.length > 0 && (
              <div className="flex items-center gap-1 overflow-x-auto py-1 text-[10px]">
                <span className="text-slate-400 whitespace-nowrap">Referensi Style:</span>
                {historyStyles.slice(0, 3).map(st => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setStyle(st)}
                    className="px-1.5 py-0.5 bg-slate-800 hover:bg-blue-600/30 text-blue-300 rounded border border-slate-700 font-medium transition"
                  >
                    {st}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tanggal Update */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-300">
              Tanggal Update Data
            </label>
            <input
              type="date"
              value={updateDate}
              onChange={e => setUpdateDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
            />
          </div>

          {/* Batch Size selector */}
          <div className="space-y-1.5 pt-2 border-t border-slate-800">
            <label className="text-xs font-medium text-slate-300 flex items-center justify-between">
              <span>Ukuran Batch Penyimpanan</span>
              <span className="text-[10px] text-emerald-400 font-medium">Optimal 500-1000</span>
            </label>
            <select
              value={batchSize}
              onChange={e => setBatchSize(Number(e.target.value))}
              className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={250}>250 baris per batch</option>
              <option value={500}>500 baris per batch (Standar)</option>
              <option value={1000}>1.000 baris per batch (Kecepatan Tinggi)</option>
            </select>
          </div>
        </div>

        {/* Right Dropzone Area */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight mb-2">
              File Excel Transaksi PO
            </h3>
            <p className="text-xs text-slate-400 mb-4">
              Membaca format Order Lines dengan kolom: Product / Display Name, Quantity, Recieved Qty, dan UoM.
            </p>

            <div
              onDragOver={e => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all ${
                selectedFile
                  ? 'border-blue-500 bg-blue-950/20'
                  : 'border-slate-700 hover:border-slate-600 bg-slate-850/50'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />

              <div className="flex flex-col items-center justify-center gap-3">
                <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-blue-400">
                  {selectedFile ? (
                    <FileSpreadsheet className="w-6 h-6 text-emerald-400" />
                  ) : (
                    <UploadCloud className="w-6 h-6" />
                  )}
                </div>

                {selectedFile ? (
                  <div>
                    <div className="text-sm font-semibold text-white">{selectedFile.name}</div>
                    <div className="text-xs text-slate-400 mt-1 font-mono">
                      {(selectedFile.size / 1024).toFixed(1)} KB · {parsedRows.length} baris terdeteksi
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className="text-xs font-semibold text-slate-200">
                      Tarik &amp; Lepas file Excel di sini atau <span className="text-blue-400 underline">Pilih File</span>
                    </div>
                    <div className="text-[11px] text-slate-400 mt-1">
                      Mendukung format .xlsx, .xls, .csv
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Warnings list */}
            {parseWarnings.length > 0 && (
              <div className="mt-4 p-3 bg-amber-950/30 border border-amber-900/50 rounded-lg text-xs text-amber-300 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Catatan Validasi Parser:</span>
                </div>
                <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-200/90 pl-1">
                  {parseWarnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Action Footer */}
          {parsedRows.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="text-xs text-slate-400">
                <span className="font-bold text-white">{parsedRows.length} baris</span> siap dikonfirmasi dan disimpan.
              </div>

              <div className="flex items-center gap-2">
                {uploadProgress && (
                  <button
                    onClick={handleResetUpload}
                    className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium border border-slate-700 flex items-center gap-1.5 transition"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Checkpoint</span>
                  </button>
                )}

                {isUploading ? (
                  <button
                    onClick={handlePauseUpload}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Jeda Upload</span>
                  </button>
                ) : (
                  <button
                    onClick={handleStartBatchUpload}
                    className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-lg shadow-blue-600/30 transition transform active:scale-95"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{uploadProgress ? 'Lanjutkan Upload' : 'Konfirmasi & Simpan ke Database'}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload Progress Bar (High-Volume Batching & Checkpoint) */}
      {uploadProgress && (
        <div className="bg-slate-900 border border-blue-500/30 rounded-xl p-5 shadow-lg space-y-3">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-blue-400 animate-pulse"></div>
              <span className="font-bold text-white">
                Proses Batch: Batch {uploadProgress.currentBatch} dari {uploadProgress.totalBatches}
              </span>
              <span className="text-slate-400">
                ({uploadProgress.processedRows} / {uploadProgress.totalRows} baris)
              </span>
            </div>
            <span className="font-mono font-bold text-blue-400">
              {Math.round((uploadProgress.processedRows / uploadProgress.totalRows) * 100)}%
            </span>
          </div>

          <div className="w-full bg-slate-800 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-blue-500 h-full transition-all duration-300"
              style={{
                width: `${(uploadProgress.processedRows / uploadProgress.totalRows) * 100}%`,
              }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>Idempotency aktif (UUID aman dari duplikasi bila resume)</span>
            {uploadPaused && (
              <span className="text-amber-400 font-semibold">Upload Dijeda — Checkpoint Tersimpan</span>
            )}
          </div>
        </div>
      )}

      {/* Preview Table Before Save (Mandatory user confirmation requirement) */}
      {parsedRows.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">
                Preview Data Sebelum Penyimpanan (Wajib Konfirmasi)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Periksa kode material, kuantitas, kekurangan (Diterima - Kebutuhan), dan status kesiapan.
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-400">
                Halaman {previewPage} dari {totalPreviewPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  disabled={previewPage <= 1}
                  onClick={() => setPreviewPage(p => Math.max(1, p - 1))}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded text-xs border border-slate-700 transition"
                >
                  Prev
                </button>
                <button
                  disabled={previewPage >= totalPreviewPages}
                  onClick={() => setPreviewPage(p => Math.min(totalPreviewPages, p + 1))}
                  className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-300 rounded text-xs border border-slate-700 transition"
                >
                  Next
                </button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-800/80 text-slate-300 uppercase tracking-wider font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Kode Material</th>
                  <th className="py-2.5 px-3">Nama Material</th>
                  <th className="py-2.5 px-3 text-right">Kebutuhan</th>
                  <th className="py-2.5 px-3 text-right">Diterima</th>
                  <th className="py-2.5 px-3 text-right">Kekurangan</th>
                  <th className="py-2.5 px-3">Satuan</th>
                  <th className="py-2.5 px-3">Status Kesiapan</th>
                  <th className="py-2.5 px-3">Audit Review</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800 font-mono">
                {paginatedPreview.map(row => (
                  <tr key={row.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-2.5 px-3 font-bold text-blue-400 whitespace-nowrap">
                      {row.material_code}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-200">
                      {row.material_name}
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-300 font-semibold">
                      {row.kebutuhan}
                    </td>
                    <td className="py-2.5 px-3 text-right text-emerald-400 font-semibold">
                      {row.diterima}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-bold ${
                        row.kekurangan < 0 ? 'text-red-400' : 'text-emerald-400'
                      }`}
                    >
                      {row.kekurangan > 0 ? `+${row.kekurangan}` : row.kekurangan}
                    </td>
                    <td className="py-2.5 px-3 font-sans text-slate-400">
                      {row.satuan}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                          row.status_kesiapan === 'READY'
                            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                            : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        }`}
                      >
                        {row.status_kesiapan}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      {row.is_flagged_for_review ? (
                        <span className="text-[10px] text-amber-400 flex items-center gap-1 font-medium">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Perlu Periksa</span>
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400">Normal</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
