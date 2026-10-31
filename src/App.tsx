/**
 * App.tsx — NeoFlash Studio root: layout, top bar with menus, state wiring
 * between DevicePanel / FirmwareDropzone / PartitionTable / ProgressOverlay /
 * LogConsole / StatusBar / DebugPanel and the simulated FlashEngine.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Zap, ChevronDown, Play, Square, HelpCircle, FileText, Settings2, TerminalSquare,
  Menu, Monitor, Smartphone as SmartIcon, FolderOpen, ListTree, Info, Bug,
} from 'lucide-react';

import type {
  DebugSettings, DeviceInfo, FileAnalysis, FlashOptions, FlashProgress,
  FlashReport, FlashState, HashProgress, LinkStatus, LogEntry, LogLevel, PartitionRow,
} from './types';

import DevicePanel from './components/DevicePanel';
import FirmwareDropzone from './components/FirmwareDropzone';
import PartitionTable from './components/PartitionTable';
import ProgressOverlay from './components/ProgressOverlay';
import LogConsole from './components/LogConsole';
import HexViewer from './components/HexViewer';
import DebugPanel from './components/DebugPanel';
import StatusBar from './components/StatusBar';
import { AboutModal, EraseModal, TroubleshootingModal } from './components/Modals';

import { analyzeFile } from './lib/fileAnalyzer';
import { sha256File } from './lib/hashing';
import { defaultPartitions, makeMockDevice, randomHex } from './lib/mockDevice';
import { parseScatter } from './lib/scatterParser';
import { preflightLines, renderLogLine } from './lib/logGenerator';
import { FlashEngine } from './lib/flashEngine';

/** Which partitions a firmware image plausibly maps to, by filename hints. */
function guessTargetPartition(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('boot') && !n.includes('loader')) return 'boot_a';
  if (n.includes('recovery')) return 'recovery';
  if (n.includes('dtbo')) return 'dtbo';
  if (n.includes('vbmeta')) return 'vbmeta';
  if (n.includes('super')) return 'super';
  if (n.includes('userdata')) return 'userdata';
  if (n.includes('modem') || n.includes('non-hlos')) return 'modem_a';
  if (n.includes('abl') || n.includes('loader')) return 'bootloader';
  return 'boot_a';
}

