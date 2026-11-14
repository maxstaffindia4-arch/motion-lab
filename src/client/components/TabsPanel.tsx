import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import {
  Sparkles,
  Sliders,
  Code2,
  History,
  FileText,
  Terminal,
  Lock,
  Unlock,
  Send,
  RotateCcw,
  GitCompare,
  AlertTriangle,
  Loader2,
  Wrench
} from 'lucide-react';
import { Shot, ShotVersion, ProjectBrandTokens, Project, Video } from '../../common/types.js';
import { ParamsForm } from './ParamsForm.js';
import { ContextTab, BuildSelection } from './ContextTab.js';
import { parseAnimationPrompt } from '../../common/prompt-parser.js';

interface TabsPanelProps {
  shot: Shot | null;
  versions: ShotVersion[];
  currentVersion: ShotVersion | null;
  brandTokens: ProjectBrandTokens | null;
  project: Project | null;
  video: Video | null;
  onShotUpdated: (shot: Shot) => void;
  onProjectsChanged: () => void;
  onGenerate: (prompt: string, lockText: boolean, selection?: BuildSelection) => void;
  onApplyEdit: (instruction: string) => void;
  onSaveParams: (params: Record<string, any>) => void;
  onSaveCode: (html: string) => void;
  onRestoreVersion: (versionId: string) => void;
  onShowDiff: (v1: ShotVersion, v2: ShotVersion) => void;
  onRepairShot?: (shotId: string) => void;
  lastEditResult?: {
    prevVersionId?: string;
    changedParams?: Record<string, { before: any; after: any }>;
    hasChanges?: boolean;
  } | null;
  logs: string[];
  isGenerating: boolean;
}

const tabButtonClass = (isActive: boolean) =>
  'flex items-center space-x-1 px-3.5 py-2.5 border-b-2 transition-colors ' +
  (isActive
    ? 'border-[#C92A2A] text-white bg-[#1E293B]'
    : 'border-transparent text-[#94A3B8] hover:text-white');

