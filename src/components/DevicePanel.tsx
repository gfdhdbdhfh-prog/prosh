/**
 * DevicePanel.tsx — left column: Detect Device flow, optional WebUSB descriptor
 * scan (read-only), device info card and Connection/Driver/Auth badges.
 */

import { useCallback, useState } from 'react';
import {
  Search, Usb, Smartphone, BatteryCharging, Cpu, HardDrive, MemoryStick,
  ShieldCheck, CircleSlash, Loader2, RotateCcw,
} from 'lucide-react';
import type { DeviceInfo, LinkStatus } from '../types';

interface Props {
  device: DeviceInfo | null;
  link: LinkStatus;
  detecting: boolean;
  busy: boolean; // an operation is running → disable re-detect
  onDetect: () => void;
  /** Invoked when a real WebUSB descriptor was captured. */
  onWebUsbDevice: (d: DeviceInfo) => void;
}

/** Minimal structural typing for navigator.usb (not in default lib.dom). */
interface UsbDeviceLike {
  vendorId: number;
  productId: number;
  productName?: string;
  manufacturerName?: string;
}
interface NavigatorUsbLike {
  requestDevice(options: { filters: Array<Record<string, number>> }): Promise<UsbDeviceLike>;
}

const Badge = ({ label, state, okText, badText, pendText }: {
  label: string;
  state: 'ok' | 'bad' | 'pend' | 'search';
  okText: string; badText: string; pendText: string;
}) => {
  const map = {
    ok:     { cls: 'border-ok/40 text-ok bg-ok/10',            text: okText },
    bad:    { cls: 'border-err/40 text-err bg-err/10',         text: badText },
    pend:   { cls: 'border-warn/40 text-warn bg-warn/10',      text: pendText },
    search: { cls: 'border-accent/40 text-accent bg-accent/10',text: 'SEARCHING…' },
  }[state];
  return (
    <span className={`badge ${map.cls}`}>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {label}: {map.text}
    </span>
  );
};

function KV({ k, v, mono, vClass, icon }: {
  k: string; v: string; mono?: boolean; vClass?: string; icon?: React.ReactNode;
}) {
  return (
    <div className="kv">
      <dt className="flex items-center gap-1">{icon}{k}</dt>
      <dd className={`${mono ? 'tracking-tight' : ''} ${vClass ?? ''}`}>{v}</dd>
    </div>
  );
}

