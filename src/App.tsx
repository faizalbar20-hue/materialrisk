import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar, MenuKey } from './components/Sidebar';
import { DashboardView } from './components/DashboardView';
import { UploadExcelView } from './components/UploadExcelView';
import { MasterDataView } from './components/MasterDataView';
import { ProductionScheduleView } from './components/ProductionScheduleView';
import { RiskAnalysisView } from './components/RiskAnalysisView';
import { AiAssistantModal } from './components/AiAssistantModal';
import { RollingRetentionModal } from './components/RollingRetentionModal';
import { SupabaseSchemaModal } from './components/SupabaseSchemaModal';
import { BulkTestModal } from './components/BulkTestModal';
import { fetchSchedules, fetchRiskAnalysis } from './services/api';

export default function App() {
  const [activeMenu, setActiveMenu] = useState<MenuKey>('dashboard');
  const [currentStyle, setCurrentStyle] = useState<string>('');
  const [targetOrForAi, setTargetOrForAi] = useState<string>('');

  // Modals state
  const [isAiOpen, setIsAiOpen] = useState(false);
  const [isRollingOpen, setIsRollingOpen] = useState(false);
  const [isSupabaseOpen, setIsSupabaseOpen] = useState(false);
  const [isBulkTestOpen, setIsBulkTestOpen] = useState(false);

  // Badge counters
  const [schedulesCount, setSchedulesCount] = useState(0);
  const [criticalRisksCount, setCriticalRisksCount] = useState(0);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const refreshBadges = async () => {
    try {
      const [schedRes, riskRes] = await Promise.all([
        fetchSchedules(),
        fetchRiskAnalysis(),
      ]);
      setSchedulesCount(schedRes.schedules.length);
      setCriticalRisksCount(riskRes.summary.critical);
    } catch (_) {}
  };

  useEffect(() => {
    refreshBadges();
  }, [refreshTrigger, currentStyle]);

  const handleOpenAiForStyle = (style: string, orNumber: string) => {
    setCurrentStyle(style);
    setTargetOrForAi(orNumber);
    setIsAiOpen(true);
  };

  const menuTitles: Record<MenuKey, string> = {
    dashboard: 'Dashboard Operasional PPIC',
    upload: 'Form Upload Order Lines Excel',
    master: 'Master Data & Rekapitulasi Material',
    schedule: 'Penjadwalan Produksi & Kalender Line',
    risk: 'Material Risk Analysis & Bottleneck',
    ai: 'AI Co-Pilot Assistant',
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-950 text-slate-100 font-sans antialiased">
      {/* Sidebar Navigation */}
      <Sidebar
        activeMenu={activeMenu}
        onSelectMenu={menu => {
          if (menu === 'ai') {
            setIsAiOpen(true);
          } else {
            setActiveMenu(menu);
          }
        }}
        schedulesCount={schedulesCount}
        criticalRisksCount={criticalRisksCount}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Global Universal Header with Searchbar */}
        <Header
          currentStyle={currentStyle}
          onStyleChange={style => setCurrentStyle(style)}
          onOpenAi={() => setIsAiOpen(true)}
          onOpenRolling={() => setIsRollingOpen(true)}
          onOpenSupabase={() => setIsSupabaseOpen(true)}
          onOpenBulkTest={() => setIsBulkTestOpen(true)}
          activeMenuTitle={menuTitles[activeMenu]}
        />

        {/* Scrollable View Area */}
        <main className="flex-1 overflow-y-auto p-6 bg-slate-950">
          <div className="max-w-7xl mx-auto space-y-6">
            {activeMenu === 'dashboard' && (
              <DashboardView
                currentStyle={currentStyle}
                onStyleSelect={style => setCurrentStyle(style)}
                onNavigateMenu={menu => setActiveMenu(menu)}
              />
            )}

            {activeMenu === 'upload' && (
              <UploadExcelView
                onUploadSuccess={() => {
                  setRefreshTrigger(t => t + 1);
                  setActiveMenu('master');
                }}
              />
            )}

            {activeMenu === 'master' && (
              <MasterDataView
                currentStyle={currentStyle}
                onStyleSelect={style => setCurrentStyle(style)}
              />
            )}

            {activeMenu === 'schedule' && (
              <ProductionScheduleView
                currentStyle={currentStyle}
                onStyleSelect={style => setCurrentStyle(style)}
                onNavigateToRisk={() => setActiveMenu('risk')}
              />
            )}

            {activeMenu === 'risk' && (
              <RiskAnalysisView
                currentStyle={currentStyle}
                onStyleSelect={style => setCurrentStyle(style)}
                onOpenAiForStyle={handleOpenAiForStyle}
              />
            )}
          </div>
        </main>
      </div>

      {/* Global Modals */}
      <AiAssistantModal
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        targetStyle={currentStyle}
        targetOr={targetOrForAi}
      />

      <RollingRetentionModal
        isOpen={isRollingOpen}
        onClose={() => setIsRollingOpen(false)}
        onPurgeSuccess={() => {
          setRefreshTrigger(t => t + 1);
        }}
      />

      <SupabaseSchemaModal
        isOpen={isSupabaseOpen}
        onClose={() => setIsSupabaseOpen(false)}
      />

      <BulkTestModal
        isOpen={isBulkTestOpen}
        onClose={() => setIsBulkTestOpen(false)}
        onBulkSuccess={() => {
          setRefreshTrigger(t => t + 1);
        }}
      />
    </div>
  );
}
