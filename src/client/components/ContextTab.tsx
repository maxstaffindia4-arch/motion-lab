import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, FileText, Loader2, Upload, X, Eye, Trash2, Copy, Download } from 'lucide-react';
import { Shot, Project, Video, DocumentRecord } from '../../common/types.js';
import { resolveContext, BuildOptions, kitIsEmpty } from '../../common/context.js';
import { parseAnimationPrompt } from '../../common/prompt-parser.js';

export type BuildSelection = BuildOptions & {
  documentIds?: string[];
  documentModes?: Record<string, 'Full' | 'Summary' | 'Off'>;
};

interface ContextTabProps {
  shot: Shot | null;
  project: Project | null;
  video: Video | null;
  selection: BuildSelection;
  onSelectionChange: (s: BuildSelection) => void;
  onShotUpdated: (shot: Shot) => void;
  onProjectsChanged: () => void;
}

const badge = (label: string, color: string) => (
  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${color}`}>{label}</span>
);

function Row({ source, label, value, stale, included, onInclude, badgeColor, onClear }: {
  source: string; label: string; value: string; stale?: boolean; included: boolean;
  onInclude?: (v: boolean) => void; badgeColor: string; onClear?: () => void;
}) {
  return (
    <div className={`flex items-start gap-2 py-1.5 border-t border-[#1E293B] ${stale ? 'bg-amber-950/20' : ''}`}
      data-testid={`context-row-${label.toLowerCase().replace(/[^a-z]+/g, '-')}`}>
      {onInclude && (
        <input type="checkbox" checked={included} onChange={(e) => onInclude(e.target.checked)}
          title={`Include ${label} in build`} className="mt-0.5 accent-[#C92A2A]" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-[#94A3B8] font-semibold">{label}:</span>
          {badge(source, badgeColor)}
          {stale && badge('STALE', 'bg-amber-900/60 text-amber-300 border-amber-600/50')}
        </div>
        <div className="text-white break-words font-mono text-[10px] mt-0.5">{value}</div>
      </div>
      {stale && onClear && (
        <button onClick={onClear} className="text-[10px] text-amber-300 hover:text-amber-200 underline shrink-0">Clear</button>
      )}
    </div>
  );
}

export const ContextTab: React.FC<ContextTabProps> = ({
  shot, project, video, selection, onSelectionChange, onShotUpdated, onProjectsChanged
}) => {
  const [docs, setDocs] = useState<DocumentRecord[]>([]);
  const [scope, setScope] = useState<'PROJECT' | 'VIDEO' | 'SHOT'>('PROJECT');
  const [role, setRole] = useState<'REFERENCE' | 'ASSET'>('REFERENCE');
  const [mode, setMode] = useState<'Full' | 'Summary' | 'Off'>('Summary');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalPrompt, setFinalPrompt] = useState<any>(null);
  const [promptBusy, setPromptBusy] = useState(false);
  const [dragging, setDragging] = useState(false);

  const projectId = project?.id || '';
  const promptOnly = Boolean(selection.promptOnly);
  const resolved = resolveContext({
    prompt: shot?.animationPrompt || '',
    parsed: parseAnimationPrompt(shot?.animationPrompt || ''),
    shot, video, project,
    options: selection
  });
  const kitEmpty = kitIsEmpty(project?.brandTokens);

  const loadDocs = async () => {
    if (!projectId) return;
    try {
      const res = await fetch(`/api/documents?projectId=${encodeURIComponent(projectId)}`);
      if (res.ok) setDocs(await res.json());
    } catch (_) {}
  };
  useEffect(() => { loadDocs(); }, [projectId, shot?.id]);

  const selectedIds = selection.documentIds;
  const docIncluded = (id: string) => selectedIds === undefined || selectedIds.includes(id);
  const setDocIncluded = (id: string, on: boolean) => {
    const base = selectedIds === undefined ? docs.map((d) => d.id) : [...selectedIds];
    onSelectionChange({ ...selection, documentIds: on ? [...base, id] : base.filter((x) => x !== id) });
  };

  const upload = async (files: FileList | File[]) => {
    if (!projectId || !files.length) return;
    setError(null);
    setBusy(true);
    try {
      for (const file of Array.from(files)) {
        const dataBase64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
          reader.onerror = () => reject(new Error('Could not read file'));
          reader.readAsDataURL(file);
        });
        const res = await fetch('/api/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId,
            videoId: scope === 'VIDEO' ? video?.id : scope === 'SHOT' ? video?.id : null,
            shotId: scope === 'SHOT' ? shot?.id : null,
            name: file.name,
            scope,
            role,
            mode,
            dataBase64
          })
        });
        if (!res.ok) throw new Error((await res.json()).error || 'Upload failed');
      }
      await loadDocs();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const patchDoc = async (id: string, patch: any) => {
    const res = await fetch(`/api/documents/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch)
    });
    if (res.ok) { await loadDocs(); } else setError((await res.json()).error || 'Update failed');
  };

  const removeDoc = async (id: string) => {
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    await loadDocs();
  };

  const showFinalPrompt = async () => {
    if (!shot) return;
    setPromptBusy(true);
    try {
      const res = await fetch(`/api/shots/${shot.id}/final-prompt`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: shot.animationPrompt, options: selection, documentIds: selection.documentIds, documentModes: selection.documentModes })
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Failed');
      setFinalPrompt(await res.json());
    } catch (e: any) { setError(e.message); } finally { setPromptBusy(false); }
  };

  const clearStaleText = async () => {
    if (!shot) return;
    const res = await fetch(`/api/shots/${shot.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ onScreenText: '', textSource: '' })
    });
    if (res.ok) onShotUpdated(await res.json());
  };

  const saveKit = async (kit: any) => {
    if (!project) return;
    const res = await fetch(`/api/projects/${project.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ brandTokens: kit })
    });
    if (res.ok) onProjectsChanged();
  };

  const importKit = async (file: File) => {
    try { await saveKit(JSON.parse(await file.text())); } catch (e: any) { setError(`Invalid kit JSON: ${e.message}`); }
  };

  const duplicateProject = async () => {
    if (!project) return;
    const res = await fetch(`/api/projects/${project.id}/duplicate`, { method: 'POST' });
    if (res.ok) onProjectsChanged(); else setError('Duplicate failed');
  };

  const scopeDocs = docs.filter((d) => d.scope === scope);
  const tokenTotal = docs.filter((d) => docIncluded(d.id) && (selection.documentModes?.[d.id] || d.mode) !== 'Off')
    .reduce((acc, d) => acc + (d.tokenEstimate || 0), 0);

  return (
    <div className="space-y-3 text-xs">
      {/* Prompt-only + final prompt */}
      <div className="bg-[#111827] border border-[#243247] rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 font-bold text-white">
            <input type="checkbox" checked={promptOnly} onChange={(e) => onSelectionChange({ ...selection, promptOnly: e.target.checked })}
              data-testid="prompt-only-toggle" className="accent-[#C92A2A]" />
            Prompt only
          </label>
          <button onClick={showFinalPrompt} disabled={promptBusy || !shot}
            className="flex items-center gap-1 px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-[10px] font-bold">
            {promptBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Eye className="w-3 h-3" />} View final LLM prompt
          </button>
        </div>
        <p className="text-[10px] text-[#64748B]">Priority: PROMPT &gt; shot &gt; video &gt; brand kit. Prompt only ignores all stored context and documents.</p>
      </div>

      {/* Resolved context */}
      <div className="bg-[#111827] border border-[#243247] rounded-lg p-3">
        <h4 className="font-bold text-white uppercase text-[11px] tracking-wide border-b border-[#243247] pb-1 mb-1">Resolved Context</h4>
        <Row source={resolved.textSource} label="On-Screen Text" badgeColor="bg-emerald-900/60 text-emerald-300 border-emerald-600/50"
          value={resolved.promptText ? `"${resolved.promptText}"` : shot?.textSource === 'drafted' && shot?.onScreenText ? `"${shot.onScreenText}"` : 'Will be drafted by AI'}
          stale={resolved.stale.text} onClear={clearStaleText} included />
        <Row source={resolved.durationSource} label="Duration" badgeColor="bg-blue-900/60 text-blue-300 border-blue-600/50"
          value={`${resolved.duration}s`} stale={resolved.stale.duration} included />
        <Row source={resolved.outputModeSource} label="Output Mode" badgeColor="bg-cyan-900/60 text-cyan-300 border-cyan-600/50"
          value={resolved.outputMode} stale={resolved.stale.outputMode} included />
        <Row source="SHOT" label="Shot Context" badgeColor="bg-slate-800 text-slate-300 border-slate-600"
          value={promptOnly ? 'ignored (Prompt only)' : resolved.shotContext || 'None'}
          included={!promptOnly && selection.includeShot !== false}
          onInclude={(v) => onSelectionChange({ ...selection, includeShot: v })} />
        <Row source="VIDEO" label="Video Notes" badgeColor="bg-purple-900/60 text-purple-300 border-purple-600/50"
          value={promptOnly ? 'ignored (Prompt only)' : resolved.videoNotes || 'None'}
          included={!promptOnly && selection.includeVideo !== false}
          onInclude={(v) => onSelectionChange({ ...selection, includeVideo: v })} />
        <Row source="BRAND KIT" label="Brand Kit" badgeColor="bg-amber-900/60 text-amber-300 border-amber-600/50"
          value={kitEmpty ? 'Empty kit (project-specific)' : promptOnly ? 'ignored (Prompt only)' : `${project?.brandTokens?.brandName || 'Kit'} · ${Object.keys(project?.brandTokens?.colors || {}).length} colors`}
          included={!promptOnly && selection.includeBrandKit !== false && resolved.kitApplied}
          onInclude={(v) => onSelectionChange({ ...selection, includeBrandKit: v, applyKit: v })} />
      </div>

      {/* Brand kit */}
      <div className="bg-[#111827] border border-[#243247] rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between border-b border-[#243247] pb-1">
          <h4 className="font-bold text-white uppercase text-[11px] tracking-wide">Brand Kit (this project only)</h4>
          <span className="text-[9px] text-[#64748B]">{kitEmpty ? 'EMPTY' : 'OPTIONAL'}</span>
        </div>
        {kitEmpty ? (
          <p className="text-[10px] text-[#64748B]">No brand kit. Builds use engine rules + prompt only.</p>
        ) : (
          <div className="space-y-1 text-[10px] text-[#94A3B8]">
            <div>Colors: <span className="font-mono text-white">{Object.entries(project?.brandTokens?.colors || {}).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}</span></div>
            <div>Fonts: <span className="font-mono text-white">{project?.brandTokens?.typography?.displayFont || 'none'} / {project?.brandTokens?.typography?.bodyFont || 'none'}</span></div>
            {project?.brandTokens?.tone && <div>Tone: <span className="text-white">{project.brandTokens.tone}</span></div>}
          </div>
        )}
        <label className="flex items-center gap-2 text-[10px] text-[#CBD5E1]">
          <input type="checkbox" checked={selection.applyKit !== false && !kitEmpty} disabled={kitEmpty}
            onChange={(e) => onSelectionChange({ ...selection, applyKit: e.target.checked, includeBrandKit: e.target.checked })}
            data-testid="apply-kit-toggle" className="accent-[#C92A2A]" />
          Apply kit to this shot
        </label>
        <div className="flex gap-1.5 flex-wrap">
          <button onClick={() => {
            const blob = new Blob([JSON.stringify(project?.brandTokens || {}, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `${project?.id || 'project'}-brand-kit.json`;
            a.click();
          }} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-[10px]">
            <Download className="w-3 h-3" /> Export kit
          </button>
          <label className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-[10px] cursor-pointer">
            <Upload className="w-3 h-3" /> Import kit
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importKit(e.target.files[0])} />
          </label>
          <button onClick={duplicateProject} className="flex items-center gap-1 px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-white text-[10px]">
            <Copy className="w-3 h-3" /> Duplicate project
          </button>
        </div>
      </div>

      {/* Documents */}
      <div className="bg-[#111827] border border-[#243247] rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between border-b border-[#243247] pb-1">
          <h4 className="font-bold text-white uppercase text-[11px] tracking-wide">Context Documents</h4>
          <span className="text-[10px] text-[#94A3B8]">~{tokenTotal.toLocaleString()} tokens</span>
        </div>
        <div className="flex gap-1">
          {(['PROJECT', 'VIDEO', 'SHOT'] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)}
              className={`px-2 py-1 rounded text-[10px] font-bold ${scope === s ? 'bg-[#C92A2A] text-white' : 'bg-slate-800 text-[#94A3B8]'}`}>
              {s}
            </button>
          ))}
        </div>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); upload(e.dataTransfer.files); }}
          className={`border border-dashed rounded p-3 text-center ${dragging ? 'border-blue-400 bg-blue-950/20' : 'border-[#334155]'}`}>
          <Upload className="w-4 h-4 mx-auto text-[#64748B]" />
          <p className="text-[10px] text-[#94A3B8] mt-1">Drag & drop png/jpg/webp/svg/pdf/docx/txt/md/csv/json/woff/woff2/ttf/otf</p>
          <input data-testid="doc-upload" type="file" multiple className="hidden" id="doc-upload"
            onChange={(e) => e.target.files && upload(e.target.files)} />
          <label htmlFor="doc-upload" className="inline-block mt-1 px-2 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-[10px] font-bold cursor-pointer">Choose files</label>
          {busy && <div className="text-[10px] text-blue-300 mt-1 flex items-center justify-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Uploading…</div>}
        </div>

        <div className="flex gap-1.5">
          <select value={role} onChange={(e) => setRole(e.target.value as any)} className="bg-[#0F172A] border border-[#334155] rounded px-1 py-1 text-[10px] text-white">
            <option value="REFERENCE">REFERENCE</option>
            <option value="ASSET">ASSET</option>
          </select>
          <select value={mode} onChange={(e) => setMode(e.target.value as any)} className="bg-[#0F172A] border border-[#334155] rounded px-1 py-1 text-[10px] text-white">
            <option value="Full">Full</option>
            <option value="Summary">Summary</option>
            <option value="Off">Off</option>
          </select>
        </div>
        <p className="text-[9px] text-amber-300/80 flex items-start gap-1">
          <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
          Free-tier key warning: uploaded content may be used by the provider. Do not upload confidential material.
        </p>
        {error && <div className="text-[10px] text-red-400">{error}</div>}

        <div className="space-y-1.5">
          {scopeDocs.length === 0 && <p className="text-[10px] text-[#64748B]">No {scope} documents yet.</p>}
          {scopeDocs.map((d) => (
            <div key={d.id} className="border border-[#243247] rounded p-1.5 space-y-1" data-testid={`doc-${d.name}`}>
              <div className="flex items-center gap-1.5">
                <input type="checkbox" checked={docIncluded(d.id)} onChange={(e) => setDocIncluded(d.id, e.target.checked)}
                  title="Include in build" className="accent-[#C92A2A]" />
                <FileText className="w-3 h-3 text-[#64748B] shrink-0" />
                <span className="text-[10px] text-white truncate flex-1">{d.name}</span>
                {badge(d.role, d.role === 'ASSET' ? 'bg-cyan-900/60 text-cyan-300 border-cyan-600/50' : 'bg-slate-800 text-slate-300 border-slate-600')}
                <span className="text-[9px] text-[#64748B]">{Math.round((d.size || 0) / 1024)}KB · ~{d.tokenEstimate || 0}t</span>
                <button onClick={() => removeDoc(d.id)} className="text-red-400 hover:text-red-300"><Trash2 className="w-3 h-3" /></button>
              </div>
              <div className="flex items-center gap-1.5 pl-5">
                <select value={d.role} onChange={(e) => patchDoc(d.id, { role: e.target.value })}
                  className="bg-[#0F172A] border border-[#334155] rounded px-1 py-0.5 text-[9px] text-white">
                  <option value="REFERENCE">REFERENCE</option><option value="ASSET">ASSET</option>
                </select>
                <select value={selection.documentModes?.[d.id] || d.mode} onChange={(e) => {
                  const m = e.target.value as 'Full' | 'Summary' | 'Off';
                  onSelectionChange({ ...selection, documentModes: { ...(selection.documentModes || {}), [d.id]: m } });
                }} className="bg-[#0F172A] border border-[#334155] rounded px-1 py-0.5 text-[9px] text-white">
                  <option value="Full">Full</option><option value="Summary">Summary</option><option value="Off">Off</option>
                </select>
                {d.summary && <span className="text-[9px] text-[#64748B] truncate" title={d.summary}>{d.summary.slice(0, 40)}…</span>}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Final prompt modal */}
      {finalPrompt && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-6" onClick={() => setFinalPrompt(null)}>
          <div className="bg-[#0F172A] border border-[#334155] rounded-lg w-full max-w-4xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-3 border-b border-[#243247]">
              <h3 className="text-sm font-bold text-white">Final LLM Prompt (no API keys)</h3>
              <button onClick={() => setFinalPrompt(null)} className="text-[#94A3B8] hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-3 text-[10px] text-[#94A3B8] border-b border-[#243247]">
              kitApplied={String(finalPrompt.kitApplied)} · textSource={finalPrompt.textSource} · docs={finalPrompt.documents?.length || 0} · attachments={finalPrompt.attachments?.length || 0} · ~{finalPrompt.totalTokens || 0} tokens
            </div>
            <div className="overflow-auto p-3 space-y-3">
              <div>
                <div className="text-[10px] font-bold text-blue-300 mb-1">SYSTEM</div>
                <pre className="whitespace-pre-wrap text-[10px] text-[#CBD5E1] bg-[#111827] p-2 rounded">{finalPrompt.systemPrompt}</pre>
              </div>
              <div>
                <div className="text-[10px] font-bold text-emerald-300 mb-1">USER</div>
                <pre className="whitespace-pre-wrap text-[10px] text-[#CBD5E1] bg-[#111827] p-2 rounded">{finalPrompt.userPrompt}</pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
