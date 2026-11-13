import React from 'react';
import { ParamsSchema } from '../../common/types.js';

interface ParamsFormProps {
  schema: ParamsSchema;
  values: Record<string, any>;
  onChange: (key: string, val: any) => void;
  onApply: () => void;
  isSaving: boolean;
}

export const ParamsForm: React.FC<ParamsFormProps> = ({
  schema,
  values,
  onChange,
  onApply,
  isSaving
}) => {
  if (!schema || schema.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-[#64748B]">
        No parameters defined for this composition.
      </div>
    );
  }

  // Group schema by field.group
  const groups: Record<string, typeof schema> = {};
  for (const field of schema) {
    const grp = field.group || 'General';
    if (!groups[grp]) groups[grp] = [];
    groups[grp].push(field);
  }

  const easingOptions = [
    'power4.out',
    'power3.out',
    'power2.out',
    'power1.inOut',
    'back.out(2)',
    'back.out(1.7)',
    'expo.inOut',
    'bounce.out',
    'none'
  ];

  return (
    <div className="space-y-6 select-none">
      {Object.entries(groups).map(([groupName, fields]) => (
        <div key={groupName} className="space-y-3">
          <h4 className="text-[11px] font-bold uppercase tracking-wider text-[#94A3B8] border-b border-[#243247] pb-1">
            {groupName}
          </h4>

          <div className="space-y-3.5">
            {fields.map((f) => {
              const val = values[f.id] !== undefined ? values[f.id] : '';

              return (
                <div key={f.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs">
                    <label className="font-medium text-[#CBD5E1]">{f.label}</label>
                    {f.type === 'number' && (
                      <span className="text-[11px] font-mono text-[#94A3B8]">{val}</span>
                    )}
                  </div>

                  {f.type === 'color' && (
                    <div className="flex items-center space-x-2">
                      <input
                        type="color"
                        value={val || '#000000'}
                        onChange={(e) => onChange(f.id, e.target.value)}
                        className="w-8 h-8 rounded border border-[#334155] bg-transparent cursor-pointer"
                      />
                      <input
                        type="text"
                        value={val}
                        onChange={(e) => onChange(f.id, e.target.value)}
                        className="flex-1 bg-[#0F172A] border border-[#334155] rounded px-2.5 py-1 text-xs text-white font-mono"
                      />
                    </div>
                  )}

                  {f.type === 'number' && (
                    <div className="flex items-center space-x-3">
                      <input
                        type="range"
                        min={f.min ?? 0}
                        max={f.max ?? 100}
                        step={f.step ?? 1}
                        value={Number(val) || 0}
                        onChange={(e) => onChange(f.id, parseFloat(e.target.value))}
                        className="flex-1 h-1.5 bg-[#1E293B] rounded appearance-none cursor-pointer accent-[#C92A2A]"
                      />
                      <input
                        type="number"
                        min={f.min}
                        max={f.max}
                        step={f.step}
                        value={val}
                        onChange={(e) => onChange(f.id, parseFloat(e.target.value))}
                        className="w-16 bg-[#0F172A] border border-[#334155] rounded px-2 py-0.5 text-xs text-right text-white font-mono"
                      />
                    </div>
                  )}

                  {f.type === 'text' && (
                    <input
                      type="text"
                      value={val}
                      onChange={(e) => onChange(f.id, e.target.value)}
                      className="w-full bg-[#0F172A] border border-[#334155] rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  )}

                  {f.type === 'easing' && (
                    <select
                      value={val || 'power4.out'}
                      onChange={(e) => onChange(f.id, e.target.value)}
                      className="w-full bg-[#0F172A] border border-[#334155] rounded px-2.5 py-1.5 text-xs text-white font-mono cursor-pointer"
                    >
                      {easingOptions.map((e) => (
                        <option key={e} value={e}>
                          {e}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      <button
        onClick={onApply}
        disabled={isSaving}
        className="w-full py-2 bg-[#2563EB] hover:bg-[#1D4ED8] disabled:bg-slate-700 text-white font-bold rounded text-xs transition-colors shadow-md"
      >
        {isSaving ? 'Updating...' : 'Save Parameters (Creates Version)'}
      </button>
    </div>
  );
};

