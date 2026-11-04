<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';
  import Button from './Button.svelte';

  export let node;
  export let contentUrl;
  export let onclose = () => {};

  let scroller = null;
  let pdf = null;
  let pageCount = 0;
  let current = 1;
  let loading = true;
  let error = '';
  let zoomMode = 'width';
  let zoomFactor = 1;
  let pageAspect = 1 / 1.414;

  let pageEls = [];
  let rendered = new Set();
  let rendering = new Set();
  let generation = 0;
  let observer = null;
  let resizeObserver = null;
  let lastWidth = 0;

  let query = '';
  let searching = false;
  let matches = [];
  let matchIndex = -1;
  let textCache = new Map();
  let searchTimer = null;

  $: zoomPercent = Math.round(zoomFactor * 100);

  onMount(() => {
    load();
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      clearTimeout(searchTimer);
      observer?.disconnect();
      resizeObserver?.disconnect();
      pdf?.destroy?.();
    };
  });

  onDestroy(() => {
    observer?.disconnect();
    resizeObserver?.disconnect();
    pdf?.destroy?.();
  });

  async function load() {
    loading = true;
    error = '';
    rendered = new Set();
    rendering = new Set();
    generation += 1;
    try {
      // pdfjs wird erst beim Öffnen einer PDF geladen. Skripte in Dokumenten
      // bleiben deaktiviert; es werden keine externen Ressourcen eingebunden.
      const pdfjs = await import('pdfjs-dist');
      const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
      pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;
      const document = await pdfjs.getDocument({
        url: contentUrl,
        enableScripting: false,
        isEvalSupported: false,
        disableAutoFetch: false,
        useSystemFonts: false,
      }).promise;
      pdf = document;
      pageCount = document.numPages;
      const first = await document.getPage(1);
      const base = first.getViewport({ scale: 1 });
      pageAspect = base.width / base.height;
      loading = false;
      await tick();
      setupObservers();
      renderVisible();
    } catch (err) {
      error = err?.message || 'Das PDF konnte nicht geladen werden.';
      loading = false;
    }
  }

  function setupObservers() {
    observer?.disconnect();
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) renderPage(Number(entry.target.dataset.pageIndex));
      }
    }, { root: scroller, rootMargin: '400px 0px' });
    for (const element of pageEls) if (element) observer.observe(element);

    resizeObserver?.disconnect();
    lastWidth = scroller?.clientWidth || 0;
    resizeObserver = new ResizeObserver(() => {
      const width = scroller?.clientWidth || 0;
      if (Math.abs(width - lastWidth) < 12) return;
      lastWidth = width;
      redraw();
    });
    if (scroller) resizeObserver.observe(scroller);
  }

  function pageScale(viewport) {
    const availableWidth = Math.max(240, (scroller?.clientWidth || 800) - 48);
    const fitWidth = availableWidth / viewport.width;
    if (zoomMode === 'page') {
      const availableHeight = Math.max(240, (scroller?.clientHeight || 800) - 48);
      return Math.min(fitWidth, availableHeight / viewport.height) * zoomFactor;
    }
    return fitWidth * zoomFactor;
  }

  async function renderPage(index) {
    if (!pdf || index < 0 || index >= pageCount) return;
    if (rendered.has(index) || rendering.has(index)) return;
    const holder = pageEls[index];
    if (!holder) return;
    const currentGeneration = generation;
    rendering.add(index);
    try {
      const page = await pdf.getPage(index + 1);
      if (currentGeneration !== generation) return;
      const viewport = page.getViewport({ scale: 1 });
      const scale = pageScale(viewport);
      const sized = page.getViewport({ scale });
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(sized.width * dpr));
      canvas.height = Math.max(1, Math.floor(sized.height * dpr));
      canvas.style.width = `${Math.floor(sized.width)}px`;
      canvas.style.height = `${Math.floor(sized.height)}px`;
      canvas.setAttribute('role', 'img');
      canvas.setAttribute('aria-label', `Seite ${index + 1} von ${pageCount}`);
      holder.style.width = `${Math.floor(sized.width)}px`;
      holder.replaceChildren(canvas);
      const context = canvas.getContext('2d', { alpha: false });
      await page.render({
        canvasContext: context,
        viewport: sized,
        transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : undefined,
      }).promise;
      if (currentGeneration === generation) rendered.add(index);
    } catch {
      holder.replaceChildren();
      holder.textContent = `Seite ${index + 1} konnte nicht dargestellt werden.`;
    } finally {
      rendering.delete(index);
    }
  }

  function renderVisible() {
    if (!scroller) return;
    const bounds = scroller.getBoundingClientRect();
    pageEls.forEach((element, index) => {
      if (!element) return;
      const rect = element.getBoundingClientRect();
      if (rect.bottom > bounds.top - 400 && rect.top < bounds.bottom + 400) renderPage(index);
    });
  }

  async function redraw() {
    generation += 1;
    rendered = new Set();
    rendering = new Set();
    for (const element of pageEls) element?.replaceChildren();
    await tick();
    renderVisible();
  }

  function setZoomMode(mode) {
    zoomMode = mode;
    zoomFactor = 1;
    redraw();
  }

  function changeZoom(delta) {
    zoomFactor = Math.min(3, Math.max(0.5, Math.round((zoomFactor + delta) * 100) / 100));
    redraw();
  }

  function goToPage(page) {
    const target = Math.max(1, Math.min(pageCount, page));
    current = target;
    tick().then(() => pageEls[target - 1]?.scrollIntoView({ block: 'start', behavior: 'smooth' }));
  }

  let scrollPending = false;
  function onScroll() {
    if (scrollPending) return;
    scrollPending = true;
    requestAnimationFrame(() => {
      scrollPending = false;
      if (!scroller) return;
      const top = scroller.getBoundingClientRect().top;
      let visible = 1;
      for (let index = 0; index < pageEls.length; index += 1) {
        const element = pageEls[index];
        if (!element) continue;
        if (element.getBoundingClientRect().top - top <= 140) visible = index + 1;
        else break;
      }
      current = visible;
    });
  }

  async function pageText(index) {
    if (textCache.has(index)) return textCache.get(index);
    const page = await pdf.getPage(index + 1);
    const content = await page.getTextContent();
    const text = content.items.map((item) => item.str || '').join(' ').replace(/\s+/g, ' ');
    textCache.set(index, text);
    return text;
  }

  function onSearchInput() {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 250);
  }

  async function runSearch() {
    const needle = query.trim().toLocaleLowerCase('de');
    matches = [];
    matchIndex = -1;
    if (!needle || !pdf) return;
    searching = true;
    try {
      for (let index = 0; index < pageCount; index += 1) {
        const text = (await pageText(index)).toLocaleLowerCase('de');
        let position = text.indexOf(needle);
        while (position !== -1) {
          matches.push(index);
          position = text.indexOf(needle, position + needle.length);
        }
      }
      if (matches.length) {
        matchIndex = 0;
        goToPage(matches[0] + 1);
      }
    } finally {
      searching = false;
    }
  }

  function stepMatch(direction) {
    if (!matches.length) return;
    matchIndex = (matchIndex + direction + matches.length) % matches.length;
    goToPage(matches[matchIndex] + 1);
  }

  function onKey(event) {
    const typing = ['INPUT', 'TEXTAREA'].includes(event.target?.tagName);
    if (event.key === 'Escape') { onclose(); return; }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
      event.preventDefault();
      document.querySelector('#pdf-search')?.focus();
      return;
    }
    if (typing) return;
    if (event.key === 'ArrowRight' || event.key === 'PageDown') { event.preventDefault(); goToPage(current + 1); }
    if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); goToPage(current - 1); }
    if (event.key === 'Home') { event.preventDefault(); goToPage(1); }
    if (event.key === 'End') { event.preventDefault(); goToPage(pageCount); }
    if (event.key === '+' || event.key === '=') { event.preventDefault(); changeZoom(0.1); }
    if (event.key === '-') { event.preventDefault(); changeZoom(-0.1); }
  }
