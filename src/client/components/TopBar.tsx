import React, { useState } from 'react';
import { Film, ShieldAlert, Cpu, Download, FileSpreadsheet, Layers, Activity, Sparkles, Loader2, Settings, X } from 'lucide-react';
import { Shot } from '../../common/types.js';

interface TopBarProps {
  currentShot?: Shot | null;
  selectedProvider: string;
  onProviderChange: (p: string) => void;
  sessionStats: { totalCalls: number; totalTokens: number; totalCostUsd: number };
  onRenderShot: () => void;
  onRenderVideo: () => void;
  onOpenBulkImport: () => void;
  onExportTimeline: () => void;
  onExportZip: () => void;
  onTestConnection: () => Promise<void>;
  onLoadDemoShots: () => Promise<void>;
  isRendering: boolean;
  isTestingLlm?: boolean;
  availableModels: { id: string; displayName: string }[];
  currentModel: string;
  onModelChange: (m: string) => void;
  onTestModel: (m: string) => void;
  onSimulate429: (mode?: 'rate-limit' | 'quota') => void;
  quotaUsedModels: string[];
}

export const TopBar: React.FC<TopBarProps> = ({
  currentShot,
  selectedProvider,
  onProviderChange,
  sessionStats,
  onRenderShot,
  onRenderVideo: _onRenderVideo,
  onOpenBulkImport,
  onExportTimeline,
  onExportZip,
  onTestConnection,
  onLoadDemoShots,
  isRendering,
  isTestingLlm = false,
  availableModels,
  currentModel,
  onModelChange,
  onTestModel,
  onSimulate429,
  quotaUsedModels
}) => {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settings, setSettings] = useState<{ editingSoftware: string; outputFormat: string }>({ editingSoftware: 'CapCut', outputFormat: 'ProRes 4444 MOV / WebM VP9' });
  const openSettings = async () => {
    setSettingsOpen(true);
    try { const r = await fetch('/api/settings'); if (r.ok) setSettings(await r.json()); } catch (_) {}
  };
  const saveSettings = async () => {
    await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
    setSettingsOpen(false);
  };
  return (
    <header className="h-14 bg-[#111827] border-b border-[#243247] px-4 flex items-center justify-between select-none">
      {/* Brand & Title */}
      <div className="flex items-center space-x-3">
        <div className="w-8 h-8 rounded-lg bg-[#C92A2A] flex items-center justify-center text-white font-black text-sm shadow-[0_0_15px_rgba(201,42,42,0.5)]">
          SI
        </div>
        <div>
          <span className="font-extrabold text-sm tracking-wide text-white">MOTION LAB</span>
          <span className="ml-2 text-xs text-[#94A3B8] font-medium hidden md:inline">Local Production Studio</span>
        </div>
      </div>

      {/* Free Tier Safeguard Banner */}
      <div className="hidden lg:flex items-center space-x-2 bg-[#1E293B] border border-amber-500/30 text-amber-300 text-xs px-3 py-1 rounded-full">
        <ShieldAlert className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Free-tier provider safeguards active. Real API metrics only.</span>
      </div>

      {/* Actions & Counters */}
      <div className="flex items-center space-x-3">
        {/* Honest Session Stats */}
        <div className="hidden xl:flex items-center space-x-3 text-xs bg-[#0F172A] px-3 py-1.5 rounded-md border border-[#243247] text-[#94A3B8]">
          <div className="flex items-center space-x-1">
            <Cpu className="w-3.5 h-3.5 text-blue-400" />
            <span>Calls: <strong className="text-white">{sessionStats.totalCalls}</strong></span>
          </div>
          <span className="text-[#334155]">|</span>
          <span>Tokens: <strong className="text-white">{sessionStats.totalTokens.toLocaleString()}</strong></span>
          <span className="text-[#334155]">|</span>
          <span>Cost: <strong className="text-emerald-400">{sessionStats.totalCostUsd === 0 ? 'Free Tier ($0)' : `$${sessionStats.totalCostUsd.toFixed(4)}`}</strong></span>
        </div>

        <button onClick={openSettings} title="Global settings" className="p-1.5 rounded bg-[#0F172A] border border-[#243247] text-[#94A3B8] hover:text-white">
          <Settings className="w-3.5 h-3.5" />
        </button>

        {/* Provider Selector */}
        <div className="flex items-center space-x-1.5 bg-[#0F172A] border border-[#243247] rounded-md px-2 py-1 text-xs">
          <span className="text-[#64748B]">LLM:</span>
          <select
            value={selectedProvider}
            onChange={(e) => onProviderChange(e.target.value)}
            className="bg-transparent text-white font-medium focus:outline-none cursor-pointer"
          >
            <option value="gemini" className="bg-[#0F172A]">Gemini 3.5 Flash</option>
            <option value="claude" className="bg-[#0F172A]">Claude 3.7 Sonnet</option>
            <option value="agent" disabled className="bg-[#0F172A] text-slate-500">
              Antigravity Agent (Later)
            </option>
          </select>
        </div>

        {/* Model Dropdown (populated from ListModels) + per-model Test */}
        <div className="flex items-center space-x-1 bg-[#0F172A] border border-[#243247] rounded-md px-2 py-1 text-xs">
          <span className="text-[#64748B]">Model:</span>
          <select
            data-testid="model-select"
            value={currentModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="bg-transparent text-white font-medium focus:outline-none cursor-pointer max-w-[150px]"
          >
            {availableModels.map((m) => {
              const quotaUsed = quotaUsedModels.includes(m.id.replace(/^models\//, ''));
              return (
                <option key={m.id} value={m.id} className="bg-[#0F172A]">
                  {m.id}{quotaUsed ? ' (quota used)' : ''}
                </option>
              );
            })}
          </select>
          <button
            data-testid="model-test"
            onClick={() => onTestModel(currentModel)}
            disabled={isTestingLlm}
            title={`Send a live PONG request to ${currentModel}`}
            className="px-1.5 py-0.5 rounded bg-cyan-950/70 hover:bg-cyan-900 border border-cyan-700/60 text-cyan-300 font-bold disabled:opacity-50"
          >
            Test
          </button>
        </div>

        {/* Simulate 429 */}
        <button
          data-testid="simulate-429"
          onClick={() => onSimulate429('rate-limit')}
          title="Simulate a rate-limit 429 (short backoff, retried)"
          className="px-2 py-1.5 bg-[#1E293B] hover:bg-[#2A374D] border border-amber-600/50 text-amber-300 rounded-md text-xs font-semibold transition-colors"
        >
          Sim 429
        </button>
        <button
          data-testid="simulate-429-quota"
          onClick={() => onSimulate429('quota')}
          title="Simulate a daily-quota 429 (never retried, no repair)"
          className="px-2 py-1.5 bg-[#1E293B] hover:bg-[#2A374D] border border-rose-600/50 text-rose-300 rounded-md text-xs font-semibold transition-colors"
        >
          Sim daily 429
        </button>

        {/* Test Connection Button */}
        <button
          onClick={onTestConnection}
          disabled={isTestingLlm}
          title="Run live diagnostic call against configured LLM"
          className="flex items-center space-x-1 px-2.5 py-1.5 bg-[#1E293B] hover:bg-[#2A374D] border border-cyan-500/40 text-cyan-300 hover:text-white rounded-md text-xs font-semibold transition-colors disabled:opacity-50"
        >
          {isTestingLlm ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
          <span className="hidden md:inline">Test Connection</span>
        </button>

        {/* Load Demo Shots Button */}
        <button
          onClick={onLoadDemoShots}
          title="Load 4 acceptance-test starter shots with empty versions"
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#1E293B] hover:bg-[#2A374D] border border-purple-500/40 text-purple-300 hover:text-white rounded-md text-xs font-semibold transition-colors"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Load Demo Shots</span>
        </button>

        {/* Bulk Import */}
        <button
          onClick={onOpenBulkImport}
          title="Import Production Sheet JSON"
          className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#1E293B] hover:bg-[#2A374D] border border-[#334155] rounded-md text-xs font-semibold text-[#CBD5E1] transition-colors"
        >
          <FileSpreadsheet className="w-3.5 h-3.5 text-blue-400" />
          <span className="hidden sm:inline">Import Sheet</span>
        </button>

        {/* Export Buttons */}
        <div className="flex items-center space-x-1">
          <button
            onClick={onExportTimeline}
            title="Export Video Timeline JSON"
            className="p-1.5 bg-[#1E293B] hover:bg-[#2A374D] border border-[#334155] rounded-md text-xs text-[#CBD5E1]"
          >
            <Layers className="w-3.5 h-3.5 text-emerald-400" />
          </button>
          <button
            onClick={onExportZip}
            title="Download Video Renders ZIP"
            className="p-1.5 bg-[#1E293B] hover:bg-[#2A374D] border border-[#334155] rounded-md text-xs text-[#CBD5E1]"
          >
            <Download className="w-3.5 h-3.5 text-cyan-400" />
          </button>
        </div>

        {/* Render Active Shot */}
        <button
          onClick={onRenderShot}
          disabled={isRendering || !currentShot?.currentVersionId}
          className="px-3.5 py-1.5 bg-[#C92A2A] hover:bg-[#A61E1E] disabled:bg-slate-700 text-white font-bold rounded-md text-xs transition-colors flex items-center space-x-1.5 shadow-md"
        >
          <Film className="w-3.5 h-3.5" />
          <span>{isRendering ? 'Rendering...' : 'Render Shot'}</span>
        </button>
      </div>
      {settingsOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={() => setSettingsOpen(false)}>
          <div className="bg-[#0F172A] border border-[#334155] rounded-lg w-full max-w-md p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">Settings (global)</h3>
              <button onClick={() => setSettingsOpen(false)} className="text-[#94A3B8] hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <label className="block text-xs text-[#94A3B8]">Editing software
              <input value={settings.editingSoftware} onChange={(e) => setSettings({ ...settings, editingSoftware: e.target.value })}
                className="mt-1 w-full bg-[#111827] border border-[#334155] rounded px-2 py-1.5 text-xs text-white" />
            </label>
            <label className="block text-xs text-[#94A3B8]">Output format
              <input value={settings.outputFormat} onChange={(e) => setSettings({ ...settings, outputFormat: e.target.value })}
                className="mt-1 w-full bg-[#111827] border border-[#334155] rounded px-2 py-1.5 text-xs text-white" />
            </label>
            <button onClick={saveSettings} className="w-full py-2 bg-[#C92A2A] hover:bg-[#A61E1E] text-white rounded text-xs font-bold">Save settings</button>
          </div>
        </div>
      )}
    </header>
  );
};
