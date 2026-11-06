import React, { useState, useRef } from 'react';
import {
  Sparkles,
  Bot,
  Volume2,
  Image as ImageIcon,
  Send,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  FileText,
  VolumeX,
} from 'lucide-react';
import { requestDualAiAnalysis, sendChatMessage, synthesizeTts, analyzeImage } from '../services/api';

interface AiAssistantModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetStyle: string;
  targetOr: string;
}

export const AiAssistantModal: React.FC<AiAssistantModalProps> = ({
  isOpen,
  onClose,
  targetStyle,
  targetOr,
}) => {
  if (!isOpen) return null;

  const [activeTab, setActiveTab] = useState<'dual' | 'chat' | 'vision'>('dual');

  // Dual Chain states
  const [dualRunning, setDualRunning] = useState(false);
  const [dualResult, setDualResult] = useState<{
    agent1Analysis: string;
    agent2Evaluation: string;
    finalRecommendation: string;
  } | null>(null);

  // Chat states
  const [messages, setMessages] = useState<Array<{ sender: 'user' | 'model'; text: string }>>([
    {
      sender: 'model',
      text: `Halo! Saya AI Co-Pilot PPIC. Saya siap membantu Anda menganalisis ketersediaan material, menyusun jadwal lini produksi, atau menghitung prioritas Pareto untuk Style ${targetStyle || 'Aktif'}. Apa yang ingin Anda tanyakan?`,
    },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);

  // TTS states
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);
  const [ttsLoading, setTtsLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Vision states (gemini-4-argon)
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageMime, setImageMime] = useState('image/jpeg');
  const [visionPrompt, setVisionPrompt] = useState('Ekstrak nomor PO, kode material, kuantitas, dan periksa apakah ada cacat pada label atau fisik material ini.');
  const [visionResult, setVisionResult] = useState<string | null>(null);
  const [visionLoading, setVisionLoading] = useState(false);

  // Trigger Dual-Chain Analysis
  const handleRunDualAnalysis = async () => {
    try {
      setDualRunning(true);
      const res = await requestDualAiAnalysis(targetStyle, targetOr);
      setDualResult(res);
    } catch (err: any) {
      alert(`Gagal menjalankan analisis: ${err.message}`);
    } finally {
      setDualRunning(false);
    }
  };

  // Play TTS audio with gemini-3.8-flash-tts
  const handlePlayTts = async (textToSpeak: string) => {
    try {
      if (isPlayingAudio && audioRef.current) {
        audioRef.current.pause();
        setIsPlayingAudio(false);
        return;
      }

      setTtsLoading(true);
      const res = await synthesizeTts(textToSpeak);
      const audioUrl = `data:${res.mimeType};base64,${res.audioBase64}`;

      const audio = new Audio(audioUrl);
      audioRef.current = audio;
      audio.onended = () => setIsPlayingAudio(false);
      audio.onerror = () => setIsPlayingAudio(false);

      await audio.play();
      setIsPlayingAudio(true);
    } catch (err: any) {
      alert(`Gagal memutar audio TTS: ${err.message}`);
    } finally {
      setTtsLoading(false);
    }
  };

  // Chat submit
  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || chatLoading) return;

    const userMsg = { sender: 'user' as const, text: chatInput.trim() };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setChatInput('');
    setChatLoading(true);

    try {
      const res = await sendChatMessage(updated, targetStyle, targetOr);
      setMessages([...updated, { sender: 'model', text: res.reply }]);
    } catch (err: any) {
      setMessages([...updated, { sender: 'model', text: `Maaf, terjadi gangguan saat menghubungi model: ${err.message}` }]);
    } finally {
      setChatLoading(false);
    }
  };

  // Image Upload handler
  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageMime(file.type || 'image/jpeg');
      const reader = new FileReader();
      reader.onload = () => {
        setSelectedImage(reader.result as string);
        setVisionResult(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleAnalyzeImage = async () => {
    if (!selectedImage) return;
    try {
      setVisionLoading(true);
      const res = await analyzeImage(selectedImage, imageMime, visionPrompt);
      setVisionResult(res.analysis);
    } catch (err: any) {
      alert(`Gagal menganalisis gambar: ${err.message}`);
    } finally {
      setVisionLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-md">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>PPIC AI Co-Pilot Intelligence</span>
                <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded font-mono">
                  Gemini API Suite
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Konteks Aktif: Style <strong className="text-white">{targetStyle || 'Semua Style'}</strong> · OR <strong className="text-white">{targetOr || 'Semua OR'}</strong>
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center transition"
          >
            ✕
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-4 py-2 border-b border-slate-800 bg-slate-900 flex items-center gap-2 text-xs">
          <button
            onClick={() => setActiveTab('dual')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'dual'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Bot className="w-4 h-4" />
            <span>Dual-Agent Chain (Model 1 &amp; 2)</span>
          </button>

          <button
            onClick={() => setActiveTab('chat')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'chat'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-4 h-4" />
            <span>Konsultasi Multi-Turn Chat</span>
          </button>

          <button
            onClick={() => setActiveTab('vision')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition flex items-center gap-1.5 ${
              activeTab === 'vision'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-slate-400 hover:text-white hover:bg-slate-800'
            }`}
          >
            <ImageIcon className="w-4 h-4" />
            <span>Scan Dokumen &amp; Swatch (gemini-4-argon)</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 text-xs text-slate-200">
          {activeTab === 'dual' && (
            <div className="space-y-4">
              <div className="bg-slate-850 border border-slate-800 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-sm font-bold text-white tracking-tight">
                    Pipeline Analisis Berantai Dual-Engine
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Model 1 mengidentifikasi bottleneck data mentah → Model 2 mengevaluasi mitigasi risiko &amp; action plan.
                  </p>
                </div>

                <button
                  onClick={handleRunDualAnalysis}
                  disabled={dualRunning}
                  className="px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-bold shadow-md flex items-center gap-2 whitespace-nowrap disabled:opacity-50"
                >
                  {dualRunning ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Sedang Menganalisis...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Jalankan Analisis Berantai</span>
                    </>
                  )}
                </button>
              </div>

              {dualResult ? (
                <div className="space-y-4 pt-2">
                  {/* Model 1 Box */}
                  <div className="bg-blue-950/20 border border-blue-900/40 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-blue-400 flex items-center gap-1.5">
                        <Bot className="w-4 h-4" />
                        <span>MODEL 1: ANALISIS OPERASIONAL &amp; DEVIASI MATERIAL</span>
                      </span>
                      <button
                        onClick={() => handlePlayTts(dualResult.agent1Analysis)}
                        disabled={ttsLoading}
                        className="px-2.5 py-1 bg-blue-600/30 hover:bg-blue-600 text-blue-200 rounded text-[11px] font-medium flex items-center gap-1 transition"
                        title="Dengarkan dengan Suara AI (gemini-3.8-flash-tts)"
                      >
                        {isPlayingAudio ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                        <span>{isPlayingAudio ? 'Stop Suara' : 'Dengarkan TTS'}</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                      {dualResult.agent1Analysis}
                    </p>
                  </div>

                  {/* Model 2 Box */}
                  <div className="bg-indigo-950/20 border border-indigo-900/40 rounded-xl p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-indigo-400 flex items-center gap-1.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>MODEL 2: EVALUASI STRATEGIS &amp; KEPUTUSAN EKSEKUTIF</span>
                      </span>
                      <button
                        onClick={() => handlePlayTts(dualResult.agent2Evaluation)}
                        disabled={ttsLoading}
                        className="px-2.5 py-1 bg-indigo-600/30 hover:bg-indigo-600 text-indigo-200 rounded text-[11px] font-medium flex items-center gap-1 transition"
                        title="Dengarkan dengan Suara AI (gemini-3.8-flash-tts)"
                      >
                        <Volume2 className="w-3.5 h-3.5" />
                        <span>Dengarkan TTS</span>
                      </button>
                    </div>
                    <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">
                      {dualResult.agent2Evaluation}
                    </p>
                  </div>

                  {/* Final Recommendation */}
                  <div className="bg-emerald-950/30 border border-emerald-900/50 rounded-xl p-4 text-xs text-emerald-300 flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                    <div>
                      <strong className="text-white block font-semibold mb-0.5">Kesimpulan Terpadu PPIC:</strong>
                      {dualResult.finalRecommendation}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="py-12 text-center text-slate-500">
                  Klik tombol <strong>"Jalankan Analisis Berantai"</strong> di atas untuk memproses data aktual dari database.
                </div>
              )}
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="flex flex-col h-[480px]">
              {/* Messages Thread */}
              <div className="flex-1 overflow-y-auto space-y-3 pr-2 mb-4">
                {messages.map((m, idx) => (
                  <div
                    key={idx}
                    className={`flex ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] rounded-xl p-3 text-xs leading-relaxed ${
                        m.sender === 'user'
                          ? 'bg-blue-600 text-white rounded-br-none'
                          : 'bg-slate-800 text-slate-200 border border-slate-700 rounded-bl-none'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2 mb-1 opacity-70 text-[10px]">
                        <span>{m.sender === 'user' ? 'Anda (PPIC Operator)' : 'Gemini AI Assistant'}</span>
                        {m.sender === 'model' && (
                          <button
                            onClick={() => handlePlayTts(m.text)}
                            className="hover:text-white"
                            title="Dengarkan TTS"
                          >
                            <Volume2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="whitespace-pre-line">{m.text}</div>
                    </div>
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 text-xs text-slate-400 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                      <span>Gemini sedang menyusun jawaban operasional...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleSendChat} className="flex items-center gap-2 pt-2 border-t border-slate-800">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Ketik pertanyaan terkait kesiapan material, lini produksi, atau simulasi..."
                  className="flex-1 px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || chatLoading}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Kirim</span>
                </button>
              </form>
            </div>
          )}

          {activeTab === 'vision' && (
            <div className="space-y-4">
              <div className="bg-slate-850 border border-slate-800 rounded-xl p-4">
                <h4 className="text-sm font-bold text-white mb-1">
                  Analisis Visual Gambar Material &amp; Surat Jalan (gemini-4-argon)
                </h4>
                <p className="text-xs text-slate-400">
                  Unggah foto swatch kain, roll label, Surat Jalan vendor, atau kemasan box untuk verifikasi OCR otomatis.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Upload Box */}
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-slate-300">
                    Pilih Foto Dokumen / Material:
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageFileChange}
                    className="block w-full text-xs text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-slate-800 file:text-blue-400 hover:file:bg-slate-700 cursor-pointer"
                  />

                  {selectedImage && (
                    <div className="relative border border-slate-700 rounded-lg overflow-hidden max-h-60 bg-black flex items-center justify-center">
                      <img
                        src={selectedImage}
                        alt="Preview Upload"
                        className="max-h-60 object-contain"
                      />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Instruksi Analisis Gambar:
                    </label>
                    <textarea
                      value={visionPrompt}
                      onChange={e => setVisionPrompt(e.target.value)}
                      rows={2}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-xs text-white"
                    />
                  </div>

                  <button
                    onClick={handleAnalyzeImage}
                    disabled={!selectedImage || visionLoading}
                    className="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition"
                  >
                    {visionLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Memindai dengan gemini-4-argon...</span>
                      </>
                    ) : (
                      <>
                        <ImageIcon className="w-4 h-4" />
                        <span>Jalankan Analisis Gambar</span>
                      </>
                    )}
                  </button>
                </div>

                {/* Result Box */}
                <div className="bg-slate-850 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-white flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <span>Hasil Ekstraksi &amp; Inspeksi Visual</span>
                      </span>
                      {visionResult && (
                        <button
                          onClick={() => handlePlayTts(visionResult)}
                          className="px-2 py-0.5 bg-slate-800 text-slate-300 hover:text-white rounded text-[10px] flex items-center gap-1"
                        >
                          <Volume2 className="w-3 h-3" />
                          <span>TTS</span>
                        </button>
                      )}
                    </div>

                    {visionResult ? (
                      <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-line bg-slate-900/60 p-3 rounded-lg border border-slate-800 max-h-72 overflow-y-auto">
                        {visionResult}
                      </div>
                    ) : (
                      <div className="py-16 text-center text-slate-500 text-xs">
                        Belum ada analisis. Unggah foto dan klik <strong>"Jalankan Analisis Gambar"</strong>.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
