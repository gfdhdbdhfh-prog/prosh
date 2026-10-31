/**
 * LogConsole.tsx — bottom console: colored levels, timestamps, autoscroll,
 * level filter, copy-to-clipboard and real Blob download of the .txt log.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Terminal, Copy, Save, Trash2, ArrowDownToLine, Ban } from 'lucide-react';
import type { LogEntry, LogLevel } from '../types';
import { fmtTimestamp, renderLogLine } from '../lib/logGenerator';

interface Props {
  entries: LogEntry[];
  active: boolean; // operation running → show blinking cursor
  onClear: () => void;
}

const LEVEL_CLS: Record<LogLevel, string> = {
  INFO:  'text-[#c9d1d9]',
  OK:    'text-ok',
  WARN:  'text-warn',
  ERROR: 'text-err font-bold',
};
const LEVEL_TAG: Record<LogLevel, string> = {
  INFO: 'text-accent', OK: 'text-ok', WARN: 'text-warn', ERROR: 'text-err',
};

export default function LogConsole({ entries, active, onClear }: Props) {
  const [autoScroll, setAutoScroll] = useState(true);
  const [filter, setFilter] = useState<LogLevel | 'ALL'>('ALL');
  const boxRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(
    () => (filter === 'ALL' ? entries : entries.filter((e) => e.level === filter)),
    [entries, filter],
  );

  // Autoscroll to bottom whenever new lines arrive.
  useEffect(() => {
    if (autoScroll && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [visible.length, autoScroll]);

  const plainText = useMemo(() => visible.map(renderLogLine).join('\n'), [visible]);

  const copy = (): void => {
    void navigator.clipboard?.writeText(plainText);
  };

  /** Real download via Blob + object URL. */
  const save = (): void => {
    const blob = new Blob([plainText + '\n'], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neoflash-session-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.txt`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  return (
    <div className="panel flex h-full min-h-0 flex-col">
      {/* Toolbar */}
      <div className="panel-title justify-between !py-0.5">
        <span className="flex items-center gap-1.5"><Terminal size={12} /> Operation Log</span>
        <div className="flex items-center gap-1 normal-case tracking-normal">
          {/* Level filter */}
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as LogLevel | 'ALL')}
            className="h-5 rounded-sm border border-edge bg-panel2 px-1 text-[9px] text-dim outline-none focus:border-accent"
            title="Filter by severity"
          >
            <option value="ALL">ALL levels</option>
            <option value="INFO">INFO only</option>
            <option value="WARN">WARN only</option>
            <option value="ERROR">ERROR only</option>
            <option value="OK">OK only</option>
          </select>
          <button className="btn !border-0 !bg-transparent !px-1 hover:!bg-[#21262d]" onClick={() => setAutoScroll((v) => !v)}
            title={autoScroll ? 'Autoscroll ON — click to pin view' : 'Autoscroll OFF'}>
            <ArrowDownToLine size={11} className={autoScroll ? 'text-accent' : 'text-dim'} />
          </button>
          <button className="btn !border-0 !bg-transparent !px-1 hover:!bg-[#21262d]" onClick={copy} title="Copy visible log to clipboard" disabled={!visible.length}>
            <Copy size={11} />
          </button>
          <button className="btn !border-0 !bg-transparent !px-1 hover:!bg-[#21262d]" onClick={save} title="Save log as .txt (real download)" disabled={!visible.length}>
            <Save size={11} />
          </button>
          <button className="btn !border-0 !bg-transparent !px-1 hover:!bg-[#21262d]" onClick={onClear} title="Clear console" disabled={active}>
            <Ban size={11} className="mr-0.5 hidden" /><Trash2 size={11} />
          </button>
        </div>
      </div>

      {/* Console body */}
      <div ref={boxRef} className="min-h-0 flex-1 overflow-auto bg-[#0d1117] px-2 py-1 leading-[1.5]">
        {visible.length === 0 && (
          <div className="text-[10px] italic text-dim">— session log empty — events will appear here —</div>
        )}
        {visible.map((e) => (
          <div key={e.id} className={`whitespace-pre-wrap break-all font-mono text-[10.5px] ${LEVEL_CLS[e.level]}`}>
            <span className="select-none text-dim">[{fmtTimestamp(e.ts)}]</span>{' '}
            <span className={`select-none font-bold ${LEVEL_TAG[e.level]}`}>{e.level.padEnd(5)}</span>{' '}
            {e.message}
          </div>
        ))}
        {active && (
          <div className="font-mono text-[10.5px] text-accent">
            &gt; <span className="blink-cursor inline-block h-3 w-1.5 translate-y-[2px] bg-accent" />
          </div>
        )}
      </div>

      <div className="flex justify-between border-t border-edge px-2 py-0.5 text-[9px] text-dim">
        <span>{visible.length} / {entries.length} lines</span>
        <span>UTF-8 · LF · monotonic ids</span>
      </div>
    </div>
  );
}
