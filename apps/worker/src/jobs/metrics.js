import si from 'systeminformation';
import { readFile } from 'node:fs/promises';
import os from 'node:os';

/**
 * Real OS-level resource collection (spec §79-95, §229).
 *
 * Design rules:
 *  - Never fabricate a value. Anything unmeasurable is reported as null and
 *    rendered "Unknown" by the panel.
 *  - Never let one failing probe blank out the whole snapshot: each probe is
 *    settled independently, so a missing `fsSize` cannot hide a valid CPU
 *    reading (the previous Promise.all rejected as a unit and stored nothing).
 *  - Inside a container, prefer the cgroup limit over the host's total, so RAM
 *    percentages describe the container the operator actually pays for.
 */

/**
 * When the worker runs in a container, `systeminformation` reads the
 * container's own /proc and reports the container's slice — not the VPS.
 * Mounting the host's /proc at HOST_PROC lets us read the real figures.
 * (systeminformation itself has no such option, so CPU/RAM/load are parsed
 * directly here; everything else still comes from the library.)
 */
const HOST_PROC = process.env.HOST_PROC || null;

/** Read the host's /proc/meminfo, in bytes. */
async function hostMeminfo() {
  if (!HOST_PROC) return null;
  const raw = await readFile(`${HOST_PROC}/meminfo`, 'utf8').catch(() => null);
  if (!raw) return null;
  const kb = {};
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\w+):\s+(\d+) kB$/);
    if (m) kb[m[1]] = Number(m[2]) * 1024;
  }
  if (!kb.MemTotal) return null;
  return {
    total: kb.MemTotal,
    available: kb.MemAvailable ?? null,
    // "used" excluding cache/buffers — the figure that reflects real pressure.
    active: kb.MemTotal - (kb.MemAvailable ?? kb.MemFree ?? 0),
    swaptotal: kb.SwapTotal ?? null,
    swapused: kb.SwapTotal != null && kb.SwapFree != null ? kb.SwapTotal - kb.SwapFree : null,
  };
}

/** Read the host's load average from /proc/loadavg. */
async function hostLoadAvg() {
  if (!HOST_PROC) return null;
  const raw = await readFile(`${HOST_PROC}/loadavg`, 'utf8').catch(() => null);
  const parts = raw?.trim().split(/\s+/).slice(0, 3).map(Number);
  return parts?.length === 3 && parts.every(Number.isFinite) ? parts : null;
}

/**
 * Host CPU utilisation from two /proc/stat samples. A single sample only gives
 * cumulative jiffies since boot, so the previous reading is retained and the
 * delta between calls becomes the percentage.
 */
let lastCpuStat = null;
async function hostCpuPercent() {
  if (!HOST_PROC) return null;
  const raw = await readFile(`${HOST_PROC}/stat`, 'utf8').catch(() => null);
  const line = raw?.split('\n').find((l) => l.startsWith('cpu '));
  if (!line) return null;
  const v = line.trim().split(/\s+/).slice(1).map(Number);
  if (v.length < 4 || v.some((n) => !Number.isFinite(n))) return null;
  const idle = v[3] + (v[4] ?? 0);          // idle + iowait
  const total = v.reduce((s, n) => s + n, 0);
  const prev = lastCpuStat;
  lastCpuStat = { idle, total };
  if (!prev) return null;                    // need two samples
  const dTotal = total - prev.total;
  const dIdle = idle - prev.idle;
  if (dTotal <= 0) return null;
  return Math.min(100, Math.max(0, Math.round((1 - dIdle / dTotal) * 1000) / 10));
}

/** Count the host's CPUs from /proc/cpuinfo. */
async function hostCpuCores() {
  if (!HOST_PROC) return null;
  const raw = await readFile(`${HOST_PROC}/cpuinfo`, 'utf8').catch(() => null);
  if (!raw) return null;
  const n = (raw.match(/^processor\s*:/gm) ?? []).length;
  return n > 0 ? n : null;
}

