<script>
  import { onMount, tick } from 'svelte';
  import { get, post, patch, del } from '../lib/api.js';
  import { addFiles } from '../lib/uploads.js';
  import { notify, refresh, refreshKey, confirmAction } from '../lib/stores.js';
  import { startJob, finishJob, failJob } from '../lib/jobs.js';
  import { navigate } from '../lib/router.js';
  import { bytes, dateTime, fileKind } from '../lib/format.js';
  import Icon from '../components/Icon.svelte';
  import IconButton from '../components/IconButton.svelte';
  import Button from '../components/Button.svelte';
  import Field from '../components/Field.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Dialog from '../components/Dialog.svelte';
  import FilePreview from '../components/FilePreview.svelte';
  import TextEditor from '../components/TextEditor.svelte';
  import ShareDialog from '../components/ShareDialog.svelte';
  import MoveDialog from '../components/MoveDialog.svelte';
  import ProgressBar from '../components/ProgressBar.svelte';

  export let folderId = null;

  let items = [];
  let total = 0;
  let breadcrumbs = [];
  let loading = true;
  let failed = '';
  let view = localStorage.getItem('onebox-view') === 'grid' ? 'grid' : 'list';
  let sort = 'name';
  let dir = 'asc';
  let selected = new Set();
  let dragOver = false;
  let dragDepth = 0;
  let menu = { open: false, x: 0, y: 0, item: null };
  let createOpen = false;
  let createName = '';
  let createBusy = false;
  let trashBusy = false;
  let renameOpen = false;
  let renameValue = '';
  let renameTarget = null;
  let shareNode = null;
  let moveNode = null;
  let previewNode = null;
  let textEditOpen = false;
  let textEditNode = null;
  let uploadInput;
  let lastFolder;
  let lastRefresh = -1;
  let nextCursor = null;
  let loadingMore = false;
  let lastSort = 'name';
  let lastDir = 'asc';

  // "Alle auswählen" arbeitet serverseitig mit Filter + Snapshot + Ausnahmen.
  let selectAllMode = false;
  let excluded = new Set();
  let selectionSnapshot = null;
  let selectionTotal = 0;
  let selectionFilter = null;

  let zipCreateOpen = false;
  let zipCreateName = '';
  let zipCreateBusy = false;
  let extractOpen = false;
  let extractNode = null;
  let extractTarget = 'here';
  let extractConflict = 'keepBoth';
  let extractFolderName = '';
  let extractBusy = false;
  let transfer = null;
  let transferTimer = null;

  $: if (folderId !== lastFolder) { lastFolder = folderId; load(); }
  $: if ($refreshKey !== lastRefresh) { lastRefresh = $refreshKey; if (lastFolder === folderId) load(); }
  $: if (sort !== lastSort || dir !== lastDir) { lastSort = sort; lastDir = dir; load(); }
  $: selectedCount = selectAllMode ? Math.max(0, selectionTotal - excluded.size) : selected.size;
  $: selectedItems = selectAllMode ? [] : items.filter((item) => selected.has(item.id));
  $: singleSelected = !selectAllMode && selected.size === 1 && selectedCount === 1 ? (selectedItems[0] || null) : null;
  $: zipSingle = singleSelected && isZip(singleSelected) ? singleSelected : null;
  $: checkboxChecked = selectedCount > 0 && (selectAllMode
    ? excluded.size === 0
    : items.length > 0 && selected.size === items.length && total <= items.length);
  $: checkboxIndeterminate = selectedCount > 0 && !checkboxChecked;

  function infiniteScroll(node) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { root: null, rootMargin: '300px' });
    observer.observe(node);
    return { destroy: () => observer.disconnect() };
  }

  function setIndeterminate(node, value) {
    node.indeterminate = value;
    return { update(next) { node.indeterminate = next; } };
  }

  onMount(() => {
    const closeMenu = () => (menu = { ...menu, open: false });
    const onKey = (event) => {
      if (event.key === 'Escape') { menu = { ...menu, open: false }; resetSelection(); }
      if ((event.ctrlKey || event.metaKey) && event.key === 'a' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        event.preventDefault();
        selectAllNow();
      }
    };
    window.addEventListener('click', closeMenu);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('keydown', onKey);
      stopTransfer();
    };
  });

  function resetSelection() {
    selected = new Set();
    selectAllMode = false;
    excluded = new Set();
    selectionSnapshot = null;
    selectionTotal = 0;
    selectionFilter = null;
  }

  function buildFilter() {
    return { parentId: folderId || null, q: null, kind: null, sort, dir };
  }

  function selectionBody() {
    if (selectAllMode) {
      return {
        selectAll: true,
        filter: selectionFilter || buildFilter(),
        exclude: [...excluded],
        snapshot: selectionSnapshot,
      };
    }
    return { ids: [...selected] };
  }

  async function load() {
    loading = true;
    failed = '';
    resetSelection();
    try {
      const data = await get(`/api/v1/files?parent=${folderId || 'root'}&sort=${sort}&dir=${dir}&limit=200`);
      items = data.items;
      total = Number(data.total) || items.length;
      breadcrumbs = data.breadcrumbs || [];
      nextCursor = data.next || null;
      const previewId = new URLSearchParams(window.location.search).get('preview');
      if (previewId) {
        const found = items.find((item) => item.id === previewId);
        if (found) previewNode = found;
        else {
          try { previewNode = (await get(`/api/v1/files/${previewId}`)).node; } catch {}
        }
      }
    } catch (err) {
      failed = err.message;
    } finally {
      loading = false;
    }
  }

  async function loadMore() {
    if (loadingMore || !nextCursor) return;
    loadingMore = true;
    try {
      const data = await get(`/api/v1/files?parent=${folderId || 'root'}&sort=${sort}&dir=${dir}&limit=200&cursor=${encodeURIComponent(nextCursor)}`);
      if (Array.isArray(data.items) && data.items.length) items = [...items, ...data.items];
      if (data.total !== undefined) total = Number(data.total) || total;
      nextCursor = data.next || null;
    } catch {
      // Keep the current list; retry on next scroll.
    } finally {
      loadingMore = false;
    }
  }

  function setView(next) {
    view = next;
    try { localStorage.setItem('onebox-view', next); } catch {}
  }

  function toggleSort(column) {
    if (sort === column) dir = dir === 'asc' ? 'desc' : 'asc';
    else { sort = column; dir = 'asc'; }
    load();
  }

  function isRowSelected(item) {
    return selectAllMode ? !excluded.has(item.id) : selected.has(item.id);
  }

  function toggleSelect(id) {
    if (selectAllMode) {
      const next = new Set(excluded);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      excluded = next;
      return;
    }
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
  }

  async function selectAllNow() {
    selected = new Set();
    selectAllMode = true;
    excluded = new Set();
    selectionSnapshot = Date.now();
    selectionFilter = buildFilter();
    selectionTotal = total;
    try {
      // Der Server liefert den Snapshot, damit die Client-Uhr keine Rolle spielt.
      const result = await post('/api/v1/files/selection', {
        selectAll: true,
        filter: selectionFilter,
        exclude: [],
      });
      if (selectAllMode) {
        selectionSnapshot = result.snapshot;
        selectionTotal = Number(result.count) || 0;
      }
    } catch {
      selectionSnapshot = Date.now();
    }
  }

  function toggleAll() {
    if (selectedCount > 0 && checkboxChecked) resetSelection();
    else selectAllNow();
  }

  function openItem(item) {
    if (item.kind === 'folder') navigate(`/files/${item.id}`);
    else if (isDocument(item)) navigate(`/doc/${item.id}`);
    else openPreview(item);
  }

  /** Markdown- und Textdateien öffnen den Dokumenten-Editor. */
  function isDocument(item) {
    return item.kind === 'file'
      && (item.mime === 'text/markdown' || item.mime === 'text/plain'
        || /\.(md|markdown|txt)$/i.test(item.name || ''));
  }

  function isZip(item) {
    return item?.kind === 'file' && (item.mime === 'application/zip' || /\.zip$/i.test(item.name || ''));
  }

  async function newDocument() {
    try {
      const res = await post('/api/v1/docs', {
        name: 'Neues Dokument',
        parentId: folderId || null,
      });
      refresh();
      navigate(`/doc/${res.node.id}`);
    } catch (error) {
      notify(`Konnte Dokument nicht anlegen: ${error.message}`, 'error');
    }
  }

  function openPreview(item) {
    previewNode = item;
    const url = new URL(window.location.href);
    url.searchParams.set('preview', item.id);
    history.replaceState(history.state, '', url);
  }

  function closePreview() {
    previewNode = null;
    const url = new URL(window.location.href);
    url.searchParams.delete('preview');
    history.replaceState(history.state, '', url);
  }

  function showMenu(event, item) {
    event.stopPropagation();
    if (event.type === 'contextmenu') event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const menuHeight = 300;
    const top = Math.min(window.innerHeight - menuHeight, rect.bottom + 4);
    const left = Math.min(window.innerWidth - 220, Math.max(8, rect.right - 208));
    menu = { open: true, x: left, y: Math.max(8, top), item };
  }

  function menuAction(action) {
    const item = menu.item;
    menu = { ...menu, open: false };
    if (!item) return;
    if (action === 'open') openItem(item);
    if (action === 'preview') openPreview(item);
    if (action === 'share') shareNode = item;
    if (action === 'rename') startRename(item);
    if (action === 'move') moveNode = item;
    if (action === 'download') window.location.href = `/api/v1/files/${item.id}/download`;
    if (action === 'trash') trashItem(item);
    if (action === 'copy') copyNode(item);
    if (action === 'extract') openExtract(item);
  }

  function startRename(item) {
    renameTarget = item;
    renameValue = item.name;
    renameOpen = true;
    tick().then(() => document.querySelector('#rename-input')?.select());
  }

  async function doRename() {
    if (!renameValue.trim() || !renameTarget) return;
    try {
      await patch(`/api/v1/files/${renameTarget.id}`, { name: renameValue.trim() });
      notify('Name geändert.', 'success');
      renameOpen = false;
      load();
    } catch (err) { notify(err.message, 'error'); }
  }

  async function copyNode(item) {
    try {
      await post(`/api/v1/files/${item.id}/copy`, { parentId: folderId });
      notify(`Kopie von „${item.name}“ erstellt.`, 'success');
      refresh();
    } catch (err) { notify(err.message, 'error'); }
  }

  async function trashSelection() {
    const countNow = selectedCount;
    if (!countNow) return;
    const single = countNow === 1 ? singleSelected : null;
    const ok = await confirmAction({
      title: countNow === 1 ? 'Element in den Papierkorb?' : `${countNow.toLocaleString('de-DE')} Elemente in den Papierkorb?`,
      description: selectAllMode
        ? `Alle ${countNow.toLocaleString('de-DE')} ausgewählten Elemente werden in den Papierkorb verschoben. Du kannst sie später wiederherstellen.`
        : 'Du kannst die Elemente später wiederherstellen.',
      detail: single?.name,
      confirmLabel: 'In den Papierkorb',
      danger: true,
    });
    if (!ok) return;
    trashBusy = true;
    const jobId = startJob({
      kind: 'trash',
      title: `Lösche ${countNow.toLocaleString('de-DE')} ${countNow === 1 ? 'Element' : 'Elemente'} …`,
      detail: 'Wird in den Papierkorb verschoben',
      count: countNow,
    });
    try {
      const result = await post('/api/v1/files/trash', selectionBody());
      const moved = Number(result.trashed) || countNow;
      finishJob(jobId, {
        title: `${moved.toLocaleString('de-DE')} ${moved === 1 ? 'Element' : 'Elemente'} gelöscht`,
        detail: 'In den Papierkorb verschoben',
      });
      notify(`${moved.toLocaleString('de-DE')} ${moved === 1 ? 'Element' : 'Elemente'} in den Papierkorb verschoben.`, 'success');
      resetSelection();
      await load();
    } catch (err) {
      failJob(jobId, { title: 'Löschen fehlgeschlagen', detail: err.message || 'Bitte erneut versuchen.' });
      notify(err.message || 'Löschen fehlgeschlagen.', 'error');
    } finally {
      trashBusy = false;
    }
  }

  async function trashItem(item) {
    const ok = await confirmAction({
      title: 'In den Papierkorb?',
      description: 'Du kannst das Element später wiederherstellen.',
      detail: item.name,
      confirmLabel: 'In den Papierkorb',
      danger: true,
    });
    if (!ok) return;
    trashBusy = true;
    const jobId = startJob({
      kind: 'trash',
      title: 'Lösche 1 Element …',
      detail: item.name,
      count: 1,
    });
    try {
      await post('/api/v1/files/trash', { ids: [item.id] });
      finishJob(jobId, { title: 'Element gelöscht', detail: 'In den Papierkorb verschoben' });
      notify('Element in den Papierkorb verschoben.', 'success');
      resetSelection();
      await load();
    } catch (err) {
      failJob(jobId, { title: 'Löschen fehlgeschlagen', detail: err.message || 'Bitte erneut versuchen.' });
      notify(err.message || 'Löschen fehlgeschlagen.', 'error');
    } finally {
      trashBusy = false;
    }
  }

  function openZipCreate() {
    const stamp = new Date().toISOString().slice(0, 10);
    zipCreateName = `Archiv ${stamp}.zip`;
    zipCreateOpen = true;
  }

  async function createZip() {
    if (!zipCreateName.trim()) return;
    zipCreateBusy = true;
    try {
      const result = await post('/api/v1/files/archive', {
        ...selectionBody(),
        parentId: folderId || null,
        name: zipCreateName.trim(),
      });
      zipCreateOpen = false;
      watchJob(result.job, 'zip');
    } catch (err) {
      notify(err.message || 'ZIP konnte nicht erstellt werden.', 'error');
    } finally {
      zipCreateBusy = false;
    }
  }

  function downloadZip() {
    if (!selectedCount) return;
    const body = selectionBody();
    const stamp = new Date().toISOString().slice(0, 10);
    let filename = `Archiv ${stamp}.zip`;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', '/api/v1/files/archive/download');
    xhr.withCredentials = true;
    xhr.responseType = 'blob';
    xhr.setRequestHeader('content-type', 'application/json');
    xhr.setRequestHeader('x-onebox-csrf', '1');
    xhr.upload.onprogress = (event) => {
      if (transfer) transfer.detail = `Anfrage gesendet · ${bytes(event.loaded)}`;
    };
    xhr.onprogress = (event) => {
      if (!transfer) return;
      transfer.value = event.loaded;
      transfer.max = event.total || Math.max(event.loaded, 1);
      transfer.detail = `${bytes(event.loaded)} gepackt${event.total ? ` von ${bytes(event.total)}` : ''}`;
    };
    xhr.onload = async () => {
      if (!transfer) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        const disposition = xhr.getResponseHeader('content-disposition') || '';
        const match = /filename\*=UTF-8''([^;]+)/i.exec(disposition);
        if (match) {
          try { filename = decodeURIComponent(match[1]); } catch {}
        }
        const url = URL.createObjectURL(xhr.response);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = filename;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
        notify(`ZIP „${filename}“ wird heruntergeladen.`, 'success');
        closeTransfer();
      } else {
        let message = 'ZIP konnte nicht erstellt werden.';
        try {
          const text = await xhr.response?.text?.();
          message = JSON.parse(text)?.error?.message || message;
        } catch {}
        notify(message, 'error');
        closeTransfer();
      }
    };
    xhr.onerror = () => {
      notify('Verbindung beim ZIP-Download unterbrochen.', 'error');
      closeTransfer();
    };
    xhr.onabort = () => {
      notify('ZIP-Download abgebrochen.', 'info');
      closeTransfer();
    };
    transfer = {
      kind: 'download',
      title: 'ZIP wird gepackt …',
      detail: 'Der Download startet gleich.',
      value: 0,
      max: 1,
      cancel: () => xhr.abort(),
    };
    xhr.send(JSON.stringify(body));
  }

  function openExtract(node) {
    extractNode = node;
    extractTarget = 'here';
    extractConflict = 'keepBoth';
    extractFolderName = String(node.name || 'Archiv').replace(/\.zip$/i, '') || 'Archiv';
    extractOpen = true;
  }

  async function startExtract() {
    if (!extractNode) return;
    extractBusy = true;
    try {
      const result = await post(`/api/v1/files/${extractNode.id}/extract`, {
        target: extractTarget,
        conflict: extractConflict,
        folderName: extractTarget === 'newFolder' ? extractFolderName.trim() : undefined,
      });
      extractOpen = false;
      watchJob(result.job, 'extract');
    } catch (err) {
      notify(err.message || 'ZIP konnte nicht entpackt werden.', 'error');
    } finally {
      extractBusy = false;
    }
  }

  function watchJob(job, kind) {
    stopTransfer();
    transfer = {
      id: job.id,
      kind,
      title: kind === 'zip' ? 'ZIP wird erstellt …' : 'ZIP wird entpackt …',
      detail: 'Auftrag wird vorbereitet …',
      value: job.processed || 0,
      max: Math.max(1, job.total || 1),
      cancel: () => cancelJob(job.id),
    };
    transferTimer = setInterval(() => pollJob(job.id, kind), 700);
    pollJob(job.id, kind);
  }

  async function pollJob(jobId, kind) {
    try {
      const { job } = await get(`/api/v1/files/archive/jobs/${jobId}`);
      if (!transfer || transfer.id !== jobId) return;
      if (job.state === 'running' || job.state === 'queued') {
        transfer.value = job.processed || 0;
        transfer.max = Math.max(1, job.total || 1);
        transfer.detail = job.total
          ? `${(job.processed || 0).toLocaleString('de-DE')} von ${job.total.toLocaleString('de-DE')}${job.current ? ` · ${job.current}` : ''}`
          : (job.current || 'Wird vorbereitet …');
        return;
      }
      if (job.state === 'done') {
        if (kind === 'zip') {
          const count = job.result?.count ?? job.total ?? 0;
          notify(`ZIP „${job.result?.name || 'Archiv.zip'}“ erstellt (${count.toLocaleString('de-DE')} Dateien).`, 'success');
        } else {
          const extracted = job.result?.extracted ?? job.processed ?? 0;
          const skipped = job.result?.skipped ?? 0;
          notify(`${extracted.toLocaleString('de-DE')} ${extracted === 1 ? 'Datei' : 'Dateien'} entpackt${skipped ? `, ${skipped.toLocaleString('de-DE')} übersprungen` : ''}.`, 'success');
        }
        closeTransfer();
        refresh();
        return;
      }
      if (job.state === 'cancelled') {
        notify(kind === 'zip' ? 'ZIP-Erstellung abgebrochen.' : 'Entpacken abgebrochen.', 'info');
      } else {
        notify(job.message || (kind === 'zip' ? 'ZIP konnte nicht erstellt werden.' : 'ZIP konnte nicht entpackt werden.'), 'error');
      }
      closeTransfer();
      refresh();
    } catch (err) {
      if (!transfer || transfer.id !== jobId) return;
      notify(err.message || 'Auftragsstatus konnte nicht geladen werden.', 'error');
      closeTransfer();
    }
  }

  async function cancelJob(jobId) {
    try { await del(`/api/v1/files/archive/jobs/${jobId}`); } catch {}
    closeTransfer();
    notify('Auftrag abgebrochen.', 'info');
  }

  function stopTransfer() {
    if (transferTimer) clearInterval(transferTimer);
    transferTimer = null;
  }

  function closeTransfer() {
    stopTransfer();
    transfer = null;
  }

  async function createFolder() {
    if (!createName.trim()) return;
    createBusy = true;
    try {
      await post('/api/v1/folders', { name: createName.trim(), parentId: folderId });
      notify('Ordner erstellt.', 'success');
      createOpen = false;
      createName = '';
      refresh();
    } catch (err) { notify(err.message, 'error'); } finally { createBusy = false; }
  }

  function chooseUploads() { uploadInput?.click(); }

  function onUploads(event) {
    const files = [...(event.target.files || [])];
    if (files.length) {
      addFiles(files, folderId);
      notify(`${files.length} ${files.length === 1 ? 'Datei' : 'Dateien'} zur Warteschlange hinzugefügt.`, 'success');
    }
    event.target.value = '';
  }

  function onDragEnter(event) {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    dragDepth += 1;
    dragOver = true;
  }

  function onDragLeave() {
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dragOver = false;
  }

  function onDrop(event) {
    event.preventDefault();
    dragDepth = 0;
    dragOver = false;
    const files = [...(event.dataTransfer?.files || [])];
    if (files.length) addFiles(files, folderId);
  }

  function onMoved() { refresh(); }

  function itemSub(item) {
    return item.kind === 'folder' ? 'Ordner' : bytes(item.size);
  }
