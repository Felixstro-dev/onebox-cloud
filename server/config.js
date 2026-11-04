import path from 'node:path';

const bool = (value, fallback = false) => {
  if (value === undefined) return fallback;
  return /^(1|true|yes|on)$/i.test(value);
};

const int = (value, fallback) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) ? n : fallback;
};

const root = process.cwd();

export const config = {
  port: int(process.env.PORT, 8080),
  host: process.env.HOST || '0.0.0.0',
  dataDir: path.resolve(process.env.DATA_DIR || path.join(root, 'data')),
  filesDir: path.resolve(process.env.FILES_DIR || path.join(root, 'files')),
  webDir: path.resolve(process.env.WEB_DIR || path.join(root, 'dist')),
  baseUrl: (process.env.BASE_URL || '').replace(/\/$/, ''),
  trustProxy: bool(process.env.TRUST_PROXY, false),
  secureCookies: bool(process.env.SECURE_COOKIES, false),
  sessionDays: int(process.env.SESSION_DAYS, 30),
  maxUploadBytes: int(process.env.MAX_UPLOAD_BYTES, 0),
  logLevel: process.env.LOG_LEVEL || 'info',
  version: '0.1.0',
  setupToken: process.env.SETUP_TOKEN || '',
};

export const paths = {
  db: path.join(config.dataDir, 'onebox.db'),
  uploads: path.join(config.dataDir, 'uploads'),
  thumbs: path.join(config.dataDir, 'thumbs'),
  backupSnapshots: path.join(config.dataDir, 'snapshots'),
  runtime: path.join(config.dataDir, 'runtime'),
};
