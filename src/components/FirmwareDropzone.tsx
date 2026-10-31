/**
 * FirmwareDropzone.tsx — center-top: drag&drop zone with REAL File API work.
 *  • reads name/size/lastModified from the actual file
 *  • triggers head-512-byte analysis + hex dump (parent owns state)
 *  • computes a genuine SHA-256 via crypto.subtle in 4 MB chunks with progress
 *  • separate scatter/manifest (.txt/.xml) loader that fills the partition table
 */

import { useCallback, useRef, useState } from 'react';
import { UploadCloud, FileArchive, X, Hash, ScanFile, Loader2, CheckCircle2 } from 'lucide-react';
import type { FileAnalysis, FlashState, HashProgress } from '../types';
import { fmtBytes } from '../lib/fileAnalyzer';

interface Props {
  analysis: FileAnalysis | null;
  hash: HashProgress;
  sha256: string | null;
  state: FlashState;
  busy: boolean;
  onFile: (file: File) => void;          // firmware image dropped
  onScatter: (file: File) => void;       // scatter/manifest dropped
  onClear: () => void;
}

export default function FirmwareDropzone({
  analysis, hash, sha256, busy, onFile, onScatter, onClear,
}: Props) {
  const [dragOver, setDragOver] = useState<'img' | 'scatter' | null>(null);
  const imgInput = useRef<HTMLInputElement>(null);
  const scatInput = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback((e: React.DragEvent, mode: 'img' | 'scatter') => {
    e.preventDefault();
    setDragOver(null);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    if (mode === 'img') onFile(f); else onScatter(f);
  }, [onFile, onScatter]);

  return (
    <div className="panel flex min-h-0 flex-col">
      <div className="panel-title justify-between">
        <span className="flex items-center gap-1.5"><FileArchive size={12} /> Firmware Package</span>
        {analysis && (
          <button className="btn !py-0 text-[9px]" onClick={onClear} disabled={busy} title="Unload package">
            <X size={10} /> Unload
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-2 p-2">
        {/* Main drop zone */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => imgInput.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && imgInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver('img'); }}
          onDragLeave={() => setDragOver((d) => (d === 'img' ? null : d))}
          onDrop={(e) => handleDrop(e, 'img')}
          className={`relative flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1 rounded-sm
                     border border-dashed p-3 text-center transition-colors duration-150
                     ${dragOver === 'img'
                        ? 'border-accent bg-accent/10 text-accent'
                        : analysis
                          ? 'border-ok/50 bg-ok/5'
                          : 'border-edge bg-panel2/50 text-dim hover:border-[#484f58] hover:bg-panel2'}`}
        >
          <input ref={imgInput} type="file" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.currentTarget.value = '';
          }} />
          {analysis ? (
            <>
              <CheckCircle2 size={16} className="text-ok" />
              <div className="max-w-full truncate text-[11px] font-bold text-[#e6edf3]">{analysis.name}</div>
              <div className="text-[10px] text-dim">
                {fmtBytes(analysis.sizeBytes)} · {analysis.sizeMb.toFixed(2)} MB · {analysis.sizeBytes.toLocaleString('en-US')} bytes
              </div>
              <div className="text-[10px] text-dim">modified {new Date(analysis.lastModified).toISOString().replace('T', ' ').slice(0, 19)}</div>
              <div className={`mt-0.5 rounded-sm border px-1.5 py-0.5 text-[10px]
                ${analysis.kind === 'unknown' ? 'border-warn/40 text-warn' : 'border-accent/40 text-accent'}`}>
                {analysis.kindLabel}
              </div>
              <div className="text-[9px] text-dim">blocks: {Math.ceil(analysis.sizeBytes / 4096).toLocaleString('en-US')} × 4096 B</div>
            </>
          ) : (
            <>
              <UploadCloud size={20} className={dragOver === 'img' ? 'text-accent' : 'text-dim'} />
              <div className="text-[11px]">
                {dragOver === 'img' ? 'Release to load image' : 'Drop firmware image (.img / .tar / .bin) or click to browse'}
              </div>
              <div className="text-[9px] text-dim">Processed locally via File API — magic bytes, hex dump and real SHA-256</div>
            </>
          )}
        </div>

        {/* Scatter / manifest loader */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => scatInput.current?.click()}
          onKeyDown={(e) => e.key === 'Enter' && scatInput.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragOver('scatter'); }}
          onDragLeave={() => setDragOver((d) => (d === 'scatter' ? null : d))}
          onDrop={(e) => handleDrop(e, 'scatter')}
          className={`flex cursor-pointer items-center justify-between gap-2 rounded-sm border border-dashed px-2 py-1.5
                     text-[10px] transition-colors duration-150
                     ${dragOver === 'scatter' ? 'border-accent bg-accent/10 text-accent' : 'border-edge bg-panel2/50 text-dim hover:border-[#484f58]'}`}
        >
          <input ref={scatInput} type="file" accept=".txt,.xml" hidden onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onScatter(f);
            e.currentTarget.value = '';
          }} />
          <span className="flex items-center gap-1.5"><ScanFile size={12} /> Load scatter / manifest (.txt / .xml)</span>
          <span className="text-[9px] opacity-70">parses partition_name / file / size / start_addr</span>
        </div>

        {/* Real SHA-256 status */}
        <div className="rounded-sm border border-edge bg-panel2 px-2 py-1.5">
          <div className="flex items-center justify-between text-[10px]">
            <span className="flex items-center gap-1.5 text-dim"><Hash size={11} /> SHA-256 (computed over real file)</span>
            {hash.active && <Loader2 size={11} className="animate-spin text-accent" />}
          </div>
          {hash.active && (
            <div className="mt-1 h-1 w-full overflow-hidden rounded bg-edge">
              <div className="h-full bg-accent transition-all duration-150" style={{ width: `${(hash.fraction * 100).toFixed(1)}%` }} />
            </div>
          )}
          {hash.active && <div className="mt-0.5 text-right text-[9px] text-accent">{(hash.fraction * 100).toFixed(1)}%</div>}
          {sha256 && !hash.active && (
            <div className="mt-1 break-all font-mono text-[10px] leading-snug text-[#7ee787]" title={sha256}>
              {sha256.slice(0, 32)}…{sha256.slice(-16)}
            </div>
          )}
          {!sha256 && !hash.active && <div className="mt-1 text-[9px] text-dim">Digest appears after a package is loaded.</div>}
        </div>
      </div>
    </div>
  );
}
