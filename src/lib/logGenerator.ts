/**
 * logGenerator.ts — formatting helpers + canned realistic fastboot/Odin-style
 * lines. The engine composes messages through these helpers so timestamps and
 * levels stay consistent everywhere.
 */

import type { LogEntry, LogLevel } from '../types';

let nextId = 1;

/** [HH:MM:SS.mmm] formatter used both in console and exported .txt log. */
export function fmtTimestamp(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

export function makeLog(level: LogLevel, message: string): LogEntry {
  return { id: nextId++, ts: Date.now(), level, message };
}

/** Render one entry the way it appears in the console / saved txt. */
export function renderLogLine(e: LogEntry): string {
  return `[${fmtTimestamp(e.ts)}] ${e.level.padEnd(5)} ${e.message}`;
}

/** Pre-flight check lines streamed at START (battery/lock/ARB/signature/GPT). */
export function preflightLines(battery: number, bootloader: string, fw: string): Array<{ level: LogLevel; msg: string }> {
  return [
    { level: 'INFO', msg: `Battery level: ${battery}% — threshold 20% — PASS` },
    { level: 'INFO', msg: `Bootloader state: ${bootloader} (fastboot oem device-info)` },
    { level: 'INFO', msg: `Anti-rollback index: current=4 target=4 — OK` },
    { level: 'INFO', msg: `Signature verification: RSA-2048 / SHA-256 avb chain trusted` },
    { level: 'INFO', msg: `Partition table match: GPT entries == scatter map (8 regions)` },
    { level: 'INFO', msg: `Target firmware baseline: ${fw} → package compatible` },
  ];
}

/** Error-code table for injected failures (looks like real service codes). */
export const ERROR_CODES: Record<string, string> = {
  'signature-mismatch': 'E_AUTH_0x1F',
  'write-timeout': 'E_IO_0x3A',
  'device-disconnected': 'E_USB_0x07',
  'anti-rollback': 'E_ARB_0x2C',
  'storage-full': 'E_UFS_0x55',
};

export const ERROR_MESSAGES: Record<string, string> = {
  'signature-mismatch': 'AVB signature mismatch — vbmeta digest rejected by device',
  'write-timeout': 'Write timeout after 30000 ms — UFS command queue stalled',
  'device-disconnected': 'USB device detached during bulk transfer (hotplug event)',
  'anti-rollback': 'Anti-rollback violation: image index lower than fuse value',
  'storage-full': 'Insufficient storage: region exceeds available LBA window',
};

export const TROUBLESHOOTING: Record<string, string[]> = {
  'signature-mismatch': [
    'The package is signed with a key not present in the device AVB allowlist.',
    'Re-download the firmware from the official channel and verify SHA-256.',
    'For unlocked bootloaders you may flash vbmeta with --disable-verification flag (Odin-style option "Preserve dm-verity off").',
  ],
  'write-timeout': [
    'Usually caused by unstable USB link or a hub between host and phone.',
    'Use a rear USB 3.0 port directly; avoid unpowered hubs and extension cables.',
    'Retry the operation — the engine resumes from the last completed partition.',
  ],
  'device-disconnected': [
    'Device left DOWNLOAD mode mid-transfer (cable wiggle, battery drain, watchdog).',
    'Re-seat the cable, hold Vol Down + Power for 10 s, then re-enter download mode.',
    'Check that the NFlash v2.1 driver shows no yellow bang in Device Manager.',
  ],
  'anti-rollback': [
    'Downgrading below the fuse-stored anti-rollback index is blocked by hardware.',
    'Only images with ARB index >= device value can be flashed.',
    'There is no workaround without physical fuse access — use the matching or newer package.',
  ],
  'storage-full': [
    'Requested write range exceeds the partition size reported by GPT.',
    'Uncheck large partitions (super/userdata) or enable "Re-Partition" to rebuild GPT.',
    'NAND Erase All frees userdata but wipes every user file on the device.',
  ],
};
