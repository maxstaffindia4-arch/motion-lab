import React from 'react';
import { Film, FolderOpen, X, Loader2, CheckCircle2 } from 'lucide-react';

export type RenderFormat = 'mov' | 'webm' | 'mp4-chroma' | 'mp4-full';

interface RenderBarProps {
  format: RenderFormat;
  onFormatChange: (f: RenderFormat) => void;
  isRendering: boolean;
  progress: number;
  progressLabel: string;
  outputPath: string | null;
  onCancel: () => void;
  onOpenFolder: (path: string) => void;
}

const FORMAT_LABELS: Record<RenderFormat, string> = {
  mov: 'ProRes 4444 MOV (alpha)',
  webm: 'WebM VP9 (alpha)',
  'mp4-chroma': 'MP4 on #00FF00 (chroma key)',
  'mp4-full': 'MP4 full (opaque)'
};

export const RenderBar: React.FC<RenderBarProps> = ({
  format,
  onFormatChange,
  isRendering,
  progress,
  progressLabel,
  outputPath,
  onCancel,
  onOpenFolder
}) => {
  return (
    <div
      data-testid="render-bar"
      className="h-11 bg-[#0F172A] border-b border-[#243247] px-4 flex items-center space-x-3 text-xs select-none"
    >
      <div className="flex items-center space-x-1.5 text-[#94A3B8]">
        <Film className="w-3.5 h-3.5 text-[#C92A2A]" />
        <span className="font-semibold text-white">Render</span>
      </div>

      <select
        data-testid="render-format"
        value={format}
        onChange={(e) => onFormatChange(e.target.value as RenderFormat)}
        disabled={isRendering}
        className="bg-[#1E293B] border border-[#334155] rounded px-2 py-1 text-[11px] text-white disabled:opacity-60"
      >
        {(Object.keys(FORMAT_LABELS) as RenderFormat[]).map((f) => (
          <option key={f} value={f}>
            {FORMAT_LABELS[f]}
          </option>
        ))}
      </select>

      {isRendering && (
        <>
          <div className="flex-1 h-2 bg-[#1E293B] rounded overflow-hidden border border-[#334155]">
            <div
              data-testid="render-progress-fill"
              className="h-full bg-[#C92A2A] transition-all duration-300"
              style={{ width: `${Math.max(2, Math.min(100, progress))}%` }}
            />
          </div>
          <span data-testid="render-progress-label" className="font-mono text-[#CBD5E1] w-40 truncate">
            {progress}% {progressLabel}
          </span>
          <button
            data-testid="render-cancel"
            onClick={onCancel}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-rose-950/70 hover:bg-rose-900 border border-rose-700 text-rose-200 font-semibold"
          >
            <X className="w-3 h-3" />
            <span>Cancel</span>
          </button>
        </>
      )}

      {!isRendering && outputPath && (
        <>
          <span data-testid="render-output-path" className="flex items-center space-x-1 font-mono text-emerald-300 truncate max-w-[46%]">
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span className="truncate">{outputPath}</span>
          </span>
          <button
            data-testid="render-open-folder"
            onClick={() => onOpenFolder(outputPath)}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-[#1E293B] hover:bg-[#2A374D] border border-[#334155] text-[#CBD5E1] font-semibold"
          >
            <FolderOpen className="w-3 h-3" />
            <span>Open folder</span>
          </button>
        </>
      )}

      {isRendering ? (
        <span className="flex items-center space-x-1 text-[#94A3B8]">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>one render at a time</span>
        </span>
      ) : (
        <span className="text-[10px] text-[#64748B]">Pick an output format, then use “Render Shot”.</span>
      )}
    </div>
  );
};
