import { eq } from 'drizzle-orm';
import { db, schema } from '../db/index.js';

export const PROFILES = {
  low: { uploads: 1, backups: 1, thumbnails: 1 },
  balanced: { uploads: 3, backups: 2, thumbnails: 2 },
  high: { uploads: 6, backups: 4, thumbnails: 4 },
};

export const DEFAULTS = {
  performanceProfile: 'balanced',
  autoThrottle: true,
  theme: 'dark',
  registrationOpen: false,
  chatEnabled: false,
  defaultQuota: 0,
};

export function getSetting(key) {
  const row = db.select().from(schema.settings).where(eq(schema.settings.key, key)).get();
  if (!row) return DEFAULTS[key];
  try {
    return JSON.parse(row.value);
  } catch {
    return row.value;
  }
}

export function getAllSettings() {
  const out = { ...DEFAULTS };
  for (const row of db.select().from(schema.settings).all()) {
    try {
      out[row.key] = JSON.parse(row.value);
    } catch {
      out[row.key] = row.value;
    }
  }
  return out;
}

export function setSetting(key, value) {
  const now = Date.now();
  db.insert(schema.settings)
    .values({ key, value: JSON.stringify(value), updatedAt: now })
    .onConflictDoUpdate({ target: schema.settings.key, set: { value: JSON.stringify(value), updatedAt: now } })
    .run();
  return value;
}

export function profileLimits() {
  const profile = getSetting('performanceProfile');
  return { ...PROFILES[profile] || PROFILES.balanced, profile };
}
