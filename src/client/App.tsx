import React, { useState, useEffect, useCallback } from 'react';
import { Project, Video, Shot, ShotVersion } from '../common/types.js';
import { TopBar } from './components/TopBar.js';
import { ProjectTree } from './components/ProjectTree.js';
import { PreviewCanvas } from './components/PreviewCanvas.js';
import { TabsPanel } from './components/TabsPanel.js';
import { BulkImportModal } from './components/BulkImportModal.js';
import { DiffModal } from './components/DiffModal.js';
import { RenderBar } from './components/RenderBar.js';

export const App: React.FC = () => {
  const [project, setProject] = useState<Project | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [versions, setVersions] = useState<ShotVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState<ShotVersion | null>(null);

  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');
  const [sessionStats, setSessionStats] = useState({ totalCalls: 0, totalTokens: 0, totalCostUsd: 0 });
  const [logs, setLogs] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [isRendering, setIsRendering] = useState<boolean>(false);
  const [currentRenderId, setCurrentRenderId] = useState<string | null>(null);
  const [renderFormat, setRenderFormat] = useState<'mov' | 'webm' | 'mp4-chroma' | 'mp4-full'>('mov');
  const [renderProgress, setRenderProgress] = useState<number>(0);
  const [renderProgressLabel, setRenderProgressLabel] = useState<string>('');
  const [renderOutputPath, setRenderOutputPath] = useState<string | null>(null);
  const [isTestingLlm, setIsTestingLlm] = useState<boolean>(false);
  const [refreshTrigger, setRefreshTrigger] = useState<number>(Date.now());
  const [availableModels, setAvailableModels] = useState<{ id: string; displayName: string }[]>([]);
  const [currentModel, setCurrentModel] = useState<string>('gemini-3.5-flash');
  const [quotaUsedModels, setQuotaUsedModels] = useState<string[]>([]);

  const [lastEditResult, setLastEditResult] = useState<{
    prevVersionId?: string;
    changedParams?: Record<string, { before: any; after: any }>;
    hasChanges?: boolean;
  } | null>(null);

  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [diffPair, setDiffPair] = useState<{ v1: ShotVersion; v2: ShotVersion } | null>(null);
  const [toast, setToast] = useState<{ type: 'info' | 'success' | 'error'; message: string } | null>(null);

  const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
    setToast({ type, message });
    setTimeout(() => {
      setToast((prev) => (prev?.message === message ? null : prev));
    }, 5000);
  }, []);

  const addLog = useCallback((line: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${line}`]);
  }, []);

  // A daily-quota 429 is terminal for the day: no retry, no repair, clearly surfaced.
  const markQuotaUsed = useCallback((model?: string) => {
    const label = (model || currentModel || 'the active model').replace(/^models\//, '');
    const message = `Daily free quota used up for ${label}. Resets in ~24h. Switch model or enable billing.`;
    showToast(message, 'error');
    addLog(`[Quota] ${message}`);
    setQuotaUsedModels((prev) => (prev.includes(label) ? prev : [...prev, label]));
  }, [addLog, currentModel, showToast]);

  // 1. Initial Load: Projects
  const loadProjects = useCallback(async () => {
    try {
      const res = await fetch('/api/projects');
      const data: Project[] = await res.json();
      if (data.length > 0) {
        setProject(data[0]);
        loadVideos(data[0].id);
      }
    } catch (e: any) {
      addLog(`Failed to load projects: ${e.message}`);
    }
  }, [addLog]);

  // 2. Load Videos
  const loadVideos = async (projectId: string) => {
    try {
      const res = await fetch(`/api/projects/${projectId}/videos`);
      const data: Video[] = await res.json();
      setVideos(data);
      if (data.length > 0) {
        setSelectedVideoId(data[0].id);
        loadShots(data[0].id);
      } else {
        setSelectedVideoId(null);
        setShots([]);
      }
    } catch (e: any) {
      addLog(`Failed to load videos: ${e.message}`);
    }
  };

  // 3. Load Shots
  const loadShots = async (videoId: string, targetShotId?: string) => {
    try {
      const res = await fetch(`/api/videos/${videoId}/shots`);
      const data: Shot[] = await res.json();
      setShots(data);
      if (data.length > 0) {
        const toSelect = targetShotId && data.some((s) => s.id === targetShotId) ? targetShotId : data[0].id;
        setSelectedShotId(toSelect);
        loadVersions(toSelect, data.find((s) => s.id === toSelect)?.currentVersionId);
      } else {
        setSelectedShotId(null);
        setVersions([]);
        setCurrentVersion(null);
      }
    } catch (e: any) {
      addLog(`Failed to load shots: ${e.message}`);
    }
  };

  // 4. Load Versions
  const loadVersions = async (shotId: string, preferredVersionId?: string) => {
    try {
      const res = await fetch(`/api/shots/${shotId}/versions`);
      const data: ShotVersion[] = await res.json();
      setVersions(data);
      if (data.length > 0) {
        setCurrentVersion(data.find((v) => v.id === preferredVersionId) || data[0]);
      } else {
        setCurrentVersion(null);
      }
      setRefreshTrigger(Date.now());
    } catch (e: any) {
      addLog(`Failed to load versions: ${e.message}`);
    }
  };

  // 5. Load Session Stats (honest metadata from DB)
  const loadStats = async () => {
    try {
      const res = await fetch('/api/session/stats');
      if (!res.ok) {
        const err = await res.json();
        addLog(`[Stats error] ${err.error || res.statusText}`);
        return;
      }
      const data = await res.json();
      setSessionStats(data);
    } catch (err: any) {
      addLog(`[Stats error] Failed to fetch session stats: ${err.message}`);
    }
  };

  const loadModels = useCallback(async () => {
    try {
      const res = await fetch('/api/system/list-models');
      if (!res.ok) return;
      const data = await res.json();
      const NON_TEXT = /image|tts|transcribe|embedding|lyria|nano-banana|computer-use|deep-research|robotics|omni|antigravity/i;
      const models: { id: string; displayName: string }[] = (data.models || [])
        .filter((m: any) => !NON_TEXT.test(m.id))
        .map((m: any) => ({ id: m.id, displayName: m.displayName || m.id }));
      const current = (data.activeModel || data.current || 'gemini-3.5-flash').replace(/^models\//, '');
      if (!models.some((m) => m.id === current)) {
        models.unshift({ id: current, displayName: current });
      }
      setAvailableModels(models);
      setCurrentModel(current);
      addLog(`ListModels returned ${models.length} text-capable models (active: ${current}).`);
    } catch (err: any) {
      addLog(`[Models] ListModels failed: ${err.message}`);
    }
  }, [addLog]);

  useEffect(() => {
    loadProjects();
    loadStats();
    loadModels();
  }, [loadProjects, loadModels]);

  const currentShot = shots.find((s) => s.id === selectedShotId) || null;

  // Handler: Test LLM Connection
  const handleTestConnection = async () => {
    setIsTestingLlm(true);
    addLog('Testing Gemini API connection...');
    try {
      const res = await fetch('/api/system/test-llm');
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Connection test failed');
      }
      showToast(`Gemini Connection OK: ${data.model} (${data.latency}ms, ${data.usage.totalTokens} tokens)`, 'success');
      addLog(`[LLM Doctor] Live call OK: model=${data.model}, latency=${data.latency}ms, promptTokens=${data.usage.promptTokens}, candidatesTokens=${data.usage.completionTokens}`);
    } catch (err: any) {
      showToast(`LLM Error: ${err.message}`, 'error');
      addLog(`[LLM Connection Failed] ${err.message}`);
    } finally {
      setIsTestingLlm(false);
    }
  };

  // Handler: Load Demo Shots
  const handleLoadDemoShots = async () => {
    if (!project) return;
    try {
      showToast('Loading 4 acceptance test shots...', 'info');
      const res = await fetch(`/api/projects/${project.id}/load-demo-shots`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load demo shots');
      showToast('Loaded 4 demo shots with clean state (ready to build).', 'success');
      addLog('Loaded 4 demo acceptance-test shots (empty versions, awaiting build).');
      await loadVideos(project.id);
    } catch (err: any) {
      showToast(`Error: ${err.message}`, 'error');
      addLog(`Error loading demo shots: ${err.message}`);
    }
  };

  // Handler: Generate Shot (Save-then-build)
  const handleGenerate = async (prompt: string, lockText: boolean, selection?: any) => {
    if (!currentShot) {
      showToast('Please select a shot from the left sidebar first', 'error');
      return;
    }
    setIsGenerating(true);
    showToast(`Synthesizing & linting Shot ${currentShot.shotNumber} (${selectedProvider})...`, 'info');
    addLog(`Initiating generation for Shot ${currentShot.shotNumber} (${selectedProvider})...`);

    try {
      const res = await fetch(`/api/shots/${currentShot.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          overrideProvider: selectedProvider,
          lockText,
          ...(selection || {})
        })
      });

      if (!res.ok) {
        const err = await res.json();
        if (err?.code === 'SERVER_1016') {
          markQuotaUsed(err.model);
          return;
        }
        throw new Error(err.error || 'Generation failed');
      }

      const data = await res.json();
      if (data.logs) {
        data.logs.forEach((l: string) => addLog(l));
      }

      if (data.shot) {
        setShots((prev) => prev.map((s) => (s.id === data.shot.id ? data.shot : s)));
      }

      showToast(`Shot ${currentShot.shotNumber} built! Version ${data.version.versionNumber} created.`, 'success');
      addLog(`Generation complete. Version ${data.version.versionNumber} created.`);

      if (selectedVideoId) {
        await loadShots(selectedVideoId, currentShot.id);
        await loadVersions(currentShot.id, data.shot?.currentVersionId);
      }
      loadStats();
    } catch (err: any) {
      showToast(`Build error: ${err.message}`, 'error');
      addLog(`Error during generation: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handler: Apply Edit Prompt
  const handleApplyEdit = async (instruction: string) => {
    if (!currentShot) {
      showToast('Please select a shot first', 'error');
      return;
    }
    setIsGenerating(true);
    showToast(`Applying edit prompt: "${instruction}"...`, 'info');
    addLog(`Applying edit prompt: "${instruction}"...`);

    try {
      const res = await fetch(`/api/shots/${currentShot.id}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          editInstruction: instruction,
          overrideProvider: selectedProvider
        })
      });

      if (!res.ok) {
        const err = await res.json();
        if (err?.code === 'SERVER_1016') {
          markQuotaUsed(err.model);
          return;
        }
        throw new Error(err.error || 'Edit failed');
      }

      const data = await res.json();
      if (data.logs) {
        data.logs.forEach((l: string) => addLog(l));
      }

      if (data.shot) {
        setShots((prev) => prev.map((s) => (s.id === data.shot.id ? data.shot : s)));
      }

      setLastEditResult({
        prevVersionId: data.prevVersionId,
        changedParams: data.changedParams,
        hasChanges: data.hasChanges
      });

      if (data.hasChanges) {
        showToast(`Edit applied! Version ${data.version.versionNumber} created.`, 'success');
      } else {
        showToast('Model returned no changes.', 'info');
      }
      addLog(`Edit completed. Version ${data.version.versionNumber} created.`);

      if (selectedVideoId) {
        await loadShots(selectedVideoId, currentShot.id);
        await loadVersions(currentShot.id, data.shot?.currentVersionId);
      }
      loadStats();
    } catch (err: any) {
      showToast(`Edit error: ${err.message}`, 'error');
      addLog(`Error applying edit: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handler: Repair Shot with AI
  const handleRepairShot = async (shotId: string) => {
    setIsGenerating(true);
    showToast('Attempting AI lint repair...', 'info');
    addLog(`Repairing Shot ${shotId}...`);
    try {
      const res = await fetch(`/api/shots/${shotId}/repair`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (data?.code === 'SERVER_1016') {
          markQuotaUsed(data.model);
          return;
        }
        throw new Error(data.error || 'Repair failed');
      }
      if (data.logs) data.logs.forEach((l: string) => addLog(l));
      if (data.shot) {
        setShots((prev) => prev.map((s) => (s.id === data.shot.id ? data.shot : s)));
      }
      if (selectedVideoId) {
        await loadShots(selectedVideoId, shotId);
        await loadVersions(shotId);
      }
      showToast(
        data.version.lintResult.ok ? 'Shot repaired successfully!' : 'Repair completed with warnings.',
        data.version.lintResult.ok ? 'success' : 'info'
      );
      addLog(`AI repair finished. Lint result: ${data.version.lintResult.ok ? 'PASSED' : 'NEEDS-REVIEW'}`);
      loadStats();
    } catch (err: any) {
      showToast(`Repair error: ${err.message}`, 'error');
      addLog(`Error repairing shot: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handler: Save Manual Params (Zero LLM calls)
  const handleSaveParams = async (params: Record<string, any>) => {
    if (!currentShot) return;
    setIsGenerating(true);
    addLog('Saving updated parameters...');

    try {
      const res = await fetch(`/api/shots/${currentShot.id}/manual-params`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ params })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Params update failed');
      }

      const ver: ShotVersion = await res.json();
      addLog(`Parameters saved. Version ${ver.versionNumber} created (Zero LLM call).`);

      if (selectedVideoId) {
        await loadShots(selectedVideoId, currentShot.id);
        await loadVersions(currentShot.id);
      }
    } catch (err: any) {
      showToast(`Error saving params: ${err.message}`, 'error');
      addLog(`Error saving params: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handler: Save Manual Code
  const handleSaveCode = async (compHtml: string) => {
    if (!currentShot) return;
    setIsGenerating(true);
    addLog('Saving manual Monaco code edits...');

    try {
      const res = await fetch(`/api/shots/${currentShot.id}/manual-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ compHtml })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Code save failed');
      }

      const ver: ShotVersion = await res.json();
      addLog(`Code saved & linted. Version ${ver.versionNumber} created.`);

      if (selectedVideoId) {
        await loadShots(selectedVideoId, currentShot.id);
        await loadVersions(currentShot.id);
      }
    } catch (err: any) {
      showToast(`Error saving code: ${err.message}`, 'error');
      addLog(`Error saving code: ${err.message}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // Handler: Restore Version (Undo)
  const handleRestoreVersion = async (versionId: string) => {
    if (!currentShot) return;
    addLog(`Restoring version ${versionId.substring(0, 8)}...`);

    try {
      const res = await fetch(`/api/shots/${currentShot.id}/restore-version`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ versionId })
      });

      if (!res.ok) throw new Error('Restore failed');

      showToast('Version restored successfully.', 'success');
      addLog('Version restored successfully.');
      setLastEditResult(null);

      if (selectedVideoId) {
        await loadShots(selectedVideoId, currentShot.id);
        await loadVersions(currentShot.id, versionId);
      }
    } catch (err: any) {
      showToast(`Restore error: ${err.message}`, 'error');
      addLog(`Error restoring version: ${err.message}`);
    }
  };

  // Handler: Render Shot (SSE progress, cancel, single render at a time)
  const handleRenderShot = async () => {
    if (!currentShot) return;
    setIsRendering(true);
    setRenderProgress(0);
    setRenderProgressLabel('starting');
    setRenderOutputPath(null);
    addLog(`Starting HyperFrames render for Shot ${currentShot.shotNumber} (${renderFormat})...`);

    try {
      const res = await fetch(`/api/shots/${currentShot.id}/render`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ renderFormat })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Render initiation failed');
      }

      const { renderId } = await res.json();
      setCurrentRenderId(renderId);
      addLog(`Render job started (ID: ${renderId.substring(0, 8)}). Streaming SSE progress...`);

      const evtSource = new EventSource(`/api/renders/${renderId}/events`);

      evtSource.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data);
          if (payload.type === 'progress') {
            const p = payload.progress;
            setRenderProgress(p.pct ?? 0);
            setRenderProgressLabel(`${p.code || ''}${p.done ? ` ${p.done}/${p.total}` : ''}`.trim());
          } else if (payload.type === 'status' && payload.lastProgress) {
            setRenderProgress(payload.lastProgress.pct ?? 0);
          } else if (payload.type === 'log') {
            addLog(payload.line.trim());
          } else if (payload.type === 'complete') {
            setRenderProgress(100);
            setRenderProgressLabel('complete');
            setRenderOutputPath(payload.outputFile);
            addLog(`Render complete! Output video ready at: ${payload.outputFile}`);
            showToast('Render completed!', 'success');
            setIsRendering(false);
            setCurrentRenderId(null);
            evtSource.close();
            if (selectedVideoId) loadShots(selectedVideoId, currentShot.id);
          } else if (payload.type === 'error') {
            addLog(`Render error: ${payload.error}`);
            showToast(`Render error: ${payload.error}`, 'error');
            setIsRendering(false);
            setCurrentRenderId(null);
            evtSource.close();
          }
        } catch (_) {}
      };

      evtSource.onerror = () => {
        evtSource.close();
        setIsRendering(false);
        setCurrentRenderId(null);
      };
    } catch (err: any) {
      showToast(`Render failed: ${err.message}`, 'error');
      addLog(`Render failed: ${err.message}`);
      setIsRendering(false);
      setCurrentRenderId(null);
    }
  };

  const handleCancelRender = async () => {
    if (!currentRenderId) return;
    addLog('Cancelling render...');
    try {
      await fetch(`/api/renders/${currentRenderId}/cancel`, { method: 'POST' });
    } catch (_) {}
    setIsRendering(false);
    setCurrentRenderId(null);
    setRenderProgress(0);
    setRenderProgressLabel('cancelled');
    showToast('Render cancelled.', 'info');
  };

  const handleOpenFolder = async (p: string) => {
    try {
      const res = await fetch('/api/system/open-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: p })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Could not open folder');
      addLog(`Opened file location: ${data.opened}`);
    } catch (err: any) {
      showToast(`Open folder failed: ${err.message}`, 'error');
    }
  };

  const handleModelChange = async (model: string) => {
    setCurrentModel(model.replace(/^models\//, ''));
    try {
      const res = await fetch('/api/system/set-model', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model })
      });
      const data = await res.json();
      addLog(`Active model set to ${model}. ${data.note || ''}`);
    } catch (err: any) {
      showToast(`Model change failed: ${err.message}`, 'error');
    }
  };

  const handleTestModel = async (model: string) => {
    setIsTestingLlm(true);
    addLog(`[Model Test] Sending live PONG to ${model}...`);
    try {
      const res = await fetch(`/api/system/test-llm?model=${encodeURIComponent(model)}`);
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Model test failed');
      const testedModel = String(data.model || model).replace(/^models\//, '');
      if (testedModel !== currentModel.replace(/^models\//, '')) {
        showToast(`Test OK, not active - Use this model (${testedModel} works, active is ${currentModel})`, 'info');
      } else {
        showToast(`${data.model} OK (${data.latency}ms): "${data.text}"`, 'success');
      }
      addLog(`[Model Test] ${data.model} responded "${data.text}" in ${data.latency}ms (tokens: ${data.usage.totalTokens}).`);
    } catch (err: any) {
      showToast(`Model test failed: ${err.message}`, 'error');
      addLog(`[Model Test] ${model} failed: ${err.message}`);
    } finally {
      setIsTestingLlm(false);
    }
  };

  const handleSimulate429 = async (mode: 'rate-limit' | 'quota' = 'rate-limit') => {
    addLog(`[Sim 429] Forcing a ${mode} 429 through the rate limiter...`);
    try {
      const res = await fetch('/api/system/simulate-429', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Simulation failed');
      (data.messages || []).forEach((m: string) => addLog(m));
      if (data.code === 'SERVER_1016' || mode === 'quota') {
        addLog(`[Sim 429] Provider calls=${data.calls}, retried=${Boolean(data.retried)}, repair calls=0.`);
        markQuotaUsed(data.model);
        return;
      }
      const first = data.messages?.[0] || '429 backoff completed';
      showToast(first, 'info');
      addLog(`[Sim 429] Recovered after ${data.calls} calls in ${data.elapsedMs}ms.`);
    } catch (err: any) {
      showToast(`429 simulation failed: ${err.message}`, 'error');
    }
  };

  // Handler: Add Video
  const handleAddVideo = async () => {
    if (!project) return;
    const title = window.prompt('Enter Video Title:', 'New Explainer Video');
    if (!title) return;

    const newVid = {
      id: `vid-${Date.now()}`,
      projectId: project.id,
      title,
      contextNotes: '',
      orderIndex: videos.length
    };

    try {
      const res = await fetch('/api/videos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newVid)
      });
      await res.json();
      loadVideos(project.id);
    } catch (err: any) {
      showToast(`Failed to create video: ${err.message}`, 'error');
      addLog(`Failed to create video: ${err.message}`);
    }
  };

  // Handler: Add Shot
  const handleAddShot = async () => {
    if (!selectedVideoId) return;
    const nextNum = `${shots.length + 1}.1`;

    const newShot = {
      videoId: selectedVideoId,
      shotNumber: nextNum,
      duration: 3,
      onScreenText: 'Enter your on-screen text here...',
      animationPrompt: `SHOT ${nextNum} | 3s | OUTPUT: overlay\nTEXT: Enter your on-screen text here...\nSTYLE: word-by-word kinetic text slam with shake`,
      outputMode: 'overlay-alpha'
    };

    try {
      const res = await fetch('/api/shots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newShot)
      });
      const created: Shot = await res.json();
      loadShots(selectedVideoId, created.id);
      addLog(`Created Shot ${created.shotNumber}`);
    } catch (err: any) {
      showToast(`Failed to create shot: ${err.message}`, 'error');
      addLog(`Failed to create shot: ${err.message}`);
    }
  };

  // Handler: Export Timeline JSON
  const handleExportTimeline = async () => {
    if (!selectedVideoId) return;
    window.open(`/api/videos/${selectedVideoId}/export/timeline`, '_blank');
  };

  // Handler: Export ZIP
  const handleExportZip = async () => {
    if (!selectedVideoId) return;
    window.location.href = `/api/videos/${selectedVideoId}/export/zip`;
  };

  return (
    <div
      className="flex flex-col h-dvh min-h-0 bg-[#0B0F19] text-[#F8FAFC] overflow-hidden"
      style={{ background: 'var(--bg-base)', color: 'var(--text-primary)' }}
    >
      {/* Top Bar */}
      <TopBar
        currentShot={currentShot}
        selectedProvider={selectedProvider}
        onProviderChange={setSelectedProvider}
        sessionStats={sessionStats}
        onRenderShot={handleRenderShot}
        onRenderVideo={() => addLog('Video batch rendering queued')}
        onOpenBulkImport={() => setIsBulkModalOpen(true)}
        onExportTimeline={handleExportTimeline}
        onExportZip={handleExportZip}
        onTestConnection={handleTestConnection}
        onLoadDemoShots={handleLoadDemoShots}
        isRendering={isRendering}
        isTestingLlm={isTestingLlm}
        availableModels={availableModels}
        currentModel={currentModel}
        onModelChange={handleModelChange}
        onTestModel={handleTestModel}
        onSimulate429={handleSimulate429}
        quotaUsedModels={quotaUsedModels}
      />

      <RenderBar
        format={renderFormat}
        onFormatChange={setRenderFormat}
        isRendering={isRendering}
        progress={renderProgress}
        progressLabel={renderProgressLabel}
        outputPath={renderOutputPath}
        onCancel={handleCancelRender}
        onOpenFolder={handleOpenFolder}
      />

      {/* Main 3-Column Workspace */}
      <div className="flex-1 flex overflow-hidden min-h-0 min-w-0">
        {/* Left Column: Project > Video > Shot Tree */}
        <ProjectTree
          project={project}
          videos={videos}
          selectedVideoId={selectedVideoId}
          onSelectVideo={(id) => {
            setSelectedVideoId(id);
            loadShots(id);
          }}
          shots={shots}
          selectedShotId={selectedShotId}
          onSelectShot={(id) => {
            setSelectedShotId(id);
            loadVersions(id);
          }}
          onAddShot={handleAddShot}
          onAddVideo={handleAddVideo}
        />

        {/* Center Column: Preview & Frame Scrubber */}
        <div className="flex-1 min-w-0 overflow-hidden flex flex-col h-full">
          <PreviewCanvas shot={currentShot} refreshTrigger={refreshTrigger} isGenerating={isGenerating} />
        </div>

        {/* Right Column: Multi-Tab Studio Panel */}
        <TabsPanel
          shot={currentShot}
          versions={versions}
          currentVersion={currentVersion}
          brandTokens={project?.brandTokens || null}
          project={project}
          video={videos.find((v) => v.id === selectedVideoId) || null}
          onShotUpdated={(s) => setShots((prev) => prev.map((x) => (x.id === s.id ? s : x)))}
          onProjectsChanged={() => window.location.reload()}
          onGenerate={handleGenerate}
          onApplyEdit={handleApplyEdit}
          onSaveParams={handleSaveParams}
          onSaveCode={handleSaveCode}
          onRestoreVersion={handleRestoreVersion}
          onShowDiff={(v1, v2) => setDiffPair({ v1, v2 })}
          onRepairShot={handleRepairShot}
          lastEditResult={lastEditResult}
          logs={logs}
          isGenerating={isGenerating}
        />
      </div>

      {/* Bulk Import Modal */}
      <BulkImportModal
        isOpen={isBulkModalOpen}
        projectId={project?.id}
        onClose={() => setIsBulkModalOpen(false)}
        onImportSuccess={() => {
          if (project) loadVideos(project.id);
          addLog('Bulk imported production sheet successfully.');
        }}
      />

      {/* Version Diff Modal */}
      <DiffModal
        isOpen={Boolean(diffPair)}
        onClose={() => setDiffPair(null)}
        v1={diffPair?.v1 || null}
        v2={diffPair?.v2 || null}
      />

      {/* Floating Status / Toast Notification */}
      {toast && (
        <div className="fixed top-14 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200">
          <div
            className={`px-4 py-2 rounded-lg shadow-2xl text-xs font-semibold flex items-center space-x-2 border backdrop-blur-md ${
              toast.type === 'error'
                ? 'bg-rose-950/90 border-rose-500 text-rose-200 shadow-rose-950/50'
                : toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-500 text-emerald-200 shadow-emerald-950/50'
                : 'bg-slate-900/90 border-blue-500 text-blue-200 shadow-blue-950/50'
            }`}
          >
            <span>{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
