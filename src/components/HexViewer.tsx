/**
 * HexViewer.tsx — classic offset | hex | ASCII panel fed by the first 512 real
 * bytes of the dropped firmware file.
 */

import { useState } from 'react';
import { Binary, ChevronDown, ChevronUp } from 'lucide-react';

interface Props {
  lines: string[]; // pre-built "00000000  xx xx …  |ascii|" rows
}

export default function HexViewer({ lines }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="panel flex min-h-0 flex-col">
      <button
        className="panel-title justify-between hover:bg-[#21262d]"
        onClick={() => setCollapsed((c) => !c)}
        title={collapsed ? 'Expand hex dump' : 'Collapse hex dump'}
      >
        <span className="flex items-center gap-1.5"><Binary size={12} /> Hex Dump · head 512 B</span>
        {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </button>
      {!collapsed && (
        <div className="min-h-0 flex-1 overflow-auto p-1.5 text-[10px] leading-[1.45]">
          <pre className="m-0 whitespace-pre font-mono text-[#7ee787]">
            <span className="select-none text-dim">
              {'offset    00 01 02 03 04 05 06 07  08 09 0a 0b 0c 0d 0e 0f  ascii\n'}
              {'────────  ──────────────────────  ──────────────────────  ────\n'}
            </span>
            {lines.join('\n')}
          </pre>
        </div>
      )}
    </div>
  );
}