</script>

<div class="pdf-viewer" aria-label={`PDF-Vorschau von ${node.name}`}>
  <div class="pdf-toolbar" role="toolbar" aria-label="PDF-Werkzeuge">
    <IconButton name="chevron-left" label="Vorherige Seite" disabled={current <= 1 || loading} onclick={() => goToPage(current - 1)} />
    <span class="pdf-page-indicator" aria-live="polite">
      <input class="input pdf-page-input" type="number" min="1" max={pageCount || 1} value={current}
        aria-label="Seitenzahl" on:change={(event) => goToPage(Number(event.target.value))} />
      <span>/ {pageCount || '–'}</span>
    </span>
    <IconButton name="chevron-right" label="Nächste Seite" disabled={current >= pageCount || loading} onclick={() => goToPage(current + 1)} />

    <span class="pdf-divider" aria-hidden="true"></span>
    <div class="segmented" role="group" aria-label="Zoom">
      <button type="button" aria-pressed={zoomMode === 'width'} on:click={() => setZoomMode('width')} title="An Breite anpassen">Breite</button>
      <button type="button" aria-pressed={zoomMode === 'page'} on:click={() => setZoomMode('page')} title="Ganze Seite anzeigen">Seite</button>
    </div>
    <IconButton name="zoom-out" label="Verkleinern" onclick={() => changeZoom(-0.1)} />
    <span class="pdf-zoom">{zoomPercent} %</span>
    <IconButton name="zoom-in" label="Vergrößern" onclick={() => changeZoom(0.1)} />

    <span class="pdf-divider" aria-hidden="true"></span>
    <div class="pdf-search">
      <Icon name="search" size={15} />
      <label class="sr-only" for="pdf-search">Im PDF suchen</label>
      <input id="pdf-search" class="input" type="search" placeholder="Im PDF suchen …" bind:value={query} on:input={onSearchInput} autocomplete="off" />
      {#if query.trim()}
        <span class="pdf-search__count" aria-live="polite">
          {searching ? '…' : (matches.length ? `${matchIndex + 1} / ${matches.length}` : '0 Treffer')}
        </span>
        <IconButton name="chevron-up" label="Vorheriger Treffer" disabled={!matches.length} onclick={() => stepMatch(-1)} />
        <IconButton name="chevron-down" label="Nächster Treffer" disabled={!matches.length} onclick={() => stepMatch(1)} />
      {/if}
    </div>

    <span class="grow"></span>
    <IconButton name="x" label="PDF-Vorschau schließen" onclick={onclose} />
  </div>

  {#if loading}
    <div class="pdf-status"><span class="spinner"></span><p>PDF wird geladen …</p></div>
  {:else if error}
    <div class="pdf-status pdf-status--error">
      <Icon name="file-warning" size={40} />
      <h2>PDF konnte nicht dargestellt werden</h2>
      <p>{error}</p>
      <div class="page-actions">
        <Button variant="secondary" icon="refresh-cw" onclick={load}>Erneut versuchen</Button>
        <Button variant="primary" icon="download" href={`${contentUrl}?download=1`}>Datei herunterladen</Button>
      </div>
    </div>
  {:else}
    <div class="pdf-scroller" bind:this={scroller} on:scroll={onScroll}>
      <div class="pdf-pages">
        {#each Array(pageCount) as _, index (index)}
          <div class="pdf-page" bind:this={pageEls[index]} data-page-index={index} style={`aspect-ratio:${pageAspect}`}>
            <span class="pdf-page__number" aria-hidden="true">{index + 1}</span>
          </div>
        {/each}
      </div>
    </div>
  {/if}
</div>
