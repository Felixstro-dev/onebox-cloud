import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import compress from '@fastify/compress';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { config } from './config.js';
import { sessionUser, COOKIE } from './services/auth.js';
import { HttpError } from './lib/errors.js';
import { registerRoutes } from './routes/index.js';
import { realtime } from './services/realtime.js';
import { maintenanceState, maintenancePage, maintenanceSecondsLeft } from './services/updates.js';

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export async function buildApp({ logger = true } = {}) {
  const app = Fastify({
    logger: logger ? { level: config.logLevel, redact: ['req.headers.cookie', 'req.headers.authorization'] } : false,
    trustProxy: config.trustProxy,
    bodyLimit: 2 * 1024 * 1024,
    disableRequestLogging: true,
  });

  await app.register(cookie);
  await app.register(websocket, { options: { maxPayload: 64 * 1024 } });
  await app.register(compress, { threshold: 1024 });

  // Sicherheitsheader zentral über Helmet. Die CSP erlaubt nur eigene
  // Skripte, eigene Verbindungen (inkl. WebSocket) und Bilder/Medien aus
  // Blob-URLs der Vorschau. Inhalte Dritter werden nie eingebunden.
  await app.register(helmet, {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        formAction: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        mediaSrc: ["'self'", 'blob:'],
        styleSrc: ["'self'", "'unsafe-inline'"],
        fontSrc: ["'self'", 'data:'],
        scriptSrc: ["'self'"],
        connectSrc: ["'self'", 'ws:', 'wss:'],
        workerSrc: ["'self'", 'blob:'],
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'same-origin' },
    xFrameOptions: { action: 'deny' },
    hsts: config.secureCookies ? { maxAge: 31536000, includeSubDomains: true } : false,
  });
  // Login und öffentliche Endpunkte aktivieren das Limit gezielt per Route.
  await app.register(rateLimit, { global: false, max: 120, timeWindow: '1 minute' });

  app.addContentTypeParser('application/offset+octet-stream', (req, payload, done) => done(null, payload));
  app.addContentTypeParser('application/octet-stream', (req, payload, done) => done(null, payload));
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => done(null, Object.fromEntries(new URLSearchParams(body))));
  app.addContentTypeParser('*', (req, payload, done) => done(null, payload));

  app.addHook('onRequest', async (req, reply) => {
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (config.secureCookies) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  });

  // Während eines Updates antwortet die Instanz mit einer eigenständigen
  // Wartungsseite. API- und Health-Aufrufe bleiben erlaubt, damit Docker und
  // die Wartungsseite den Fortschritt prüfen können.
  app.addHook('onRequest', async (req, reply) => {
    const state = maintenanceState();
    if (!state.active) return;
    const url = String(req.url || '').split('?')[0];
    const allowed = url === '/maintenance'
      || url === '/api/v1/system/maintenance'
      || url === '/api/v1/system/health';
    if (allowed) return;
    const seconds = maintenanceSecondsLeft();
    reply.header('Retry-After', String(seconds || 30));
    reply.header('Cache-Control', 'no-store');
    if (url.startsWith('/api/')) {
      return reply.status(503).send({
        error: { code: 'maintenance', message: 'Onebox wird gerade aktualisiert. Bitte in wenigen Sekunden erneut versuchen.' },
        maintenance: { ...state, seconds },
      });
    }
    if (req.method === 'GET' || req.method === 'HEAD') return reply.redirect('/maintenance');
    return reply.status(503).type('text/html').send(maintenancePage());
  });

  app.addHook('onSend', async (request, reply, payload) => {
    const url = String(request.url || '').split('?')[0];
    if (reply.statusCode === 200 && (url.startsWith('/assets/') || url.startsWith('/icons/') || url === '/favicon.ico' || url === '/manifest.webmanifest')) {
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
    }
    return payload;
  });

  app.decorateRequest('user', null);
  app.addHook('preHandler', async (req) => {
    req.user = sessionUser(req);
    // WebDAV authentifiziert jede Anfrage per HTTP Basic Auth.
    if (MUTATING.has(req.method) && req.user && !req.url.startsWith('/dav')) {
      const header = req.headers['x-onebox-csrf'];
      if (header !== '1') throw new HttpError(403, 'csrf', 'Missing request verification header.');
      const origin = req.headers.origin;
      if (origin) {
        const host = req.headers['x-forwarded-host'] || req.headers.host;
        try {
          if (new URL(origin).host !== host) throw new HttpError(403, 'csrf', 'Origin does not match.');
        } catch {
          throw new HttpError(403, 'csrf', 'Origin does not match.');
        }
      }
    }
  });

  app.setErrorHandler((error, req, reply) => {
    if (error instanceof HttpError) {
      return reply.status(error.status).send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    if (error.statusCode && error.statusCode < 500) {
      return reply.status(error.statusCode).send({ error: { code: 'request_error', message: error.message } });
    }
    req.log.error(error);
    return reply.status(500).send({ error: { code: 'internal', message: 'Something went wrong on the server.' } });
  });

  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/')) {
      return reply.status(404).send({ error: { code: 'not_found', message: 'Endpoint not found.' } });
    }
    if (req.url.startsWith('/dav')) return reply.status(404).send('Not found');
    return reply.type('text/html').send(fs.existsSync(path.join(config.webDir, 'index.html')) ? fs.readFileSync(path.join(config.webDir, 'index.html')) : 'Onebox is running. Build the web app with npm run build.');
  });

  await registerRoutes(app);

  if (fs.existsSync(config.webDir)) {
    await app.register(fastifyStatic, { root: config.webDir, prefix: '/', wildcard: true, index: false, setHeaders: (res, filePath, stat) => {
      // Nur gehashte Assets (z. B. index-ABC123.js) sind immutable.
      // index.html und andere Einstiegspunkte dürfen nicht gecacht werden,
      // sonst sieht der Browser nach einem Update die alte Version.
      if (filePath.endsWith('.html')) {
        res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
      } else if (/[.-][A-Za-z0-9]{8,}\.(js|css|woff2?|png|jpg|jpeg|svg|webp)$/.test(filePath)) {
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        res.setHeader('Cache-Control', 'public, max-age=3600');
      }
    } });
    const sendIndex = (req, reply) => {
      reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      return reply.sendFile('index.html');
    };
    app.get('/', sendIndex);
  }

  app.addHook('onClose', async () => realtime.close());

  return app;
}
