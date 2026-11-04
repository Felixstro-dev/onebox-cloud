<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { get, post, del } from '../lib/api.js';
  import { notify, confirmAction, refresh } from '../lib/stores.js';
  import { bytes, dayKey, dayLabel, dateTime } from '../lib/format.js';
  import Icon from '../components/Icon.svelte';
  import IconButton from '../components/IconButton.svelte';
  import Button from '../components/Button.svelte';
  import Dialog from '../components/Dialog.svelte';
  import Field from '../components/Field.svelte';
  import EmptyState from '../components/EmptyState.svelte';

  let items = [];
  let albums = [];
  let total = 0;
  let nextOffset = null;
  let loading = true;
  let loadingMore = false;
  let failed = '';
  let activeAlbum = null;
  let selected = new Set();
  let selectMode = 'none';
  let allCount = 0;
  let viewerIndex = null;
  let exif = null;
  let exifOpen = false;
  let editorOpen = false;
  let editorNode = null;
  let slideshow = false;
  let slideshowTimer = null;
  let newAlbumOpen = false;
  let albumName = '';
  let addToAlbumOpen = false;
  let albumBusy = false;
  let edit = { rotate: 0, flip: false, flop: false, brightness: 1, saturation: 1, contrast: 1, grayscale: false, filter: 'none' };
  let saving = false;

  $: current = viewerIndex !== null ? items[viewerIndex] : null;
  $: groups = groupByDay(items);
  $: albumList = albums;

  onMount(() => {
    loadAlbums();
    load();
    const onKey = (event) => {
      if (viewerIndex === null || editorOpen) return;
      if (event.key === 'Escape') closeViewer();
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  onDestroy(() => clearInterval(slideshowTimer));

  function groupByDay(list) {
    const map = new Map();
    for (const item of list) {
      const key = dayKey(item.takenAt || item.createdAt);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    }
    return [...map.entries()].map(([key, photos]) => ({ key, label: dayLabel(photos[0].takenAt || photos[0].createdAt), photos }));
  }

  async function loadAlbums() {
    try { albums = (await get('/api/v1/photos/albums')).items; } catch {}
  }

  async function load(reset = true) {
    if (reset) { loading = true; items = []; nextOffset = null; }
    else loadingMore = true;
    failed = '';
    try {
      const offset = reset ? 0 : Number(nextOffset || 0);
      const data = await get(`/api/v1/photos?limit=60&offset=${offset}${activeAlbum ? `&album=${activeAlbum}` : ''}`);
      items = reset ? data.items : [...items, ...data.items];
      total = data.total;
      nextOffset = data.nextOffset;
      selected = new Set();
      selectMode = 'none';
      allCount = 0;
    } catch (err) { failed = err.message; } finally { loading = false; loadingMore = false; }
  }

  function selectAlbum(id) {
    activeAlbum = id;
    selected = new Set();
    selectMode = 'none';
    allCount = 0;
    load();
  }

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    selected = next;
  }

  async function deleteSelected() {
    if ((!selected.size && selectMode !== 'all') || (selectMode === 'all' && !items.length)) return;
    const count = selectMode === 'all' ? allCount : selected.size;
    const ok = await confirmAction({
      title: count > 1 ? `${count.toLocaleString('de-DE')} Fotos löschen?` : 'Foto löschen?',
      description: count > 1 ? 'Alle ausgewählten Fotos werden in den Papierkorb verschoben.' : 'Das Foto wird in den Papierkorb verschoben.',
      confirmLabel: 'In den Papierkorb',
      danger: true,
    });
    if (!ok) return;
    try {
      const ids = selectMode === 'all' ? items.map(i => i.id) : [...selected];
      await post('/api/v1/files/trash', { ids });
      notify(`${count > 1 ? count + ' Fotos' : 'Foto'} in den Papierkorb verschoben.`, 'success');
      selected = new Set();
      selectMode = 'none';
      allCount = 0;
      load();
    } catch (err) { notify(err.message, 'error'); }
  }

  async function duplicateSelected() {
    if (!selected.size) return;
    for (const id of selected) {
      const item = items.find(i => i.id === id);
      if (!item) continue;
      try {
        await post(`/api/v1/files/${item.id}/copy`, { parentId: item.parentId || null, name: `${item.name} (Kopie)` });
      } catch {}
    }
    notify(`${selected.size} ${selected.size === 1 ? 'Foto' : 'Fotos'} dupliziert.`, 'success');
    selected = new Set();
    selectMode = 'none';
    allCount = 0;
    load();
  }

  function openViewer(index) {
    viewerIndex = index;
    exif = null;
    exifOpen = false;
    loadExif(items[index]);
  }

  function closeViewer() {
    viewerIndex = null;
    exifOpen = false;
    stopSlideshow();
  }

  function step(delta) {
    if (viewerIndex === null) return;
    const next = viewerIndex + delta;
    if (next < 0 || next >= items.length) return;
    openViewer(next);
  }

  async function loadExif(node) {
    if (!node) return;
    try { exif = await get(`/api/v1/photos/${node.id}/exif`); } catch { exif = null; }
  }

  function toggleSlideshow() {
    if (slideshow) return stopSlideshow();
    slideshow = true;
    slideshowTimer = setInterval(() => {
      if (viewerIndex === null) return;
      const next = viewerIndex + 1;
      if (next >= items.length) { stopSlideshow(); return; }
      openViewer(next);
    }, 4000);
    notify('Diashow gestartet. Pfeiltasten wechseln das Bild.', 'info');
  }

  function stopSlideshow() {
    slideshow = false;
    clearInterval(slideshowTimer);
    slideshowTimer = null;
  }

  async function createAlbum() {
    if (!albumName.trim()) return;
    albumBusy = true;
    try {
      await post('/api/v1/photos/albums', { name: albumName.trim() });
      notify('Album erstellt.', 'success');
      newAlbumOpen = false;
      albumName = '';
      loadAlbums();
    } catch (err) { notify(err.message, 'error'); } finally { albumBusy = false; }
  }

  async function addSelectedToAlbum(album) {
    albumBusy = true;
    try {
      await post(`/api/v1/photos/albums/${album.id}/items`, { nodeIds: [...selected] });
      notify(`${selected.size} ${selected.size === 1 ? 'Foto' : 'Fotos'} zu „${album.name}“ hinzugefügt.`, 'success');
      addToAlbumOpen = false;
      selected = new Set();
      selectMode = 'none';
      allCount = 0;
      loadAlbums();
    } catch (err) { notify(err.message, 'error'); } finally { albumBusy = false; }
  }

  async function removeAlbum(album) {
    const ok = await confirmAction({ title: `Album „${album.name}“ löschen?`, description: 'Die Fotos selbst bleiben erhalten.', confirmLabel: 'Album löschen', danger: true });
    if (!ok) return;
    try {
      await del(`/api/v1/photos/albums/${album.id}`);
      if (activeAlbum === album.id) activeAlbum = null;
      loadAlbums();
      load();
    } catch (err) { notify(err.message, 'error'); }
  }

  function openEditor(node) {
    editorNode = node;
    edit = { rotate: 0, flip: false, flop: false, brightness: 1, saturation: 1, contrast: 1, grayscale: false, filter: 'none' };
    editorOpen = true;
  }

  $: previewFilter = `brightness(${edit.brightness}) saturate(${edit.saturation}) contrast(${edit.contrast})${edit.grayscale ? ' grayscale(1)' : ''}`;
  $: previewTransform = `rotate(${edit.rotate}deg) scaleX(${edit.flip ? -1 : 1}) scaleY(${edit.flop ? -1 : 1})`;

  async function saveEdit() {
    saving = true;
    try {
      const body = { ...edit, rotate: Number(edit.rotate) };
      if (body.brightness === 1 && body.saturation === 1 && body.contrast === 1) {
        delete body.brightness; delete body.saturation; delete body.contrast;
      }
      const result = await post(`/api/v1/photos/${editorNode.id}/edit`, body);
      notify('Bearbeitete Kopie erstellt.', 'success');
      editorOpen = false;
      refresh();
      load();
    } catch (err) { notify(err.message, 'error'); } finally { saving = false; }
  }

  function download(node) {
    window.location.href = `/api/v1/files/${node.id}/download`;
  }

  function exifValue(value, suffix = '') {
    if (value === null || value === undefined || value === '') return '—';
    if (typeof value === 'number') return `${Math.round(value * 100) / 100}${suffix}`;
    return String(value);
  }
</script>

<div class="page page--wide">
  <header class="page-head">
    <div>
      <h1>Fotos</h1>
      <p class="lede">{total.toLocaleString('de-DE')} {total === 1 ? 'Foto' : 'Fotos'} – nach Aufnahmedatum sortiert.</p>
    </div>
    <div class="page-actions">
      <Button variant="secondary" icon="folder-plus" onclick={() => { newAlbumOpen = true; albumName = ''; }}>Album erstellen</Button>
      {#if selected.size || selectMode === 'all'}
        <Button variant="primary" icon="images" onclick={() => (addToAlbumOpen = true)}>{selectMode === 'all' ? 'Alle' : selected.size} zu Album</Button>
        <Button variant="quiet" size="sm" icon="copy" onclick={duplicateSelected}>Duplizieren</Button>
        <Button variant="danger" icon="trash-2" onclick={deleteSelected}>Löschen</Button>
      {/if}
    </div>
  </header>

  {#if selectMode === 'partial' && items.length > 0 && selected.size === items.length && total > items.length}
  <div class="selection-hint" role="status" aria-live="polite" style="margin-bottom:var(--space-4);animation:fade-in .35s ease-out">
    <span>{selected.size.toLocaleString('de-DE')} von {total.toLocaleString('de-DE')} Fotos ausgewählt</span>
    <button type="button" class="link-btn" onclick={() => { selectMode = 'all'; allCount = total; }}>Alle {total.toLocaleString('de-DE')} auswählen</button>
  </div>
  {:else if selectMode === 'all'}
  <div class="selection-hint" role="status" aria-live="polite" style="margin-bottom:var(--space-4);animation:fade-in .35s ease-out">
    <span>Alle {allCount.toLocaleString('de-DE')} Fotos ausgewählt</span>
    <button type="button" class="link-btn" onclick={() => { selected = new Set(); selectMode = 'none'; allCount = 0; }}>Auswahl aufheben</button>
  </div>
  {/if}

  <div class="album-strip" role="list" aria-label="Alben">
    <button type="button" class="album-card" class:is-active={!activeAlbum} onclick={() => selectAlbum(null)}>
      <span class="album-blank"><Icon name="images" size={15} /></span>
      Alle Fotos <small>{total}</small>
    </button>
    {#each albumList as album (album.id)}
      <div class="album-card" class:is-active={activeAlbum === album.id} role="listitem">
        <button type="button" style="display:flex;align-items:center;gap:var(--space-2);background:none;border:0;color:inherit" onclick={() => selectAlbum(album.id)}>
          {#if album.coverThumb}
            <img src={album.coverThumb} alt="" />
          {:else}
            <span class="album-blank"><Icon name="image" size={14} /></span>
          {/if}
          {album.name} <small>{album.count}</small>
        </button>
        <IconButton name="x" label={`Album ${album.name} löschen`} size={13} onclick={() => removeAlbum(album)} />
      </div>
    {/each}
  </div>

  {#if failed}
    <EmptyState icon="cloud-off" title="Fotos konnten nicht geladen werden" text={failed} action={() => load()} actionLabel="Erneut versuchen" />
  {:else if loading}
    <div class="photo-grid">
      {#each Array(9) as _}<span class="skeleton" style="aspect-ratio:1;height:auto"></span>{/each}
    </div>
  {:else if !items.length}
    <EmptyState icon="image" title={activeAlbum ? 'Dieses Album ist leer' : 'Noch keine Fotos'} text={activeAlbum ? 'Füge Fotos über den Dateibereich oder die Auswahl zu diesem Album hinzu.' : 'Lade Bilder in den Dateibereich hoch – sie erscheinen hier automatisch.'} />
  {:else}
    {#each groups as group (group.key)}
      <section class="photo-day" aria-labelledby={`day-${group.key}`}>
        <h2 id={`day-${group.key}`}>{group.label}</h2>
        <div class="photo-grid">
          {#each group.photos as photo}
            {@const index = items.indexOf(photo)}
            <button type="button" class="photo-tile" class:is-selected={selected.has(photo.id)} onclick={() => openViewer(index)} aria-label={`${photo.name} öffnen`}>
              <img src={`/api/v1/files/${photo.id}/thumbnail?size=320`} alt="" loading="lazy" />
              <input class="check" type="checkbox" checked={selected.has(photo.id)} onclick={() => { toggle(photo.id); }} aria-label={`${photo.name} auswählen`} />
            </button>
          {/each}
        </div>
      </section>
    {/each}
    {#if nextOffset !== null}
      <div style="display:grid;place-items:center;margin-top:var(--space-8)">
        <Button variant="secondary" loading={loadingMore} onclick={() => load(false)}>Weitere Fotos laden</Button>
      </div>
    {/if}
  {/if}
</div>

{#if current}
  <div class="viewer" role="dialog" aria-modal="true" aria-label={`Foto ${current.name}`}>
    <div class="viewer__bar">
      <Icon name="image" size={18} />
      <span class="viewer__title">{current.name}</span>
      <span class="tag">{viewerIndex + 1} / {items.length}</span>
      <IconButton name="play" label={slideshow ? 'Diashow stoppen' : 'Diashow starten'} active={slideshow} onclick={toggleSlideshow} />
      <IconButton name="info" label="Details anzeigen" active={exifOpen} onclick={() => (exifOpen = !exifOpen)} />
      <IconButton name="pencil" label="Foto bearbeiten" onclick={() => openEditor(current)} />
      <IconButton name="download" label="Foto herunterladen" onclick={() => download(current)} />
      <IconButton name="x" label="Viewer schließen" onclick={closeViewer} />
    </div>
    <div class="viewer__stage">
      <button type="button" class="viewer__photo" onclick={() => step(1)} aria-label="Nächstes Foto"><img src={`/api/v1/files/${current.id}/content`} alt={current.name} /></button>
      {#if items.length > 1}
        <button type="button" class="viewer__nav viewer__nav--prev" onclick={() => step(-1)} disabled={viewerIndex === 0} aria-label="Vorheriges Foto"><Icon name="chevron-left" size={22} /></button>
        <button type="button" class="viewer__nav viewer__nav--next" onclick={() => step(1)} disabled={viewerIndex === items.length - 1} aria-label="Nächstes Foto"><Icon name="chevron-right" size={22} /></button>
      {/if}
      {#if slideshow}<span class="slideshow-hint">Diashow · Esc zum Beenden</span>{/if}
      {#if exifOpen}
        <aside class="viewer__panel" aria-label="Bilddetails">
          <div class="card-head"><h3>Details</h3><IconButton name="x" label="Details schließen" onclick={() => (exifOpen = false)} /></div>
          {#if exif}
            <dl class="exif-grid">
              <dt>Format</dt><dd>{exif.format?.toUpperCase() || '—'}</dd>
              <dt>Maße</dt><dd>{exif.width || '—'} × {exif.height || '—'}</dd>
              <dt>Größe</dt><dd>{bytes(exif.size)}</dd>
              <dt>Kamera</dt><dd>{exifValue([exif.make, exif.camera].filter(Boolean).join(' '))}</dd>
              <dt>Objektiv</dt><dd>{exifValue(exif.lens)}</dd>
              <dt>Blende</dt><dd>{exifValue(exif.aperture, ' f')}</dd>
              <dt>ISO</dt><dd>{exifValue(exif.iso)}</dd>
              <dt>Belichtung</dt><dd>{exifValue(exif.shutter, ' s')}</dd>
              <dt>Brennweite</dt><dd>{exifValue(exif.focalLength, ' mm')}</dd>
              <dt>Aufgenommen</dt><dd>{exif.takenAt ? dateTime(exif.takenAt) : '—'}</dd>
            </dl>
          {:else}
            <p class="stat-foot">Details werden geladen …</p>
          {/if}
        </aside>
      {/if}
    </div>
    <div class="viewer__strip">
      {#each items as photo, index}
        <button type="button" class="viewer__thumb" class:is-active={index === viewerIndex} onclick={() => openViewer(index)} aria-label={`${photo.name} anzeigen`}>
          <img src={`/api/v1/files/${photo.id}/thumbnail?size=320`} alt="" />
        </button>
      {/each}
    </div>
  </div>
{/if}

<Dialog open={editorOpen} title="Foto bearbeiten" description="Beim Speichern entsteht eine neue Kopie – das Original bleibt unverändert." size="lg" onclose={() => (editorOpen = false)}>
  {#if editorNode}
    <div class="editor-layout">
      <div class="editor-preview">
        <img src={`/api/v1/files/${editorNode.id}/content`} alt="Vorschau der Bearbeitung" style:filter={previewFilter} style:transform={previewTransform} />
      </div>
      <div class="editor-controls">
        <div class="page-actions">
          <Button variant="secondary" size="sm" icon="rotate-cw" onclick={() => (edit.rotate = (edit.rotate + 90) % 360)}>Drehen</Button>
          <Button variant="secondary" size="sm" icon="flip-horizontal" onclick={() => (edit.flip = !edit.flip)}>Spiegeln</Button>
        </div>
        <label class="range-row">Helligkeit <input type="range" min="0.4" max="1.8" step="0.05" bind:value={edit.brightness} /></label>
        <label class="range-row">Sättigung <input type="range" min="0" max="2" step="0.05" bind:value={edit.saturation} /></label>
        <label class="range-row">Kontrast <input type="range" min="0.4" max="1.8" step="0.05" bind:value={edit.contrast} /></label>
        <Field label="Filter" id="photo-filter">
          <select id="photo-filter" class="select" bind:value={edit.filter}>
            <option value="none">Original</option>
            <option value="warm">Warm</option>
            <option value="cool">Kühl</option>
            <option value="vivid">Kräftig</option>
            <option value="mono">Schwarzweiß</option>
          </select>
        </Field>
        <label class="check-row"><input type="checkbox" bind:checked={edit.grayscale} /> Schwarzweiß</label>
      </div>
    </div>
  {/if}
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (editorOpen = false)}>Abbrechen</Button>
    <Button variant="primary" loading={saving} onclick={saveEdit} icon="check">Kopie speichern</Button>
  </svelte:fragment>
</Dialog>

<Dialog open={newAlbumOpen} title="Neues Album" size="sm" onclose={() => (newAlbumOpen = false)}>
  <Field label="Name" id="album-name" required>
    <input id="album-name" class="input" bind:value={albumName} placeholder="z. B. Sommer 2026" onkeydown={(event) => event.key === 'Enter' && createAlbum()} />
  </Field>
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (newAlbumOpen = false)}>Abbrechen</Button>
    <Button variant="primary" loading={albumBusy} disabled={!albumName.trim()} onclick={createAlbum}>Album erstellen</Button>
  </svelte:fragment>
</Dialog>

<Dialog open={addToAlbumOpen} title="Zu Album hinzufügen" description={`${selected.size} ${selected.size === 1 ? 'Foto' : 'Fotos'} auswählen.`} size="sm" onclose={() => (addToAlbumOpen = false)}>
  {#if !albums.length}
    <p class="field__hint">Es gibt noch kein Album. Erstelle zuerst eines.</p>
    <Button variant="secondary" icon="folder-plus" onclick={() => { addToAlbumOpen = false; newAlbumOpen = true; }}>Album erstellen</Button>
  {:else}
    <div class="list-stack">
      {#each albums as album}
        <button class="menu-item" type="button" disabled={albumBusy} onclick={() => addSelectedToAlbum(album)}>
          <Icon name="images" size={16} /><span class="grow-ellipsis">{album.name}</span><small>{album.count}</small>
        </button>
      {/each}
    </div>
  {/if}
  <svelte:fragment slot="footer"><Button variant="quiet" onclick={() => (addToAlbumOpen = false)}>Schließen</Button></svelte:fragment>
</Dialog>
