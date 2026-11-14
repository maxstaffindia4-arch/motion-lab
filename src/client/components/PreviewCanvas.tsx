import React, { useState, useEffect, useRef } from 'react';
import { Play, Pause, RotateCcw, Smartphone, Shield, Loader2 } from 'lucide-react';
import { Shot } from '../../common/types.js';

interface PreviewCanvasProps {
  shot: Shot | null;
  refreshTrigger: number;
  isGenerating?: boolean;
}

export const PreviewCanvas: React.FC<PreviewCanvasProps> = ({ shot, refreshTrigger, isGenerating }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [showSafeMargins, setShowSafeMargins] = useState(true);
  const [showMobileCrop, setShowMobileCrop] = useState(false);
  const [scale, setScale] = useState(0.5);
  const [bgMode, setBgMode] = useState<'checker' | 'dark' | 'light' | 'green'>('checker');

  const containerRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number>(0);

  const duration = shot?.duration || 4;
  const fps = 30;
  const totalFrames = Math.round(duration * fps);
  const currentFrame = Math.min(totalFrames, Math.round(currentTime * fps));

  // Compute scale based on container width to keep 1920x1080 pixel-accurate
  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const width = containerRef.current.clientWidth;
        if (width > 0) {
          setScale(width / 1920);
        }
      }
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    if (containerRef.current) observer.observe(containerRef.current);
    window.addEventListener('resize', updateScale);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', updateScale);
    };
  }, []);

  // When shot or version changes, seek to preview frame (0.8s or 30% mark)
  useEffect(() => {
    setIsPlaying(false);
    const initialPreviewTime = Math.min(0.8, duration * 0.4);
    setCurrentTime(initialPreviewTime);
    const timer = setTimeout(() => {
      seekTime(initialPreviewTime);
    }, 250);

    return () => clearTimeout(timer);
  }, [shot?.id, shot?.currentVersionId, refreshTrigger, duration]);

  const seekTime = (t: number) => {
    const clamped = Math.max(0, Math.min(duration, t));
    setCurrentTime(clamped);
    if (iframeRef.current && iframeRef.current.contentWindow) {
      iframeRef.current.contentWindow.postMessage({ type: 'SEEK', time: clamped }, '*');
    }
  };

  const togglePlay = () => {
    if (isPlaying) {
      setIsPlaying(false);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'PAUSE' }, '*');
      }
    } else {
      if (currentTime >= duration) {
        seekTime(0);
      }
      setIsPlaying(true);
      lastTimeRef.current = performance.now();
      if (iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'PLAY' }, '*');
      }
    }
  };

  // Playback loop
  useEffect(() => {
    if (!isPlaying) return;

    const tick = (now: number) => {
      const deltaSec = (now - lastTimeRef.current) / 1000;
      lastTimeRef.current = now;

      setCurrentTime((prev) => {
        const next = prev + deltaSec;
        if (next >= duration) {
          setIsPlaying(false);
          seekTime(duration);
          return duration;
        }
        return next;
      });

      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, duration]);

  const formatTime = (t: number) => {
    const s = Math.floor(t);
    const ms = Math.floor((t - s) * 100);
    return `${String(s).padStart(2, '0')}.${String(ms).padStart(2, '0')}s`;
  };

  const handleIframeLoaded = () => {
    seekTime(currentTime);
  };

  return (
    <div className="flex-1 bg-[#090D16] flex flex-col h-full overflow-hidden select-none">
      {/* Top Controls Toolbar */}
      <div className="min-h-10 bg-[#111827] border-b border-[#243247] px-4 py-1.5 flex flex-wrap items-center justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-bold text-white flex items-center space-x-1.5 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-400"></span>
            <span>Viewport: 1920×1080 (16:9)</span>
          </span>
          <span className="text-[#64748B]">·</span>
          <span className="text-[#94A3B8] font-mono shrink-0">
            Mode: <strong className="text-cyan-400 uppercase">{shot?.outputMode || 'overlay-alpha'}</strong>
          </span>
          {shot && (
            <>
              <span className="text-[#64748B]">·</span>
              <span className="text-slate-400 font-mono text-[11px] truncate max-w-[200px]" title={`Shot ${shot.shotNumber} (${shot.duration}s)`}>
                Shot {shot.shotNumber} ({shot.duration}s)
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Background Toggle (Checkerboard | Dark | Light | Green) */}
          <div className="flex items-center bg-[#1E293B] border border-[#334155] rounded p-0.5 text-[10px]">
            <button
              onClick={() => setBgMode('checker')}
              title="Checkerboard (Transparent Alpha)"
              className={`px-1.5 py-0.5 rounded transition-colors ${bgMode === 'checker' ? 'bg-[#334155] text-white font-bold' : 'text-[#94A3B8] hover:text-white'}`}
            >
              Checker
            </button>
            <button
              onClick={() => setBgMode('dark')}
              title="Dark Background"
              className={`px-1.5 py-0.5 rounded transition-colors ${bgMode === 'dark' ? 'bg-[#334155] text-white font-bold' : 'text-[#94A3B8] hover:text-white'}`}
            >
              Dark
            </button>
            <button
              onClick={() => setBgMode('light')}
              title="Light Background"
              className={`px-1.5 py-0.5 rounded transition-colors ${bgMode === 'light' ? 'bg-[#334155] text-white font-bold' : 'text-[#94A3B8] hover:text-white'}`}
            >
              Light
            </button>
            <button
              onClick={() => setBgMode('green')}
              title="Chroma Green"
              className={`px-1.5 py-0.5 rounded transition-colors ${bgMode === 'green' ? 'bg-[#334155] text-white font-bold' : 'text-[#94A3B8] hover:text-white'}`}
            >
              Green
            </button>
          </div>

          {/* Safe Margins Toggle */}
          <button
            onClick={() => setShowSafeMargins(!showSafeMargins)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded border transition-colors ${
              showSafeMargins
                ? 'bg-blue-600/20 border-blue-500 text-blue-300 font-semibold'
                : 'bg-[#1E293B] border-[#334155] text-[#94A3B8]'
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Safe Margins (5%)</span>
          </button>

          {/* 9:16 Mobile Crop Toggle */}
          <button
            onClick={() => setShowMobileCrop(!showMobileCrop)}
            className={`flex items-center space-x-1 px-2.5 py-1 rounded border transition-colors ${
              showMobileCrop
                ? 'bg-purple-600/20 border-purple-500 text-purple-300 font-semibold'
                : 'bg-[#1E293B] border-[#334155] text-[#94A3B8]'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span>9:16 Crop</span>
          </button>
        </div>
      </div>

      {/* Main Video Canvas Area */}
      <div className="flex-1 flex items-center justify-center p-6 relative overflow-hidden bg-[#070A11]">
        {/* Aspect Ratio Box (16:9 container) */}
        <div
          ref={containerRef}
          className="relative shadow-2xl border border-[#243247] rounded-lg overflow-hidden"
          style={{
            width: '100%',
            maxWidth: '1060px',
            aspectRatio: '16 / 9',
            backgroundColor: bgMode === 'dark' ? '#070A11' : bgMode === 'light' ? '#FFFFFF' : bgMode === 'green' ? '#00FF00' : '#0B0F19',
            backgroundImage: bgMode === 'checker' ? 'linear-gradient(45deg, #161F30 25%, transparent 25%), linear-gradient(-45deg, #161F30 25%, transparent 25%), linear-gradient(45deg, transparent 75%, #161F30 75%), linear-gradient(-45deg, transparent 75%, #161F30 75%)' : undefined,
            backgroundSize: bgMode === 'checker' ? '32px 32px' : undefined,
            backgroundPosition: bgMode === 'checker' ? '0 0, 0 16px, 16px -16px, -16px 0px' : undefined
          }}
        >
          {shot ? (
            <div className="w-full h-full relative overflow-hidden">
              {/* Scaled 1920x1080 Iframe */}
              <iframe
                ref={iframeRef}
                key={`${shot.id}-${shot.currentVersionId}-${refreshTrigger}-${bgMode}`}
                src={`/preview-frame/${shot.id}?t=${refreshTrigger}&bg=${bgMode}`}
                onLoad={handleIframeLoaded}
                sandbox="allow-scripts"
                className="border-0 pointer-events-auto"
                style={{
                  width: '1920px',
                  height: '1080px',
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  position: 'absolute',
                  top: 0,
                  left: 0
                }}
                title="HyperFrames Sandbox Preview"
              />
            </div>
          ) : (
            <div className="w-full h-full flex flex-col items-center justify-center text-[#64748B] space-y-2">
              <p className="text-sm">Select or create a shot from the left sidebar to preview</p>
            </div>
          )}

          {/* Active Generation Loading Overlay */}
          {isGenerating && (
            <div className="absolute inset-0 bg-black/85 backdrop-blur-sm z-30 flex flex-col items-center justify-center space-y-3">
              <Loader2 className="w-10 h-10 text-[#C92A2A] animate-spin" />
              <div className="text-center">
                <p className="text-white font-bold text-sm">Generating Composition via Gemini...</p>
                <p className="text-[#94A3B8] text-xs font-mono mt-1">Calling model & executing HyperFrames lint verification</p>
              </div>
            </div>
          )}

          {/* Safe Margins Overlay */}
          {showSafeMargins && (
            <div className="absolute inset-0 pointer-events-none z-10">
              {/* Action safe 90% */}
              <div className="absolute inset-[5%] border border-cyan-500/40 border-dashed rounded-sm">
                <span className="absolute top-1 left-2 text-[10px] font-mono text-cyan-400/80 bg-black/60 px-1 rounded">
                  Action Safe (90%)
                </span>
              </div>
              {/* Title safe 80% */}
              <div className="absolute inset-[10%] border border-amber-500/30 border-dotted rounded-sm">
                <span className="absolute top-1 left-2 text-[10px] font-mono text-amber-400/80 bg-black/60 px-1 rounded">
                  Title Safe (80%)
                </span>
              </div>
            </div>
          )}

          {/* 9:16 Crop Overlay */}
          {showMobileCrop && (
            <div className="absolute inset-0 pointer-events-none z-10 flex items-center justify-center">
              <div className="w-[31.64%] h-full border-x-2 border-purple-500/80 bg-purple-900/10 shadow-[0_0_50px_rgba(168,85,247,0.3)] relative">
                <span className="absolute bottom-2 left-2 text-[10px] font-bold text-purple-300 bg-black/70 px-1.5 py-0.5 rounded">
                  Mobile 9:16 Safe
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Frame-Accurate Scrubber & Playback Controls */}
      <div className="h-20 bg-[#111827] border-t border-[#243247] px-6 flex flex-col justify-center select-none">
        {/* Scrubber Track & Sliders */}
        <div className="flex items-center space-x-3">
          <input
            type="range"
            min={0}
            max={duration}
            step={1 / fps}
            value={currentTime}
            onChange={(e) => {
              setIsPlaying(false);
              seekTime(parseFloat(e.target.value));
            }}
            className="flex-1 h-2 bg-[#1E293B] rounded-lg appearance-none cursor-pointer accent-[#C92A2A]"
          />
        </div>

        {/* Playback Controls & Frame Indicators */}
        <div className="flex items-center justify-between mt-2">
          {/* Transport Buttons */}
          <div className="flex items-center space-x-2">
            <button
              onClick={() => seekTime(0)}
              title="Reset to Frame 0"
              aria-label="Reset to Frame 0"
              className="p-1.5 rounded hover:bg-[#1E293B] text-[#94A3B8] hover:text-white transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <button
              onClick={togglePlay}
              title={isPlaying ? 'Pause' : 'Play'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              className="px-3 py-1.5 rounded-md bg-[#C92A2A] hover:bg-[#A61E1E] text-white font-bold flex items-center space-x-1 transition-colors shadow-md"
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 fill-white" />}
              <span className="text-xs">{isPlaying ? 'Pause' : 'Play'}</span>
            </button>
          </div>

          {/* Time & Frame Accuracies */}
          <div className="flex items-center space-x-4 text-xs font-mono">
            <div className="bg-[#1E293B] px-2.5 py-1 rounded text-cyan-400 border border-[#334155]">
              TIME: <span className="text-white font-bold">{formatTime(currentTime)}</span> / {formatTime(duration)}
            </div>

            <div className="bg-[#1E293B] px-2.5 py-1 rounded text-amber-400 border border-[#334155]">
              FRAME: <span className="text-white font-bold">{currentFrame}</span> / {totalFrames} (30 fps)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
