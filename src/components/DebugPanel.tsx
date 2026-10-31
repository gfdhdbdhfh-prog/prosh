/**
 * DebugPanel.tsx — hidden scenario-injection drawer (Ctrl+Shift+D).
 * Lets the operator demo error paths, aborts and speed variants. Pure UI:
 * settings are consumed by flashEngine during simulation only.
 */

import { Bug, Zap } from 'lucide-react';
import type { DebugSettings, ErrorType, PartitionRow } from '../types';

interface Props {
  open: boolean;
  settings: DebugSettings;
  partitions: PartitionRow[];
  onChange: (patch: Partial<DebugSettings>) => void;
  onClose: () => void;
}

const ERROR_TYPES: Array<{ v: ErrorType; label: string }> = [
  { v: 'signature-mismatch', label: 'Signature mismatch' },
  { v: 'write-timeout',      label: 'Write timeout' },
  { v: 'device-disconnected',label: 'Device disconnected' },
  { v: 'anti-rollback',      label: 'Anti-rollback violation' },
  { v: 'storage-full',       label: 'Storage full' },
];

export default function DebugPanel({ open, settings, partitions, onChange, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="panel absolute inset-x-2 bottom-10 z-40 mx-auto max-w-md shadow-[0_8px_30px_rgba(0,0,0,0.6)] lg:left-auto lg:right-2 lg:inset-x-auto">
      <div className="panel-title justify-between !text-warn">
        <span className="flex items-center gap-1.5"><Bug size={12} /> Debug / Scenario Injection</span>
        <button className="btn !border-0 !bg-transparent !px-1 text-dim" onClick={onClose} title="Close (Ctrl+Shift+D)">✕</button>
      </div>
      <div className="flex flex-col gap-2.5 p-2.5 text-[10px]">
        {/* Error injection */}
        <label className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5"><Zap size={11} className="text-err" /> Inject error at partition</span>
          <input type="checkbox" checked={settings.injectError}
            onChange={(e) => onChange({ injectError: e.target.checked })}
            className="h-3 w-3 accent-[#f85149]" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <select
            value={settings.errorPartition}
            disabled={!settings.injectError}
            onChange={(e) => onChange({ errorPartition: e.target.value })}
            className="rounded-sm border border-edge bg-panel2 px-1.5 py-1 text-[10px] outline-none focus:border-accent disabled:opacity-40"
          >
            {partitions.map((p) => <option key={p.partition} value={p.partition}>{p.partition}</option>)}
          </select>
          <select
            value={settings.errorType}
            disabled={!settings.injectError}
            onChange={(e) => onChange({ errorType: e.target.value as ErrorType })}
            className="rounded-sm border border-edge bg-panel2 px-1.5 py-1 text-[10px] outline-none focus:border-accent disabled:opacity-40"
          >
            {ERROR_TYPES.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </div>

        {/* Simulation speed */}
        <div>
          <div className="mb-1 text-dim">Simulation speed</div>
          <div className="flex gap-1">
            {([0.5, 1, 2, 100] as const).map((s) => (
              <button key={s}
                className={`btn flex-1 justify-center ${settings.simSpeed === s ? '!border-accent/60 !text-accent' : ''}`}
                onClick={() => onChange({ simSpeed: s })}
                title={s === 100 ? 'Skip delays entirely' : `${s}× real delay`}>
                {s === 100 ? 'instant' : `${s}x`}
              </button>
            ))}
          </div>
        </div>

        {/* Battery slider */}
        <div>
          <div className="mb-1 flex justify-between text-dim">
            <span>Battery level (debug)</span>
            <span className={settings.batteryLevel < 20 ? 'font-bold text-err' : 'text-[#e6edf3]'}>{settings.batteryLevel}%</span>
          </div>
          <input type="range" min={1} max={100} value={settings.batteryLevel}
            onChange={(e) => onChange({ batteryLevel: Number(e.target.value) })} />
          <div className="mt-0.5 text-[9px] text-dim">Below 20% the START button is locked with a warning.</div>
        </div>
      </div>
    </div>
  );
}