</script>

<div
  class="page page--wide"
  role="region"
  aria-label="Dateibereich"
  on:dragenter={onDragEnter}
  on:dragover={(e) => { e.preventDefault(); }}
  on:dragleave={onDragLeave}
  on:drop={onDrop}
>
  <header class="page-head">
    <div>
      <nav class="crumbs" aria-label="Pfad">
        <a class="crumb" href="/files" data-route={folderId ? '' : undefined} aria-current={!folderId ? 'page' : undefined}>Meine Dateien</a>
        {#each breadcrumbs as crumb}
          <span class="crumb-sep" aria-hidden="true"><Icon name="chevron-right" size={13} /></span>
          <a class="crumb" href={`/files/${crumb.id}`} data-route aria-current={crumb.id === folderId ? 'page' : undefined}>{crumb.name}</a>
        {/each}
      </nav>
      <h1 style="margin-top:var(--space-2)">{folderId ? (breadcrumbs[breadcrumbs.length - 1]?.name || 'Ordner') : 'Dateien'}</h1>
      <p class="lede">{total.toLocaleString('de-DE')} {total === 1 ? 'Element' : 'Elemente'} · ziehe Dateien hierher, um sie hochzuladen.</p>
    </div>
    <div class="page-actions">
      <Button variant="secondary" icon="file-plus" onclick={newDocument}>Neues Dokument</Button>
      <Button variant="secondary" icon="folder-plus" onclick={() => { createOpen = true; createName = ''; }}>Neuer Ordner</Button>
      <Button variant="primary" icon="upload" onclick={chooseUploads}>Hochladen</Button>
    </div>
  </header>

  <input class="sr-only" type="file" multiple bind:this={uploadInput} on:change={onUploads} />

  <div class="files-toolbar">
    <select class="select" style="width:auto;min-height:2.25rem;font-size:var(--text-sm)" value={sort} on:change={(event) => { sort = event.target.value; dir = 'asc'; load(); }} aria-label="Sortieren nach">
      <option value="name">Name</option>
      <option value="updatedAt">Geändert</option>
      <option value="size">Größe</option>
      <option value="kind">Typ</option>
    </select>
    <IconButton name={dir === 'asc' ? 'arrow-up' : 'arrow-down'} label={dir === 'asc' ? 'Aufsteigend' : 'Absteigend'} onclick={() => toggleSort(sort)} />
    <span class="grow"></span>
    <span class="tag">{view === 'grid' ? 'Raster' : 'Liste'}</span>
    <div class="segmented" role="group" aria-label="Ansicht">
      <button type="button" aria-pressed={view === 'list'} on:click={() => setView('list')} aria-label="Listenansicht"><Icon name="list" size={16} /></button>
      <button type="button" aria-pressed={view === 'grid'} on:click={() => setView('grid')} aria-label="Rasteransicht"><Icon name="layout-grid" size={16} /></button>
    </div>
  </div>

  {#if !selectAllMode && items.length > 0 && selected.size === items.length && total > items.length}
  <div class="selection-hint" role="status" aria-live="polite">
    <span>{selected.size.toLocaleString('de-DE')} von {total.toLocaleString('de-DE')} Elementen ausgewählt</span>
    <button type="button" class="link-btn" on:click={selectAllNow}>Alle {total.toLocaleString('de-DE')} auswählen</button>
  </div>
  {/if}

  {#if failed}
    <EmptyState icon="cloud-off" title="Ordner konnte nicht geladen werden" text={failed} action={load} actionLabel="Erneut versuchen" />
  {:else if loading}
    <div class="file-list loading-block"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div>
  {:else if !items.length}
    <EmptyState icon="folder-open" title={folderId ? 'Dieser Ordner ist leer' : 'Hier ist noch Platz'} text="Lade Dateien hoch oder lege einen Unterordner an.">
      <div class="page-actions" style="margin-top:var(--space-4)">
        <Button variant="secondary" size="sm" icon="folder-plus" onclick={() => { createOpen = true; createName = ''; }}>Ordner anlegen</Button>
        <Button variant="primary" size="sm" icon="upload" onclick={chooseUploads}>Dateien hochladen</Button>
      </div>
    </EmptyState>
  {:else if view === 'list'}
    <div class="file-list" role="grid" aria-label="Dateiliste">
      <div class="file-row file-row--head" role="row">
        <span class="file-row__check"><input type="checkbox" checked={checkboxChecked} use:setIndeterminate={checkboxIndeterminate} on:change={toggleAll} aria-label="Alle auswählen" /></span>
        <button class="file-row__main file-head" type="button" on:click={() => toggleSort('name')}>Name {#if sort === 'name'}<Icon name={dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} />{/if}</button>
        <button class="file-cell file-head" type="button" on:click={() => toggleSort('updatedAt')}>Geändert {#if sort === 'updatedAt'}<Icon name={dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} />{/if}</button>
        <button class="file-cell file-head" type="button" on:click={() => toggleSort('size')}>Größe {#if sort === 'size'}<Icon name={dir === 'asc' ? 'arrow-up' : 'arrow-down'} size={12} />{/if}</button>
        <span></span>
      </div>
      {#each items as item (item.id)}
        <div class="file-row" class:is-selected={isRowSelected(item)} role="row" tabindex="-1" on:contextmenu={(event) => showMenu(event, item)}>
          <span class="file-row__check"><input type="checkbox" checked={isRowSelected(item)} on:change={() => toggleSelect(item.id)} aria-label={`${item.name} auswählen`} /></span>
          <button class="file-row__main" type="button" on:click={() => openItem(item)} on:dblclick={() => openItem(item)}>
            <span class="file-icon file-icon--{fileKind(item)}" aria-hidden="true"><Icon name={fileKind(item) === 'folder' ? 'folder' : fileKind(item) === 'image' ? 'image' : fileKind(item) === 'video' ? 'play' : 'file'} size={18} /></span>
            <span style="min-width:0">
              <span class="file-name">{item.name}</span>
              <span class="file-sub">{itemSub(item)}</span>
            </span>
          </button>
          <span class="file-cell">{dateTime(item.updatedAt)}</span>
          <span class="file-cell">{item.kind === 'folder' ? '—' : bytes(item.size)}</span>
          <span class="file-row__menu">
            <IconButton name="ellipsis" label={`Aktionen für ${item.name}`} onclick={(event) => showMenu(event, item)} />
          </span>
        </div>
      {/each}
      <div class="file-list-sentinel" use:infiniteScroll aria-hidden="true"></div>
    </div>
  {:else}
    <div class="file-grid" role="list" aria-label="Dateien">
      {#each items as item (item.id)}
        <div class="file-tile" role="listitem" class:is-selected={isRowSelected(item)} on:contextmenu={(event) => showMenu(event, item)}>
          <label class="file-tile__check"><input type="checkbox" checked={isRowSelected(item)} on:change={() => toggleSelect(item.id)} aria-label={`${item.name} auswählen`} /></label>
          <button type="button" class="file-tile__preview" on:click={() => openItem(item)} on:dblclick={() => openItem(item)} aria-label={`${item.name} öffnen`}>
            {#if fileKind(item) === 'image'}
              <img src={`/api/v1/files/${item.id}/thumbnail?size=320`} alt="" loading="lazy" />
            {:else}
              <span class="file-icon file-icon--{fileKind(item)}"><Icon name={fileKind(item) === 'folder' ? 'folder' : fileKind(item) === 'video' ? 'play' : 'file'} size={28} /></span>
            {/if}
          </button>
          <div class="file-tile__body">
            <span class="file-tile__name" title={item.name}>{item.name}</span>
            <IconButton name="ellipsis" label={`Aktionen für ${item.name}`} onclick={(event) => showMenu(event, item)} />
          </div>
        </div>
      {/each}
      <div class="file-grid-sentinel" use:infiniteScroll aria-hidden="true"></div>
    </div>
  {/if}

  {#if selectedCount > 0 && !trashBusy}
    <div class="selection-bar" role="toolbar" aria-label="Auswahl">
      <strong class="selection-bar__count">{selectedCount.toLocaleString('de-DE')} ausgewählt</strong>
      <Button variant="quiet" size="sm" icon="x" onclick={resetSelection}>Aufheben</Button>
      {#if singleSelected}
        <Button variant="quiet" size="sm" icon="link" onclick={() => (shareNode = singleSelected)}>Teilen</Button>
        <Button variant="quiet" size="sm" icon="folder-input" onclick={() => (moveNode = singleSelected)}>Verschieben</Button>
      {/if}
      <Button variant="quiet" size="sm" icon="file-archive" onclick={downloadZip}>Als ZIP herunterladen</Button>
      <Button variant="quiet" size="sm" icon="folder-archive" onclick={openZipCreate}>ZIP erstellen</Button>
      {#if zipSingle}
        <Button variant="quiet" size="sm" icon="package-open" onclick={() => openExtract(zipSingle)}>Entpacken</Button>
      {/if}
      <Button variant="danger" size="sm" icon="trash-2" loading={trashBusy} disabled={trashBusy} onclick={trashSelection}>Löschen</Button>
    </div>
  {/if}

  {#if transfer}
    <div class="archive-transfer" role="status" aria-live="polite">
      <div class="archive-transfer__head">
        <span class="archive-transfer__icon"><Icon name={transfer.kind === 'extract' ? 'package-open' : 'file-archive'} size={20} /></span>
        <div class="archive-transfer__text">
          <strong>{transfer.title}</strong>
          <span>{transfer.detail}</span>
        </div>
        <IconButton name="x" label="Abbrechen" onclick={() => transfer.cancel()} />
      </div>
      <ProgressBar value={transfer.value} max={transfer.max} size="sm" tone="brand" label={transfer.title} />
      <div class="archive-transfer__foot">
        <span>{Math.round(Math.min(100, (transfer.value / (transfer.max || 1)) * 100))} %</span>
        <Button variant="quiet" size="sm" icon="x" onclick={transfer.cancel}>Abbrechen</Button>
      </div>
    </div>
  {/if}

  {#if dragOver}
    <div class="drop-overlay" aria-hidden="true">
      <div class="drop-card">
        <Icon name="upload-cloud" size={36} />
        <h2>Zum Hochladen loslassen</h2>
        <p>Die Dateien landen in {folderId ? `„${breadcrumbs[breadcrumbs.length - 1]?.name}“` : '„Meine Dateien“'}.</p>
      </div>
    </div>
  {/if}
</div>

{#if menu.open}
  <div class="menu-pop" style="position:fixed;left:{menu.x}px;top:{menu.y}px;z-index:70" role="menu" aria-label="Dateiaktionen">
    <button class="menu-item" role="menuitem" on:click={() => menuAction('open')}><Icon name="external-link" size={16} />{menu.item?.kind === 'folder' ? 'Öffnen' : 'Vorschau'}</button>
    {#if menu.item?.kind === 'file'}
      <button class="menu-item" role="menuitem" on:click={() => menuAction('download')}><Icon name="download" size={16} />Herunterladen</button>
    {/if}
    {#if isZip(menu.item)}
      <button class="menu-item" role="menuitem" on:click={() => menuAction('extract')}><Icon name="package-open" size={16} />Entpacken</button>
    {/if}
    <button class="menu-item" role="menuitem" on:click={() => menuAction('share')}><Icon name="link" size={16} />Teilen</button>
    <button class="menu-item" role="menuitem" on:click={() => menuAction('rename')}><Icon name="pencil" size={16} />Umbenennen</button>
    <button class="menu-item" role="menuitem" on:click={() => menuAction('move')}><Icon name="folder-input" size={16} />Verschieben</button>
    <button class="menu-item" role="menuitem" on:click={() => menuAction('copy')}><Icon name="copy" size={16} />Kopie erstellen</button>
    <div class="menu-sep"></div>
    <button class="menu-item menu-item--danger" role="menuitem" on:click={() => menuAction('trash')}><Icon name="trash-2" size={16} />In den Papierkorb</button>
  </div>
{/if}

<Dialog open={createOpen} title="Neuer Ordner" description="Ordner helfen, Dateien an einem Ort zu bündeln." size="sm" onclose={() => (createOpen = false)}>
  <Field label="Name" id="new-folder" required>
    <input id="new-folder" class="input" bind:value={createName} placeholder="z. B. Projektunterlagen" on:keydown={(event) => event.key === 'Enter' && createFolder()} />
  </Field>
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (createOpen = false)}>Abbrechen</Button>
    <Button variant="primary" loading={createBusy} disabled={!createName.trim()} onclick={createFolder}>Ordner erstellen</Button>
  </svelte:fragment>
</Dialog>

<Dialog open={renameOpen} title="Umbenennen" size="sm" onclose={() => (renameOpen = false)}>
  <Field label="Neuer Name" id="rename-input-field" required>
    <input id="rename-input" class="input" bind:value={renameValue} on:keydown={(event) => event.key === 'Enter' && doRename()} />
  </Field>
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (renameOpen = false)}>Abbrechen</Button>
    <Button variant="primary" disabled={!renameValue.trim()} onclick={doRename}>Speichern</Button>
  </svelte:fragment>
</Dialog>

<Dialog open={zipCreateOpen} title="ZIP erstellen" description={`${selectedCount.toLocaleString('de-DE')} Element(e) werden im aktuellen Ordner als ZIP gespeichert.`} size="sm" onclose={() => (zipCreateOpen = false)}>
  <Field label="Dateiname" id="zip-name" required>
    <input id="zip-name" class="input" bind:value={zipCreateName} on:keydown={(event) => event.key === 'Enter' && createZip()} />
  </Field>
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (zipCreateOpen = false)}>Abbrechen</Button>
    <Button variant="primary" icon="file-archive" loading={zipCreateBusy} disabled={!zipCreateName.trim()} onclick={createZip}>ZIP erstellen</Button>
  </svelte:fragment>
</Dialog>

<Dialog open={extractOpen} title="ZIP entpacken" description={extractNode ? `„${extractNode.name}“` : ''} size="sm" onclose={() => (extractOpen = false)}>
  <div class="extract-options">
    <label class="extract-option">
      <input type="radio" name="extract-target" value="here" bind:group={extractTarget} />
      <span><strong>Hier entpacken</strong><small>Die Dateien landen im aktuellen Ordner.</small></span>
    </label>
    <label class="extract-option">
      <input type="radio" name="extract-target" value="newFolder" bind:group={extractTarget} />
      <span><strong>In neuen Ordner entpacken</strong><small>Ein Ordner mit dem Namen der ZIP-Datei wird angelegt.</small></span>
    </label>
  </div>
  {#if extractTarget === 'newFolder'}
    <Field label="Ordnername" id="extract-folder" required>
      <input id="extract-folder" class="input" bind:value={extractFolderName} />
    </Field>
  {/if}
  <Field label="Bei Namenskonflikten" id="extract-conflict">
    <select id="extract-conflict" class="select" bind:value={extractConflict}>
      <option value="keepBoth">Beide behalten</option>
      <option value="skip">Überspringen</option>
      <option value="replace">Ersetzen</option>
    </select>
  </Field>
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (extractOpen = false)}>Abbrechen</Button>
    <Button variant="primary" icon="package-open" loading={extractBusy} onclick={startExtract}>Entpacken</Button>
  </svelte:fragment>
</Dialog>

<ShareDialog open={Boolean(shareNode)} node={shareNode} onclose={() => (shareNode = null)} />
<MoveDialog open={Boolean(moveNode)} node={moveNode} onclose={() => (moveNode = null)} onmoved={onMoved} />
{#if previewNode}
  <FilePreview node={previewNode} onclose={closePreview} />
{/if}