export default function DevicePanel({ device, link, detecting, busy, onDetect, onWebUsbDevice }: Props) {
  const [usbError, setUsbError] = useState<string | null>(null);

  /** Optional real WebUSB path — reads descriptors ONLY (no control transfers). */
  const scanWebUsb = useCallback(async (): Promise<void> => {
    setUsbError(null);
    const nav = navigator as Navigator & { usb?: NavigatorUsbLike };
    if (!nav.usb || typeof nav.usb.requestDevice !== 'function') {
      setUsbError('WebUSB not supported in this browser');
      return;
    }
    try {
      // Broad vendor filter so most Android/download-mode devices can be offered.
      const d = await nav.usb.requestDevice({ filters: [{ classCode: 0xff }] });
      const info: DeviceInfo = {
        model: d.productName ?? 'NF-X7 Pro',
        codename: 'aurora',
        soc: 'SNX-8250',
        ram: '12 GB',
        storage: 'UFS 3.1 256GB',
        serial: ((d.vendorId << 16) | d.productId).toString(16).toUpperCase().padStart(8, '0'),
        bootloader: 'UNLOCKED',
        currentFw: '14.0.3_TKQ1.221013',
        battery: device?.battery ?? 87,
        mode: 'DOWNLOAD',
        port: 'USB (WebUSB)',
        usb: {
          vendorId: d.vendorId,
          productId: d.productId,
          productName: d.productName,
          manufacturerName: d.manufacturerName,
        },
      };
      onWebUsbDevice(info);
    } catch (e) {
      // User cancelled the chooser or no device matched — keep working on mock.
      setUsbError(`WebUSB unavailable (${e instanceof Error ? e.name : 'error'}) — using simulated device`);
    }
  }, [device, onWebUsbDevice]);

  return (
    <aside className="panel flex h-full min-h-0 w-full flex-col lg:w-[280px] lg:shrink-0">
      <div className="panel-title"><Smartphone size={12} /> Device &amp; Connection</div>

      <div className="flex flex-col gap-2 p-2">
        {/* Action row */}
        <div className="flex gap-1.5">
          <button
            className="btn btn-accent flex-1 justify-center"
            onClick={onDetect}
            disabled={detecting || busy}
            title={busy ? 'Unavailable while an operation is running' : detecting ? 'Scanning USB bus…' : 'Enumerate download-mode device'}
          >
            {detecting ? <Loader2 size={12} className="animate-spin" /> : <Search size={12} />}
            {detecting ? 'SCANNING…' : 'Detect Device'}
          </button>
          <button
            className="btn justify-center"
            onClick={() => void scanWebUsb()}
            disabled={busy}
            title="Read real USB descriptors via WebUSB (optional, read-only)"
          >
            <Usb size={12} /> Scan USB
          </button>
        </div>
        {usbError && <div className="text-[10px] leading-snug text-warn">{usbError}</div>}

        {/* Detection animation skeleton */}
        {detecting && (
          <div className="scan-sweep relative overflow-hidden rounded-sm border border-edge bg-panel2 p-3">
            {[90, 70, 80, 50].map((w, i) => (
              <div key={i} className="mb-2 h-2 rounded bg-edge/60" style={{ width: `${w}%` }} />
            ))}
            <div className="mt-1 text-[10px] text-accent">Querying USB bus / enumerating interfaces…</div>
          </div>
        )}

        {/* Device card */}
        {device && !detecting && (
          <dl className="rounded-sm border border-edge bg-panel2 px-2.5 py-2 text-[11px]">
            <div className="mb-1 flex items-center justify-between border-b border-edge pb-1">
              <span className="font-bold tracking-wide text-[#e6edf3]">{device.model}</span>
              <span className="badge border-accent/40 text-accent">{device.mode}</span>
            </div>
            <KV k="Codename" v={device.codename} />
            <KV k="SoC" v={device.soc} icon={<Cpu size={11} className="text-dim" />} />
            <KV k="RAM" v={device.ram} icon={<MemoryStick size={11} className="text-dim" />} />
            <KV k="Storage" v={device.storage} icon={<HardDrive size={11} className="text-dim" />} />
            <KV k="Serial" v={device.serial} mono />
            <KV k="Bootloader" v={device.bootloader} vClass={device.bootloader === 'UNLOCKED' ? 'text-ok' : 'text-warn'} />
            <KV k="Current FW" v={device.currentFw} mono />
            <div className="kv">
              <dt className="flex items-center gap-1"><BatteryCharging size={11} className="text-dim" /> Battery</dt>
              <dd className={device.battery < 20 ? 'text-err' : device.battery < 50 ? 'text-warn' : 'text-ok'}>{device.battery}%</dd>
            </div>
            {device.usb && (
              <div className="mt-1 border-t border-edge pt-1 text-[10px] leading-relaxed text-dim">
                Real descriptor · VID 0x{device.usb.vendorId.toString(16).padStart(4, '0')} ·
                PID 0x{device.usb.productId.toString(16).padStart(4, '0')}
                {device.usb.productName ? ` · ${device.usb.productName}` : ''}
              </div>
            )}
          </dl>
        )}

        {!device && !detecting && (
          <div className="rounded-sm border border-dashed border-edge p-3 text-center text-[10px] leading-relaxed text-dim">
            No device detected.<br />
            Connect phone in DOWNLOAD mode and press <span className="text-accent">Detect Device</span>.
          </div>
        )}

        {/* Status badges */}
        <div className="flex flex-wrap gap-1">
          <Badge label="Connection"
            state={link.connection === 'connected' ? 'ok' : link.connection === 'searching' ? 'search' : 'bad'}
            okText="ONLINE" badText="OFFLINE" pendText="—" />
          <Badge label="Driver" state={link.driver === 'ok' ? 'ok' : 'pend'}
            okText="NFlash v2.1" badText="MISSING" pendText="LOADING" />
          <Badge label="Auth" state={link.auth === 'granted' ? 'ok' : link.auth === 'denied' ? 'bad' : 'pend'}
            okText="GRANTED" badText="DENIED" pendText="PENDING" />
        </div>

        {device && (
          <button className="btn justify-center text-[10px]" onClick={onDetect} disabled={busy}
            title={busy ? 'Operation in progress' : 'Re-enumerate the device'}>
            <RotateCcw size={11} /> Re-detect device
          </button>
        )}
      </div>

      <div className="mt-auto border-t border-edge p-2 text-[9px] leading-relaxed text-dim">
        <ShieldCheck size={10} className="mr-1 inline text-ok" />
        Simulation environment. No actual device operations are performed.
        <br />
        <CircleSlash size={10} className="mr-1 mt-1 inline text-warn" />
        Do not rely on this tool for real service work.
      </div>
    </aside>
  );
}
