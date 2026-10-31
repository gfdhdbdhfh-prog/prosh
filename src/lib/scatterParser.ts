/**
 * scatterParser.ts — tolerant text parser for SP-Flash-Tool-style .txt scatter
 * files and simple XML manifests. Extracts partition name, file, size & offset
 * so the UI table can be populated from a REAL uploaded file.
 */

import type { ScatterEntry } from '../types';

const KB = 1024, MB = 1024 * KB, GB = 1024 * MB;

/** Parse "0x1A40000", "1234", "96MB", "6GB" style values into bytes. */
function parseSize(raw: string): number | null {
  const s = raw.trim().toLowerCase();
  if (!s) return null;
  const hex = s.match(/^0x([0-9a-f]+)$/);
  if (hex) return parseInt(hex[1], 16);
  const unit = s.match(/^([\d.]+)\s*(kb|mb|gb|k|m|g|b)?$/);
  if (unit) {
    const n = parseFloat(unit[1]);
    const mult: Record<string, number> = { kb: KB, k: KB, mb: MB, m: MB, gb: GB, g: GB, b: 1, '': 1 };
    return Math.round(n * (mult[unit[2] ?? ''] ?? 1));
  }
  const dec = Number(s);
  return Number.isFinite(dec) ? dec : null;
}

/**
 * Supported line formats (case-insensitive keys):
 *   - name: boot_a  file: boot.img  size: 96MB  start_addr: 0x00A00000
 *   - <partition name="super" file="super.img" size="0x180000000" offset="0x1000"/>
 *   - BOOT_A boot.img 0x6000000 0x00A00000        (whitespace columns)
 */
export function parseScatter(text: string): ScatterEntry[] {
  const out: ScatterEntry[] = [];
  const lines = text.split(/\r?\n/);

  for (const line of lines) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('//')) continue;

    // XML attribute form
    const xml = t.match(/<partition\b[^>]*>/i);
    if (xml) {
      const attr = (name: string): string | undefined => {
        const m = xml[0].match(new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i'));
        return m?.[1];
      };
      const partition = attr('name') ?? attr('partition');
      if (partition) {
        out.push({
          partition,
          file: attr('file') ?? `${partition}.img`,
          sizeBytes: parseSize(attr('size') ?? '') ?? 0,
          offsetBytes: parseSize(attr('offset') ?? attr('start_addr') ?? '') ?? 0,
        });
      }
      continue;
    }

    // key: value pairs
    const kv = (key: string): string | undefined => {
      const m = t.match(new RegExp(`\\b${key}\\s*[:=]\\s*([^;\\s]+(?:\\s(?![a-z_]+:)[^;\\s]+)?)`, 'i'));
      return m?.[1];
    };
    const partition = kv('partition_name') ?? kv('name') ?? kv('part');
    if (partition) {
      out.push({
        partition,
        file: kv('file') ?? kv('file_name') ?? `${partition}.img`,
        sizeBytes: parseSize(kv('size') ?? kv('region_size') ?? '') ?? 0,
        offsetBytes: parseSize(kv('start_addr') ?? kv('offset') ?? kv('lba') ?? '') ?? 0,
      });
      continue;
    }

    // whitespace columns: NAME file.bin 0xSIZE 0xOFFSET
    const cols = t.split(/\s+/);
    if (cols.length >= 2 && /^[A-Za-z][\w-]*$/.test(cols[0])) {
      const size = cols[2] ? parseSize(cols[2]) : null;
      const off = cols[3] ? parseSize(cols[3]) : null;
      if (size !== null || off !== null) {
        out.push({
          partition: cols[0].toLowerCase(),
          file: cols[1],
          sizeBytes: size ?? 0,
          offsetBytes: off ?? 0,
        });
      }
    }
  }
  return out;
}
