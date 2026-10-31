/**
 * flashEngine.ts — the flashing finite-state machine.
 *   idle → detecting → ready → hashing → verifying → flashing → rebooting → success
 *                                          (flashing ↘ error → ready, ↘ aborted)
 *
 * IMPORTANT: this is a SIMULATION. No WebUSB transfers, no real I/O to any
 * device. All timings are fake but jittered to feel like a genuine service
 * tool. The only real work happens in hashing.ts (SHA-256 of a local file).
 */

import type {
  DebugSettings,
  DeviceInfo,
  FlashOptions,
  FlashProgress,
  FlashReport,
  FlashState,
  LogLevel,
  PartitionRow,
  SpeedSample,
} from '../types';
import { ERROR_CODES, ERROR_MESSAGES } from './logGenerator';
import { fmtBytes, fmtHex } from './fileAnalyzer';

export interface EngineCallbacks {
  onState: (s: FlashState) => void;
  onLog: (level: LogLevel, message: string) => void;
  onPartitions: (rows: PartitionRow[]) => void;
  onProgress: (p: FlashProgress) => void;
  onDone: (report: FlashReport) => void;
}

/** Sleep helper scaled by the simulation speed factor. */
function scaled(ms: number, speed: number): Promise<void> {
  const t = Math.max(1, ms / speed);
  return new Promise((r) => setTimeout(r, t));
}

/** Random float in [a,b). */
function rf(a: number, b: number): number {
  return a + Math.random() * (b - a);
}

/** ASCII progress bar like fastboot's [=====>    ]. */
export function asciiBar(pct: number, width = 10): string {
  const filled = Math.min(width, Math.round((pct / 100) * width));
  const bar = '='.repeat(Math.max(0, filled - 1)) + (filled > 0 ? '>' : '');
  return `[${bar.padEnd(width, ' ')}]`;
}

export class FlashEngine {
  private state: FlashState = 'idle';
  private cancelled = false;
  private rows: PartitionRow[];
  private cb: EngineCallbacks;

  constructor(cb: EngineCallbacks) {
    this.cb = cb;
    this.rows = [];
  }

  get currentState(): FlashState {
    return this.state;
  }

  setRows(rows: PartitionRow[]): void {
    this.rows = rows.map((r) => ({ ...r }));
    this.cb.onPartitions(this.rows);
  }

  private setState(s: FlashState): void {
    this.state = s;
    this.cb.onState(s);
  }

  private log(level: LogLevel, msg: string): void {
    this.cb.onLog(level, msg);
  }

  /** CANCEL — sets the flag; loops check it at every await boundary. */
  cancel(): void {
    if (this.state === 'flashing' || this.state === 'verifying' || this.state === 'hashing') {
      this.cancelled = true;
      this.log('WARN', 'User requested abort — finishing current block transfer…');
    }
  }

  /** Reset per-run flags and statuses before a fresh START/Retry. */
  private resetStatuses(): void {
    this.cancelled = false;
    this.rows = this.rows.map((r) => ({ ...r, status: r.selected ? 'pending' : 'skipped' }));
    this.cb.onPartitions(this.rows);
  }

  private updateRow(idx: number, patch: Partial<PartitionRow>): void {
    this.rows = this.rows.map((r, i) => (i === idx ? { ...r, ...patch } : r));
    this.cb.onPartitions(this.rows);
  }

