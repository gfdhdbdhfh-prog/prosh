/**
 * Modals.tsx — three dialogs: NAND Erase All red confirmation (types ERASE),
 * About box (contains the required disclaimer line) and Troubleshooting notes.
 */

import { useState } from 'react';
import { AlertOctagon, Info, X, LifeBuoy } from 'lucide-react';
import { TROUBLESHOOTING } from '../lib/logGenerator';

const SIM_NOTE = 'Simulation environment. No actual device operations are performed.';

export function EraseModal({ onConfirm, onCancel }: { onConfirm: () => void; onCancel: () => void }) {
  const [text, setText] = useState('');
  const ok = text.trim().toUpperCase() === 'ERASE';
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm border border-err bg-panel shadow-[0_0_40px_rgba(248,81,73,0.25)]">
        <div className="flex items-center gap-2 border-b border-err/50 bg-err/10 px-3 py-2 text-err">
          <AlertOctagon size={16} />
          <span className="text-xs font-bold tracking-wider">DESTRUCTIVE OPERATION — NAND ERASE ALL</span>
        </div>
        <div className="space-y-2 p-3 text-[11px] leading-relaxed text-[#c9d1d9]">
          <p className="text-err font-semibold">
            This wipes every LUN of the UFS storage: userdata, super, persist caches and all A/B slots.
          </p>
          <ul className="list-inside list-disc space-y-0.5 text-dim">
            <li>User data cannot be recovered after erase.</li>
            <li>Device may require full firmware reinstall to boot.</li>
            <li>{SIM_NOTE}</li>
          </ul>
          <label className="mt-2 block text-[10px] text-dim">
            Type <span className="mx-1 rounded-sm border border-err px-1 font-bold text-err">ERASE</span> to confirm:
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ok && onConfirm()}
              placeholder="ERASE"
              className="mt-1 w-full rounded-sm border border-edge bg-base px-2 py-1 font-mono text-[12px] text-[#e6edf3] outline-none focus:border-err"
            />
          </label>
        </div>
        <div className="flex justify-end gap-2 border-t border-edge px-3 py-2">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger !bg-err/15 font-bold disabled:!opacity-30" disabled={!ok} onClick={onConfirm}>
            Confirm destructive erase
          </button>
        </div>
      </div>
    </div>
  );
}

export function AboutModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-md border border-edge bg-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title justify-between">
          <span className="flex items-center gap-1.5"><Info size={12} /> About NeoFlash Studio</span>
          <button className="btn !border-0 !bg-transparent !px-1" onClick={onClose}><X size={11} /></button>
        </div>
        <div className="space-y-2 p-3 text-[11px] leading-relaxed">
          <div className="text-sm font-bold text-accent">NeoFlash Studio <span className="text-dim">v4.2.1 build 20261014</span></div>
          <p className="text-dim">
            Firmware flashing simulator styled after professional service utilities
            (Odin / SP Flash Tool / MiFlash / fastboot). Drag a real firmware file to inspect its
            header bytes, hex dump and genuine SHA-256 digest; the flash pipeline itself is fully simulated.
          </p>
          <p className="rounded-sm border border-warn/40 bg-warn/10 px-2 py-1.5 text-warn font-semibold">
            {SIM_NOTE}
          </p>
          <table className="w-full text-[10px] text-dim">
            <tbody>
              {[
                ['Engine', 'state-machine v3 (idle→…→success)'],
                ['Crypto', 'WebCrypto SubtleCrypto SHA-256, 4 MiB chunks'],
                ['USB', 'optional WebUSB descriptor read (no transfers)'],
                ['Stack', 'React + TypeScript + Vite + Tailwind'],
              ].map(([k, v]) => (
                <tr key={k} className="border-b border-[#21262d] last:border-0">
                  <td className="py-0.5 pr-2">{k}</td><td className="py-0.5 text-[#c9d1d9]">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function TroubleshootingModal({ errorType, onClose }: { errorType: string; onClose: () => void }) {
  const notes = TROUBLESHOOTING[errorType] ?? ['No notes for this code. Re-run with debug panel off.'];
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="w-full max-w-lg border border-edge bg-panel" onClick={(e) => e.stopPropagation()}>
        <div className="panel-title justify-between !text-accent">
          <span className="flex items-center gap-1.5"><LifeBuoy size={12} /> Troubleshooting — {errorType}</span>
          <button className="btn !border-0 !bg-transparent !px-1" onClick={onClose}><X size={11} /></button>
        </div>
        <ol className="list-decimal space-y-2 p-3 pl-8 text-[11px] leading-relaxed text-[#c9d1d9] marker:text-accent">
          {notes.map((n, i) => <li key={i}>{n}</li>)}
        </ol>
        <div className="border-t border-edge px-3 py-1.5 text-[9px] text-dim">{SIM_NOTE}</div>
      </div>
    </div>
  );
}
