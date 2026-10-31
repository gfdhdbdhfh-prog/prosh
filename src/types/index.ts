/**
 * NeoFlash Studio — shared type definitions.
 * All device operations are SIMULATED; these types describe UI state only.
 */

/** Log severity levels rendered with distinct colors in the console. */
export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'OK';

/** A single timestamped console line. */
export interface LogEntry {
  id: number;
  /** Millisecond epoch of emission; formatted as [HH:MM:SS.mmm] */
  ts: number;
  level: LogLevel;
  message: string;
}

/** Finite-state machine states for the flashing pipeline. */
export type FlashState =
  | 'idle'        // nothing detected yet
  | 'detecting'   // USB enumeration animation running
  | 'ready'       // device + package loaded, awaiting START
  | 'hashing'     // real SHA-256 over the dropped file
  | 'verifying'   // pre-flight checks stream
  | 'flashing'    // per-partition erase/write/verify loop
  | 'rebooting'   // final reboot handshake
  | 'success'     // FLASH COMPLETE
  | 'error'       // injected / simulated failure
  | 'aborted';    // user pressed CANCEL

/** Detected (mock) device descriptor card. */
export interface DeviceInfo {
  model: string;
  codename: string;
  soc: string;
  ram: string;
  storage: string;
  serial: string;      // random hex, regenerated per detection
  bootloader: 'UNLOCKED' | 'LOCKED';
  currentFw: string;
  battery: number;     // percent, adjustable via debug panel
  mode: string;        // DOWNLOAD / FASTBOOT / RECOVERY
  port: string;
  /** Populated when a real WebUSB descriptor was read. */
  usb?: UsbDescriptorInfo;
}

/** Real values obtained from navigator.usb.requestDevice descriptors (read-only). */
export interface UsbDescriptorInfo {
  vendorId: number;
  productId: number;
  productName?: string;
  manufacturerName?: string;
}

/** Connection-side status badges under the device card. */
export interface LinkStatus {
  connection: 'none' | 'searching' | 'connected';
  driver: 'missing' | 'ok';
  auth: 'pending' | 'granted' | 'denied';
}

/** Magic-byte classification result for an uploaded image. */
export type ImageKind =
  | 'android-sparse'   // 3A FF 26 ED
  | 'ext4'             // 53 EF at 0x438
  | 'zip'              // 50 4B ..
  | 'elf'              // 7F 45 4C 46
  | 'boot-image'       // "ANDROID!"
  | 'unknown';         // RAW

/** Analysis of the first bytes of a real File object. */
export interface FileAnalysis {
  name: string;
  sizeBytes: number;
  sizeMb: number;
  lastModified: number;
  kind: ImageKind;
  kindLabel: string;
  /** First 512 bytes captured for the hex viewer. */
  head: Uint8Array;
  hexDump: string[];
}

/** One row of the partition table. */
export interface PartitionRow {
  id: string;
  partition: string;
  file: string;
  sizeBytes: number;
  /** LBA offset on the UFS storage. */
  offsetBytes: number;
  selected: boolean;
  status: PartitionStatus;
  /** True when size was derived from the actually-loaded file. */
  realSize: boolean;
}

export type PartitionStatus =
  | 'pending'
  | 'erasing'
  | 'writing'
  | 'verifying'
  | 'done'
  | 'failed'
  | 'skipped'
  | 'aborted';

/** Flash options checkboxes (Odin-style). */
export interface FlashOptions {
  autoReboot: boolean;
  repartition: boolean;
  nandEraseAll: boolean;
  preserveUserdata: boolean;
  verifyAfterFlash: boolean;
}

/** Debug-panel scenario injection settings. */
export interface DebugSettings {
  injectError: boolean;
  errorPartition: string;
  errorType: ErrorType;
  simSpeed: 0.5 | 1 | 2 | 100; // 100 == "instant"
  batteryLevel: number;
}

export type ErrorType =
  | 'signature-mismatch'
  | 'write-timeout'
  | 'device-disconnected'
  | 'anti-rollback'
  | 'storage-full';

/** Live progress snapshot while flashing. */
export interface FlashProgress {
  overall: number;          // 0..100 across all partitions
  currentPartition: string | null;
  partitionProgress: number; // 0..100 within current partition
  speedMBs: number;          // instantaneous write speed
  etaSeconds: number;
  doneCount: number;
  totalCount: number;
  /** Rolling window of speed samples for the sparkline (updated 4×/s). */
  samples: SpeedSample[];
}

export interface SpeedSample {
  t: number;      // seconds since flash start
  mbps: number;
}

/** Hashing progress for the real-file SHA-256 pass. */
export interface HashProgress {
  active: boolean;
  fraction: number; // 0..1
  digest: string | null;
}

/** Final report exported as JSON. */
export interface FlashReport {
  tool: string;
  version: string;
  simulation: true;
  startedAt: string;
  finishedAt: string;
  outcome: 'SUCCESS' | 'ABORTED' | 'ERROR';
  elapsedSec: number;
  avgThroughputMBs: number;
  device: Omit<DeviceInfo, 'usb'> | null;
  packageFile: string | null;
  sha256: string | null;
  options: FlashOptions;
  partitions: Array<{
    partition: string;
    file: string;
    sizeBytes: number;
    offsetBytes: number;
    status: PartitionStatus;
  }>;
  log: Array<{ ts: string; level: LogLevel; message: string }>;
}

/** Scatter/manifest parse result. */
export interface ScatterEntry {
  partition: string;
  file: string;
  sizeBytes: number;
  offsetBytes: number;
}
