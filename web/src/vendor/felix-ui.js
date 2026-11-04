/* Felix Modern UI: sheet.js, effects.js, preloader.js */
/* ===== sheet.js ===== */
/* Felix Modern UI: gestengesteuertes Bottom-Sheet im iOS-Stil (ohne Abhängigkeiten).
   Verhalten: folgt dem Finger 1:1, rastet an Detents ein, berücksichtigt Wischgeschwindigkeit,
   Gummiband über der obersten Stufe, jederzeit unterbrechbar, Fokus und Escape wie bei einem Dialog.
   CSS-Gegenstück: .sheet, .sheet__grab, .sheet-scrim, .behind in components.css.

   const sheet = new Sheet(el, { detents: [.5, 1], handle: el.querySelector('.sheet__grab'),
                                 scrim: scrimEl, behind: mainEl, onClose() {} });
   sheet.open(); sheet.close(); sheet.snap(1);   // snap(index) springt zu einem Detent
   detents = sichtbarer Anteil der Sheet-Höhe (aufsteigend, letzter Wert meist 1). */
(function (global) {
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const rubber = (x, d) => (1 - 1 / ((x * 0.55) / d + 1)) * d;   // iOS-Gummiband
  const root = document.documentElement;

  function Sheet(el, opts) {
    const o = Object.assign({ detents: [1], initial: 0, handle: null, scrim: null, behind: null, onClose() {} }, opts || {});
    const handle = o.handle || el;
    let isOpen = false, dragging = false, startY = 0, startPos = 0, samples = [], opener = null;

    const h = () => el.offsetHeight;
    const yFor = d => h() * (1 - d);
    const topY = () => yFor(o.detents[o.detents.length - 1]);
    const currentY = () => new DOMMatrixReadOnly(getComputedStyle(el).transform).m42;
    const setY = y => { el.style.transform = `translateY(${y}px)`; };
    const progress = y => clamp(1 - y / h(), 0, 1);
    const setProgress = p => root.style.setProperty('--sheet-p', p.toFixed(4));

    function show(state) {
      isOpen = state;
      el.dataset.open = state;
      if (o.scrim) o.scrim.dataset.open = state;
      if (o.behind) { o.behind.classList.add('behind'); o.behind.inert = state; }
      el.setAttribute('aria-hidden', String(!state));
      el.inert = !state;
    }
    function snap(i) {
      const d = o.detents[clamp(i, 0, o.detents.length - 1)];
      el.classList.remove('dragging'); root.classList.remove('sheet-dragging');
      setY(yFor(d)); setProgress(d);
    }
    function open(i) {
      opener = document.activeElement; show(true);
      requestAnimationFrame(() => { snap(i == null ? o.initial : i); el.focus({ preventScroll: true }); });
    }
    function close() {
      if (!isOpen) return;
      el.classList.remove('dragging'); root.classList.remove('sheet-dragging');
      show(false); setY(h()); setProgress(0);
      if (opener && opener.focus) opener.focus({ preventScroll: true });
      o.onClose();
    }

    handle.addEventListener('pointerdown', e => {
      if (!isOpen || (e.pointerType === 'mouse' && e.button !== 0) || e.target.closest('button, a, input, textarea, select')) return;
      dragging = true; handle.setPointerCapture(e.pointerId);
      const y = currentY();                                  // laufende Animation einfrieren (unterbrechbar)
      el.classList.add('dragging'); root.classList.add('sheet-dragging');
      setY(y); setProgress(progress(y));
      startY = e.clientY; startPos = y; samples = [{ t: e.timeStamp, y }];
    });
    handle.addEventListener('pointermove', e => {
      if (!dragging) return;
      let y = startPos + (e.clientY - startY);
      if (y < topY()) y = topY() - rubber(topY() - y, 120);   // Gummiband nach oben
      setY(y); setProgress(progress(y));
      samples.push({ t: e.timeStamp, y });
      while (samples.length > 2 && e.timeStamp - samples[0].t > 100) samples.shift();
    });
    function release(e) {
      if (!dragging) return; dragging = false;
      const a = samples[0], b = samples[samples.length - 1];
      const v = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0;       // px pro ms
      const projected = b.y + v * 200;                            // wohin die Geste „ausrollen“ würde
      const stops = o.detents.map(d => ({ y: yFor(d), i: o.detents.indexOf(d) })).concat([{ y: h(), i: -1 }]);
      const best = stops.reduce((m, s) => (Math.abs(s.y - projected) < Math.abs(m.y - projected) ? s : m));
      if (best.i === -1) close(); else snap(best.i);
    }
    handle.addEventListener('pointerup', release);
    handle.addEventListener('pointercancel', release);
    el.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
    if (o.scrim) o.scrim.addEventListener('click', close);
    if (!el.hasAttribute('tabindex')) el.tabIndex = -1;
    el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); show(false);
    return { open, close, snap, get isOpen() { return isOpen; } };
  }
  global.Sheet = Sheet;
})(window);

/* ===== effects.js ===== */
/* Felix Modern UI: kleine Helfer für Effekte (ohne Abhängigkeiten).
   splitWords(el)       zerlegt Text in maskierte Wörter für .split / .split-in
   replay(el, cls)      spielt eine CSS-Animation erneut ab
   themeSwitch(btn, fn) Hell/Dunkel-Wechsel mit Kreis-Reveal ab Knopfposition (View Transitions API, sonst sofort)
   blurUp(root)         setzt .ready auf .blur-up-Bildern, sobald sie geladen sind */