export default function App() {
  // ---------- core simulation state ----------
  const [state, setState] = useState<FlashState>('idle');
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [link, setLink] = useState<LinkStatus>({ connection: 'none', driver: 'ok', auth: 'pending' });
  const [detecting, setDetecting] = useState(false);

  const [analysis, setAnalysis] = useState<FileAnalysis | null>(null);
  const [hash, setHash] = useState<HashProgress>({ active: false, fraction: 0, digest: null });
  const [sha256, setSha256] = useState<string | null>(null);
  const fileRef = useRef<File | null>(null);

  const [partitions, setPartitions] = useState<PartitionRow[]>(() => defaultPartitions());
  const [options, setOptions] = useState<FlashOptions>({
    autoReboot: true, repartition: false, nandEraseAll: false,
    preserveUserdata: true, verifyAfterFlash: true,
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef(1);
  const [progress, setProgress] = useState<FlashProgress | null>(null);
  const [report, setReport] = useState<FlashReport | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const [debugOpen, setDebugOpen] = useState(false);
  const [debug, setDebug] = useState<DebugSettings>({
    injectError: false, errorPartition: 'boot_a', errorType: 'signature-mismatch',
    simSpeed: 1, batteryLevel: 87,
  });

  const [modal, setModal] = useState<'erase' | 'about' | 'troubleshoot' | null>(null);
  const [menu, setMenu] = useState<'file' | 'options' | 'log' | 'help' | null>(null);
  const [tab, setTab] = useState<'device' | 'firmware' | 'log'>('firmware'); // <1024px tabs
  const sessionId = useMemo(() => `0x${randomHex(4)}`, []);

  const engineRef = useRef<FlashEngine | null>(null);

  // ---------- logging ----------
  const pushLog = useCallback((level: LogLevel, message: string): void => {
    setLogs((prev) => [...prev.slice(-1999), { id: logIdRef.current++, ts: Date.now(), level, message }]);
  }, []);

  // Build the engine once; callbacks close over stable setters.
  useEffect(() => {
    engineRef.current = new FlashEngine({
      onState: (s) => setState(s),
      onLog: (lvl, msg) => pushLog(lvl, msg),
      onPartitions: (rows) => setPartitions(rows),
      onProgress: (p) => setProgress(p),
      onDone: (rep) => {
        setReport(rep);
        setStartedAt(null);
        if (rep.outcome === 'ERROR') {
          const code = (rep as FlashReport & { errorCode?: string }).errorCode ?? null;
          setErrorCode(code);
        } else {
          setErrorCode(null);
        }
      },
    });
    pushLog('INFO', 'NeoFlash Studio v4.2.1 build 20261014 initialized');
    pushLog('WARN', 'Simulation environment. No actual device operations are performed.');
  }, [pushLog]);

  // Keep debug settings mirrored into the engine before each run.
  useEffect(() => { engineRef.current?.attachDebug(debug); }, [debug]);

  // Battery slider affects the displayed device card too.
  useEffect(() => {
    setDevice((d) => (d ? { ...d, battery: debug.batteryLevel } : d));
  }, [debug.batteryLevel]);

  // ---------- hotkeys ----------
  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.ctrlKey && e.shiftKey && e.code === 'KeyD') {
        e.preventDefault();
        setDebugOpen((v) => !v);
        pushLog('INFO', 'Debug panel toggled via Ctrl+Shift+D');
      }
      if (e.key === 'Escape') setMenu(null);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [pushLog]);

  // ---------- device detection ----------
  const detectDevice = useCallback((): void => {
    if (detecting) return;
    setDetecting(true);
    setState('idle');
    setLink({ connection: 'searching', driver: 'ok', auth: 'pending' });
    pushLog('INFO', 'Enumerating USB devices (simulated)…');
    const delay = 1500 + Math.random() * 1500; // 1.5–3 s search animation
    setTimeout(() => {
      const dev = makeMockDevice(debug.batteryLevel);
      setDevice(dev);
      setDetecting(false);
      setLink({ connection: 'connected', driver: 'ok', auth: 'granted' });
      setState('ready');
      pushLog('OK', `Device found: ${dev.model} [${dev.serial}] in ${dev.mode} mode`);
      pushLog('INFO', `USB descriptor: VID 0x2717 PID 0x FF4A (simulated), interface 0 = DownloadAgent`);
      pushLog('INFO', `Battery: ${dev.battery}% · Bootloader: ${dev.bootloader} · FW: ${dev.currentFw}`);
    }, delay);
  }, [detecting, debug.batteryLevel, pushLog]);

  /** WebUSB real-descriptor path (read-only). */
  const onWebUsbDevice = useCallback((d: DeviceInfo): void => {
    setDevice(d);
    setLink({ connection: 'connected', driver: 'ok', auth: 'granted' });
    setState('ready');
    pushLog('OK', `WebUSB descriptor captured: VID 0x${d.usb?.vendorId.toString(16)} PID 0x${d.usb?.productId.toString(16)} (descriptors only, no transfers)`);
  }, [pushLog]);

  // ---------- firmware file handling ----------
  const onFile = useCallback(async (f: File): Promise<void> => {
    fileRef.current = f;
    setReport(null);
    setErrorCode(null);
    pushLog('INFO', `Loading package: ${f.name} (${f.size.toLocaleString('en-US')} bytes)`);
    try {
      const a = await analyzeFile(f);
      setAnalysis(a);
      pushLog('INFO', `Magic scan: ${a.kindLabel}`);
      pushLog('INFO', `Head 512 B captured → hex viewer (${a.hexDump.length} rows)`);

      // Fill the matching partition row with the REAL size of the dropped file.
      const target = guessTargetPartition(f.name);
      setPartitions((prev) => prev.map((p) =>
        p.partition === target
          ? { ...p, file: f.name, sizeBytes: f.size, realSize: true }
          : p));
      pushLog('INFO', `Bound real image size to partition "${target}" (${f.size.toLocaleString('en-US')} B)`);

      // Real SHA-256 pass with chunked progress.
      setState('hashing');
      setHash({ active: true, fraction: 0, digest: null });
      const t = performance.now();
      const res = await sha256File(f, (fr) => setHash({ active: true, fraction: fr, digest: null }));
      setHash({ active: false, fraction: 1, digest: res.hex });
      setSha256(res.hex);
      pushLog('OK', `SHA-256 computed in ${(performance.now() - t).toFixed(0)} ms: ${res.hex}`);
      setState(device ? 'ready' : 'idle');
    } catch (err) {
      pushLog('ERROR', `Package read failed: ${err instanceof Error ? err.message : String(err)}`);
      setState(device ? 'ready' : 'idle');
    }
  }, [device, pushLog]);

  const clearFile = useCallback((): void => {
    fileRef.current = null;
    setAnalysis(null);
    setSha256(null);
    setHash({ active: false, fraction: 0, digest: null });
    setPartitions(defaultPartitions());
    pushLog('INFO', 'Package unloaded, partition map reset to defaults');
  }, [pushLog]);

  // ---------- scatter / manifest ----------
  const onScatter = useCallback(async (f: File): Promise<void> => {
    const text = await f.text();
    const entries = parseScatter(text);
    if (!entries.length) {
      pushLog('WARN', `Scatter parse: no entries found in ${f.name}`);
      return;
    }
    setPartitions((prev) => {
      const next = prev.map((p) => {
        const hit = entries.find((e) => e.partition.replace(/[-_]/g, '') === p.partition.replace(/[-_]/g, ''));
        return hit
          ? { ...p, file: hit.file, sizeBytes: hit.sizeBytes || p.sizeBytes, offsetBytes: hit.offsetBytes || p.offsetBytes, realSize: !!hit.sizeBytes }
          : p;
      });
      // Append unknown entries as extra rows.
      let off = 0x20000000;
      for (const e of entries) {
        if (!next.some((p) => p.partition === e.partition)) {
          next.push({ id: `x${next.length}`, partition: e.partition, file: e.file, sizeBytes: e.sizeBytes || 0x100000, offsetBytes: e.offsetBytes || off, selected: false, status: 'pending', realSize: true });
          off += 0x1000000;
        }
      }
      return next;
    });
    pushLog('OK', `Scatter loaded: ${f.name} → ${entries.length} region definitions merged`);
  }, [pushLog]);

  // ---------- options ----------
  const toggleOption = useCallback((key: keyof FlashOptions, val: boolean): void => {
    if (key === 'nandEraseAll' && val) {
      setModal('erase'); // require typed confirmation first
      return;
    }
    if (key === 'preserveUserdata' && val && options.nandEraseAll) {
      pushLog('WARN', 'Preserve Userdata conflicts with NAND Erase All — erase will be kept, userdata flag cleared');
      setOptions((o) => ({ ...o, preserveUserdata: false }));
      return;
    }
    setOptions((o) => ({ ...o, [key]: val }));
    pushLog('INFO', `Option "${key}" ${val ? 'ENABLED' : 'disabled'}`);
  }, [options.nandEraseAll, pushLog]);

  const confirmErase = useCallback((): void => {
    setModal(null);
    setOptions((o) => ({ ...o, nandEraseAll: true }));
    pushLog('WARN', 'NAND Erase All CONFIRMED (typed "ERASE") — all user data will be wiped in simulation');
  }, [pushLog]);

  // ---------- START / CANCEL ----------
  const busy = ['verifying', 'flashing', 'rebooting', 'hashing'].includes(state);
  const lowBattery = debug.batteryLevel < 20;
  const canStart = !!device && !!analysis && !busy && !lowBattery &&
    partitions.some((p) => p.selected) && state !== 'detecting';

  const startReason = !device ? 'Detect a device first'
    : !analysis ? 'Load a firmware package first'
    : lowBattery ? `Battery ${debug.batteryLevel}% < 20% — charge device (debug slider)`
    : !partitions.some((p) => p.selected) ? 'Select at least one partition'
    : busy ? 'Operation already running' : undefined;

  const start = useCallback((): void => {
    if (!canStart || !device || !engineRef.current) return;
    setReport(null);
    setErrorCode(null);
    setProgress(null);
    const now = Date.now();
    setStartedAt(now);
    engineRef.current.packageNameRef = analysis?.name ?? null;
    pushLog('INFO', '── FLASH SEQUENCE INITIATED ──');
    void engineRef.current.run(
      device, options, debug,
      preflightLines(device.battery, device.bootloader, device.currentFw),
      sha256, now,
    );
  }, [canStart, device, analysis, options, debug, sha256, pushLog]);

  const cancel = useCallback((): void => {
    engineRef.current?.cancel();
  }, []);

  const retry = useCallback((): void => {
    if (!device) return;
    pushLog('INFO', 'Retry requested — resuming pipeline from scratch (completed regions cached)');
    setState('ready');
    setTimeout(start, 120);
  }, [device, pushLog, start]);

  // ---------- report export (real JSON download) ----------
  const exportReport = useCallback((): void => {
    if (!report) return;
    const full: FlashReport & { logText?: string } = {
      ...report,
      log: logs.map((l) => ({ ts: new Date(l.ts).toISOString(), level: l.level, message: l.message })),
      logText: logs.map(renderLogLine).join('\n'),
    };
    const blob = new Blob([JSON.stringify(full, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `neoflash-report-${Date.now()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
    pushLog('OK', 'Session report exported (JSON via Blob download)');
  }, [report, logs, pushLog]);

  // ---------- partition toggle ----------
  const togglePartition = useCallback((id: string, selected: boolean): void => {
    setPartitions((prev) => prev.map((p) => (p.id === id ? { ...p, selected } : p)));
  }, []);

  // ---------- menu handlers ----------
  const menuAction = (m: string): void => {
    setMenu(null);
    switch (m) {
      case 'load-image': /* opens dialog through ref click below */
        document.querySelector<HTMLInputElement>('input[type=file]:not([accept])')?.click();
        break;
      case 'load-scatter':
        document.querySelector<HTMLInputElement>('input[accept=".txt,.xml"]')?.click();
        break;
      case 'export-report': exportReport(); break;
      case 'save-log':
        setLogs((ls) => {
          const blob = new Blob([ls.map(renderLogLine).join('\n') + '\n'], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url; a.download = 'neoflash-log.txt'; a.click();
          setTimeout(() => URL.revokeObjectURL(url), 5000);
          return ls;
        });
        break;
      case 'clear-log': setLogs([]); pushLog('INFO', 'Console cleared'); break;
      case 'debug': setDebugOpen((v) => !v); break;
      case 'about': setModal('about'); break;
      case 'help': pushLog('INFO', 'Help: Detect Device → drop firmware → tick partitions → START. Ctrl+Shift+D opens the scenario/debug drawer.'); break;
      default: break;
    }
  };

  const MenuItem = ({ id, label }: { id: string; label: string }) => (
    <button className="block w-full px-3 py-1 text-left text-[11px] hover:bg-[#21262d]" onClick={() => menuAction(id)}>
      {label}
    </button>
  );

  const MenuBar = ({ name, items }: { name: 'file' | 'options' | 'log' | 'help'; items: Array<[string, string]> }) => (
    <div className="relative">
      <button
        className={`rounded-sm px-2 py-0.5 text-[11px] transition-colors duration-150 hover:bg-[#21262d] ${menu === name ? 'bg-[#21262d] text-accent' : 'text-dim'}`}
        onClick={() => setMenu(menu === name ? null : name)}
      >
        {name[0].toUpperCase() + name.slice(1)} <ChevronDown size={9} className="inline" />
      </button>
      {menu === name && (
        <div className="absolute left-0 top-6 z-40 min-w-[190px] border border-edge bg-panel shadow-lg" onMouseLeave={() => setMenu(null)}>
          {items.map(([id, label]) => <MenuItem key={id} id={id} label={label} />)}
        </div>
      )}
    </div>
  );

  // ---------- derived UI helpers ----------
  const connDot = link.connection === 'connected' ? 'bg-ok' : link.connection === 'searching' ? 'bg-accent pulse-dot' : 'bg-err';
  const stateBadge: Record<FlashState, [string, string]> = {
    idle: ['IDLE', 'text-dim border-edge'], detecting: ['SCANNING', 'text-accent border-accent/50'],
    ready: ['READY', 'text-ok border-ok/50'], hashing: ['HASHING', 'text-accent border-accent/50'],
    verifying: ['PRE-FLIGHT', 'text-accent border-accent/50'], flashing: ['FLASHING', 'text-accent border-accent/50 animate-pulse'],
    rebooting: ['REBOOTING', 'text-warn border-warn/50'], success: ['COMPLETE', 'text-ok border-ok/50'],
    error: ['ERROR', 'text-err border-err/50'], aborted: ['ABORTED', 'text-warn border-warn/50'],
  };
  const [badgeTxt, badgeCls] = stateBadge[state];

  const optionDefs: Array<{ key: keyof FlashOptions; label: string; hint: string }> = [
    { key: 'autoReboot', label: 'Auto Reboot', hint: 'Send reboot after last partition' },
    { key: 'repartition', label: 'Re-Partition', hint: 'Rebuild GPT from scatter map' },
    { key: 'nandEraseAll', label: 'NAND Erase All', hint: 'Wipe every UFS LUN — destructive!' },
    { key: 'preserveUserdata', label: 'Preserve Userdata', hint: 'Skip userdata even if checked above' },
    { key: 'verifyAfterFlash', label: 'Verify After Flash', hint: 'Read-back SHA-256 per region' },
  ];

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-base text-[#c9d1d9]">
      {/* ================= TOP BAR ================= */}
      <header className="flex items-center gap-2 border-b border-edge bg-panel px-2 py-1">
        <div className="flex items-center gap-1.5">
          <div className="flex h-6 w-6 items-center justify-center rounded-sm bg-accent/15 text-accent"><Zap size={14} /></div>
          <span className="text-[13px] font-bold tracking-wide text-[#e6edf3]">NeoFlash<span className="text-accent">Studio</span></span>
        </div>
        <span className="hidden rounded-sm border border-edge px-1.5 py-0.5 text-[9px] text-dim sm:inline">v4.2.1 build 20261014</span>

        {/* Connection indicator */}
        <span className="ml-1 flex items-center gap-1.5 text-[10px]" title={`Connection: ${link.connection}`}>
          <span className={`h-2 w-2 rounded-full ${connDot}`} />
          <span className={link.connection === 'connected' ? 'text-ok' : 'text-dim'}>
            {link.connection === 'connected' ? device?.serial : link.connection === 'searching' ? 'scanning…' : 'no device'}
          </span>
        </span>

        <nav className="ml-2 hidden items-center gap-0.5 md:flex">
          <MenuBar name="file" items={[['load-image', 'Load firmware image…'], ['load-scatter', 'Load scatter/manifest…'], ['export-report', 'Export session report (JSON)'], ['-', '—']]} />
          <MenuBar name="options" items={[['debug', 'Toggle debug panel (Ctrl+Shift+D)'], ['reset', 'Reset all options']]} />
          <MenuBar name="log" items={[['save-log', 'Save log as .txt'], ['clear-log', 'Clear console']]} />
          <MenuBar name="help" items={[['help', 'Quick help'], ['about', 'About NeoFlash Studio']]} />
        </nav>
        <span className="md:hidden text-dim"><Menu size={14} /></span>

        <span className={`ml-auto badge ${badgeCls}`}>{badgeTxt}</span>
      </header>

      {/* Mobile resolution hint */}
      <div className="border-b border-warn/30 bg-warn/10 px-2 py-0.5 text-center text-[9px] text-warn lg:hidden">
        Desktop resolution recommended for service operations
      </div>

      {/* ================= MAIN AREA ================= */}
      <main className="relative flex min-h-0 flex-1 flex-col gap-1.5 overflow-hidden p-1.5 lg:flex-row">
        {/* Tabs under 1024px */}
        <div className="flex gap-1 lg:hidden">
          {(['device', 'firmware', 'log'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className={`btn flex-1 justify-center capitalize ${tab === t ? '!border-accent/60 !text-accent' : ''}`}>
              {t === 'device' ? <SmartIcon size={11} /> : t === 'firmware' ? <FolderOpen size={11} /> : <TerminalSquare size={11} />}
              {t}
            </button>
          ))}
        </div>

        {/* LEFT: Device */}
        <div className={`${tab === 'device' ? 'flex' : 'hidden'} min-h-0 flex-1 lg:flex lg:flex-none`}>
          <DevicePanel
            device={device} link={link} detecting={detecting} busy={busy}
            onDetect={detectDevice} onWebUsbDevice={onWebUsbDevice}
          />
        </div>

        {/* CENTER: firmware + partitions + controls */}
        <div className={`${tab === 'firmware' ? 'flex' : 'hidden'} min-h-0 flex-1 flex-col gap-1.5 lg:flex`}>
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 xl:flex-row">
            <div className="flex min-h-0 flex-1 flex-col gap-1.5">
              <FirmwareDropzone
                analysis={analysis} hash={hash} sha256={sha256} state={state} busy={busy}
                onFile={(f) => void onFile(f)} onScatter={(f) => void onScatter(f)} onClear={clearFile}
              />
              <PartitionTable rows={partitions} busy={busy} onToggle={togglePartition} />
            </div>
            <div className="flex min-h-0 w-full shrink-0 flex-col xl:w-[300px]">
              <HexViewer lines={analysis?.hexDump ?? ['— load a firmware file to capture the first 512 bytes —']} />
            </div>
          </div>

          {/* Options + START cluster */}
          <div className="panel flex flex-wrap items-end gap-x-4 gap-y-2 p-2">
            <div className="min-w-[220px] flex-1">
              <div className="mb-1 flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-dim"><Settings2 size={11} /> Flash options</div>
              <div className="flex flex-wrap gap-x-4 gap-y-1">
                {optionDefs.map((o) => (
                  <label key={o.key} className={`flex cursor-pointer items-center gap-1.5 text-[10.5px] ${o.key === 'nandEraseAll' ? 'text-err' : ''}`} title={o.hint}>
                    <input type="checkbox" checked={options[o.key]} disabled={busy}
                      onChange={(e) => toggleOption(o.key, e.target.checked)}
                      className={`h-3 w-3 ${o.key === 'nandEraseAll' ? 'accent-[#f85149]' : 'accent-[#00d9ff]'} disabled:cursor-not-allowed`} />
                    {o.label}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button className="btn-start" onClick={start} disabled={!canStart} title={startReason ?? 'Begin simulated flash sequence'}>
                <Play size={15} /> START
              </button>
              <button className="btn btn-danger !py-2" onClick={cancel} disabled={!busy}
                title={busy ? 'Abort the running operation' : 'No operation in progress'}>
                <Square size={13} /> CANCEL
              </button>
            </div>
          </div>

          {/* Progress HUD */}
          <ProgressOverlay
            state={state} progress={progress} report={report} startedAt={startedAt}
            errorCode={errorCode} onExportReport={exportReport} onRetry={retry}
            onTroubleshooting={() => setModal('troubleshoot')}
          />
        </div>

        {/* RIGHT/BOTTOM: Log console — resizable via native resize handle */}
        <div className={`${tab === 'log' ? 'flex' : 'hidden'} min-h-[180px] flex-col lg:flex lg:h-auto`}
             style={{}}>
          <div className="min-h-[250px] flex-1 resize-y overflow-hidden lg:min-h-0 lg:h-full">
            <LogConsole entries={logs} active={busy} onClear={() => { setLogs([]); pushLog('INFO', 'Console cleared'); }} />
          </div>
        </div>

        {/* Debug drawer */}
        <DebugPanel open={debugOpen} settings={debug} partitions={partitions}
          onChange={(patch) => setDebug((d) => ({ ...d, ...patch }))} onClose={() => setDebugOpen(false)} />
      </main>

      {/* ================= STATUS BAR ================= */}
      <StatusBar device={device} state={state} sessionId={sessionId} startedAt={startedAt} />

      {/* ================= MODALS ================= */}
      {modal === 'erase' && <EraseModal onConfirm={confirmErase} onCancel={() => { setModal(null); pushLog('INFO', 'NAND Erase All confirmation dismissed'); }} />}
      {modal === 'about' && <AboutModal onClose={() => setModal(null)} />}
      {modal === 'troubleshoot' && <TroubleshootingModal errorType={debug.errorType} onClose={() => setModal(null)} />}

      {/* Footer strip icons for flavor (hidden, decorative) */}
      <div className="hidden"><HelpCircle size={10} /><ListTree size={10} /><Info size={10} /><Bug size={10} /><FileText size={10} /><Monitor size={10} /></div>
    </div>
  );
}
