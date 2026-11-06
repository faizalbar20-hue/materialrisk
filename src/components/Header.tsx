import React, { useState, useEffect, useRef } from 'react';
import { Search, X, Sparkles, Database, Clock, Zap, Volume2, CheckCircle2 } from 'lucide-react';
import { fetchActiveOrStyles } from '../services/api';

interface HeaderProps {
  currentStyle: string;
  onStyleChange: (style: string) => void;
  onOpenAi: () => void;
  onOpenRolling: () => void;
  onOpenSupabase: () => void;
  onOpenBulkTest: () => void;
  activeMenuTitle: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentStyle,
  onStyleChange,
  onOpenAi,
  onOpenRolling,
  onOpenSupabase,
  onOpenBulkTest,
  activeMenuTitle,
}) => {
  const [searchInput, setSearchInput] = useState(currentStyle);
  const [suggestions, setSuggestions] = useState<{ styles: string[]; ors: string[] }>({ styles: [], ors: [] });
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSearchInput(currentStyle);
  }, [currentStyle]);

  useEffect(() => {
    fetchActiveOrStyles()
      .then(data => {
        setSuggestions({ styles: data.styles, ors: data.ors });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    onStyleChange(searchInput.trim());
    setShowDropdown(false);
  };

  const handleSelectSuggestion = (val: string) => {
    setSearchInput(val);
    onStyleChange(val);
    setShowDropdown(false);
  };

  const handleClear = () => {
    setSearchInput('');
    onStyleChange('');
    setShowDropdown(false);
  };

  const filteredStyles = suggestions.styles.filter(s =>
    s.toLowerCase().includes((searchInput || '').toLowerCase())
  );
  const filteredOrs = suggestions.ors.filter(o =>
    o.toLowerCase().includes((searchInput || '').toLowerCase())
  );

  return (
    <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 text-slate-100">
      <div className="px-6 py-3.5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        {/* Menu Context Indicator */}
        <div className="flex items-center gap-3">
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white flex items-center gap-2">
              <span>{activeMenuTitle}</span>
              {currentStyle && (
                <span className="text-xs font-medium bg-blue-600/30 text-blue-300 border border-blue-500/40 px-2 py-0.5 rounded">
                  Filter Style: {currentStyle}
                </span>
              )}
            </h1>
            <p className="text-xs text-slate-400">
              Sistem Analisis Kebutuhan Material &amp; Kesiapan Produksi
            </p>
          </div>
        </div>

        {/* Global Searchbar (Dedicated to Style & OR) */}
        <div className="relative flex-1 max-w-xl" ref={dropdownRef}>
          <form onSubmit={handleSearchSubmit} className="relative">
            <div className="relative flex items-center">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input
                type="text"
                value={searchInput}
                onChange={e => {
                  setSearchInput(e.target.value);
                  setShowDropdown(true);
                }}
                onFocus={() => setShowDropdown(true)}
                placeholder="Cari Style (identitas utama PPIC), OR, atau Material..."
                className="w-full pl-10 pr-20 py-2 bg-slate-800/90 border border-slate-700/80 rounded-lg text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-blue-500 transition-all shadow-inner"
              />
              <div className="absolute right-2 flex items-center gap-1">
                {searchInput && (
                  <button
                    type="button"
                    onClick={handleClear}
                    title="Hapus pencarian"
                    className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-700 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="submit"
                  className="px-2.5 py-1 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded transition shadow-sm"
                >
                  Cari
                </button>
              </div>
            </div>
          </form>

          {/* Autocomplete Dropdown */}
          {showDropdown && (filteredStyles.length > 0 || filteredOrs.length > 0) && (
            <div className="absolute left-0 right-0 mt-1.5 bg-slate-850 border border-slate-700 rounded-lg shadow-2xl overflow-hidden z-50 bg-slate-900 divide-y divide-slate-800">
              {filteredStyles.length > 0 && (
                <div className="p-2">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
                    Histori Style (Identitas PPIC)
                  </div>
                  <div className="space-y-0.5">
                    {filteredStyles.slice(0, 5).map(st => (
                      <button
                        key={st}
                        type="button"
                        onClick={() => handleSelectSuggestion(st)}
                        className="w-full text-left px-2.5 py-1.5 text-xs text-slate-200 hover:bg-blue-600 hover:text-white rounded flex items-center justify-between transition"
                      >
                        <span className="font-semibold">{st}</span>
                        <span className="text-[10px] text-slate-400 opacity-80">Gunakan Style Ini</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {filteredOrs.length > 0 && (
                <div className="p-2">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2 py-1">
                    Histori Nomor OR
                  </div>
                  <div className="space-y-0.5">
                    {filteredOrs.slice(0, 4).map(orNum => (
                      <button
                        key={orNum}
                        type="button"
                        onClick={() => handleSelectSuggestion(orNum)}
                        className="w-full text-left px-2.5 py-1.5 text-xs text-slate-200 hover:bg-blue-600 hover:text-white rounded flex items-center justify-between transition"
                      >
                        <span className="font-mono">{orNum}</span>
                        <span className="text-[10px] text-slate-400 opacity-80">Filter OR</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Global Toolbar Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <button
            onClick={onOpenAi}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-lg text-xs font-semibold shadow-md transition transform active:scale-95"
            title="Buka AI Assistant Co-Pilot dengan Gemini"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Co-Pilot</span>
          </button>

          <button
            onClick={onOpenRolling}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
            title="Kelola Retensi Rolling 4 Hari"
          >
            <Clock className="w-3.5 h-3.5 text-amber-400" />
            <span>Rolling 4 Hari</span>
          </button>

          <button
            onClick={onOpenSupabase}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
            title="Kelola Koneksi Database & Skema Supabase"
          >
            <Database className="w-3.5 h-3.5 text-emerald-400" />
            <span>Supabase DB</span>
          </button>

          <button
            onClick={onOpenBulkTest}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition"
            title="Uji Upload 20.000 / 40.000 Baris"
          >
            <Zap className="w-3.5 h-3.5 text-yellow-400" />
            <span>High-Volume Test</span>
          </button>
        </div>
      </div>
    </header>
  );
};
