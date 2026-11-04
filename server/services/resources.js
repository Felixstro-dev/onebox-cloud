import fs from 'node:fs';
import os from 'node:os';

export class JobQueue {
  constructor(name, concurrency = 1) {
    this.name = name;
    this.concurrency = concurrency;
    this.peakConcurrency = concurrency;
    this.running = new Map();
    this.waiting = [];
    this.completed = 0;
    this.failed = 0;
  }

  setConcurrency(next) {
    this.concurrency = Math.max(1, next);
    this.peakConcurrency = Math.max(this.peakConcurrency, this.concurrency);
    this.drain();
  }

  add(fn, meta = {}) {
    return new Promise((resolve, reject) => {
      this.waiting.push({ fn, meta, resolve, reject });
      this.drain();
    });
  }

  drain() {
    while (this.running.size < this.concurrency && this.waiting.length) {
      const job = this.waiting.shift();
      const id = `${this.name}-${this.completed + this.failed + this.running.size + 1}`;
      this.running.set(id, job.meta);
      Promise.resolve()
        .then(job.fn)
        .then((value) => {
          this.completed += 1;
          job.resolve(value);
        })
        .catch((error) => {
          this.failed += 1;
          job.reject(error);
        })
        .finally(() => {
          this.running.delete(id);
          this.drain();
        });
    }
  }

  stats() {
    return {
      name: this.name,
      concurrency: this.concurrency,
      running: this.running.size,
      waiting: this.waiting.length,
      completed: this.completed,
      failed: this.failed,
    };
  }
}

function readFirst(paths) {
  for (const file of paths) {
    try {
      return fs.readFileSync(file, 'utf8').trim();
    } catch {
      // Try the next cgroup path.
    }
  }
  return null;
}

const cgroupFiles = {
  memoryMax: ['/sys/fs/cgroup/memory.max', '/sys/fs/cgroup/memory/memory.limit_in_bytes'],
  memoryCurrent: ['/sys/fs/cgroup/memory.current', '/sys/fs/cgroup/memory/memory.usage_in_bytes'],
  cpuMax: ['/sys/fs/cgroup/cpu.max', '/sys/fs/cgroup/cpu/cpu.cfs_quota_us'],
  cpuStat: ['/sys/fs/cgroup/cpu.stat', '/sys/fs/cgroup/cpuacct/cpuacct.usage'],
};

export class ResourceManager {
  constructor(queues, getLimits, getAutoThrottle) {
    this.queues = queues;
    this.getLimits = getLimits;
    this.getAutoThrottle = getAutoThrottle;
    this.lastCpu = this.readCpuUsage();
    this.lastAt = Date.now();
    this.cpuPercent = 0;
    this.throttled = false;
    this.timer = setInterval(() => this.sample(), 2500);
    this.timer.unref?.();
    this.applyLimits();
  }

  readCpuUsage() {
    const raw = readFirst(cgroupFiles.cpuStat);
    if (raw?.startsWith('usage_usec')) {
      const match = /usage_usec\s+(\d+)/.exec(raw);
      if (match) return Number(match[1]) / 1000;
    }
    if (raw && /^\d+$/.test(raw)) return Number(raw) / 1000;
    const cpu = os.cpus();
    return cpu.reduce((sum, c) => sum + Object.values(c.times).reduce((a, b) => a + b, 0), 0) * (1000 / cpu.length);
  }

  memory() {
    let total = os.totalmem();
    let used = os.totalmem() - os.freemem();
    const limitRaw = readFirst(cgroupFiles.memoryMax);
    if (limitRaw && limitRaw !== 'max' && /^\d+$/.test(limitRaw)) {
      const limit = Number(limitRaw);
      if (limit > 0 && limit < total) total = limit;
      const current = Number(readFirst(cgroupFiles.memoryCurrent) || used);
      used = Math.min(current, total);
    }
    return { total, used, free: Math.max(0, total - used), percent: total ? Math.round((used / total) * 100) : 0 };
  }

  sample() {
    const now = Date.now();
    const current = this.readCpuUsage();
    const elapsed = Math.max(1, now - this.lastAt);
    const delta = Math.max(0, current - this.lastCpu);
    this.cpuPercent = Math.min(100, Math.round((delta / elapsed) * 100));
    this.lastCpu = current;
    this.lastAt = now;
    const mem = this.memory();
    const limits = this.getLimits();
    const throttled = this.getAutoThrottle() && (this.cpuPercent > 85 || mem.percent > 92);
    if (throttled !== this.throttled) {
      this.throttled = throttled;
      this.applyLimits();
    }
  }

  applyLimits() {
    const limits = this.getLimits();
    const factor = this.throttled ? 0.5 : 1;
    this.queues.backups?.setConcurrency(Math.max(1, Math.floor(limits.backups * factor)));
    this.queues.thumbnails?.setConcurrency(Math.max(1, Math.floor(limits.thumbnails * factor)));
    this.queues.ingest?.setConcurrency(Math.max(1, Math.floor(limits.backups * factor)));
  }

  applyProfile() {
    this.throttled = false;
    this.applyLimits();
  }

  metrics() {
    return {
      cpu: { percent: this.cpuPercent, cores: os.cpus().length },
      memory: this.memory(),
      throttled: this.throttled,
      autoThrottle: this.getAutoThrottle(),
      limits: this.getLimits(),
      queues: Object.fromEntries(Object.entries(this.queues).map(([key, queue]) => [key, queue.stats()])),
      uptime: Math.round(process.uptime()),
    };
  }
}
