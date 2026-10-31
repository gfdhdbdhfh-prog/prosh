/**
 * PartitionTable.tsx — checkboxable partition rows populated either from the
 * default mock layout, from a real scatter file, or with the loaded image's
 * real size substituted into the matching partition.
 */

import { Table2, Loader2 } from 'lucide-react';
import type { PartitionRow, PartitionStatus } from '../types';
import { fmtBytes, fmtHex, toBlocks } from '../lib/fileAnalyzer';

interface Props {
  rows: PartitionRow[];
  busy: boolean;
  onToggle: (id: string, selected: boolean) => void;
}

const STATUS_META: Record<PartitionStatus, { label: string; cls: string; spin?: boolean }> = {
  pending:   { label: 'PENDING',   cls: 'text-dim' },
  erasing:   { label: 'ERASING',   cls: 'text-warn', spin: true },
  writing:   { label: 'WRITING',   cls: 'text-accent', spin: true },
  verifying: { label: 'VERIFYING', cls: 'text-accent', spin: true },
  done:      { label: 'DONE ✓',    cls: 'text-ok' },
  failed:    { label: 'FAILED ✗',  cls: 'text-err' },
  skipped:   { label: 'SKIPPED',   cls: 'text-dim opacity-60' },
  aborted:   { label: 'ABORTED',   cls: 'text-warn' },
};

export default function PartitionTable({ rows, busy, onToggle }: Props) {
  const selCount = rows.filter((r) => r.selected).length;

  return (
    <div className="panel flex min-h-0 flex-1 flex-col">
      <div className="panel-title justify-between">
        <span className="flex items-center gap-1.5"><Table2 size={12} /> Partition Map</span>
        <span className="normal-case tracking-normal text-[9px]">
          {selCount}/{rows.length} selected · block size 4096 B
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="ptable w-full border-collapse text-[10px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className="w-7" aria-label="select" />
              <th>Partition</th>
              <th>File</th>
              <th className="text-right">Size</th>
              <th className="text-right">Offset</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const meta = STATUS_META[r.status];
              return (
                <tr key={r.id} className={!r.selected ? 'opacity-50' : ''}>
                  <td className="text-center">
                    <input
                      type="checkbox"
                      checked={r.selected}
                      disabled={busy}
                      onChange={(e) => onToggle(r.id, e.target.checked)}
                      className="h-3 w-3 cursor-pointer accent-[#00d9ff] disabled:cursor-not-allowed"
                      title={busy ? 'Locked while operation runs' : `Include ${r.partition} in flash job`}
                    />
                  </td>
                  <td className="font-bold text-[#e6edf3]">{r.partition}</td>
                  <td className="max-w-[130px] truncate text-dim" title={r.file}>
                    {r.file}
                    {r.realSize && <span className="ml-1 rounded-sm border border-accent/40 px-1 text-[8px] text-accent" title="Size taken from the actual uploaded file">REAL</span>}
                  </td>
                  <td className="text-right tabular-nums text-[#c9d1d9]" title={`${toBlocks(r.sizeBytes).toLocaleString('en-US')} blocks`}>
                    {fmtBytes(r.sizeBytes)}
                  </td>
                  <td className="text-right font-mono text-[#a5d6ff]/80">{fmtHex(r.offsetBytes)}</td>
                  <td>
                    <span className={`inline-flex items-center gap-1 font-semibold ${meta.cls}`}>
                      {meta.spin && <Loader2 size={9} className="animate-spin" />}
                      {meta.label}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
