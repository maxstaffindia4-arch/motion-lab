import React, { useState } from 'react';
import { X, Upload, CheckCircle2, AlertCircle, FileSpreadsheet } from 'lucide-react';
import { BulkImportSchema } from '../../common/types.js';

interface BulkImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportSuccess: () => void;
  projectId?: string;
}

export const BulkImportModal: React.FC<BulkImportModalProps> = ({ isOpen, onClose, onImportSuccess, projectId }) => {
  const [jsonText, setJsonText] = useState(`{
  "video": {
    "id": "explainer-01",
    "title": "Why You Need Offshore Specialists"
  },
  "shots": [
    {
      "id": "1.1",
      "duration": 3,
      "role": "Hook",
      "voiceover": "Running a business is already hard enough.",
      "onScreenText": "Running a business is already hard enough.",
      "animationPrompt": "SHOT 1.1 | 3s | OUTPUT: overlay\\nTEXT: Running a business is already hard enough.\\nSTYLE: word-by-word kinetic text slam with shake"
    },
    {
      "id": "1.2",
      "duration": 7,
      "role": "Pain Points",
      "voiceover": "You spend weeks sorting recruitment, office leases, equipment and endless admin.",
      "onScreenText": "Recruitment / Office Space / Equipment / Admin",
      "animationPrompt": "SHOT 1.2 | 7s | OUTPUT: overlay\\nTEXT: Recruitment / Office Space / Equipment / Admin\\nSTYLE: strike-checklist pain points"
    },
    {
      "id": "1.3",
      "duration": 7,
      "role": "Solution Features",
      "voiceover": "With Staff India, you get dedicated employees, office infrastructure, recruitment support, and flexible working hours.",
      "onScreenText": "Dedicated Employees / Office Infrastructure / Recruitment Support / Flexible Working Hours",
      "animationPrompt": "SHOT 1.3 | 7s | OUTPUT: overlay\\nTEXT: Dedicated Employees / Office Infrastructure / Recruitment Support / Flexible Working Hours\\nSTYLE: 4 icon cards sequential pop-in with floating idle"
    },
    {
      "id": "1.4",
      "duration": 4,
      "role": "CTA Outro",
      "voiceover": "Visit Staff-India.com to speak to an advisor today.",
      "onScreenText": "Visit Staff-India.com | Speak to an Advisor",
      "animationPrompt": "SHOT 1.4 | 4s | OUTPUT: overlay\\nTEXT: Visit Staff-India.com | Speak to an Advisor\\nSTYLE: end-card logo with CTA button"
    }
  ]
}`);

  const [parseError, setParseError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<any | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  if (!isOpen) return null;

  const validateJson = () => {
    try {
      const obj = JSON.parse(jsonText);
      const validated = BulkImportSchema.parse(obj);
      setParsedData(validated);
      setParseError(null);
    } catch (e: any) {
      setParsedData(null);
      setParseError(e.message);
    }
  };

  const handleImport = async () => {
    if (!parsedData) return;
    setIsImporting(true);
    try {
      const res = await fetch('/api/import/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...parsedData, projectId })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Import failed');
      }
      onImportSuccess();
      onClose();
    } catch (err: any) {
      setParseError(err.message);
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-[#243247] rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Modal Header */}
        <div className="p-4 border-b border-[#243247] flex items-center justify-between bg-[#161F30]">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5 text-blue-400" />
            <h3 className="font-bold text-white text-sm">Bulk Import Production Sheet (JSON)</h3>
          </div>
          <button onClick={onClose} className="text-[#94A3B8] hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-[#CBD5E1]">Paste Production Sheet JSON</label>
              <button
                onClick={validateJson}
                className="px-2.5 py-1 rounded bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold transition-colors"
              >
                Validate JSON
              </button>
            </div>
            <textarea
              value={jsonText}
              onChange={(e) => {
                setJsonText(e.target.value);
                setParsedData(null);
              }}
              rows={9}
              className="w-full bg-[#0B0F19] border border-[#334155] rounded-lg p-3 text-xs text-white font-mono leading-relaxed focus:outline-none focus:border-blue-500"
            />
          </div>

          {parseError && (
            <div className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <div className="font-mono whitespace-pre-wrap">{parseError}</div>
            </div>
          )}

          {parsedData && (
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-emerald-400 text-xs font-bold">
                <CheckCircle2 className="w-4 h-4" />
                <span>Valid Production Sheet: {parsedData.video.title} ({parsedData.shots.length} shots)</span>
              </div>

              {/* Preview Table */}
              <div className="border border-[#243247] rounded-lg overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1E293B] text-[#94A3B8] uppercase text-[10px]">
                    <tr>
                      <th className="p-2">Shot ID</th>
                      <th className="p-2">Duration</th>
                      <th className="p-2">Role</th>
                      <th className="p-2">On-Screen Text</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#243247] bg-[#0F172A]">
                    {parsedData.shots.map((s: any) => (
                      <tr key={s.id}>
                        <td className="p-2 font-mono font-bold text-white">{s.id}</td>
                        <td className="p-2 font-mono text-[#94A3B8]">{s.duration || 3}s</td>
                        <td className="p-2 text-cyan-400">{s.role || 'Scene'}</td>
                        <td className="p-2 text-white font-medium truncate max-w-xs">{s.onScreenText}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-[#243247] bg-[#161F30] flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-[#1E293B] hover:bg-[#2A374D] text-[#CBD5E1] text-xs font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!parsedData || isImporting}
            className="px-5 py-2 rounded-lg bg-[#C92A2A] hover:bg-[#A61E1E] disabled:bg-slate-700 text-white text-xs font-bold transition-all shadow-md"
          >
            {isImporting ? 'Importing...' : 'Confirm & Import Video'}
          </button>
        </div>
      </div>
    </div>
  );
};

