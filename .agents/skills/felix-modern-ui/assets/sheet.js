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
