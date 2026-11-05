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
