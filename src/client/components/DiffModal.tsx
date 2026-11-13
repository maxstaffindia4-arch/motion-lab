import React from 'react';
import { DiffEditor } from '@monaco-editor/react';
import { X, GitCompare } from 'lucide-react';
import { ShotVersion } from '../../common/types.js';

interface DiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  v1: ShotVersion | null;
  v2: ShotVersion | null;
}

export const DiffModal: React.FC<DiffModalProps> = ({ isOpen, onClose, v1, v2 }) => {
  if (!isOpen || !v1 || !v2) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-6">
      <div className="bg-[#111827] border border-[#243247] rounded-xl max-w-6xl w-full h-[85vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-[#243247] flex items-center justify-between bg-[#161F30]">
          <div className="flex items-center space-x-2">
            <GitCompare className="w-5 h-5 text-cyan-400" />
            <h3 className="font-bold text-white text-sm">
              Version Diff: v{v1.versionNumber} ({v1.source}) vs v{v2.versionNumber} ({v2.source})
            </h3>
          </div>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Monaco Diff Editor */}
        <div className="flex-1 bg-[#0F172A]">
          <DiffEditor
            height="100%"
            language="html"
            theme="vs-dark"
            original={v1.compHtml}
            modified={v2.compHtml}
            options={{
              readOnly: true,
              renderSideBySide: true,
              fontSize: 12
            }}
          />
        </div>
      </div>
    </div>
  );
};

