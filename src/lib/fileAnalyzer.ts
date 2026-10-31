/**
 * fileAnalyzer.ts — real File API processing.
 * Reads the first 512 bytes of an actual dropped file, builds a canonical
 * hex dump (offset + 16 hex bytes + ASCII gutter) and classifies the image
 * by magic bytes. No device I/O involved — pure local file reading.
 */

import type { FileAnalysis, ImageKind } from '../types';

const BLOCK_SIZE = 4096; // UFS logical block size used for offsets/sizes

/** Read the first `count` bytes of a File via FileReader (callback-based). */
export function readHead(file: File, count = 512): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(new Uint8Array(reader.result));
      } else {
        reject(new Error('Unexpected FileReader result'));
      }
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader error'));
    reader.readAsArrayBuffer(file.slice(0, count));
  });
}

/** Detect the superblock / container signature from head bytes. */
export function detectMagic(head: Uint8Array, fullSize: number): { kind: ImageKind; label: string } {
  const b = head;
  // Android sparse image magic: 3A FF 26 ED (little-endian read of 0xED26FF3A)
  if (b.length >= 4 && b[0] === 0x3a && b[1] === 0xff && b[2] === 0x26 && b[3] === 0xed) {
    return { kind: 'android-sparse', label: 'Android Sparse Image (magic 3A FF 26 ED)' };
  }
  // Boot image header magic: "ANDROID!" at offset 0
  const boot = String.fromCharCode(...Array.from(b.slice(0, 8)));
  if (boot.startsWith('ANDROID!')) {
    return { kind: 'boot-image', label: 'Android Boot Image ("ANDROID!" header)' };
  }
  // ELF header: 7F 45 4C 46
  if (b.length >= 4 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46) {
    return { kind: 'elf', label: 'ELF Binary (7F 45 4C 46) — likely prebuilt kernel/recovery' };
  }
  // ZIP / OTA payload: 50 4B 03 04 (or empty-archive variants)
  if (b.length >= 2 && b[0] === 0x50 && b[1] === 0x4b) {
    return { kind: 'zip', label: 'ZIP Archive (50 4B) — OTA / package container' };
  }
  // ext4 superblock magic 53 EF at byte offset 0x438 (head must cover it)
  if (fullSize >= 0x43a + 2 && b.length > 0x439 && b[0x438] === 0x53 && b[0x439] === 0xef) {
    return { kind: 'ext4', label: 'EXT4 Filesystem (superblock magic 53 EF @ 0x438)' };
  }
  return { kind: 'unknown', label: 'Unknown / RAW binary blob' };
}

/** Byte → printable ASCII or '.' fallback. */
function asciiChar(byte: number): string {
  return byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : '.';
}

/** Build lines like: 00000000  3a ff 26 ed ...  |....ASCII...|  (16 bytes/row) */
export function buildHexDump(data: Uint8Array, maxLines = 32): string[] {
  const lines: string[] = [];
  const rows = Math.min(Math.ceil(data.length / 16), maxLines);
  for (let r = 0; r < rows; r++) {
    const off = r * 16;
    const slice = data.slice(off, off + 16);
    const hex = Array.from(slice)
      .map((v) => v.toString(16).padStart(2, '0'))
      .join(' ')
      .padEnd(47, ' ');
    const ascii = Array.from(slice).map(asciiChar).join('');
    lines.push(`${off.toString(16).padStart(8, '0')}  ${hex} |${ascii}|`);
  }
  if (data.length > rows * 16) {
    lines.push(`… ${data.length - rows * 16} more bytes captured (showing first ${rows * 16})`);
  }
  return lines;
}

/** Full analysis pipeline for one dropped File. */
export async function analyzeFile(file: File): Promise<FileAnalysis> {
  const head = await readHead(file, 512);
  const { kind, label } = detectMagic(head, file.size);
  return {
    name: file.name,
    sizeBytes: file.size,
    sizeMb: file.size / (1024 * 1024),
    lastModified: file.lastModified,
    kind,
    kindLabel: label,
    head,
    hexDump: buildHexDump(head),
  };
}

/** Round up to whole 4096-byte blocks — displayed next to sizes. */
export function toBlocks(bytes: number): number {
  return Math.ceil(bytes / BLOCK_SIZE);
}

/** Human-readable byte formatter with block granularity notes. */
export function fmtBytes(bytes: number): string {
  if (bytes >= 1 << 30) return `${(bytes / (1 << 30)).toFixed(2)} GB`;
  if (bytes >= 1 << 20) return `${(bytes / (1 << 20)).toFixed(1)} MB`;
  if (bytes >= 1 << 10) return `${(bytes / (1 << 10)).toFixed(1)} KB`;
  return `${bytes} B`;
}

/** Hex offset formatter used all over the UI (0x prefixed, 8 digits). */
export function fmtHex(n: number): string {
  return `0x${n.toString(16).toUpperCase().padStart(8, '0')}`;
}
