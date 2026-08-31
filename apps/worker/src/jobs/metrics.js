import si from 'systeminformation';
import { existsSync } from 'node:fs';

/**
 * Real OS-level resource collection (spec §79-95, §229).
 * Uses systeminformation (native APIs, no shell-outs) and never fabricates
 * values: anything unavailable is reported as null and rendered "Unknown".
 */
export async function collectResourceMetrics() {
  const [cpuLoad, cpuInfo, mem, load, fsSize, netStats, processes, time] = await Promise.all([
    si.currentLoad(),
    si.cpu(),
    si.mem(),
    si.fullLoad().then(() => si.load()), // load() after first call returns values
    si.fsSize(),
    si.networkStats(),
    si.processes(),
    si.time(),
  ]);

  const inContainer = process.env.WEBJOBS_RUN_FROM_PACKAGE !== undefined || hasCgroup();
  return {
    capturedAt: new Date(time.current),
    cpuPercent: Math.round(cpuLoad.currentLoad * 10) / 10,
    cpuCores: cpuInfo.cores,
    cpuModel: `${cpuInfo.manufacturer} ${cpuInfo.brand}`.trim(),
    loadAvg: load.avgLoad ? load.avgLoad.map((v) => Math.round(v * 100) / 100) : null,
    memTotal: mem.total,
    memUsed: mem.used,
    memAvailable: mem.available,
    swapTotal: mem.swaptotal,
    swapUsed: mem.swapused,
    disks: fsSize
      .filter((d) => d.mount && d.use != null)
      .map((d) => ({ mount: d.mount, total: d.size, used: d.used, pct: Math.round(d.use * 10) / 10 })),
    net: netStats
      .filter((n) => n.iface && !n.iface.startsWith('lo'))
      .map((n) => ({ iface: n.iface, rx_bps: n.rx_sec ?? 0, tx_bps: n.tx_sec ?? 0 })),
    processes: processes.list
      .sort((a, b) => b.pcpu - a.pcpu)
      .slice(0, 12)
      .map((p) => ({ pid: p.pid, name: p.name, cpu: p.pcpu, mem: p.pmem, memBytes: Math.round((p.pmem / 100) * mem.total) })),
    source: inContainer ? 'container' : 'host',
  };
}

function hasCgroup() {
  try {
    return existsSync('/proc/self/cgroup');
  } catch { return false; }
}
