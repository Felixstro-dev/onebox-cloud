import { JobQueue, ResourceManager } from './resources.js';
import { ThumbnailService } from './thumbnails.js';
import { getSetting, profileLimits, setSetting } from './settings.js';

const limits = profileLimits();

export const jobs = {
  backups: new JobQueue('backups', limits.backups),
  ingest: new JobQueue('ingest', limits.backups),
};

export const thumbnails = new ThumbnailService(limits);

export const resources = new ResourceManager(
  { ...jobs, thumbnails: thumbnails.queue },
  profileLimits,
  () => Boolean(getSetting('autoThrottle')),
);

export function applyPerformance(profile) {
  const allowed = ['low', 'balanced', 'high'];
  if (!allowed.includes(profile)) throw new Error('Unknown performance profile.');
  setSetting('performanceProfile', profile);
  const next = profileLimits();
  thumbnails.applyLimits(next);
  resources.applyProfile();
  return next;
}

export function jobStats() {
  return {
    queues: {
      backups: jobs.backups.stats(),
      ingest: jobs.ingest.stats(),
      thumbnails: thumbnails.stats(),
    },
    limits: profileLimits(),
    throttled: resources.throttled,
  };
}