/** Run a probe with a hard timeout; resolve to null instead of throwing. */
async function probe(name, fn, timeoutMs = 4000) {
  try {
    return await Promise.race([
      fn(),
      new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} probe timed out`)), timeoutMs)),
    ]);
  } catch {
    return null;
  }
}

/** Process-list collection is the most expensive probe; sample it sparingly. */
let processCache = { at: 0, list: null };
const PROCESS_SAMPLE_MS = 10_000;

export async function collectResourceMetrics({ withProcesses = true } = {}) {
  const container = await detectContainer();

  const [cpuLoad, cpuInfo, mem, fsSize, netStats, processes,
    hostMem, hostLoad, hostCpu, hostCoreCount] = await Promise.all([
    probe('currentLoad', () => si.currentLoad()),
    probe('cpu', () => si.cpu()),
    probe('mem', () => si.mem()),
    probe('fsSize', () => si.fsSize()),
    probe('networkStats', () => si.networkStats()),
    withProcesses ? sampleProcesses() : Promise.resolve(null),
    probe('hostMeminfo', hostMeminfo),
    probe('hostLoadAvg', hostLoadAvg),
    probe('hostCpuPercent', hostCpuPercent),
    probe('hostCpuCores', hostCpuCores),
  ]);

  // load average: prefer the host's /proc/loadavg, else os.loadavg() — a Node
  // built-in always present on Linux/macOS. (The old si.load() does not exist
  // and rejected every cycle, which is why no metrics were ever stored.)
  const rawLoad = hostLoad ?? (typeof os.loadavg === 'function' ? os.loadavg() : null);
  const loadAvg = Array.isArray(rawLoad) && rawLoad.every(Number.isFinite)
    ? rawLoad.map((v) => Math.round(v * 100) / 100)
    : null;

  // Host figures first, then narrow to the container's own limits when set.
  const hostMemTotal = hostMem?.total ?? mem?.total ?? os.totalmem();
  const memTotal = container.memLimit && container.memLimit < hostMemTotal ? container.memLimit : hostMemTotal;
  const memUsed = container.memUsage != null && container.memLimit && container.memLimit < hostMemTotal
    ? container.memUsage
    // `mem.used` counts cache/buffers; active is what pressure actually means.
    : (hostMem?.active ?? mem?.active ?? mem?.used ?? (hostMemTotal - os.freemem()));
  const memAvailable = hostMem?.available ?? mem?.available ?? Math.max(memTotal - memUsed, 0);

  // `resource_metrics.cpu_cores` is an int column, so the fractional cgroup
  // quota (e.g. 1.5 CPUs) is rounded up for storage and kept exact in
  // cpuQuota for the panel's load-ratio maths.
  const hostCores = hostCoreCount ?? cpuInfo?.cores ?? os.cpus()?.length ?? null;
  const cpuCores = container.cpuQuota ? Math.max(1, Math.ceil(container.cpuQuota)) : hostCores;

  const cpuPercent = hostCpu != null ? hostCpu
    : (cpuLoad?.currentLoad != null && Number.isFinite(cpuLoad.currentLoad)
      ? Math.min(100, Math.round(cpuLoad.currentLoad * 10) / 10)
      : null);

  return {
    capturedAt: new Date(),
    cpuPercent,
    cpuCores,
    hostCores,
    cpuQuota: container.cpuQuota ? Math.round(container.cpuQuota * 100) / 100 : null,
    cpuModel: cpuInfo ? `${cpuInfo.manufacturer ?? ''} ${cpuInfo.brand ?? ''}`.trim() || null : null,
    loadAvg,
    memTotal,
    memUsed,
    memAvailable,
    swapTotal: hostMem?.swaptotal ?? mem?.swaptotal ?? null,
    swapUsed: hostMem?.swapused ?? mem?.swapused ?? null,
    disks: (fsSize ?? [])
      .filter((d) => d.mount && d.use != null && d.size > 0)
      // Ignore container overlay/pseudo mounts that duplicate the root figure.
      .filter((d) => !/^\/(?:proc|sys|dev|run)(?:\/|$)/.test(d.mount))
      .map((d) => ({ mount: d.mount, total: d.size, used: d.used, pct: Math.round(d.use * 10) / 10 })),
    net: (netStats ?? [])
      .filter((n) => n.iface && !n.iface.startsWith('lo'))
      .map((n) => ({
        iface: n.iface,
        // rx_sec is -1 on the very first sample; report null, not a fake 0.
        rx_bps: n.rx_sec >= 0 ? Math.round(n.rx_sec) : null,
        tx_bps: n.tx_sec >= 0 ? Math.round(n.tx_sec) : null,
      })),
    processes: (processes ?? []).map((p) => ({
      pid: p.pid,
      name: p.name,
      cpu: Math.round((p.pcpu ?? 0) * 10) / 10,
      mem: Math.round((p.pmem ?? 0) * 10) / 10,
      memBytes: p.memRss != null ? p.memRss * 1024 : Math.round(((p.pmem ?? 0) / 100) * hostMemTotal),
    })),
    // Reading the host's /proc from inside a container means these figures
    // describe the VPS, so they are labelled 'host' regardless of packaging.
    source: !container.inContainer || HOST_PROC ? 'host' : 'container',
  };
}

/** Top processes by CPU, cached so the 2s metric loop stays cheap. */
async function sampleProcesses() {
  if (processCache.list && Date.now() - processCache.at < PROCESS_SAMPLE_MS) return processCache.list;
  const result = await probe('processes', () => si.processes(), 6000);
  const list = (result?.list ?? [])
    .sort((a, b) => (b.pcpu ?? 0) - (a.pcpu ?? 0))
    .slice(0, 12);
  // Keep the previous sample rather than flashing an empty table on a miss.
  if (result) processCache = { at: Date.now(), list };
  return processCache.list ?? list;
}

/**
 * Detect containerization and read the cgroup limits (v2 first, then v1).
 * Docker Compose deployments are the norm for this project, so reporting the
 * host's 64 GB when the container is capped at 2 GB would be actively
 * misleading on the VPS page.
 */
async function detectContainer() {
  const out = { inContainer: false, memLimit: null, memUsage: null, cpuQuota: null };

  const dockerEnv = await readFile('/.dockerenv').then(() => true).catch(() => false);
  const cgroup = await readFile('/proc/self/cgroup', 'utf8').catch(() => '');
  out.inContainer = dockerEnv
    || /docker|kubepods|containerd|lxc/.test(cgroup)
    || process.env.KUBERNETES_SERVICE_HOST != null;

  const num = async (path) => {
    const raw = (await readFile(path, 'utf8').catch(() => '')).trim();
    if (!raw || raw === 'max' || raw === '-1') return null;
    const n = Number(raw.split(/\s+/)[0]);
    return Number.isFinite(n) && n > 0 ? n : null;
  };

  // cgroup v2
  out.memLimit = await num('/sys/fs/cgroup/memory.max');
  out.memUsage = await num('/sys/fs/cgroup/memory.current');
  const cpuMax = (await readFile('/sys/fs/cgroup/cpu.max', 'utf8').catch(() => '')).trim();
  if (cpuMax && !cpuMax.startsWith('max')) {
    const [quota, period] = cpuMax.split(/\s+/).map(Number);
    if (quota > 0 && period > 0) out.cpuQuota = quota / period;
  }

  // cgroup v1 fallback
  if (out.memLimit == null) {
    const v1 = await num('/sys/fs/cgroup/memory/memory.limit_in_bytes');
    // v1 reports an absurd sentinel (~8 EiB) when no limit is set.
    out.memLimit = v1 && v1 < Number.MAX_SAFE_INTEGER / 2 ? v1 : null;
    out.memUsage = await num('/sys/fs/cgroup/memory/memory.usage_in_bytes');
  }
  if (out.cpuQuota == null) {
    const quota = await num('/sys/fs/cgroup/cpu/cpu.cfs_quota_us');
    const period = await num('/sys/fs/cgroup/cpu/cpu.cfs_period_us');
    if (quota && period) out.cpuQuota = quota / period;
  }

  return out;
}
