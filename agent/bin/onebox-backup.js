#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';

const URL = (process.env.ONEBOX_AGENT_URL || '').replace(/\/$/, '');
const TOKEN = process.env.ONEBOX_AGENT_TOKEN || '';
const VERSION = '1.1.0';
if (!URL || !TOKEN) { console.error('ONEBOX_AGENT_URL / TOKEN fehlen'); process.exit(1); }

async function api(route, opts = {}) {
  const full = URL + route;
  const res = await fetch(full, {
    ...opts,
    headers: { Authorization: 'Bearer ' + TOKEN, 'X-Agent-Version': VERSION, ...(opts.headers || {}) },
  });
  if (!res.ok) throw new Error(`Agent API ${route}: ${res.status}`);
  return res.json ? res.json() : res.text();
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    const hash = crypto.createHash('sha256');
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

function shouldIgnore(name, patternsString) {
  if (!patternsString) return false;
  const patterns = patternsString.split('\n').map(s => s.trim()).filter(Boolean);
  for (const pat of patterns) {
    if (pat === name || pat === '/' + name) return true;
    if (pat.endsWith('/')) { if (name === pat.slice(0, -1) || name.startsWith(pat.slice(0, -1) + '/')) return true; }
    if (name.endsWith(pat.replace('*', '')) || name.includes(pat.replace('*', ''))) return true;
  }
  return false;
}

async function uploadFile(filePath, relativePath) {
  const hash = await hashFile(filePath);
  const stats = fs.statSync(filePath);
  await api(`/api/v1/agents/me/file?path=${encodeURIComponent(relativePath)}&hash=${hash}&size=${stats.size}&mime=application/octet-stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: fs.createReadStream(filePath),
    duplex: 'half',
  });
  console.log('Upload:', relativePath);
}

async function scanAndUpload(paths, excludes = '') {
  for (const p of (paths || [])) {
    if (!fs.existsSync(p)) continue;
    const base = p.replace(/\/$/, '');
    function walk(dir, rel) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (shouldIgnore(entry.name, excludes)) continue;
        const full = path.join(dir, entry.name);
        const relPath = rel ? rel + '/' + entry.name : entry.name;
        if (entry.isDirectory()) walk(full, relPath);
        else if (entry.isFile()) uploadFile(full, relPath);
      }
    }
    walk(base, '');
  }
}

async function run() {
  console.log('Agent startet (v' + VERSION + ') ...');
  const agentInfo = await api('/api/v1/agents/me');
  const excludes = agentInfo.agent?.excludes || '';
  console.log('Agent verbunden:', agentInfo.agent.name, '| Pfade:', agentInfo.paths);
  await scanAndUpload(agentInfo.paths, excludes);
  await api('/api/v1/agents/me/complete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ files: 0, bytes: 0, deleted: 0 }) });
  console.log('Agent bereit.');
}

run().catch((e) => { console.error('Agent Fehler:', e.message || e); process.exit(1); });
