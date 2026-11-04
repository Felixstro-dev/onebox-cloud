import fs from 'node:fs';
import path from 'node:path';
import Fastify from 'fastify';
import cookie from '@fastify/cookie';
import websocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import compress from '@fastify/compress';
import { config } from './config.js';
import { sessionUser, COOKIE } from './services/auth.js';
import { HttpError } from './lib/errors.js';
import { registerRoutes } from './routes/index.js';
import { realtime } from './services/realtime.js';

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

  app.addContentTypeParser('application/offset+octet-stream', (req, payload, done) => done(null, payload));
  app.addContentTypeParser('application/octet-stream', (req, payload, done) => done(null, payload));
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'string' }, (req, body, done) => done(null, Object.fromEntries(new URLSearchParams(body))));
  app.addContentTypeParser('*', (req, payload, done) => done(null, payload));

  app.addHook('onRequest', async (req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Referrer-Policy', 'same-origin');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    if (config.secureCookies) reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    if (!req.url.startsWith('/api/v1/public/') && !req.url.startsWith('/dav')) {
      reply.header('Content-Security-Policy', "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; script-src 'self'; connect-src 'self' ws: wss:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    }
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
    if (MUTATING.has(req.method) && req.user) {
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
