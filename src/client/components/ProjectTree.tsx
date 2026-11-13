import React from 'react';
import { Project, Video, Shot } from '../../common/types.js';
import { Plus } from 'lucide-react';

interface ProjectTreeProps {
  project: Project | null;
  videos: Video[];
  selectedVideoId: string | null;
  onSelectVideo: (id: string) => void;
  shots: Shot[];
  selectedShotId: string | null;
  onSelectShot: (id: string) => void;
  onAddShot: () => void;
  onAddVideo: () => void;
}

export const ProjectTree: React.FC<ProjectTreeProps> = ({
  project,
  videos,
  selectedVideoId,
  onSelectVideo,
  shots,
  selectedShotId,
  onSelectShot,
  onAddShot,
  onAddVideo
}) => {
  const getStatusBadge = (status: Shot['status']) => {
    switch (status) {
      case 'rendered':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-900/60 text-purple-300 border border-purple-700/50">RENDERED</span>;
      case 'built':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-900/60 text-emerald-300 border border-emerald-700/50">BUILT</span>;
      case 'needs-review':
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-900/60 text-amber-300 border border-amber-700/50">REVIEW</span>;
      default:
        return <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700">DRAFT</span>;
    }
  };

  const getModeBadge = (mode: Shot['outputMode']) => {
    if (mode === 'overlay-alpha') return <span className="text-[10px] text-cyan-400 font-mono">ALPHA</span>;
    if (mode === 'chroma') return <span className="text-[10px] text-emerald-400 font-mono">CHROMA</span>;
    return <span className="text-[10px] text-slate-400 font-mono">FULL</span>;
  };

  return (
    <aside className="w-80 bg-[#0F172A] border-r border-[#243247] flex flex-col h-full select-none">
      {/* Project Header */}
      <div className="p-3 border-b border-[#243247] bg-[#161F30]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#94A3B8]">Active Project</span>
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-900/40 text-blue-300 font-semibold border border-blue-700/40">1080p · 30fps</span>
        </div>
        <div className="mt-1 font-bold text-base text-white truncate">
          {project?.name || 'No project'}
        </div>
      </div>

      {/* Video Selector */}
      <div className="p-2 border-b border-[#243247]">
        <div className="flex items-center justify-between px-1 mb-1.5">
          <span className="text-[11px] font-bold text-[#64748B] uppercase">Videos ({videos.length})</span>
          <button
            onClick={onAddVideo}
            title="Create New Video"
            className="text-xs text-blue-400 hover:text-blue-300 flex items-center space-x-1"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Video</span>
          </button>
        </div>
        <select
          value={selectedVideoId || ''}
          onChange={(e) => onSelectVideo(e.target.value)}
          className="w-full bg-[#1E293B] border border-[#334155] rounded-md px-2.5 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-blue-500 cursor-pointer"
        >
          {videos.map((v) => (
            <option key={v.id} value={v.id}>
              {v.title}
            </option>
          ))}
        </select>
      </div>

      {/* Shots List Header */}
      <div className="px-3 py-2 flex items-center justify-between border-b border-[#243247]/60">
        <span className="text-[11px] font-bold text-[#94A3B8] uppercase">Shots ({shots.length})</span>
        <button
          onClick={onAddShot}
          className="flex items-center space-x-1 px-2 py-1 rounded bg-[#C92A2A]/20 hover:bg-[#C92A2A]/30 text-[#F87171] hover:text-white border border-[#C92A2A]/40 text-xs font-semibold transition-colors"
        >
          <Plus className="w-3 h-3" />
          <span>New Shot</span>
        </button>
      </div>

      {/* Shots List */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {shots.length === 0 ? (
          <div className="p-4 text-center text-xs text-[#64748B]">
            No shots in this video. Click "+ New Shot" to begin.
          </div>
        ) : (
          shots.map((shot) => {
            const isSelected = shot.id === selectedShotId;
            return (
              <div
                key={shot.id}
                data-testid={`shot-${shot.shotNumber}`}
                onClick={() => onSelectShot(shot.id)}
                className={`p-2.5 rounded-lg border transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[#1E293B] border-blue-500 shadow-md ring-1 ring-blue-500/50'
                    : 'bg-[#111827]/70 hover:bg-[#1E293B]/60 border-[#243247]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center space-x-2">
                    <span className="font-extrabold text-xs text-white font-mono">
                      Shot {shot.shotNumber}
                    </span>
                    <span className="text-[11px] text-[#94A3B8] font-mono">
                      {shot.duration}s
                    </span>
                  </div>
                  <div className="flex items-center space-x-1.5">
                    {getModeBadge(shot.outputMode)}
                    {getStatusBadge(shot.status)}
                  </div>
                </div>

                <div className="text-xs text-[#CBD5E1] line-clamp-2 font-medium">
                  {shot.onScreenText || shot.animationPrompt || 'Untitled Shot'}
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};

