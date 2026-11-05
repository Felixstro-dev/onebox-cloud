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
