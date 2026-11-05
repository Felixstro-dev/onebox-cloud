/* Felix Modern UI: Upload-Fenster unten rechts (ohne Abhängigkeiten, Icons eingebaut).
   Zeigt jede Datei als Schritt (wartet, lädt, fertig, Fehler), Gesamtprozent und geschätzte Restzeit.

   const up = UploadPanel.create({ lang: 'de-DE', closeAfterMs: 6000 });
   const id = up.add({ name: 'urlaub.zip', size: 52428800 });     // legt die Zeile an und öffnet das Fenster
   up.progress(id, geladeneBytes);  up.done(id);  up.fail(id, 'Verbindung unterbrochen');  up.cancel(id);
   up.onCancel = id => …;  up.onRetry = id => …;  up.onCancelAll = () => …;

   UploadPanel.uploadFiles(files, { url: '/api/upload', field: 'file', headers: {}, concurrency: 3, panel: up })
     lädt per XMLHttpRequest hoch (fetch kennt keinen Upload-Fortschritt), speist das Fenster, unterstützt Abbrechen und erneut Versuchen. */
(function (g) {
  const I = { upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/>', check: '<path d="M20 6 9 17l-5-5"/>', chev: '<path d="m18 15-6-6-6 6"/>', x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>' };
  const svg = (n, c) => `<svg class="${c || ''}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[n]}</svg>`;
  const E = (t, c, h) => { const e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; };

  function create(opt) {
    const o = Object.assign({ lang: document.documentElement.lang || 'de-DE', closeAfterMs: 6000, texts: {} }, opt || {});
    const T = Object.assign({ title: 'Lädt hoch', of: 'von', allDone: 'Alle Dateien hochgeladen', failed: 'fehlgeschlagen', waiting: 'Wartet', calc: 'Berechne Dauer …', almost: 'gleich fertig', left: 'noch etwa', cancel: 'Uploads abbrechen', sure: 'Wirklich abbrechen?', collapse: 'Liste ein- oder ausklappen', close: 'Schließen', retry: 'Erneut versuchen', canceled: 'Abgebrochen', files: 'Dateien', file: 'Datei' }, o.texts);
    const nf = new Intl.NumberFormat(o.lang, { maximumFractionDigits: 1 }), pf = new Intl.NumberFormat(o.lang, { style: 'percent' });
    const bytes = n => { const u = ['B', 'KB', 'MB', 'GB', 'TB']; let i = 0; while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; } return nf.format(n) + '\u00a0' + u[i]; };
    const dur = s => { s = Math.round(s); if (s < 3) return T.almost; const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60; return T.left + ' ' + (h ? `${h}\u00a0Std. ${m}\u00a0Min.` : m ? `${m}\u00a0Min. ${sec ? sec + '\u00a0Sek.' : ''}` : `${sec}\u00a0Sek.`); };

    const root = E('section', 'up'); root.setAttribute('role', 'region'); root.setAttribute('aria-label', T.title);
    root.innerHTML = `<div class="up__head"><span class="up__icon">${svg('upload')}</span><div><p class="up__title"></p><p class="up__sub"></p></div>
      <div class="up__actions"><button type="button" class="up__btn" data-a="collapse" aria-expanded="true" aria-label="${T.collapse}">${svg('chev', 'up-chev')}</button><button type="button" class="up__btn" data-a="close" aria-label="${T.cancel}">${svg('x')}</button></div></div>
      <div class="up__bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-label="Gesamtfortschritt"><i></i></div>
      <div class="up__list-wrap"><div><ul class="up__list"></ul></div></div><div class="up__live" role="status" aria-live="polite"></div>`;
    document.body.append(root);
    const $ = s => root.querySelector(s), list = $('.up__list'), bar = $('.up__bar'), live = $('.up__live'), closeBtn = $('[data-a="close"]');
    const files = new Map(); let seq = 0, closeT = 0, confirmT = 0, lastSpoken = -1, startT = 0, speed = 0, last = { t: 0, b: 0 }, tick = 0;
    const api = { onCancel: null, onRetry: null, onCancelAll: null, onClose: null, el: root };

    const total = () => [...files.values()].reduce((s, f) => s + f.size, 0), loaded = () => [...files.values()].reduce((s, f) => s + (f.state === 'done' ? f.size : Math.min(f.loaded, f.size)), 0);
    const count = st => [...files.values()].filter(f => f.state === st).length;
    const busy = () => count('active') + count('queued') > 0;

    function render() {
      const all = [...files.values()], t = total(), l = loaded(), p = t ? l / t : 0, nDone = count('done'), nErr = count('error'), act = busy();
      root.style.setProperty('--p', p.toFixed(4)); bar.firstElementChild.style.setProperty('--p', p.toFixed(4)); bar.setAttribute('aria-valuenow', Math.round(p * 100));
      root.dataset.state = act ? 'active' : nErr ? 'error' : all.length ? 'done' : 'idle';
      $('.up__title').textContent = act ? `${T.title} · ${Math.min(all.length, nDone + count('error') + count('canceled') + 1)} ${T.of} ${all.length}` : nErr ? `${nErr} ${nErr === 1 ? T.file : T.files} ${T.failed}` : T.allDone;
      const sub = $('.up__sub');
      if (act) { const el = (performance.now() - startT) / 1000, rem = speed > 0 && el > 1.5 ? (t - l) / speed : null;
        sub.innerHTML = `<b>${pf.format(p).replace(/\s/g, '\u00a0')}</b> · ` + (rem == null ? `<span class="shimmer-text">${T.calc}</span>` : `${dur(rem)} · ${bytes(speed)}/s`); }
      else sub.innerHTML = `${bytes(t)} · ${all.length} ${all.length === 1 ? T.file : T.files}`;
      closeBtn.setAttribute('aria-label', act ? T.cancel : T.close);
      const pct = Math.floor(p * 10) * 10; if (pct !== lastSpoken && act) { lastSpoken = pct; live.textContent = `${pct} Prozent`; } if (!act && lastSpoken !== -2) { lastSpoken = -2; live.textContent = $('.up__title').textContent; }
    }
    function row(f) {
      const li = f.li; li.dataset.state = f.state;
      const pct = f.size ? f.loaded / f.size : 0;
      li.querySelector('.up__file-bar > i').style.setProperty('--p', pct.toFixed(4));
      const side = li.querySelector('.up__side'), meta = li.querySelector('.up__meta');
      if (f.state === 'queued') { side.textContent = T.waiting; meta.textContent = bytes(f.size); }
      else if (f.state === 'active') { side.textContent = pf.format(pct).replace(/\s/g, '\u00a0'); meta.textContent = `${bytes(f.loaded)} ${T.of} ${bytes(f.size)}`; }
      else if (f.state === 'done') { side.textContent = bytes(f.size); meta.textContent = ''; }
      else if (f.state === 'canceled') { side.textContent = ''; meta.textContent = T.canceled; }
      else { side.innerHTML = `<button type="button" class="up__retry" data-a="retry">${T.retry}</button>`; meta.textContent = f.error || ''; }
    }
    function clock() { clearInterval(tick); tick = setInterval(() => { const now = performance.now(), b = loaded(), dt = (now - last.t) / 1000; if (dt > 0) { const inst = (b - last.b) / dt; speed = speed ? speed * .75 + inst * .25 : inst; } last = { t: now, b }; render(); if (!busy()) clearInterval(tick); }, 500); }
    function reset() { startT = performance.now(); speed = 0; last = { t: startT, b: loaded() }; lastSpoken = -1; }
    function open() { clearTimeout(closeT); root.classList.add('is-open'); }
    function close() { root.classList.remove('is-open'); clearTimeout(closeT); setTimeout(() => { if (!busy() && !root.classList.contains('is-open')) { files.clear(); list.innerHTML = ''; } }, 400); api.onClose && api.onClose(); }
    function maybeAutoClose() { clearTimeout(closeT); if (!busy() && !count('error') && o.closeAfterMs) closeT = setTimeout(() => { if (!root.matches(':hover') && !root.contains(document.activeElement)) close(); else maybeAutoClose(); }, o.closeAfterMs); }

    api.add = f => {
      const wasBusy = busy(); if (!wasBusy) { [...files.entries()].forEach(([k, v]) => { if (v.state !== 'error') { v.li.remove(); files.delete(k); } }); }
      const id = 'u' + (++seq), li = E('li', 'up__item', `<span class="up__mark"></span><div style="min-width:0"><div class="up__name"></div><span class="up__meta"></span><div class="up__file-bar"><i></i></div></div><div class="up__side"></div>`);
      li.querySelector('.up__name').textContent = f.name; li.querySelector('.up__name').title = f.name; li.dataset.id = id; list.append(li);
      files.set(id, { id, name: f.name, size: f.size || 0, loaded: 0, state: 'queued', li }); row(files.get(id)); if (!wasBusy) reset(); clock(); open(); render(); return id;
    };
    api.progress = (id, b) => { const f = files.get(id); if (!f) return; if (f.state === 'queued') f.state = 'active'; f.loaded = b; row(f); render(); };
    api.start = id => { const f = files.get(id); if (f && f.state === 'queued') { f.state = 'active'; row(f); render(); } };
    api.done = id => { const f = files.get(id); if (!f) return; f.state = 'done'; f.loaded = f.size; row(f); render(); maybeAutoClose(); };
    api.fail = (id, msg) => { const f = files.get(id); if (!f) return; f.state = 'error'; f.error = msg || ''; row(f); render(); };
    api.cancel = id => { const f = files.get(id); if (!f) return; f.state = 'canceled'; row(f); render(); maybeAutoClose(); };
    api.retry = id => { const f = files.get(id); if (!f) return; const wasBusy = busy(); f.state = 'queued'; f.loaded = 0; f.error = ''; row(f); if (!wasBusy) reset(); clock(); render(); api.onRetry && api.onRetry(id); };
    api.open = open; api.close = close; api.collapse = c => { root.classList.toggle('is-collapsed', c); $('[data-a="collapse"]').setAttribute('aria-expanded', !root.classList.contains('is-collapsed')); };

    root.addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'collapse') api.collapse(!root.classList.contains('is-collapsed'));
      else if (a.dataset.a === 'retry') api.retry(a.closest('.up__item').dataset.id);
      else if (a.dataset.a === 'close') {
        if (!busy()) return close();
        if (!a.classList.contains('is-confirm')) { a.classList.add('is-confirm'); a.textContent = T.sure; confirmT = setTimeout(() => { a.classList.remove('is-confirm'); a.innerHTML = svg('x'); }, 3000); }
        else { clearTimeout(confirmT); a.classList.remove('is-confirm'); a.innerHTML = svg('x'); [...files.values()].filter(f => f.state === 'active' || f.state === 'queued').forEach(f => { api.onCancel && api.onCancel(f.id); api.cancel(f.id); }); api.onCancelAll && api.onCancelAll(); }
      }
    });
    root.addEventListener('mouseleave', maybeAutoClose);
    return api;
  }

  /* XMLHttpRequest-Upload mit Warteschlange, Fortschritt, Abbrechen und erneut Versuchen */
  function uploadFiles(fileList, opt) {
    const o = Object.assign({ url: '/upload', field: 'file', headers: {}, concurrency: 3, withCredentials: false, panel: null, formData: null }, opt || {});
    const panel = o.panel || create(); const queue = [], xhrs = new Map(); let running = 0; const results = [];
    const enqueue = file => { const id = panel.add({ name: file.name, size: file.size }); queue.push({ id, file }); return id; };
    function next() {
      while (running < o.concurrency && queue.length) {
        const { id, file } = queue.shift(); running++; panel.start(id);
        const x = new XMLHttpRequest(); xhrs.set(id, x); x.open('POST', o.url); x.withCredentials = o.withCredentials;
        Object.entries(o.headers).forEach(([k, v]) => x.setRequestHeader(k, v));
        x.upload.onprogress = e => { if (e.lengthComputable) panel.progress(id, Math.min(e.loaded, file.size)); };
        const end = () => { running--; xhrs.delete(id); next(); };
        x.onload = () => { x.status >= 200 && x.status < 300 ? (panel.done(id), results.push({ file, ok: true, response: x.response })) : (panel.fail(id, `Fehler ${x.status}`), results.push({ file, ok: false })); end(); };
        x.onerror = () => { panel.fail(id, 'Verbindung unterbrochen'); results.push({ file, ok: false }); end(); };
        x.onabort = () => { running--; xhrs.delete(id); next(); };
        const fd = o.formData ? o.formData(file) : (() => { const f = new FormData(); f.append(o.field, file, file.name); return f; })(); x.send(fd);
      }
    }
    const byId = new Map(); [...fileList].forEach(f => byId.set(enqueue(f), f));
    panel.onCancel = id => { const x = xhrs.get(id); if (x) x.abort(); const i = queue.findIndex(q => q.id === id); if (i > -1) queue.splice(i, 1); };
    panel.onRetry = id => { queue.push({ id, file: byId.get(id) }); next(); };
    next(); return { panel, results };
  }
  g.UploadPanel = { create, uploadFiles };
})(window);
