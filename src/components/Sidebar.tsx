import React from 'react';
import {
  LayoutDashboard,
  UploadCloud,
  TableProperties,
  Calendar,
  AlertTriangle,
  Sparkles,
  Layers,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

export type MenuKey = 'dashboard' | 'upload' | 'master' | 'schedule' | 'risk' | 'ai';

interface SidebarProps {
  activeMenu: MenuKey;
  onSelectMenu: (menu: MenuKey) => void;
  schedulesCount: number;
  criticalRisksCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeMenu,
  onSelectMenu,
  schedulesCount,
  criticalRisksCount,
}) => {
  const menuItems: Array<{
    key: MenuKey;
    label: string;
    icon: React.ElementType;
    badge?: string | number;
    badgeColor?: string;
  }> = [
    {
      key: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      key: 'upload',
      label: 'Upload Excel',
      icon: UploadCloud,
    },
    {
      key: 'master',
      label: 'Master Data Material',
      icon: TableProperties,
    },
    {
      key: 'schedule',
      label: 'Penjadwalan Produksi',
      icon: Calendar,
      badge: schedulesCount > 0 ? schedulesCount : undefined,
      badgeColor: 'bg-blue-500/20 text-blue-300 border border-blue-500/30',
    },
    {
      key: 'risk',
      label: 'Material Risk Analysis',
      icon: AlertTriangle,
      badge: criticalRisksCount > 0 ? `${criticalRisksCount} Kritis` : undefined,
      badgeColor: 'bg-red-500/20 text-red-300 border border-red-500/30 font-semibold',
    },
    {
      key: 'ai',
      label: 'AI Assistant',
      icon: Sparkles,
      badge: 'Dual-Engine',
      badgeColor: 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30',
    },
  ];

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col justify-between select-none">
      <div>
        {/* Brand Header */}
        <div className="p-4 border-b border-slate-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
            <Layers className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-white flex items-center gap-1.5">
              <span>PPIC SYSTEM</span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">
              Material &amp; Risk Control
            </div>
          </div>
        </div>

        {/* Section Header */}
        <div className="px-4 pt-5 pb-2">
          <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Menu Operasional PPIC
          </div>
        </div>

        {/* Navigation Items */}
        <nav className="p-2 space-y-1">
          {menuItems.map(item => {
            const Icon = item.icon;
            const isActive = activeMenu === item.key;

            return (
              <button
                key={item.key}
                onClick={() => onSelectMenu(item.key)}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-xs font-semibold transition-all group ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                    : 'text-slate-300 hover:bg-slate-850 hover:text-white hover:bg-slate-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon
                    className={`w-4 h-4 transition-colors ${
                      isActive ? 'text-white' : 'text-slate-400 group-hover:text-blue-400'
                    }`}
                  />
                  <span>{item.label}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  {item.badge && (
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full ${
                        isActive ? 'bg-white/20 text-white' : item.badgeColor
                      }`}
                    >
                      {item.badge}
                    </span>
                  )}
                  {isActive && <ChevronRight className="w-3.5 h-3.5 text-white/80" />}
                </div>
              </button>
            );
          })}
        </nav>
      </div>

      {/* Clean System Integrity Footer (Strictly without Shift 1, Plant Cikarang, or Username) */}
      <div className="p-4 border-t border-slate-800/80 bg-slate-950/80 text-[11px] text-slate-400 space-y-2">
        <div className="flex items-center gap-2 text-emerald-400 font-medium">
          <ShieldCheck className="w-4 h-4" />
          <span>Supabase B Ready</span>
        </div>
        <p className="text-[10px] text-slate-400 leading-relaxed">
          Kekurangan = Diterima - Kebutuhan. Ready (≥ 0) | Belum Ready (&lt; 0).
        </p>
      </div>
    </aside>
  );
};
