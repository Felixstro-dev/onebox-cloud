import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';
import { paths } from '../config.js';
import { JobQueue } from './resources.js';
import { objectPath } from './storage.js';

class WorkerPool {
  constructor(max = 4) {
    this.max = max;
    this.idle = [];
    this.all = new Set();
    this.waiters = [];
    this.sequence = 0;
  }

  setMax(max) {
    this.max = Math.max(1, max);
  }

  spawn() {
    const worker = new Worker(new URL('./thumbnail-worker.js', import.meta.url));
    const entry = { worker, busy: null, timer: null };
    worker.on('message', (message) => {
      const job = entry.busy;
      entry.busy = null;
      if (job) message.ok ? job.resolve(message) : job.reject(new Error(message.error));
      this.release(entry);
    });
    worker.on('error', (error) => {
      const job = entry.busy;
      entry.busy = null;
      if (job) job.reject(error);
      this.destroy(entry);
    });
    worker.on('exit', () => this.all.delete(entry));
    this.all.add(entry);
    return entry;
  }

  release(entry) {
    if (!this.all.has(entry)) return;
    if (this.waiters.length) {
      const waiter = this.waiters.shift();
      waiter(entry);
      return;
    }
    entry.timer = setTimeout(() => this.destroy(entry), 30000);
    entry.timer.unref?.();
    this.idle.push(entry);
  }

  destroy(entry) {
    clearTimeout(entry.timer);
    this.idle = this.idle.filter((item) => item !== entry);
    this.all.delete(entry);
    entry.worker.terminate().catch(() => {});
  }

  acquire() {
    const idle = this.idle.pop();
    if (idle) {
      clearTimeout(idle.timer);
      return Promise.resolve(idle);
    }
    if (this.all.size < this.max) return Promise.resolve(this.spawn());
    return new Promise((resolve) => this.waiters.push(resolve));
  }

  async run(task) {
    const entry = await this.acquire();
    return new Promise((resolve, reject) => {
      entry.busy = { resolve, reject };
      entry.worker.postMessage({ taskId: ++this.sequence, ...task });
    });
  }

  close() {
    for (const entry of [...this.all]) this.destroy(entry);
  }
}

export class ThumbnailService {
  constructor(limits) {
    this.limits = limits;
    this.pool = new WorkerPool(limits.thumbnails);
    this.queue = new JobQueue('thumbnails', limits.thumbnails);
    this.inflight = new Map();
  }

  applyLimits(limits) {
    this.limits = limits;
    this.pool.setMax(limits.thumbnails);
    this.queue.setConcurrency(limits.thumbnails);
  }

  dir(nodeId) {
    return path.join(paths.thumbs, nodeId);
  }

  file(nodeId, size) {
    return path.join(this.dir(nodeId), `${size}.webp`);
  }

  async ensure(node, size = 768) {
    const target = this.file(node.id, size);
    if (fs.existsSync(target)) return target;
    if (!node.hash) return null;
    const key = `${node.id}:${size}`;
    if (this.inflight.has(key)) return this.inflight.get(key);
    const promise = this.queue.add(() => this.pool.run({ file: objectPath(node.hash), outputDir: this.dir(node.id), size }))
      .then(async (result) => {
        if (result.meta?.width && !node.width) {
          db.update(schema.nodes).set({ width: result.meta.width, height: result.meta.height, takenAt: node.takenAt || result.meta.takenAt || null }).where(eq(schema.nodes.id, node.id)).run();
        }
        return result.output;
      })
      .finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }

  async generateAll(node) {
    for (const size of [320, 768, 1600]) {
      await this.queue.add(() => this.pool.run({ file: objectPath(node.hash), outputDir: this.dir(node.id), size })).catch(() => {});
    }
  }

  async remove(nodeId) {
    await fsp.rm(this.dir(nodeId), { recursive: true, force: true });
  }

  stats() {
    return this.queue.stats();
  }

  close() {
    this.pool.close();
  }
}