export const TabsPanel: React.FC<TabsPanelProps> = ({
  shot,
  versions,
  currentVersion,
  brandTokens: _brandTokens,
  project,
  video,
  onShotUpdated,
  onProjectsChanged,
  onGenerate,
  onApplyEdit,
  onSaveParams,
  onSaveCode,
  onRestoreVersion,
  onShowDiff,
  onRepairShot,
  lastEditResult,
  logs,
  isGenerating
}) => {
  const [activeTab, setActiveTab] = useState<'prompt' | 'context' | 'params' | 'code' | 'versions' | 'log'>('prompt');
  const [promptText, setPromptText] = useState(shot?.animationPrompt || '');
  const [editInstruction, setEditInstruction] = useState('');
  const [lockText, setLockText] = useState(true);
  const [codeContent, setCodeContent] = useState(currentVersion?.compHtml || '');
  const [paramValues, setParamValues] = useState<Record<string, any>>(currentVersion?.params || {});
  const [buildSelection, setBuildSelection] = useState<BuildSelection>({});
  const [modelChoice, setModelChoice] = useState(shot?.buildModel || '');
  const [fixingTiming, setFixingTiming] = useState(false);

  const timingIssue = (currentVersion?.params as any)?.__meta?.timing as
    | { message: string; fixedFadeOutAt: number; fixedDuration: number }
    | undefined;

  const fixTiming = async () => {
    if (!shot) return;
    setFixingTiming(true);
    try {
      const res = await fetch(`/api/shots/${shot.id}/fix-timing`, { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.shot) onShotUpdated(data.shot);
        onProjectsChanged();
      }
    } catch (_) {}
    setFixingTiming(false);
  };

  useEffect(() => {
    setModelChoice(shot?.buildModel || '');
  }, [shot?.id, shot?.buildModel]);

  const updateBuildModel = async (model: string) => {
    setModelChoice(model);
    if (!shot) return;
    try {
      const res = await fetch(`/api/shots/${shot.id}/build-model`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model })
      });
      if (res.ok) {
        const data = await res.json();
        onShotUpdated(data.shot);
      }
    } catch (_) {}
  };

  useEffect(() => {
    if (shot) {
      setPromptText(shot.animationPrompt || '');
    }
  }, [shot?.id, shot?.animationPrompt]);

  useEffect(() => {
    if (currentVersion) {
      setCodeContent(currentVersion.compHtml);
      setParamValues(currentVersion.params || {});
    }
  }, [currentVersion?.id, currentVersion?.compHtml, currentVersion?.params]);

  const parsed = parseAnimationPrompt(promptText);
  const fmtParam = (v: any) => (typeof v === 'string' ? `"${v}"` : JSON.stringify(v) ?? String(v));

  // Global keyboard shortcuts: Cmd+Enter (Build)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        if (promptText && !isGenerating && shot) {
          onGenerate(promptText, lockText, buildSelection);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [promptText, isGenerating, lockText, shot, onGenerate, buildSelection]);

  const lintErrors = (currentVersion?.lintResult?.findings || [])
    .filter((f) => f.level === 'error')
    .map((f) => f.message);
  const needsReview = shot?.status === 'needs-review' || lintErrors.length > 0;

  return (
    <aside
      className="bg-[#0F172A] border-l border-[#243247] flex flex-col h-full select-none shrink-0 min-w-0"
      style={{ width: 'clamp(320px, 26vw, 420px)' }}
    >
      {/* Tabs Header */}
      <div role="tablist" aria-label="Shot editor panels" className="flex border-b border-[#243247] bg-[#111827] text-xs font-semibold overflow-x-auto">
        <button
          role="tab"
          aria-selected={activeTab === 'prompt'}
          aria-controls="tab-panel-prompt"
          onClick={() => setActiveTab('prompt')}
          className={`${tabButtonClass(activeTab === 'prompt')} shrink-0`}
        >
          <Sparkles className="w-3.5 h-3.5 text-amber-400" />
          <span>Prompt</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'context'}
          aria-controls="tab-panel-context"
          onClick={() => setActiveTab('context')}
          className={`${tabButtonClass(activeTab === 'context')} shrink-0`}
        >
          <FileText className="w-3.5 h-3.5 text-blue-400" />
          <span>Context</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'params'}
          aria-controls="tab-panel-params"
          onClick={() => setActiveTab('params')}
          className={`${tabButtonClass(activeTab === 'params')} shrink-0`}
        >
          <Sliders className="w-3.5 h-3.5 text-emerald-400" />
          <span>Params</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'code'}
          aria-controls="tab-panel-code"
          onClick={() => setActiveTab('code')}
          className={`${tabButtonClass(activeTab === 'code')} shrink-0`}
        >
          <Code2 className="w-3.5 h-3.5 text-purple-400" />
          <span>Code</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'versions'}
          aria-controls="tab-panel-versions"
          onClick={() => setActiveTab('versions')}
          className={`${tabButtonClass(activeTab === 'versions')} shrink-0`}
        >
          <History className="w-3.5 h-3.5 text-cyan-400" />
          <span>Versions ({versions.length})</span>
        </button>

        <button
          role="tab"
          aria-selected={activeTab === 'log'}
          aria-controls="tab-panel-log"
          onClick={() => setActiveTab('log')}
          className={`${tabButtonClass(activeTab === 'log')} shrink-0`}
        >
          <Terminal className="w-3.5 h-3.5 text-slate-400" />
          <span>Log</span>
        </button>
      </div>

      {/* Tab Contents */}
      <div
        role="tabpanel"
        id={`tab-panel-${activeTab}`}
        tabIndex={0}
        className="flex-1 overflow-y-auto p-4 min-h-0"
      >
        {activeTab === 'prompt' && (
          <div className="space-y-4">
            {needsReview && (
              <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-600/50 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-1.5 text-amber-300 font-bold text-xs">
                    <AlertTriangle className="w-4 h-4 text-amber-400" />
                    <span>Lint Review Required ({lintErrors.length} issues)</span>
                  </div>
                  {onRepairShot && shot && (
                    <button
                      onClick={() => onRepairShot(shot.id)}
                      disabled={isGenerating}
                      className="flex items-center space-x-1 px-2.5 py-1 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white rounded text-xs font-semibold shadow-sm transition-colors"
                    >
                      <Wrench className="w-3 h-3" />
                      <span>Repair with AI</span>
                    </button>
                  )}
                </div>
                {lintErrors.length > 0 && (
                  <ul className="text-[11px] text-amber-200/90 list-disc list-inside space-y-0.5">
                    {lintErrors.map((err, i) => (
                      <li key={i} className="font-mono">
                        {err}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {/* Generation path + QA verdict for the current version */}
            {(() => {
              const meta = (currentVersion?.params as any)?.__meta;
              if (!meta) return null;
              return (
                <div
                  data-testid="generation-path"
                  className="flex items-center justify-between text-[11px] bg-[#111827] border border-[#243247] rounded-lg px-3 py-2"
                >
                  <span className={meta.path === 'template' ? 'text-emerald-300 font-bold' : 'text-purple-300 font-bold'}>
                    {meta.path === 'template' ? `TEMPLATE: ${meta.archetype}` : 'CUSTOM'}
                  </span>
                  <span className="text-[#64748B] font-mono">
                    {meta.qa
                      ? meta.qa.ok
                        ? 'QA PASS'
                        : `QA FAIL (${Math.round((meta.qa.worstOverlap || 0) * 100)}% overlap)`
                      : 'QA skipped'}
                  </span>
                </div>
              );
            })()}

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-bold text-[#CBD5E1]">Animation Prompt</label>
                <button
                  onClick={() => setLockText(!lockText)}
                  className={
                    'flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded border transition-colors ' +
                    (lockText
                      ? 'bg-emerald-950 border-emerald-600 text-emerald-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400')
                  }
                  title="Strictly enforce verbatim onScreenText"
                >
                  {lockText ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                  <span>Lock Text</span>
                </button>
              </div>

              <div className="flex items-center justify-between mb-2 text-[11px]">
                <span className="text-[#94A3B8]">Build model (per shot)</span>
                <select
                  value={modelChoice}
                  onChange={(e) => updateBuildModel(e.target.value)}
                  className="bg-[#111827] border border-[#334155] rounded px-2 py-1 text-[11px] text-white"
                >
                  <option value="">Global default</option>
                  <option value="models/gemini-3.1-flash-lite">Gemini 3.1 Flash Lite (cheap)</option>
                  <option value="models/gemini-3.5-flash">Gemini 3.5 Flash</option>
                  <option value="claude-sonnet-4-5">Claude Sonnet 4.5</option>
                </select>
              </div>

              <textarea
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="e.g. SHOT 1.1 | 4s | OUTPUT: overlay / TEXT: Overwhelmed by Admin / High Overhead / STYLE: strike-checklist pain points"
                rows={7}
                className="w-full bg-[#111827] border border-[#334155] rounded-lg p-3 text-xs text-white font-mono leading-relaxed focus:outline-none focus:border-blue-500 shadow-inner"
              />
            </div>

            {/* Parsed Structure Preview */}
            <div className="bg-[#111827] border border-[#243247] rounded-lg p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-[#64748B] tracking-wider">Parsed Properties</span>
                {parsed.isFreeForm && (
                  <span className="text-[10px] bg-purple-950/60 border border-purple-500/40 text-purple-300 px-1.5 py-0.5 rounded">
                    Free-form Prompt
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div>
                  <span className="text-[#94A3B8]">Target Duration:</span>{' '}
                  <strong data-testid="parsed-duration" className="text-white font-mono">
                    {`${parsed.duration || 4}s (${parsed.durationSource === 'from prompt' ? 'from prompt' : 'default'})`}
                  </strong>
                </div>
                <div>
                  <span className="text-[#94A3B8]">Output Mode:</span>{' '}
                  <strong className="text-cyan-400 font-mono">{parsed.outputMode}</strong>{' '}
                  <span className="text-[10px] text-[#64748B]">
                    {parsed.outputModeSource === 'from prompt' ? '(from prompt)' : '(default)'}
                  </span>
                </div>
              </div>

              {parsed.text ? (
                <div className="text-[11px] pt-1.5 border-t border-[#243247]">
                  <span className="text-[#94A3B8]">
                    {parsed.textSource === 'from prompt' ? 'Verbatim text (from prompt):' : 'Drafted text (editable):'}
                  </span>{' '}
                  <span className="text-emerald-300 font-semibold font-mono">"{parsed.text}"</span>
                </div>
              ) : (
                <div className="text-[11px] pt-1.5 border-t border-[#243247] text-[#94A3B8]">
                  <span>On-Screen Text:</span> <span className="italic text-[#64748B]">Will be drafted by AI</span>
                </div>
              )}

              {parsed.isFreeForm && lockText && parsed.textSource === 'drafted by LLM' && (
                <div className="text-[10px] text-amber-300 bg-amber-950/40 p-1.5 rounded border border-amber-600/40 flex items-center space-x-1">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                  <span>"Lock text" is ON without quotes. Put text in quotes to lock, or AI will draft freely.</span>
                </div>
              )}
            </div>

            {!shot && (
              <div className="p-2.5 rounded-lg bg-amber-950/40 border border-amber-600/40 text-amber-300 text-xs flex items-center space-x-2">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                <span>Select a shot from the left sidebar to generate or edit.</span>
              </div>
            )}

            {/* Build Button */}
            <button
              onClick={() => onGenerate(promptText, lockText, buildSelection)}
              disabled={isGenerating || !shot || !promptText.trim()}
              className="w-full py-2.5 bg-[#C92A2A] hover:bg-[#A61E1E] disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-bold rounded-lg text-xs transition-all shadow-[0_0_15px_rgba(201,42,42,0.4)] flex items-center justify-center space-x-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin text-white" />
                  <span>Generating & Linting (Save-Then-Build)...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 text-amber-300" />
                  <span>Build Shot (Ctrl+Enter)</span>
                </>
              )}
            </button>

            {/* Natural-Language Edit Instruction */}
            <div className="pt-4 border-t border-[#243247] space-y-2">
              <label className="text-xs font-bold text-[#CBD5E1]">Natural-Language Edit Prompt</label>
              <div className="flex space-x-2">
                <input
                  type="text"
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && editInstruction && !isGenerating && shot) {
                      onApplyEdit(editInstruction);
                      setEditInstruction('');
                    }
                  }}
                  placeholder='e.g. "make the text bigger and warmer"'
                  className="flex-1 bg-[#111827] border border-[#334155] rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => {
                    if (editInstruction && shot) {
                      onApplyEdit(editInstruction);
                      setEditInstruction('');
                    }
                  }}
                  disabled={isGenerating || !editInstruction.trim() || !shot}
                  className="px-3.5 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white font-bold rounded-lg text-xs transition-colors flex items-center justify-center"
                >
                  {isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>

              {lastEditResult && (
                <div data-testid="last-edit-result" className="bg-[#111827] border border-[#334155] rounded-lg p-3 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-white">Last Edit Result</span>
                    {lastEditResult.prevVersionId && (
                      <button
                        onClick={() => onRestoreVersion(lastEditResult.prevVersionId!)}
                        className="flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-900/50 hover:bg-amber-800/70 border border-amber-600 text-amber-200 text-[11px] font-semibold transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>Undo Edit</span>
                      </button>
                    )}
                  </div>
                  {lastEditResult.hasChanges ? (
                    <div>
                      <p className="text-[11px] text-emerald-400 font-medium">Changes applied:</p>
                      {lastEditResult.changedParams && Object.keys(lastEditResult.changedParams).length > 0 ? (
                        <div className="mt-1 space-y-1">
                          {Object.entries(lastEditResult.changedParams).map(([paramKey, diff]) => (
                            <div
                              key={paramKey}
                              data-testid="param-diff"
                              className="text-[10px] font-mono bg-slate-900 px-2 py-1 rounded border border-slate-800"
                            >
                              <span className="text-blue-300">{paramKey}</span>:{' '}
                              <span className="line-through text-red-400">{fmtParam(diff.before)}</span>
                              {' -> '}
                              <span className="text-emerald-300 font-bold">{fmtParam(diff.after)}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-[#94A3B8] italic">Composition markup modified directly.</p>
                      )}
                    </div>
                  ) : (
                    <p data-testid="edit-no-changes" className="text-[11px] text-amber-300 italic">
                      No changes made
                    </p>
                  )}
                </div>
              )}

              <p className="text-[10px] text-[#64748B]">
                Edits prefer modifying parameters; manual code edits in Monaco are preserved via diff instructions.
              </p>
            </div>
          </div>
        )}

        {activeTab === 'context' && (
          <ContextTab
            shot={shot}
            project={project}
            video={video}
            selection={buildSelection}
            onSelectionChange={setBuildSelection}
            onShotUpdated={onShotUpdated}
            onProjectsChanged={onProjectsChanged}
          />
        )}

        {activeTab === 'params' && (
          <div className="space-y-3">
            {timingIssue && (
              <div data-testid="timing-warning" className="p-3 rounded-lg bg-amber-950/40 border border-amber-600/50 space-y-2">
                <div className="flex items-start space-x-1.5 text-amber-300 text-[11px] font-semibold">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>{timingIssue.message}</span>
                </div>
                <button
                  onClick={fixTiming}
                  disabled={fixingTiming}
                  className="w-full py-1.5 bg-amber-600 hover:bg-amber-500 disabled:bg-slate-700 text-white rounded text-xs font-bold transition-colors"
                >
                  {fixingTiming
                    ? 'Fixing timing...'
                    : `Fix timing (fade at ${timingIssue.fixedFadeOutAt}s, duration ${timingIssue.fixedDuration}s)`}
                </button>
              </div>
            )}
            <ParamsForm
              schema={currentVersion?.paramsSchema || []}
              values={paramValues}
              onChange={(k, v) => setParamValues((prev) => ({ ...prev, [k]: v }))}
              onApply={() => onSaveParams(paramValues)}
              isSaving={isGenerating}
            />
          </div>
        )}

        {activeTab === 'code' && (
          <div className="h-full flex flex-col space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-[#94A3B8]">Monaco Editor (comp.html)</span>
              <button
                onClick={() => onSaveCode(codeContent)}
                disabled={isGenerating}
                className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-bold transition-colors"
              >
                Save Code (Creates Version)
              </button>
            </div>
            <div className="h-[480px] border border-[#243247] rounded-lg overflow-hidden">
              <Editor
                height="100%"
                defaultLanguage="html"
                theme="vs-dark"
                value={codeContent}
                onChange={(v) => setCodeContent(v || '')}
                options={{
                  minimap: { enabled: false },
                  fontSize: 12,
                  wordWrap: 'on'
                }}
              />
            </div>
          </div>
        )}

        {activeTab === 'versions' && (
          <div className="space-y-3">
            <span className="text-[11px] font-bold text-[#64748B] uppercase">Version History ({versions.length})</span>
            {versions.map((ver, idx) => {
              const isCurrent = ver.id === currentVersion?.id;
              const prevVer = versions[idx + 1];

              return (
                <div
                  key={ver.id}
                  className={
                    'p-3 rounded-lg border transition-all ' +
                    (isCurrent
                      ? 'bg-[#1E293B] border-blue-500 ring-1 ring-blue-500/50'
                      : 'bg-[#111827] border-[#243247]')
                  }
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center space-x-2">
                      <span className="font-extrabold text-xs text-white">v{ver.versionNumber}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded font-mono uppercase bg-slate-800 text-slate-300 border border-slate-700">
                        {ver.source}
                      </span>
                      {isCurrent && <span className="text-[10px] font-bold text-emerald-400">ACTIVE</span>}
                    </div>
                    <div className="flex items-center space-x-1.5">
                      {prevVer && (
                        <button
                          onClick={() => onShowDiff(prevVer, ver)}
                          title="Compare with previous version"
                          className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300"
                        >
                          <GitCompare className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {!isCurrent && (
                        <button
                          onClick={() => onRestoreVersion(ver.id)}
                          title="Restore this version"
                          className="flex items-center space-x-1 px-2 py-0.5 rounded bg-blue-900/40 hover:bg-blue-800/60 border border-blue-700 text-blue-200 text-[11px] font-semibold"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Undo to here</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <p className="text-xs text-[#CBD5E1] line-clamp-2 italic mb-1">
                    "{ver.producingPrompt || 'Generated composition'}"
                  </p>

                  <div className="flex items-center justify-between text-[10px] text-[#64748B]">
                    <span>{new Date(ver.createdAt).toLocaleTimeString()}</span>
                    <span>
                      {ver.provider} · {ver.model}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'log' && (
          <div className="h-full bg-[#070A11] border border-[#243247] rounded-lg p-3 font-mono text-[11px] text-[#CBD5E1] overflow-y-auto space-y-1">
            {logs.length === 0 ? (
              <span className="text-[#64748B]">No activity logged yet.</span>
            ) : (
              logs.map((line, i) => (
                <div key={i} className="leading-relaxed whitespace-pre-wrap">
                  {line}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </aside>
  );
};
