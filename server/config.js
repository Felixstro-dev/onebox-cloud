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
  version: process.env.ONEB_VERSION || '0.2.8',
  updateRepo: process.env.UPDATE_CHECK_REPO || 'Felixstro-dev/onebox-cloud',
  updateApiUrl: process.env.UPDATE_API_URL || '',
  updateApiToken: process.env.UPDATE_API_TOKEN || '',
  updateDelaySeconds: int(process.env.UPDATE_DELAY_SECONDS, 30),
};

export const paths = {
  db: path.join(config.dataDir, 'onebox.db'),
  uploads: path.join(config.dataDir, 'uploads'),
  thumbs: path.join(config.dataDir, 'thumbs'),
  backupSnapshots: path.join(config.dataDir, 'snapshots'),
  runtime: path.join(config.dataDir, 'runtime'),
};

/**
 * Validiert die Umgebungsvariablen beim Start. Fehler werden gesammelt und
 * mit einer klaren Meldung abgebrochen, statt später undefiniert zu laufen.
 */
export function configErrors() {
  const errors = [];
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) {
    errors.push('PORT muss eine Zahl zwischen 1 und 65535 sein.');
  }
  if (!Number.isInteger(config.sessionDays) || config.sessionDays < 1 || config.sessionDays > 365) {
    errors.push('SESSION_DAYS muss zwischen 1 und 365 liegen.');
  }
  if (!Number.isInteger(config.maxUploadBytes) || config.maxUploadBytes < 0) {
    errors.push('MAX_UPLOAD_BYTES muss eine nicht-negative Ganzzahl sein.');
  }
  if (config.baseUrl) {
    try {
      const url = new URL(config.baseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('protocol');
    } catch {
      errors.push('BASE_URL muss eine gültige http(s)-URL sein.');
    }
  }
  if (!config.dataDir || !config.filesDir) {
    errors.push('DATA_DIR und FILES_DIR müssen gesetzt sein.');
  }
  return errors;
}

export function assertValidConfig() {
  const errors = configErrors();
  if (errors.length) {
    throw new Error(`Ungültige Konfiguration:\n- ${errors.join('\n- ')}`);
  }
  if (!config.secureCookies && process.env.NODE_ENV === 'production') {
    console.warn('[onebox] Warnung: SECURE_COOKIES ist in Produktion nicht aktiv. Setze SECURE_COOKIES=1 hinter HTTPS.');
  }
}
