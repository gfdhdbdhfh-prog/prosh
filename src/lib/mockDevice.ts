/**
 * mockDevice.ts — plausible fake device descriptors & partition layouts.
 * Nothing here touches hardware; it only fabricates believable strings/numbers
 * for the simulation UI.
 */

import type { DeviceInfo, PartitionRow } from '../types';
import { fmtBytes } from './fileAnalyzer';

/** Cryptographically-random hex string of `len` chars. */
export function randomHex(len: number): string {
  const bytes = new Uint8Array(Math.ceil(len / 2));
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, len)
    .toUpperCase();
}

/** Build a fresh mock device card (serial regenerated every detection). */
export function makeMockDevice(battery: number): DeviceInfo {
  return {
    model: 'NF-X7 Pro',
    codename: 'aurora',
    soc: 'SNX-8250',
    ram: '12 GB',
    storage: 'UFS 3.1 256GB',
    serial: randomHex(12),
    bootloader: 'UNLOCKED',
    currentFw: '14.0.3_TKQ1.221013',
    battery,
    mode: 'DOWNLOAD',
    port: 'USB 3.0 @ bus 2 dev 7',
  };
}

const KB = 1024, MB = 1024 * KB, GB = 1024 * MB;

/** Default partition layout with realistic sizes & LBA offsets (4096-aligned). */
export function defaultPartitions(): PartitionRow[] {
  const spec: Array<[string, string, number]> = [
    ['boot_a', 'boot.img', 96 * MB],
    ['recovery', 'recovery.img', 128 * MB],
    ['dtbo', 'dtbo.img', 32 * MB],
    ['vbmeta', 'vbmeta.img', 8 * KB],
    ['super', 'super.img', 6 * GB],
    ['userdata', 'userdata.img', 4 * GB],
    ['modem_a', 'NON-HLOS.bin', 128 * MB],
    ['bootloader', 'abl.elf', 2 * MB],
  ];
  let offset = 0x00A00000; // GPT reserve + first usable LBA region
  return spec.map(([partition, file, size], i) => {
    const row: PartitionRow = {
      id: `p${i}`,
      partition,
      file,
      sizeBytes: size,
      offsetBytes: offset,
      selected: partition !== 'userdata' && partition !== 'super',
      status: 'pending',
      realSize: false,
    };
    // Next partition starts on a 4096-byte block boundary after this one.
    offset += Math.ceil(size / 4096) * 4096 + 0x100000;
    return row;
  });
}

/** A short human summary used in tooltips/log lines. */
export function describePartition(p: PartitionRow): string {
  return `${p.partition} (${fmtBytes(p.sizeBytes)} @ ${p.offsetBytes.toString(16)})`;
}