(function (g) {
  function splitWords(el) {
    const words = el.textContent.trim().split(/\s+/); el.setAttribute('aria-label', el.textContent.trim()); el.textContent = '';
    words.forEach((w, i) => { const m = document.createElement('span'); m.className = 'mask'; m.setAttribute('aria-hidden', 'true'); const s = document.createElement('span'); s.textContent = w; s.style.setProperty('--i', i); m.append(s); el.append(m, ' '); });
    el.classList.add('split'); return el;
  }
  function replay(el, cls) { el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  function themeSwitch(btn, fn) {
    const r = btn.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return fn();
    const root = document.documentElement; root.style.setProperty('--tx', x + 'px'); root.style.setProperty('--ty', y + 'px'); root.classList.add('theme-reveal');
    const vt = document.startViewTransition(fn), R = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    vt.ready.then(() => root.animate({ clipPath: [`circle(0 at ${x}px ${y}px)`, `circle(${R}px at ${x}px ${y}px)`] }, { duration: 420, easing: 'cubic-bezier(.22,1,.36,1)', pseudoElement: '::view-transition-new(root)' }));
    vt.finished.finally(() => root.classList.remove('theme-reveal'));
  }
  function blurUp(root) { (root || document).querySelectorAll('img.blur-up').forEach(i => { const ok = () => i.classList.add('ready'); i.complete ? ok() : i.addEventListener('load', ok, { once: true }); }); }
  g.FX = { splitWords, replay, themeSwitch, blurUp };
})(window);

/* ===== preloader.js ===== */
/* Felix Modern UI: Preloader und Seitenrand-Fortschritt (ohne Abhängigkeiten).
   Der Zähler zeigt ECHTEN Fortschritt: geladene Bilder, Schriften und das load-Ereignis. Es gibt keine erfundenen Prozente.
   Preloader.start({ minMs: 900, maxMs: 4000, once: 'pl', onDone })  Mindestdauer gegen Flackern, Höchstdauer gegen Blockieren, once = nur einmal pro Sitzung
   TopBar.start() / TopBar.done()                        schlanke Linie am oberen Rand bei Seitenwechseln oder Anfragen */
(function (g) {
  const root = document.documentElement, reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const Preloader = {
    start(o) {
      o = Object.assign({ minMs: 900, maxMs: 4000, once: '', onDone() {} }, o || {});
      const el = document.querySelector('.preloader'); if (!el) return o.onDone();
      if (o.once) { try { if (sessionStorage.getItem(o.once)) { el.hidden = true; root.classList.remove('is-loading'); return o.onDone(); } sessionStorage.setItem(o.once, '1'); } catch (e) {} }  // nur einmal pro Sitzung
      const count = el.querySelector('.preloader__count'), bar = el.querySelector('.preloader__bar');
      const t0 = performance.now(); let shown = 0, finished = false, fontsOk = false, loadOk = document.readyState === 'complete';
      root.classList.add('is-loading'); el.hidden = false; el.classList.remove('is-done');
      document.fonts && document.fonts.ready.then(() => fontsOk = true); if (!document.fonts) fontsOk = true;
      if (!loadOk) addEventListener('load', () => loadOk = true, { once: true });
      const imgs = [...document.images];
      const target = () => { const total = imgs.length + 2, done = imgs.filter(i => i.complete).length + (fontsOk ? 1 : 0) + (loadOk ? 1 : 0); return done / total; };
      const finish = () => { if (finished) return; finished = true; el.classList.add('is-done'); root.classList.remove('is-loading');
        const end = () => { el.hidden = true; o.onDone(); document.dispatchEvent(new Event('preloader:done')); };
        reduce() ? end() : el.addEventListener('transitionend', e => { if (e.target === el) end(); }, { once: true }); setTimeout(() => { if (!el.hidden) end(); }, 900); };
      (function frame(now) {
        if (finished) return; const el_ = now - t0; shown += (Math.min(target(), el_ / o.minMs) - shown) * .18;  // nie schneller als echt geladen, nie schneller als die Mindestdauer
        const pct = Math.min(100, Math.round(shown * 100)); if (count) count.textContent = String(pct).padStart(3, '0'); if (bar) bar.style.setProperty('--p', shown.toFixed(3));
        if ((shown > .985 && el_ >= o.minMs) || el_ >= o.maxMs) { if (count) count.textContent = '100'; if (bar) bar.style.setProperty('--p', 1); return finish(); }
        requestAnimationFrame(frame);
      })(t0);
    }
  };
  const TopBar = { el: null, p: 0, t: 0,
    start() { this.el = this.el || document.querySelector('.topbar-progress'); if (!this.el) return; clearInterval(this.t); this.p = .08; this.set(); this.el.classList.add('on'); this.t = setInterval(() => { this.p += (0.9 - this.p) * .08; this.set(); }, 200); },
    done() { if (!this.el) return; clearInterval(this.t); this.p = 1; this.set(); setTimeout(() => { this.el.classList.remove('on'); setTimeout(() => { this.p = 0; this.set(); }, 250); }, 220); },
    set() { this.el.firstElementChild.style.setProperty('--p', this.p.toFixed(3)); } };
  g.Preloader = Preloader; g.TopBar = TopBar;
})(window);
