/**
 * StatusBar.tsx — bottom strip: port / driver / session id / elapsed timer.
 */

import { useEffect, useState } from 'react';
import type { DeviceInfo, FlashState } from '../types';

interface Props {
  device: DeviceInfo | null;
  state: FlashState;
  sessionId: string;
  startedAt: number | null; // set when an operation begins
}

function fmtElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
}

export default function StatusBar({ device, state, sessionId, startedAt }: Props) {
  const [, tick] = useState(0);
  // Refresh the elapsed counter once per second while an operation is active.
  useEffect(() => {
    if (!startedAt) return;
    const id = setInterval(() => tick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [startedAt]);

  const running = ['verifying', 'flashing', 'rebooting', 'hashing'].includes(state);
  const elapsed = startedAt ? fmtElapsed(Date.now() - startedAt) : '00:00:00';

  return (
    <footer className="flex items-center gap-3 overflow-x-auto whitespace-nowrap border-t border-edge bg-panel px-2 py-[3px] text-[9.5px] text-dim">
      <span>Port: <span className="text-[#c9d1d9]">{device?.port ?? '—'}</span></span>
      <span className="text-edge">|</span>
      <span>Driver: <span className="text-[#c9d1d9]">NFlash v2.1</span></span>
      <span className="text-edge">|</span>
      <span>Session: <span className="font-mono text-accent">{sessionId}</span></span>
      <span className="text-edge">|</span>
      <span>Elapsed: <span className={`tabular-nums ${running ? 'text-accent' : 'text-[#c9d1d9]'}`}>{elapsed}</span></span>
      <span className="ml-auto hidden text-[#484f58] sm:inline">
        SIMULATION · Ctrl+Shift+D debug panel
      </span>
    </footer>
  );
}