  /**
   * Full pipeline entry point invoked by the START button.
   * Assumes device detected & package loaded (UI enforces gating).
   */
  async run(
    device: DeviceInfo,
    options: FlashOptions,
    debug: DebugSettings,
    preflight: Array<{ level: LogLevel; msg: string }>,
    sha256: string | null,
    startedAtMs: number,
  ): Promise<void> {
    const speed = debug.simSpeed;
    this.resetStatuses();
    this.setState('verifying');
    const samples: SpeedSample[] = [];
    const t0 = performance.now();

    this.log('INFO', `Target: ${device.model} (${device.codename})`);
    await scaled(rf(150, 300), speed);
    this.log('INFO', 'Handshake... OK');
    await scaled(rf(150, 300), speed);
    this.log('INFO', 'Auth token verified (RSA-2048)');
    await scaled(rf(200, 350), speed);
    this.log('INFO', `Sending scatter map... ${this.rows.length} entries`);
    await scaled(rf(200, 400), speed);

    // ---- Pre-flight checks, streamed line-by-line -----------------------
    for (const p of preflight) {
      if (this.cancelled) {
        this.finishAbort(device, options, sha256, startedAtMs, samples, t0);
        return;
      }
      this.log(p.level, p.msg);
      await scaled(rf(200, 400), speed);
    }

    if (options.nandEraseAll) {
      this.log('WARN', 'NAND Erase All selected — wiping all UFS LUNs (simulated)');
      await scaled(rf(300, 500), speed);
      this.log('INFO', 'Erasing userdata region... done (simulated 4.0 GB)');
    }
    if (options.repartition) {
      this.log('INFO', 'Rebuild GPT partition table... OK');
      await scaled(rf(200, 350), speed);
    }

    // ---- Per-partition loop ---------------------------------------------
    this.setState('flashing');
    const targets = this.rows.filter((r) => r.selected);
    const total = targets.length;
    let doneCount = 0;
    let bytesWrittenTotal = 0;

    for (let i = 0; i < this.rows.length; i++) {
      const row = this.rows[i];
      if (!row.selected) continue;
      if (this.cancelled) return this.finishAbort(device, options, sha256, startedAtMs, samples, t0);

      // -- Erase --
      this.updateRow(i, { status: 'erasing' });
      this.log('INFO', `Erasing ${row.partition}... done (${rf(0.05, 0.3).toFixed(2)}s)`);
      await scaled(rf(250, 500), speed);

      // -- Write with non-linear progress --
      this.updateRow(i, { status: 'writing' });
      const writeOk = await this.writePartition(i, row, speed, samples, t0, doneCount, total, bytesWrittenTotal, targets);
      if (!writeOk) {
        // Error injected or cancelled inside the write loop.
        if (this.cancelled) return this.finishAbort(device, options, sha256, startedAtMs, samples, t0);
        return this.finishError(row, debug, device, options, sha256, startedAtMs, samples, t0);
      }
      bytesWrittenTotal += row.sizeBytes;

      // Occasional realistic sparse-image warning
      if (Math.random() < 0.25) {
        this.log('WARN', `Sparse chunk gap detected at ${fmtHex(0x1A40000 + Math.floor(rf(0, 0x90000)))}, padding`);
        await scaled(rf(150, 300), speed);
      }

      // -- Verify --
      if (options.verifyAfterFlash) {
        this.updateRow(i, { status: 'verifying' });
        await scaled(rf(200, 450), speed);
        this.log('OK', `${row.partition} flashed and verified (SHA-256 match)`);
      } else {
        this.log('OK', `${row.partition} flashed (verification skipped)`);
      }
      this.updateRow(i, { status: 'done' });
      doneCount++;
      this.emitOverall(doneCount, total, 100, null, samples, 0, t0);
    }

    // ---- Reboot ----------------------------------------------------------
    this.setState('rebooting');
    if (options.autoReboot) {
      this.log('INFO', 'Sending reboot command (simulated)...');
      await scaled(rf(400, 800), speed);
      this.log('INFO', 'Device is booting... waiting for USB re-enumeration');
      await scaled(rf(500, 900), speed);
    } else {
      this.log('WARN', 'Auto Reboot disabled — device left in DOWNLOAD mode');
      await scaled(rf(200, 400), speed);
    }

    this.setState('success');
    const elapsed = (Date.now() - startedAtMs) / 1000;
    const avg = samples.length ? samples.reduce((a, s) => a + s.mbps, 0) / samples.length : 0;
    this.log('OK', `FLASH COMPLETE — ${total}/${total} partitions written in ${elapsed.toFixed(1)}s`);
    this.report('SUCCESS', device, options, sha256, startedAtMs, elapsed, avg, samples);
  }

  /** Drive one partition's write progress: jerky curve, pauses at 30% & 78%. */
  private async writePartition(
    idx: number,
    row: PartitionRow,
    speed: number,
    samples: SpeedSample[],
    t0: number,
    doneCount: number,
    total: number,
    bytesSoFar: number,
    targets: PartitionRow[],
  ): Promise<boolean> {
    const remainingBytes = targets.slice(doneCount).reduce((a, t) => a + t.sizeBytes, 0);
    let pct = 0;
    let mbps = rf(14, 22);
    while (pct < 100) {
      if (this.cancelled) return false;
      // Non-linear increments: bursts + micro-pauses near hot spots.
      let step = rf(2.5, 9);
      if (pct < 30 && pct + step >= 30) step = 30 - pct + 0.5;
      if (Math.abs(pct - 30) < 2 && pct < 31) {
        await scaled(rf(250, 600), speed); // micro-pause ~30%
      }
      if (Math.abs(pct - 78) < 2 && pct < 79) {
        await scaled(rf(300, 700), speed); // micro-pause ~78%
      }
      pct = Math.min(100, pct + step);
      // Speed wanders between 12 and 31 MB/s with occasional dips.
      mbps = Math.max(12, Math.min(31, mbps + rf(-4, 4)));
      if (Math.random() < 0.08) mbps *= 0.55; // stall blip
      samples.push({ t: (performance.now() - t0) / 1000, mbps });
      if (samples.length > 240) samples.shift();

      const writtenMB = (row.sizeBytes * pct) / 100 / (1024 * 1024);
      this.log('INFO', `Writing ${row.partition}  ${asciiBar(pct)} ${Math.floor(pct)}% ${mbps.toFixed(1)} MB/s ${writtenMB.toFixed(1)} MB`);

      const etaSec = ((remainingBytes - bytesSoFar - (row.sizeBytes * pct) / 100) / (1024 * 1024)) / Math.max(6, mbps);
      this.emitOverall(doneCount, total, pct, row.partition, samples, Math.max(0, etaSec), t0, idx, pct);

      await scaled(rf(90, 220), speed);

      // Debug error injection fires mid-write on the chosen partition.
      if (debugHit(this.debugRef, row.partition, pct)) {
        this.updateRow(idx, { status: 'failed' });
        return false;
      }
    }
    return true;
  }

