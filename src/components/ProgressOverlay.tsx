/**
 * ProgressOverlay.tsx — the flashing HUD: overall bar, circular gauge,
 * "3 / 8 partitions" counter, live ETA and a recharts sparkline of write speed
 * (samples pushed by the engine ~4×/s). Also renders final SUCCESS panel with
 * elapsed time / avg throughput / Export Report button.
 */

import {
  ResponsiveContainer, AreaChart, Area, YAxis, XAxis, Tooltip,
} from 'recharts';
import { Activity, CheckCircle2, FileDown, Timer, Gauge, XOctagon, AlertTriangle } from 'lucide-react';
import type { FlashProgress, FlashReport, FlashState } from '../types';

interface Props {
  state: FlashState;
  progress: FlashProgress | null;
  report: FlashReport | null;
  startedAt: number | null;
  errorCode: string | null;
  onExportReport: () => void;
  onRetry: () => void;
  onTroubleshooting: () => void;
}

/** SVG ring gauge — no external chart needed for a circle. */
function Ring({ pct }: { pct: number }) {
  const r = 26, c = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" className="-rotate-90">
      <circle cx="32" cy="32" r={r} fill="none" stroke="#30363d" strokeWidth="5" />
      <circle
        cx="32" cy="32" r={r} fill="none" stroke="#00d9ff" strokeWidth="5"
        strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)}
        style={{ transition: 'stroke-dashoffset 150ms linear' }}
      />
    </svg>
  );
}

function fmtEta(s: number): string {
  if (!isFinite(s) || s <= 0) return '--:--';
  const m = Math.floor(s / 60), sec = Math.round(s % 60);
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

export default function ProgressOverlay({
  state, progress, report, startedAt, errorCode, onExportReport, onRetry, onTroubleshooting,
}: Props) {
  const running = state === 'verifying' || state === 'flashing' || state === 'rebooting' || state === 'hashing';

  // Elapsed ticker inside header when running
  const elapsed = startedAt && running ? (Date.now() - startedAt) / 1000 : report?.elapsedSec ?? null;

  if (state === 'success' && report) {
    return (
      <div className="panel border-ok/50 bg-ok/5 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-ok" />
            <div>
              <div className="text-sm font-bold tracking-widest text-ok">FLASH COMPLETE</div>
              <div className="text-[10px] text-dim">
                All selected partitions written &amp; verified · device rebooted (simulated)
              </div>
            </div>
          </div>
          <div className="flex items-center gap-3 text-[10px] text-dim">
            <span className="flex items-center gap-1"><Timer size={11} /> elapsed {report.elapsedSec.toFixed(1)} s</span>
            <span className="flex items-center gap-1"><Gauge size={11} /> avg {report.avgThroughputMBs.toFixed(1)} MB/s</span>
            <button className="btn btn-accent" onClick={onExportReport}>
              <FileDown size={11} /> Export Report
            </button>
          </div>
        </div>
      </div>
    );
  }

  if ((state === 'error' || state === 'aborted') && report) {
    const isErr = state === 'error';
    return (
      <div className={`panel p-2 ${isErr ? 'border-err/50 bg-err/5' : 'border-warn/50 bg-warn/5'}`}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {isErr ? <XOctagon size={18} className="text-err" /> : <AlertTriangle size={18} className="text-warn" />}
            <div>
              <div className={`text-sm font-bold tracking-widest ${isErr ? 'text-err' : 'text-warn'}`}>
                {isErr ? `FLASH FAILED ${errorCode ?? ''}` : 'OPERATION ABORTED'}
              </div>
              <div className="text-[10px] text-dim">
                elapsed {report.elapsedSec.toFixed(1)} s · {report.partitions.filter((p) => p.status === 'done').length} partition(s) completed before stop
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn" onClick={onTroubleshooting} title="Open troubleshooting notes">Troubleshooting</button>
            <button className="btn btn-accent" onClick={onRetry}><Activity size={11} /> Retry</button>
            <button className="btn" onClick={onExportReport}><FileDown size={11} /> Export Report</button>
          </div>
        </div>
      </div>
    );
  }

  if (!running || !progress) {
    return (
      <div className="panel px-2 py-1.5 text-[10px] text-dim">
        <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-edge align-middle" />
        Idle — pipeline stages: <span className="text-[#8b949e]">detect → load package → hash → pre-flight → erase/write/verify ×N → reboot</span>
      </div>
    );
  }

  const data = progress.samples.slice(-90).map((s, i) => ({ i, mbps: Math.round(s.mbps * 10) / 10 }));

  return (
    <div className="panel flex flex-col gap-1.5 p-2">
      {/* Overall bar */}
      <div className="flex items-center gap-2">
        <span className="w-24 shrink-0 text-[10px] uppercase tracking-wider text-dim">Overall</span>
        <div className="h-2 flex-1 overflow-hidden rounded-sm border border-edge bg-[#0d1117]">
          <div className="h-full bg-gradient-to-r from-[#00d9ff]/60 to-accent transition-all duration-150"
               style={{ width: `${progress.overall.toFixed(1)}%` }} />
        </div>
        <span className="w-12 text-right text-[10px] tabular-nums text-accent">{progress.overall.toFixed(1)}%</span>
        <span className="w-16 text-right text-[10px] tabular-nums text-dim">{progress.doneCount} / {progress.totalCount}</span>
      </div>

      <div className="flex items-center gap-3">
        {/* Ring + current partition */}
        <div className="relative shrink-0">
          <Ring pct={progress.partitionProgress} />
          <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold tabular-nums text-accent">
            {Math.floor(progress.partitionProgress)}%
          </span>
        </div>
        <div className="min-w-0 flex-1 text-[10px] leading-relaxed">
          <div className="truncate">
            <span className="text-dim">Current:</span>{' '}
            <span className="font-bold text-[#e6edf3]">{progress.currentPartition ?? 'finishing…'}</span>
            <span className="ml-2 text-dim">stage: {state.toUpperCase()}</span>
          </div>
          <div className="text-dim">
            Speed <span className="tabular-nums text-accent">{progress.speedMBs.toFixed(1)} MB/s</span>
            {' · '}ETA <span className="tabular-nums text-accent">{fmtEta(progress.etaSeconds)}</span>
            {' · '}Elapsed <span className="tabular-nums text-accent">{elapsed !== null ? fmtEta(elapsed) : '--:--'}</span>
          </div>
        </div>

        {/* Live sparkline (updates with each progress push ≈4×/s) */}
        <div className="hidden h-[54px] w-44 shrink-0 sm:block">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 0, left: -32 }}>
              <defs>
                <linearGradient id="spd" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#00d9ff" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#00d9ff" stopOpacity={0.05} />
                </linearGradient>
              </defs>
              <YAxis domain={[0, 35]} tick={{ fontSize: 8, fill: '#8b949e' }} width={30} />
              <XAxis dataKey="i" hide />
              <Tooltip
                contentStyle={{ background: '#161b22', border: '1px solid #30363d', fontSize: 10 }}
                labelFormatter={() => ''}
                formatter={(v: number | string) => [`${v} MB/s`, 'write']}
              />
              <Area type="monotone" dataKey="mbps" stroke="#00d9ff" strokeWidth={1} fill="url(#spd)" isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
