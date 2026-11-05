<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { get as readStore } from 'svelte/store';
  import { get, post, patch, del } from '../lib/api.js';
  import { addFiles } from '../lib/uploads.js';
  import { notify, refresh, refreshKey, confirmAction } from '../lib/stores.js';
  import { clipboard } from '../lib/clipboard.js';
  import { refreshJobs } from '../lib/jobs.js';
  import { selectionBar } from '../lib/selection-bar.js';
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

  const SORT_FIELDS = ['name', 'updatedAt', 'size', 'kind'];
  const initialQuery = new URLSearchParams(window.location.search);
  const initialView = initialQuery.get('view');

  let items = [];
  let total = 0;
  let breadcrumbs = [];
  let loading = true;
  let failed = '';
  let view = initialView === 'grid' || initialView === 'list'
    ? initialView
    : (localStorage.getItem('onebox-view') === 'grid' ? 'grid' : 'list');
  let sort = SORT_FIELDS.includes(initialQuery.get('sort')) ? initialQuery.get('sort') : 'name';
  let dir = initialQuery.get('dir') === 'desc' ? 'desc' : 'asc';
  let selected = new Set();
  let anchorId = null;
  let focusedId = null;
  let rowRefs = [];
  let dragOver = false;
  let dragDepth = 0;
  let dragIds = [];
  let dropTarget = null;
  let menuSheet = false;
  let menu = { open: false, x: 0, y: 0, item: null };
  let helpOpen = false;
  let pressTimer = null;
  let pressStart = null;
  let suppressClick = false;
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
  let detailsOpen = false;
  let detailsNode = null;
  let textEditOpen = false;
  let textEditNode = null;
  let uploadInput;
  let folderUploadInput;
  let lastFolder;
  let lastRefresh = -1;
  let nextCursor = null;
  let loadingMore = false;
  let lastSort = sort;
  let lastDir = dir;

  const SHORTCUTS = [
    { keys: ['Entf'], label: 'In den Papierkorb' },
    { keys: ['F2'], label: 'Umbenennen' },
    { keys: ['Strg', 'A'], label: 'Alles auswählen' },
    { keys: ['Esc'], label: 'Auswahl aufheben' },
    { keys: ['Enter'], label: 'Öffnen' },
    { keys: ['↑', '↓'], label: 'Navigieren' },
    { keys: ['Shift', '↑'], label: 'Bereich auswählen' },
    { keys: ['Leertaste'], label: 'Auswahl umschalten' },
    { keys: ['Strg', 'C'], label: 'Kopieren' },
    { keys: ['Strg', 'X'], label: 'Ausschneiden' },
    { keys: ['Strg', 'V'], label: 'Einfügen' },
    { keys: ['/'], label: 'Suche fokussieren' },
    { keys: ['?'], label: 'Diese Hilfe' },
  ];


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
  $: selectionBar.set(selectedCount > 0 ? {
    count: selectedCount,
    total,
    single: singleSelected,
    zipSingle,
    busy: trashBusy,
    onClear: resetSelection,
    onShare: () => (shareNode = singleSelected),
    onMove: () => (moveNode = singleSelected),
    onDownloadZip: downloadZip,
    onCreateZip: openZipCreate,
    onExtract: () => openExtract(zipSingle),
    onTrash: trashSelection,
  } : null);

  onDestroy(() => selectionBar.set(null));
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
    const onKey = (event) => onGlobalKey(event);
    const onPop = () => {
      const query = new URLSearchParams(window.location.search);
      const nextView = query.get('view') === 'grid' ? 'grid' : 'list';
      const nextSort = SORT_FIELDS.includes(query.get('sort')) ? query.get('sort') : 'name';
      const nextDir = query.get('dir') === 'desc' ? 'desc' : 'asc';
      if (nextView !== view || nextSort !== sort || nextDir !== dir) {
        view = nextView;
        sort = nextSort;
        dir = nextDir;
      }
    };
    window.addEventListener('click', closeMenu);
    window.addEventListener('keydown', onKey);
    window.addEventListener('popstate', onPop);
    return () => {
      window.removeEventListener('click', closeMenu);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('popstate', onPop);
      clearTimeout(pressTimer);
      stopTransfer();
    };
  });

  function isTyping(target) {
    if (!target) return false;
    return ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
  }

  function syncUrl() {
    const url = new URL(window.location.href);
    if (view === 'list') url.searchParams.delete('view');
    else url.searchParams.set('view', view);
    if (sort === 'name') url.searchParams.delete('sort');
    else url.searchParams.set('sort', sort);
    if (dir === 'asc') url.searchParams.delete('dir');
    else url.searchParams.set('dir', dir);
    history.replaceState(history.state, '', url);
  }

  function onGlobalKey(event) {
    if (event.key === 'Escape') {
      const hadMenu = menu.open;
      menu = { ...menu, open: false };
      if (helpOpen) { helpOpen = false; return; }
      if (hadMenu) return;
      resetSelection();
      return;
    }
    if (isTyping(event.target)) return;
    const mod = event.ctrlKey || event.metaKey;
    const key = event.key;
    const index = Math.max(0, items.findIndex((item) => item.id === focusedId));

    if (mod && key.toLowerCase() === 'a') { event.preventDefault(); selectAllNow(); return; }
    if (mod && key.toLowerCase() === 'c') { event.preventDefault(); copySelection(); return; }
    if (mod && key.toLowerCase() === 'x') { event.preventDefault(); cutSelection(); return; }
    if (mod && key.toLowerCase() === 'v') { event.preventDefault(); pasteClipboard(); return; }
    if (key === 'Delete') {
      if (selectedCount) { event.preventDefault(); trashSelection(); }
      return;
    }
    if (key === 'F2') {
      if (singleSelected) { event.preventDefault(); startRename(singleSelected); }
      return;
    }
    if (key === 'Enter') {
      const item = items.find((entry) => entry.id === focusedId) || singleSelected;
      if (item) { event.preventDefault(); openItem(item); }
      return;
    }
    if (key === ' ') {
      if (focusedId) { event.preventDefault(); toggleSelect(focusedId); }
      return;
    }
    if (key === '/') {
      event.preventDefault();
      document.querySelector('#global-search')?.focus();
      return;
    }
    if (key === '?') { event.preventDefault(); helpOpen = true; return; }
    if (['ArrowDown', 'ArrowRight'].includes(key)) {
      event.preventDefault();
      focusRow(index + 1, { extend: event.shiftKey });
      return;
    }
    if (['ArrowUp', 'ArrowLeft'].includes(key)) {
      event.preventDefault();
      focusRow(index - 1, { extend: event.shiftKey });
    }
  }

  function focusRow(index, { extend = false } = {}) {
    if (!items.length) return;
    const clamped = Math.max(0, Math.min(items.length - 1, index));
    const item = items[clamped];
    focusedId = item.id;
    if (extend) selectRange(clamped);
    else selectOnly(item.id);
    tick().then(() => rowRefs[clamped]?.focus());
  }

  function selectIds(ids) {
    selectAllMode = false;
    excluded = new Set();
    selectionSnapshot = null;
    selectionTotal = 0;
    selectionFilter = null;
    selected = new Set(ids);
  }

  function selectOnly(id) {
    selectIds([id]);
    anchorId = id;
    focusedId = id;
  }

  function selectRange(index) {
    const item = items[index];
    if (!item) return;
    const anchorIndex = items.findIndex((entry) => entry.id === anchorId);
    if (anchorIndex === -1) { selectOnly(item.id); return; }
    const from = Math.min(anchorIndex, index);
    const to = Math.max(anchorIndex, index);
    selectIds(items.slice(from, to + 1).map((entry) => entry.id));
    focusedId = item.id;
  }

  function onItemClick(event, item, index) {
    if (suppressClick) { suppressClick = false; return; }
    if (event.target?.closest?.('input[type="checkbox"]')) return;
    if (event.shiftKey) { selectRange(index); return; }
    if (event.ctrlKey || event.metaKey) {
      anchorId = item.id;
      focusedId = item.id;
      toggleSelect(item.id);
      return;
    }
    selectOnly(item.id);
  }

  /** Liefert die IDs, die eine Aktion auf diesem Element betreffen würde. */
  function selectionIdsForItem(item) {
    if (isRowSelected(item)) return [...selectionIds()];
    return [item.id];
  }

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

  /** Explizite IDs der aktuellen Auswahl (ohne "alle"-Modus). */
  function selectionIds() {
    if (selectAllMode) {
      return items.filter((item) => !excluded.has(item.id)).map((item) => item.id);
    }
    return [...selected];
  }

  function selectionNodes() {
    return selectAllMode
      ? items.filter((item) => !excluded.has(item.id))
      : items.filter((item) => selected.has(item.id));
  }

  async function load() {
    loading = true;
    failed = '';
    resetSelection();
    try {
      const data = await get(`/api/v1/files?parent=${folderId || 'root'}&sort=${sort}&dir=${dir}&limit=100`);
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
      const data = await get(`/api/v1/files?parent=${folderId || 'root'}&sort=${sort}&dir=${dir}&limit=100&cursor=${encodeURIComponent(nextCursor)}`);
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
    syncUrl();
  }

  function toggleSort(column) {
    if (sort === column) dir = dir === 'asc' ? 'desc' : 'asc';
    else { sort = column; dir = 'asc'; }
    syncUrl();
  }

  function changeSort(next) {
    sort = next;
    dir = 'asc';
    syncUrl();
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
      anchorId = id;
      focusedId = id;
      return;
    }
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    selected = next;
    anchorId = id;
    focusedId = id;
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

  function openMenuAt(x, y, item) {
    if (item && !isRowSelected(item)) selectOnly(item.id);
    menuSheet = window.matchMedia('(max-width: 700px)').matches;
    const width = 236;
    const height = 380;
    const left = Math.max(8, Math.min(x, window.innerWidth - width - 8));
    const top = Math.max(8, Math.min(y, window.innerHeight - height));
    menu = { open: true, x: left, y: top, item };
  }

  function showMenu(event, item) {
    event.stopPropagation();
    if (event.type === 'contextmenu') event.preventDefault();
    const rect = event.currentTarget?.getBoundingClientRect?.();
    const x = event.clientX || (rect ? rect.right - 16 : 16);
    const y = event.clientY || (rect ? rect.bottom + 4 : 16);
    openMenuAt(x, y, item);
  }

  /** Long-Press öffnet auf Touch-Geräten dasselbe Menü wie ein Rechtsklick. */
  function startLongPress(event, item) {
    if (event.pointerType === 'mouse') return;
    pressStart = { x: event.clientX, y: event.clientY };
    clearTimeout(pressTimer);
    pressTimer = setTimeout(() => {
      suppressClick = true;
      openMenuAt(event.clientX, event.clientY, item);
      navigator.vibrate?.(10);
    }, 480);
  }

  function moveLongPress(event) {
    if (!pressStart) return;
    if (Math.hypot(event.clientX - pressStart.x, event.clientY - pressStart.y) > 10) cancelLongPress();
  }

  function cancelLongPress() {
    clearTimeout(pressTimer);
    pressTimer = null;
    pressStart = null;
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
    if (action === 'trash') (selectedCount > 1 ? trashSelection() : trashItem(item));
    if (action === 'copy') copyNode(item);
    if (action === 'details') { detailsNode = item; detailsOpen = true; }
    if (action === 'extract') openExtract(item);
    if (action === 'zipDownload') downloadZip();
    if (action === 'zipCreate') openZipCreate();
  }

  function copySelection() {
    const nodes = selectionNodes();
    if (!nodes.length) return;
    clipboard.set({ mode: 'copy', ids: nodes.map((node) => node.id), names: nodes.map((node) => node.name) });
    notify(`${nodes.length} ${nodes.length === 1 ? 'Element' : 'Elemente'} kopiert.`, 'info');
  }

  function cutSelection() {
    const nodes = selectionNodes();
    if (!nodes.length) return;
    clipboard.set({ mode: 'cut', ids: nodes.map((node) => node.id), names: nodes.map((node) => node.name) });
    notify(`${nodes.length} ${nodes.length === 1 ? 'Element' : 'Elemente'} ausgeschnitten.`, 'info');
  }

  async function pasteClipboard() {
    const clip = readStore(clipboard);
    if (!clip.ids.length) return;
    try {
      if (clip.mode === 'copy') {
        for (const id of clip.ids) {
          await post(`/api/v1/files/${id}/copy`, { parentId: folderId || null });
        }
        notify(`${clip.ids.length} ${clip.ids.length === 1 ? 'Element' : 'Elemente'} eingefügt.`, 'success');
      } else {
        await moveNodes(clip.ids, folderId || null);
        clipboard.set({ mode: null, ids: [], names: [] });
      }
      refresh();
    } catch (err) {
      notify(err.message || 'Einfügen fehlgeschlagen.', 'error');
    }
  }

  async function moveNodes(ids, parentId) {
    const unique = [...new Set(ids)].filter(Boolean);
    if (!unique.length) return;
    let moved = 0;
    let lastError = null;
    for (const id of unique) {
      try {
        await patch(`/api/v1/files/${id}`, { parentId: parentId ?? null });
        moved += 1;
      } catch (err) { lastError = err; }
    }
    if (moved) {
      notify(`${moved} ${moved === 1 ? 'Element' : 'Elemente'} verschoben.`, 'success');
      resetSelection();
      refresh();
    }
    if (lastError && moved < unique.length) {
      notify(lastError.message || 'Einige Elemente konnten nicht verschoben werden.', 'error');
    }
  }

  function undoTrash(stamp) {
    return {
      label: 'Rückgängig',
      onClick: async () => {
        try {
          const result = await post('/api/v1/files/trash/restore', { stamp });
          notify(`${(result.restored || 0).toLocaleString('de-DE')} ${result.restored === 1 ? 'Element' : 'Elemente'} wiederhergestellt.`, 'success');
          refresh();
        } catch (err) {
          notify(err.message || 'Wiederherstellen fehlgeschlagen.', 'error');
        }
      },
    };
  }

  function isInternalDrag(dataTransfer) {
    return Boolean(dataTransfer?.types?.includes('application/x-onebox-nodes'));
  }

  function onInternalDragStart(event, item) {
    const ids = selectionIdsForItem(item);
    if (!isRowSelected(item)) selectOnly(item.id);
    dragIds = ids;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-onebox-nodes', JSON.stringify(ids));
    event.dataTransfer.setData('text/plain', ids.join('\n'));
  }

  function onInternalDragEnd() {
    dragIds = [];
    dropTarget = null;
  }

  function onNodeDragOver(event, item) {
    if (item.kind !== 'folder' || !isInternalDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    dropTarget = item.id;
  }

  function onNodeDragLeave(event, item) {
    if (dropTarget === item.id && !event.currentTarget.contains(event.relatedTarget)) dropTarget = null;
  }

  async function onNodeDrop(event, item) {
    if (!isInternalDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    let ids = dragIds;
    try {
      const raw = event.dataTransfer.getData('application/x-onebox-nodes');
      if (raw) ids = JSON.parse(raw);
    } catch { /* Fallback auf dragIds */ }
    dropTarget = null;
    dragIds = [];
    await moveNodes(ids.filter((id) => id !== item.id), item.id);
  }

  function onCrumbDragOver(event, targetId) {
    if (!isInternalDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    dropTarget = `crumb:${targetId || 'root'}`;
  }

  function onCrumbDragLeave(event, targetId) {
    if (dropTarget === `crumb:${targetId || 'root'}` && !event.currentTarget.contains(event.relatedTarget)) dropTarget = null;
  }

  async function onCrumbDrop(event, targetId) {
    if (!isInternalDrag(event.dataTransfer)) return;
    event.preventDefault();
    event.stopPropagation();
    let ids = dragIds;
    try {
      const raw = event.dataTransfer.getData('application/x-onebox-nodes');
      if (raw) ids = JSON.parse(raw);
    } catch { /* Fallback auf dragIds */ }
    dropTarget = null;
    dragIds = [];
    await moveNodes(ids, targetId || null);
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
    try {
      const result = await post('/api/v1/files/trash', selectionBody());
      const moved = Number(result.trashed) || countNow;
      refreshJobs();
      notify(
        `${moved.toLocaleString('de-DE')} ${moved === 1 ? 'Element' : 'Elemente'} in den Papierkorb verschoben.`,
        'success',
        10000,
        result.stamp ? undoTrash(result.stamp) : null,
      );
      resetSelection();
      await load();
    } catch (err) {
      refreshJobs();
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
    try {
      const result = await post('/api/v1/files/trash', { ids: [item.id] });
      refreshJobs();
      notify('Element in den Papierkorb verschoben.', 'success', 10000, result.stamp ? undoTrash(result.stamp) : null);
      resetSelection();
      await load();
    } catch (err) {
      refreshJobs();
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

  function chooseFolderUploads() { folderUploadInput?.click(); }

  function onFolderUploads(event) {
    const entries = [...(event.target.files || [])].map((file) => {
      const parts = String(file.webkitRelativePath || file.name).split('/');
      return { file, path: parts.slice(0, -1) };
    });
    event.target.value = '';
    if (entries.length) uploadTree(entries);
  }

  /** Legt die Ordnerstruktur an und hängt die Dateien an der richtigen Stelle ein. */
  async function uploadTree(entries) {
    const folders = new Map([['', folderId || null]]);
    let created = 0;
    for (const entry of entries) {
      let parentId = folderId || null;
      let key = '';
      for (const part of entry.path) {
        const nextKey = key ? `${key}/${part}` : part;
        if (!folders.has(nextKey)) {
          try {
            const result = await post('/api/v1/folders', { name: part, parentId: parentId || null });
            folders.set(nextKey, result.node.id);
            created += 1;
          } catch {
            folders.set(nextKey, parentId);
          }
        }
        parentId = folders.get(nextKey);
        key = nextKey;
      }
      addFiles([entry.file], parentId);
    }
    notify(`${entries.length} ${entries.length === 1 ? 'Datei' : 'Dateien'} in ${created ? `${created} ${created === 1 ? 'Ordner' : 'Ordner'}` : 'diesen Ordner'} einsortiert.`, 'success');
    if (created) refresh();
  }

  async function readEntry(entry, pathParts, out) {
    if (entry.isFile) {
      const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
      out.push({ file, path: pathParts });
      return;
    }
    if (!entry.isDirectory) return;
    const reader = entry.createReader();
    const children = await new Promise((resolve) => {
      const all = [];
      const read = () => reader.readEntries((rows) => {
        if (!rows.length) return resolve(all);
        all.push(...rows);
        read();
      }, () => resolve(all));
      read();
    });
    for (const child of children) await readEntry(child, [...pathParts, entry.name], out);
  }

  async function entriesFromDrop(dataTransfer) {
    const roots = [...(dataTransfer.items || [])]
      .map((item) => item.webkitGetAsEntry?.())
      .filter(Boolean);
    if (!roots.length) return [...(dataTransfer.files || [])].map((file) => ({ file, path: [] }));
    const out = [];
    for (const root of roots) await readEntry(root, [], out);
    return out;
  }

  function onDragEnter(event) {
    if (isInternalDrag(event.dataTransfer)) return;
    if (!event.dataTransfer?.types?.includes('Files')) return;
    dragDepth += 1;
    dragOver = true;
  }

  function onDragLeave(event) {
    if (isInternalDrag(event.dataTransfer)) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dragOver = false;
  }

  async function onDrop(event) {
    event.preventDefault();
    dragDepth = 0;
    dragOver = false;
    if (!event.dataTransfer || isInternalDrag(event.dataTransfer)) return;
    const entries = await entriesFromDrop(event.dataTransfer);
    if (!entries.length) return;
    const hasTree = entries.some((entry) => entry.path.length > 0);
    if (hasTree) await uploadTree(entries);
    else addFiles(entries.map((entry) => entry.file), folderId);
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
        <a class="crumb" class:is-drop={dropTarget === 'crumb:root'} href="/files" data-route={folderId ? '' : undefined} aria-current={!folderId ? 'page' : undefined}
          on:dragover={(event) => onCrumbDragOver(event, null)}
          on:dragleave={(event) => onCrumbDragLeave(event, null)}
          on:drop={(event) => onCrumbDrop(event, null)}>Meine Dateien</a>
        {#each breadcrumbs as crumb}
          <span class="crumb-sep" aria-hidden="true"><Icon name="chevron-right" size={13} /></span>
          <a class="crumb" class:is-drop={dropTarget === `crumb:${crumb.id}`} href={`/files/${crumb.id}`} data-route aria-current={crumb.id === folderId ? 'page' : undefined}
            on:dragover={(event) => onCrumbDragOver(event, crumb.id)}
            on:dragleave={(event) => onCrumbDragLeave(event, crumb.id)}
            on:drop={(event) => onCrumbDrop(event, crumb.id)}>{crumb.name}</a>
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

  <input class="sr-only" type="file" multiple data-testid="files-upload-input" bind:this={uploadInput} on:change={onUploads} />
  <input class="sr-only" type="file" multiple webkitdirectory directory bind:this={folderUploadInput} on:change={onFolderUploads} />

  <div class="files-toolbar">
    <select class="select" style="width:auto;min-height:2.25rem;font-size:var(--text-sm)" value={sort} on:change={(event) => changeSort(event.target.value)} aria-label="Sortieren nach">
      <option value="name">Name</option>
      <option value="updatedAt">Geändert</option>
      <option value="size">Größe</option>
      <option value="kind">Typ</option>
    </select>
    <IconButton name={dir === 'asc' ? 'arrow-up' : 'arrow-down'} label={dir === 'asc' ? 'Aufsteigend' : 'Absteigend'} onclick={() => toggleSort(sort)} />
    <span class="grow"></span>
    {#if $clipboard.ids.length}
      <Button variant="quiet" size="sm" icon="clipboard-paste" onclick={pasteClipboard}>Einfügen ({$clipboard.ids.length})</Button>
    {/if}
    <IconButton name="circle-help" label="Tastaturkürzel anzeigen" onclick={() => (helpOpen = true)} />
    <IconButton name="folder-up" label="Ordner hochladen" onclick={chooseFolderUploads} />
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
      {#each items as item, index (item.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
        <div class="file-row" class:is-selected={isRowSelected(item)} class:is-focused={focusedId === item.id}
          class:is-cut={$clipboard.mode === 'cut' && $clipboard.ids.includes(item.id)}
          class:is-drop={dropTarget === item.id}
          role="row" tabindex={focusedId === item.id ? 0 : -1}
          bind:this={rowRefs[index]}
          draggable="true"
          on:focus={() => (focusedId = item.id)}
          on:click={(event) => onItemClick(event, item, index)}
          on:dblclick={() => openItem(item)}
          on:contextmenu={(event) => showMenu(event, item)}
          on:pointerdown={(event) => startLongPress(event, item)}
          on:pointermove={moveLongPress}
          on:pointerup={cancelLongPress}
          on:pointercancel={cancelLongPress}
          on:dragstart={(event) => onInternalDragStart(event, item)}
          on:dragend={onInternalDragEnd}
          on:dragover={(event) => onNodeDragOver(event, item)}
          on:dragleave={(event) => onNodeDragLeave(event, item)}
          on:drop={(event) => onNodeDrop(event, item)}>
          <span class="file-row__check"><input type="checkbox" checked={isRowSelected(item)} on:change={() => toggleSelect(item.id)} aria-label={`${item.name} auswählen`} /></span>
          <div class="file-row__main">
            <span class="file-icon file-icon--{fileKind(item)}" aria-hidden="true"><Icon name={fileKind(item) === 'folder' ? 'folder' : fileKind(item) === 'image' ? 'image' : fileKind(item) === 'video' ? 'play' : 'file'} size={18} /></span>
            <span style="min-width:0">
              <span class="file-name">{item.name}</span>
              <span class="file-sub">{itemSub(item)}</span>
            </span>
          </div>
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
      {#each items as item, index (item.id)}
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
        <div class="file-tile" role="listitem" tabindex={focusedId === item.id ? 0 : -1}
          class:is-selected={isRowSelected(item)} class:is-focused={focusedId === item.id}
          class:is-cut={$clipboard.mode === 'cut' && $clipboard.ids.includes(item.id)}
          class:is-drop={dropTarget === item.id}
          bind:this={rowRefs[index]}
          draggable="true"
          on:focus={() => (focusedId = item.id)}
          on:click={(event) => onItemClick(event, item, index)}
          on:dblclick={() => openItem(item)}
          on:contextmenu={(event) => showMenu(event, item)}
          on:pointerdown={(event) => startLongPress(event, item)}
          on:pointermove={moveLongPress}
          on:pointerup={cancelLongPress}
          on:pointercancel={cancelLongPress}
          on:dragstart={(event) => onInternalDragStart(event, item)}
          on:dragend={onInternalDragEnd}
          on:dragover={(event) => onNodeDragOver(event, item)}
          on:dragleave={(event) => onNodeDragLeave(event, item)}
          on:drop={(event) => onNodeDrop(event, item)}>
          <label class="file-tile__check"><input type="checkbox" checked={isRowSelected(item)} on:change={() => toggleSelect(item.id)} aria-label={`${item.name} auswählen`} /></label>
          <div class="file-tile__preview">
            {#if fileKind(item) === 'image' || fileKind(item) === 'pdf'}
              <span class="file-icon file-icon--{fileKind(item)}"><Icon name={fileKind(item) === 'pdf' ? 'file-text' : 'image'} size={28} /></span>
              <img class="file-tile__img" src={`/api/v1/files/${item.id}/thumbnail?size=320`} alt="" loading="lazy" on:error={(event) => { event.currentTarget.style.display = 'none'; }} />
            {:else}
              <span class="file-icon file-icon--{fileKind(item)}"><Icon name={fileKind(item) === 'folder' ? 'folder' : fileKind(item) === 'video' ? 'play' : 'file'} size={28} /></span>
            {/if}
          </div>
          <div class="file-tile__body">
            <span class="file-tile__name" title={item.name}>{item.name}</span>
            <IconButton name="ellipsis" label={`Aktionen für ${item.name}`} onclick={(event) => showMenu(event, item)} />
          </div>
        </div>
      {/each}
      <div class="file-grid-sentinel" use:infiniteScroll aria-hidden="true"></div>
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
  <div class="menu-pop" class:menu-pop--sheet={menuSheet} style={menuSheet ? '' : `position:fixed;left:${menu.x}px;top:${menu.y}px;z-index:70`} role="menu" aria-label="Dateiaktionen">
    {#if menuSheet}<div class="menu-sheet-handle" aria-hidden="true"></div>{/if}
    <button class="menu-item" role="menuitem" on:click={() => menuAction('open')}><Icon name={menu.item?.kind === 'folder' ? 'folder-open' : 'external-link'} size={16} />{menu.item?.kind === 'folder' ? 'Öffnen' : 'Vorschau'}</button>
    {#if menu.item?.kind === 'file'}
      <button class="menu-item" role="menuitem" on:click={() => menuAction('download')}><Icon name="download" size={16} />Herunterladen</button>
    {/if}
    {#if isZip(menu.item)}
      <button class="menu-item" role="menuitem" on:click={() => menuAction('extract')}><Icon name="package-open" size={16} />Entpacken</button>
    {/if}
    <div class="menu-sep"></div>
    <button class="menu-item" role="menuitem" on:click={() => menuAction('zipDownload')}><Icon name="file-archive" size={16} />Als ZIP herunterladen</button>
    <button class="menu-item" role="menuitem" on:click={() => menuAction('zipCreate')}><Icon name="folder-archive" size={16} />ZIP erstellen</button>
    <div class="menu-sep"></div>
    {#if selectedCount <= 1}
      <button class="menu-item" role="menuitem" on:click={() => menuAction('share')}><Icon name="link" size={16} />Teilen</button>
      <button class="menu-item" role="menuitem" on:click={() => menuAction('rename')}><Icon name="pencil" size={16} />Umbenennen</button>
      <button class="menu-item" role="menuitem" on:click={() => menuAction('move')}><Icon name="folder-input" size={16} />Verschieben</button>
      <button class="menu-item" role="menuitem" on:click={() => menuAction('copy')}><Icon name="copy" size={16} />Kopie erstellen</button>
      <button class="menu-item" role="menuitem" on:click={() => menuAction('details')}><Icon name="info" size={16} />Details</button>
      <div class="menu-sep"></div>
    {/if}
    <button class="menu-item menu-item--danger" role="menuitem" on:click={() => menuAction('trash')}><Icon name="trash-2" size={16} />{selectedCount > 1 ? `${selectedCount} Elemente löschen` : 'In den Papierkorb'}</button>
  </div>
{/if}

<Dialog open={helpOpen} title="Tastaturkürzel" description="Der Dateibereich lässt sich vollständig ohne Maus bedienen." size="sm" onclose={() => (helpOpen = false)}>
  <div class="shortcut-list">
    {#each SHORTCUTS as shortcut (shortcut.label)}
      <div class="shortcut-row">
        <span>{shortcut.label}</span>
        <span class="shortcut-keys">
          {#each shortcut.keys as key (key)}<kbd>{key}</kbd>{/each}
        </span>
      </div>
    {/each}
  </div>
  <p class="stat-foot" style="margin-top:var(--space-4)">Tipp: Rechtsklick oder langes Tippen öffnet das Kontextmenü. Dateien lassen sich auf Ordner und Breadcrumbs ziehen.</p>
  <svelte:fragment slot="footer">
    <Button variant="primary" onclick={() => (helpOpen = false)}>Verstanden</Button>
  </svelte:fragment>
</Dialog>

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

<Dialog open={detailsOpen} title="Details" description={detailsNode?.name || ''} size="sm" onclose={() => (detailsOpen = false)}>
  {#if detailsNode}
    <dl class="kv">
      <dt>Name</dt><dd style="word-break:break-word">{detailsNode.name}</dd>
      <dt>Typ</dt><dd>{detailsNode.kind === 'folder' ? 'Ordner' : (detailsNode.mime || 'Datei')}</dd>
      {#if detailsNode.kind !== 'folder'}
        <dt>Größe</dt><dd>{bytes(detailsNode.size)}</dd>
      {/if}
      {#if detailsNode.width && detailsNode.height}
        <dt>Abmessungen</dt><dd>{detailsNode.width} × {detailsNode.height} px</dd>
      {/if}
      <dt>Geändert</dt><dd>{dateTime(detailsNode.updatedAt)}</dd>
      {#if detailsNode.createdAt}<dt>Erstellt</dt><dd>{dateTime(detailsNode.createdAt)}</dd>{/if}
      {#if detailsNode.hash}<dt>Prüfsumme</dt><dd style="word-break:break-all;font-size:var(--text-xs)">{detailsNode.hash}</dd>{/if}
    </dl>
  {/if}
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (detailsOpen = false)}>Schließen</Button>
    {#if detailsNode?.kind === 'file'}
      <Button variant="secondary" size="sm" icon="download" href={`/api/v1/files/${detailsNode.id}/download`}>Herunterladen</Button>
    {/if}
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