  private debugRef: DebugSettings | null = null;

  /** Attach debug settings so the write loop can consult them. */
  attachDebug(d: DebugSettings): void {
    this.debugRef = d;
  }

  private emitOverall(
    done: number,
    total: number,
    partPct: number,
    current: string | null,
    samples: SpeedSample[],
    eta: number,
    _t0: number,
    _idx?: number,
    _pp?: number,
  ): void {
    const overall = Math.min(100, ((done + partPct / 100) / Math.max(1, total)) * 100);
    const last = samples[samples.length - 1];
    this.cb.onProgress({
      overall,
      currentPartition: current,
      partitionProgress: partPct,
      speedMBs: last ? last.mbps : 0,
      etaSeconds: eta,
      doneCount: done,
      totalCount: total,
      samples: [...samples],
    });
  }

  private finishAbort(device: DeviceInfo, options: FlashOptions, sha: string | null, startedAt: number, samples: SpeedSample[], t0: number): void {
    this.setState('aborted');
    this.rows = this.rows.map((r) => (r.status === 'writing' || r.status === 'erasing' || r.status === 'verifying' ? { ...r, status: 'aborted' } : r));
    this.cb.onPartitions(this.rows);
    this.log('WARN', 'Operation ABORTED by user — partial writes may leave device unbootable');
    const elapsed = (Date.now() - startedAt) / 1000;
    this.report('ABORTED', device, options, sha, startedAt, elapsed, avgMbps(samples), samples);
  }

  private finishError(
    row: PartitionRow,
    debug: DebugSettings,
    device: DeviceInfo,
    options: FlashOptions,
    sha: string | null,
    startedAt: number,
    samples: SpeedSample[],
    t0: number,
  ): void {
    this.setState('error');
    const code = ERROR_CODES[debug.errorType] ?? 'E_GEN_0x00';
    const msg = ERROR_MESSAGES[debug.errorType] ?? 'Unknown simulated fault';
    this.log('ERROR', `${code}: ${msg}`);
    this.log('ERROR', `Failed partition: ${row.partition} @ ${fmtHex(row.offsetBytes)} (${fmtBytes(row.sizeBytes)})`);
    this.log('WARN', 'Device held in DOWNLOAD mode. Use Retry to resume from failed partition.');
    const elapsed = (Date.now() - startedAt) / 1000;
    this.report('ERROR', device, options, sha, startedAt, elapsed, avgMbps(samples), samples, code);
    // error → ready transition handled by UI (Retry / re-detect)
  }

  private report(
    outcome: FlashReport['outcome'],
    device: DeviceInfo,
    options: FlashOptions,
    sha: string | null,
    startedAt: number,
    elapsed: number,
    avg: number,
    samples: SpeedSample[],
    errorCode?: string,
  ): void {
    const rep: FlashReport = {
      tool: 'NeoFlash Studio',
      version: 'v4.2.1 build 20261014',
      simulation: true,
      startedAt: new Date(startedAt).toISOString(),
      finishedAt: new Date().toISOString(),
      outcome,
      elapsedSec: Math.round(elapsed * 100) / 100,
      avgThroughputMBs: Math.round(avg * 10) / 10,
      device: { ...device },
      packageFile: this.packageNameRef ?? null,
      sha256: sha,
      options,
      partitions: this.rows.map(({ partition, file, sizeBytes, offsetBytes, status }) => ({
        partition, file, sizeBytes, offsetBytes, status,
      })),
      log: [], // filled by UI layer which owns the full log buffer
    };
    // Extra fields kept out of the strict interface via local cast-free approach:
    if (errorCode) {
      (rep as FlashReport & { errorCode?: string }).errorCode = errorCode;
    }
    void samples;
    this.cb.onDone(rep);
  }

  packageNameRef: string | null = null;
}

function avgMbps(samples: SpeedSample[]): number {
  return samples.length ? samples.reduce((a, s) => a + s.mbps, 0) / samples.length : 0;
}

/** True once the injected-error partition passes its trigger percentage. */
function debugHit(d: DebugSettings | null, partition: string, pct: number): boolean {
  if (!d || !d.injectError) return false;
  if (d.errorPartition !== partition) return false;
  return pct >= 45; // fail mid-write for drama
}
