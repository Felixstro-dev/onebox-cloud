<script>
  import { onMount, onDestroy, tick } from 'svelte';
  import { get, post, patch, del } from '../lib/api.js';
  import { notify, refresh, user as userStore } from '../lib/stores.js';
  import { navigate, route } from '../lib/router.js';
  import { createDocumentEditor, getMarkdown, setMarkdown } from '../lib/editor.js';
  import { CollabProvider, colorFor } from '../lib/collab.js';
  import { CollabBinding, publishCursor, clearCursor } from '../lib/collab-binding.js';
  import { markdownToHtml, htmlToMarkdown, markdownToText, sanitize } from '../lib/markdown.js';
  import * as Y from 'yjs';
  import Icon from '../components/Icon.svelte';
  import IconButton from '../components/IconButton.svelte';
  import Button from '../components/Button.svelte';
  import Dialog from '../components/Dialog.svelte';
  import Field from '../components/Field.svelte';
  import CommentPanel from '../components/doc/CommentPanel.svelte';
  import VersionPanel from '../components/doc/VersionPanel.svelte';
  import SlashMenu from '../components/doc/SlashMenu.svelte';
  import FormatBar from '../components/doc/FormatBar.svelte';

  export let docId;

  let host;
  let editor = null;
  let provider = null;
  let ydoc = null;

  let loading = true;
  let loadedDocId = null;
  let loadError = null;
  let node = null;
  let content = '';
  let status = 'draft';
  let reviewBy = null;
  let revision = 0;
  let path = [];

  let saveState = 'saved';        // saved | saving | offline | error
  let saveTimer = null;
  let dirty = false;
  let lastSavedAt = null;

  let connState = 'connecting';   // connecting | connected | offline | denied
  let peers = [];

  let panel = 'none';             // none | comments | versions
  let comments = [];
  let versions = [];
  let versionDiff = null;

  let readMode = false;
  let sourceMode = false;
  let docReadOnly = false;
  let sourceText = '';
  let menuOpen = false;
  let shareOpen = false;
  let renameOpen = false;
  let renameValue = '';
  let statusOpen = false;
  let importOpen = false;

  let formatPos = null;           // { x, y }
  let slash = { open: false, x: 0, y: 0, query: '', from: 0, index: 0 };
  let activeCommentId = null;
  let revisionTick = 0;           // erzwingt Neu-Rendering der Toolbar

  let toc = [];
  let currentHeading = null;
  let scrollEl;

  $: docPath = path.map((crumb) => crumb.name).join(' / ');
  $: title = node ? node.name.replace(/\.(md|markdown|txt)$/i, '') : '';
  $: words = countWords(content);
  $: statusLabel = { draft: 'Entwurf', review: 'In Prüfung', changes: 'Änderungen', approved: 'Freigegeben' }[status] || status;

  function countWords(text) {
    const clean = String(text || '').trim();
    return clean ? clean.split(/\s+/).length : 0;
  }

  onMount(() => {
    load();
    const onPasteImages = (event) => uploadPastedImages(event.detail.files);
    const onOpenFile = (event) => navigate(`/files/${event.detail.id}`);
    window.addEventListener('onebox:paste-images', onPasteImages);
    window.addEventListener('onebox:open-file', onOpenFile);
    const onKey = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        saveNow(true);
      }
      if (event.key === 'Escape') {
        if (slash.open) { slash = { ...slash, open: false }; return; }
        if (formatPos) { formatPos = null; return; }
        if (menuOpen) menuOpen = false;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('onebox:paste-images', onPasteImages);
      window.removeEventListener('onebox:open-file', onOpenFile);
      window.removeEventListener('keydown', onKey);
      teardown();
    };
  });

  // Wechsel auf ein anderes Dokument, während dieselbe View-Instanz läuft.
  $: if (docId && loadedDocId && !loading && docId !== loadedDocId) reload(docId);

  function teardown() {
    if (saveTimer) clearTimeout(saveTimer);
    provider?.destroy();
    provider = null;
    editor?.destroy();
    editor = null;
    ydoc?.destroy();
    ydoc = null;
  }

  async function load() {
    loading = true;
    loadError = null;
    loadedDocId = null;
    teardown();
    try {
      const res = await get(`/api/v1/docs/${docId}`);
      node = res.node;
      content = res.content || '';
      status = res.status || 'draft';
      reviewBy = res.reviewBy || null;
      revision = res.revision || 0;
      path = res.breadcrumbs || [];
      sourceText = content;
      docReadOnly = !!res.readOnly;
      readMode = docReadOnly;
      // Erst den Ladezustand beenden: erst dann ist der Editor-Host im DOM.
      loading = false;
      await tick();
      setupEditor(res);
      loadedDocId = docId;
      saveState = 'saved';
    } catch (error) {
      loading = false;
      loadedDocId = docId;
      loadError = error.message || 'Dokument konnte nicht geladen werden.';
    }
  }

  async function reload(id) {
    docId = id;
    await load();
  }

  function setupEditor(res) {
    ydoc = new Y.Doc();
    // Vorhandenen Live-Zustand übernehmen (falls vorhanden), sonst aus dem Markdown anlegen.
    if (res.ystate) {
      try { Y.applyUpdate(ydoc, Uint8Array.from(atob(res.ystate), (c) => c.charCodeAt(0)), 'load'); } catch {}
    }

    const fragment = ydoc.getXmlFragment('prosemirror');
    const readOnly = !!res.readOnly;

    // Erst der Provider (geteiltes Dokument, aber noch nicht verbunden),
    // dann der Editor mit der Yjs-Bindung — Plugins entstehen nur hier.
    provider = new CollabProvider(docId, {
      doc: ydoc,
      user: { id: $userStore?.id, displayName: $userStore?.displayName, username: $userStore?.username },
      onStatus: (next) => {
        connState = next;
        if (next === 'denied') notify('Zugriff auf dieses Dokument wurde entzogen.', 'error');
      },
      onPeers: (list) => { peers = list; },
    });

    editor = createDocumentEditor({
      element: host,
      content: '',
      readOnly,
      extensions: [
        CollabBinding.configure({
          fragment,
          awareness: provider.awareness,
          writable: !readOnly,
        }),
      ],
      onChange: onEditorChange,
      onSelection: onSelectionUpdate,
    });

    // Erst der Editor steht, dann Inhalt einspeisen: leerer Yjs-Block → Markdown setzen.
    // Der lokale Transaktion schreibt automatisch ins geteilte Fragment.
    if (fragment.length === 0 && content) {
      setMarkdown(editor, content);
    }

    // Verbindung erst nach der Initialisierung öffnen (kein Race mit dem Seed).
    provider.start();

    buildToc();
  }

  function onEditorChange() {
    if (!editor) return;
    dirty = true;
    saveState = 'saving';
    revisionTick += 1;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNow(false), 2000);   // 2 s Ruhe
    buildToc();
  }

  function onSelectionUpdate() {
    revisionTick += 1;
    trackSlash();
    const { from, to } = editor.state.selection;

    if (from === to || readMode || sourceMode || !provider) {
      formatPos = null;
      clearCursor(provider?.awareness);
      return;
    }
    // Cursor für andere Teilnehmende sichtbar machen (relative Position).
    publishCursor(editor, provider.awareness, from, to);

    try {
      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(to);
      const mid = (start.left + end.left) / 2;
      const width = 16 * 14;                 // grobe Toolbar-Breite
      formatPos = {
        x: Math.min(Math.max(8, mid - width / 2), window.innerWidth - width - 8),
        y: Math.max(8, start.top - 46),
      };
    } catch { formatPos = null; }
  }

  async function saveNow(force) {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!editor || docReadOnly || (!dirty && !force)) return;
    const markdown = sourceMode ? sourceText : getMarkdown(editor);
    if (!force && markdown === content) { saveState = 'saved'; dirty = false; return; }

    saveState = 'saving';
    try {
      const res = await patch(`/api/v1/docs/${docId}/content`, { content: markdown });
      content = markdown;
      revision = res.revision ?? revision;
      node = res.node || node;
      dirty = false;
      lastSavedAt = Date.now();
      saveState = 'saved';
      if (res.snapshot) notify('Momentaufnahme angelegt.', 'info', 2600);
    } catch (error) {
      saveState = navigator.onLine ? 'error' : 'offline';
      if (force) notify(`Speichern fehlgeschlagen: ${error.message}`, 'error');
      // Erneut versuchen, sobald die Verbindung zurück ist.
      if (!navigator.onLine) window.addEventListener('online', () => saveNow(true), { once: true });
    }
  }

  // ---------------------------------------------------------------- Slash-Menü

  const SLASH_ITEMS = [
    { id: 'h1', icon: 'heading-1', label: 'Überschrift 1', hint: 'Große Überschrift', run: () => editor.chain().focus().toggleHeading({ level: 1 }).run() },
    { id: 'h2', icon: 'heading-2', label: 'Überschrift 2', hint: 'Mittlere Überschrift', run: () => editor.chain().focus().toggleHeading({ level: 2 }).run() },
    { id: 'h3', icon: 'heading-3', label: 'Überschrift 3', hint: 'Kleine Überschrift', run: () => editor.chain().focus().toggleHeading({ level: 3 }).run() },
    { id: 'ul', icon: 'list', label: 'Liste', hint: 'Aufzählung mit Punkten', run: () => editor.chain().focus().toggleBulletList().run() },
    { id: 'ol', icon: 'list-ordered', label: 'Nummerierte Liste', hint: 'Aufzählung mit Zahlen', run: () => editor.chain().focus().toggleOrderedList().run() },
    { id: 'todo', icon: 'list-checks', label: 'Aufgabe', hint: 'Checkbox-Liste', run: () => editor.chain().focus().toggleTaskList().run() },
    { id: 'quote', icon: 'quote', label: 'Zitat', hint: 'Hervorgehobener Text', run: () => editor.chain().focus().toggleBlockquote().run() },
    { id: 'code', icon: 'code', label: 'Codeblock', hint: 'Mit Syntaxfärbung', run: () => editor.chain().focus().toggleCodeBlock().run() },
    { id: 'table', icon: 'table', label: 'Tabelle', hint: '3 × 3 einfügen', run: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
    { id: 'hr', icon: 'minus', label: 'Trennlinie', hint: 'Horizontale Linie', run: () => editor.chain().focus().setHorizontalRule().run() },
    { id: 'info', icon: 'info', label: 'Hinweis: Info', hint: 'Farbige Infobox', run: () => insertHint('info') },
    { id: 'warn', icon: 'triangle-alert', label: 'Hinweis: Warnung', hint: 'Farbige Warnbox', run: () => insertHint('warn') },
    { id: 'tip', icon: 'lightbulb', label: 'Hinweis: Tipp', hint: 'Farbige Tippbox', run: () => insertHint('tip') },
    { id: 'image', icon: 'image', label: 'Bild', hint: 'Datei auswählen', run: () => pickImage() },
    { id: 'file', icon: 'file-plus', label: 'Datei einbetten', hint: 'Onebox-Datei als Karte', run: () => pickEmbed() },
    { id: 'video', icon: 'play', label: 'Video einbetten', hint: 'Externe Quelle, erst nach Klick', run: () => promptVideo() },
  ];

  $: slashFiltered = slash.query
    ? SLASH_ITEMS.filter((item) => `${item.label} ${item.hint}`.toLowerCase().includes(slash.query.toLowerCase()))
    : SLASH_ITEMS;

  function insertHint(kind) {
    editor.chain().focus().insertContent({
      type: 'oneboxHint',
      attrs: { kind },
      content: [{ type: 'paragraph' }],
    }).run();
  }

  function handleSlashKey(event) {
    if (!slash.open) return;
    if (event.key === 'ArrowDown') { event.preventDefault(); slash = { ...slash, index: Math.min(slash.index + 1, slashFiltered.length - 1) }; return; }
    if (event.key === 'ArrowUp') { event.preventDefault(); slash = { ...slash, index: Math.max(slash.index - 1, 0) }; return; }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = slashFiltered[slash.index];
      if (item) runSlash(item);
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); slash = { ...slash, open: false }; return; }
    if (event.key === 'Backspace') {
      const q = editor.state.doc.textBetween(slash.from + 1, editor.state.selection.from, '\n', '\ufffc');
      if (!q) { slash = { ...slash, open: false }; /* Backspace löscht das "/" */ }
    }
    setTimeout(() => {
      if (!slash.open) return;
      const from = editor.state.selection.from;
      if (from <= slash.from) { slash = { ...slash, open: false }; return; }
      const text = editor.state.doc.textBetween(slash.from + 1, from, '\n', '\ufffc');
      if (text.includes('\n')) { slash = { ...slash, open: false }; return; }
      slash = { ...slash, query: text, index: 0 };
    }, 0);
  }

  function openSlash() {
    const { from } = editor.state.selection;
    const coords = editor.view.coordsAtPos(from);
    slash = {
      open: true,
      x: Math.min(coords.left, window.innerWidth - 336),
      y: Math.min(coords.bottom + 8, window.innerHeight - 320),
      query: '',
      from: Math.max(0, from - 1),
      index: 0,
    };
  }

  function runSlash(item) {
    // Das "/"-Zeichen und den eingegebenen Filter entfernen.
    const { from } = editor.state.selection;
    const start = slash.from;
    slash = { ...slash, open: false };
    editor.chain().focus().deleteRange({ from: start, to: from }).run();
    item.run();
  }

  function trackSlash() {
    if (!editor || readMode || sourceMode) return;
    const { from, empty } = editor.state.selection;
    if (!empty) { if (slash.open) slash = { ...slash, open: false }; return; }
    const char = editor.state.doc.textBetween(Math.max(0, from - 1), from, '\n', '\ufffc');
    if (char === '/' && !slash.open) {
      const before = editor.state.doc.textBetween(Math.max(0, from - 2), Math.max(0, from - 1), '\n', '\ufffc');
      if (!before || /\s/.test(before)) openSlash();
      return;
    }
    if (slash.open) {
    }
    if (slash.open) {
      // Menü schließen, sobald der Cursor den "/" verlässt oder eine
      // neue Zeile beginnt. Die Filterung selbst läuft über handleSlashKey.
      if (from <= slash.from) { slash = { ...slash, open: false }; return; }
      const between = editor.state.doc.textBetween(slash.from + 1, from, '\n', '\ufffc');
      if (between.includes('\n')) { slash = { ...slash, open: false }; return; }
    }
  }

  // ------------------------------------------------------------ Bilder / Dateien

  let fileInput;
  let embedInput;
  let importInput;

  function pickImage() { fileInput?.click(); }
  function pickEmbed() { embedInput?.click(); }

  async function onImageChange(event) {
    const files = [...(event.target.files || [])];
    event.target.value = '';
    await insertFilesAsImages(files);
  }

  async function uploadPastedImages(files) {
    await insertFilesAsImages([...files]);
  }

  async function insertFilesAsImages(files) {
    if (!files.length) return;
    for (const file of files) {
      try {
        const res = await uploadInline(file);
        editor.chain().focus().insertContent({
          type: 'image',
          attrs: { src: `/api/v1/files/${res.id}/content`, alt: res.name.replace(/\.[^.]+$/, '') },
        }).run();
        notify(`${res.name} eingefügt.`, 'success', 2400);
      } catch (error) {
        notify(`${file.name}: ${error.message}`, 'error');
      }
    }
  }

  async function onEmbedChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const res = await uploadInline(file);
      editor.chain().focus().insertContent({
        type: 'oneboxFile',
        attrs: { id: res.id, mime: res.mime || '', label: res.name, unavailable: 'false' },
      }).run();
    } catch (error) {
      notify(error.message, 'error');
    }
  }

  /** Einzeldatei hochladen (ohne Upload-Panel). */
  async function uploadInline(file) {
    const created = await post('/api/v1/uploads', {
      name: file.name, size: file.size, mime: file.type || 'application/octet-stream', parentId: node?.parentId || null,
    });
    const sessionId = created.upload.id;
    let offset = created.upload.offset || 0;
    while (offset < file.size) {
      const end = Math.min(offset + 8 * 1024 * 1024, file.size);
      const { patchUpload } = await import('../lib/api.js');
      await patchUpload(sessionId, offset, file.slice(offset, end));
      offset = end;
    }
    const { completeUpload } = await import('../lib/api.js');
    await completeUpload(sessionId);
    return { id: sessionId, name: file.name, mime: file.type };
  }

  function promptVideo() {
    const src = window.prompt('Adresse des Videos (YouTube, Vimeo, …):');
    if (!src) return;
    let provider = 'Extern';
    try {
      const host = new URL(src).hostname.replace(/^www\./, '');
      provider = host.split('.')[0];
      const allowed = ['youtube.com', 'youtu.be', 'vimeo.com', 'ted.com', 'archive.org'];
      const ok = allowed.some((domain) => host === domain || host.endsWith(`.${domain}`));
      if (!ok) {
        editor.chain().focus().insertContent({ type: 'oneboxVideo', attrs: { src: '', provider, allowed: 'false' } }).run();
        notify('Dieser Anbieter ist nicht erlaubt. Die Kette wurde eingefügt, aber nicht verbunden.', 'info', 5000);
        return;
      }
    } catch { /* relative/other input */ }
    editor.chain().focus().insertContent({ type: 'oneboxVideo', attrs: { src, provider, allowed: 'true' } }).run();
  }

  // ------------------------------------------------------------------ Inhaltverzeichnis

  function buildToc() {
    if (!editor) return;
    const headings = [];
    editor.state.doc.descendants((n) => {
      if (n.type.name === 'heading') headings.push({ level: n.attrs.level, text: n.textContent, pos: n });
    });
    toc = headings.map((h, i) => ({ ...h, id: `h-${i}`, text: h.text || 'Überschrift' }));
  }

  function scrollToHeading(index) {
    const headings = [];
    editor.state.doc.descendants((n) => { if (n.type.name === 'heading') headings.push(n); });
    const target = headings[index];
    if (!target) return;
    try {
      const pos = editor.view.posAtDOM?.(target) ?? null;
      const dom = editor.view.dom.querySelectorAll('h1,h2,h3')[index];
      dom?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      currentHeading = index;
    } catch {}
  }

  // -------------------------------------------------------------- Quelltext-Modus

  function toggleSource() {
    if (docReadOnly) { notify('Dieses Dokument ist schreibgeschützt.', 'info'); menuOpen = false; return; }
    if (sourceMode) {
      // Zurück in den visuellen Editor: Markdown neu einlesen.
      content = sourceText;
      setMarkdown(editor, sourceText);
      sourceMode = false;
      editor.setEditable(!readMode && !docReadOnly);
      dirty = true;
      saveNow(false);
    } else {
      sourceText = getMarkdown(editor);
      sourceMode = true;
      editor.setEditable(false);
      formatPos = null;
    }
  }

  function onSourceInput(event) {
    sourceText = event.target.value;
    dirty = true;
    saveState = 'saving';
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => saveNow(false), 2000);
  }

  // ------------------------------------------------------------------ Export

  function download(name, mime, data) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  async function exportAs(kind) {
    menuOpen = false;
    const markdown = sourceMode ? sourceText : getMarkdown(editor);
    const base = title || 'Dokument';
    try {
      if (kind === 'md') download(`${base}.md`, 'text/markdown;charset=utf-8', markdown);
      else if (kind === 'txt') download(`${base}.txt`, 'text/plain;charset=utf-8', markdownToText(markdown));
      else if (kind === 'html') {
        const html = `<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${escapeHtml(base)}</title></head><body>${markdownToHtml(markdown)}</body></html>`;
        download(`${base}.html`, 'text/html;charset=utf-8', html);
      } else if (kind === 'pdf') {
        // Druck-Stylesheet: der Browser erzeugt das PDF (separater Dialog, Skalierung wählbar).
        window.dispatchEvent(new CustomEvent('onebox:print-doc', { detail: { title: base, html: markdownToHtml(markdown) } }));
        await tick();
        window.print();
      } else if (kind === 'docx') {
        const { default: docx } = await import('docx');
        const { Packer } = docx;
        const paragraphs = markdown.split('\n').map((line) => {
          const text = line.replace(/^#{1,6}\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1');
          if (/^#{1,2}\s/.test(line)) return new docx.Heading({ text, level: 1 });
          if (/^#{3,6}\s/.test(line)) return new docx.Heading({ text, level: 2 });
          if (/^\s*[-*+]\s+/.test(line)) return new docx.Paragraph({ bullet: { level: 0 }, text: text.replace(/^\s*[-*+]\s+/, '') });
          if (/^\s*\d+\.\s+/.test(line)) return new docx.Paragraph({ numbering: { reference: 'list', level: 0 }, text: text.replace(/^\s*\d+\.\s+/, '') });
          if (/^---+\s*$/.test(line)) return new docx.Paragraph({ text: '' });
          return new docx.Paragraph({ text });
        });
        const file = new docx.Document({
          numbering: { config: [{ reference: 'list', levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: 'start' }] }] },
          sections: [{ children: paragraphs }],
        });
        const buffer = await Packer.toBuffer(file);
        download(`${base}.docx`, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer);
      }
      notify(`Export als ${kind.toUpperCase()} erstellt.`, 'success', 2600);
    } catch (error) {
      notify(`Export fehlgeschlagen: ${error.message}`, 'error');
    }
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  }

  // ------------------------------------------------------------------ Import

  async function onImportChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      let text = '';
      const name = file.name.toLowerCase();
      if (name.endsWith('.md') || name.endsWith('.markdown') || name.endsWith('.txt')) {
        text = await file.text();
      } else if (name.endsWith('.html') || name.endsWith('.htm')) {
        const { cleanHtmlToMarkdown } = await import('../lib/markdown.js');
        text = cleanHtmlToMarkdown(await file.text());
      } else if (name.endsWith('.docx')) {
        const mammoth = await import('mammoth');
        const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
        const { cleanHtmlToMarkdown } = await import('../lib/markdown.js');
        text = cleanHtmlToMarkdown(result.value);
      } else {
        notify('Nur .md, .txt, .html und .docx werden unterstützt.', 'error');
        return;
      }
      const current = sourceMode ? sourceText : getMarkdown(editor);
      const merged = `${current.replace(/\s*$/, '')}\n\n---\n\n## Import: ${file.name.replace(/\.[^.]+$/, '')}\n\n${text.trim()}\n`;
      if (sourceMode) { sourceText = merged; onSourceInput({ target: { value: merged } }); }
      else { setMarkdown(editor, merged); dirty = true; saveNow(false); }
      importOpen = false;
      notify(`${file.name} importiert.`, 'success');
    } catch (error) {
      notify(`Import fehlgeschlagen: ${error.message}`, 'error');
    }
  }

  // ------------------------------------------------------------------ Kommentare

  async function loadComments() {
    try {
      const res = await get(`/api/v1/docs/${docId}/comments`);
      comments = res.items || [];
    } catch {}
  }

  async function addComment(body, anchor, parentId = null) {
    try {
      const res = await post(`/api/v1/docs/${docId}/comments`, {
        body, anchor: parentId ? null : (anchor || null), parentId: parentId || null,
      });
      await loadComments();
      notify(parentId ? 'Antwort hinterlegt.' : 'Kommentar hinterlegt.', 'success', 2200);
      return res.comment;
    } catch (error) { notify(error.message, 'error'); return null; }
  }

  async function updateComment(id, body) {
    try {
      await patch(`/api/v1/docs/${docId}/comments/${id}`, { body });
      await loadComments();
    } catch (error) { notify(error.message, 'error'); }
  }

  async function resolveComment(id, resolved) {
    try {
      await patch(`/api/v1/docs/${docId}/comments/${id}`, { resolved });
      await loadComments();
    } catch (error) { notify(error.message, 'error'); }
  }

  async function removeComment(id) {
    try {
      await del(`/api/v1/docs/${docId}/comments/${id}`);
      await loadComments();
    } catch (error) { notify(error.message, 'error'); }
  }

  function anchorSelection() {
    if (!editor) return null;
    const { from, to } = editor.state.selection;
    if (from === to) return null;
    return { quote: editor.state.doc.textBetween(from, to, ' ').slice(0, 300), from, to };
  }

  // ------------------------------------------------------------------ Versionen

  async function loadVersions() {
    try {
      const res = await get(`/api/v1/docs/${docId}/versions`);
      versions = res.items || [];
    } catch {}
  }

  async function createNamedVersion(label) {
    try {
      await saveNow(true);
      await post(`/api/v1/docs/${docId}/versions`, { label });
      await loadVersions();
      notify(`Version „${label}“ gespeichert.`, 'success');
    } catch (error) { notify(error.message, 'error'); }
  }

  async function restoreVersion(id) {
    try {
      await saveNow(true);
      const res = await post(`/api/v1/docs/${docId}/versions/${id}/restore`, {});
      content = res.node?.content ?? content;
      await load();
      await loadVersions();
      notify('Version wiederhergestellt — die vorherige Fassung bleibt erhalten.', 'success', 4200);
    } catch (error) { notify(error.message, 'error'); }
  }

  async function compareVersions(from, to) {
    try {
      const query = new URLSearchParams();
      if (from) query.set('from', from);
      if (to) query.set('to', to);
      versionDiff = await get(`/api/v1/docs/${docId}/diff?${query.toString()}`);
    } catch (error) { notify(error.message, 'error'); }
  }

  async function copyVersionText(id) {
    try {
      const res = await get(`/api/v1/docs/${docId}/versions/${id}`);
      await navigator.clipboard.writeText(res.version.content);
      notify('Inhalt der Version kopiert.', 'success', 2400);
    } catch { notify('Kopieren nicht möglich.', 'error'); }
  }

  // ------------------------------------------------------------------ Status / Teilen

  async function setStatus(next) {
    try {
      const res = await patch(`/api/v1/docs/${docId}/status`, { status: next, reviewBy: next === 'review' ? ($userStore?.displayName || null) : null });
      status = res.status;
      reviewBy = res.reviewBy;
      statusOpen = false;
      notify(`Status: ${statusLabel}`, 'success', 2600);
    } catch (error) { notify(error.message, 'error'); }
  }

  async function rename() {
    try {
      const res = await patch(`/api/v1/files/${node.id}`, { name: renameValue });
      node = res.node;
      renameOpen = false;
      refresh();
      notify('Umbenannt.', 'success', 2000);
    } catch (error) { notify(error.message, 'error'); }
  }

  function togglePanel(next) {
    panel = panel === next ? 'none' : next;
    if (panel === 'comments') loadComments();
    if (panel === 'versions') loadVersions();
    if (panel === 'none') versionDiff = null;
  }

  function onScroll() {
    if (!editor || !toc.length) return;
    const headings = [...(scrollEl?.querySelectorAll('.doc-prose h1, .doc-prose h2, .doc-prose h3') || [])];
    const top = (scrollEl?.scrollTop || 0) + 120;
    let active = 0;
    headings.forEach((el, i) => { if (el.offsetTop <= top) active = i; });
    currentHeading = active;
  }
</script>

<svelte:head>
  <title>{title || 'Dokument'} · Onebox</title>
</svelte:head>

<!-- Druck-Stylesheet für den PDF-Export -->
<div class="print-sheet" aria-hidden="true">
  <h1>{title}</h1>
  {@html markdownToHtml(sourceMode ? sourceText : (content || ''))}
</div>

{#if loading}
  <div class="doc-shell">
    <div class="doc-bar"><span class="save-state"><span class="save-state__dot"></span>Lädt …</span></div>
    <div class="doc-scroll">
      <div class="doc-width">
        <div class="skeleton" style="height:2.4rem;width:60%"></div>
        <div class="skeleton" style="height:1rem;width:92%;margin-top:1rem"></div>
        <div class="skeleton" style="height:1rem;width:84%;margin-top:.5rem"></div>
        <div class="skeleton" style="height:1rem;width:88%;margin-top:.5rem"></div>
      </div>
    </div>
  </div>
{:else if loadError}
  <div class="doc-shell">
    <div class="doc-bar">
      <IconButton name="arrow-left" label="Zurück" onclick={() => navigate('/files')} />
      <div class="doc-bar__title"><h1>Dokument</h1></div>
    </div>
    <div class="doc-scroll">
      <div class="doc-width">
        <p style="color:var(--color-error)">{loadError}</p>
        <div style="margin-top:1rem"><Button variant="secondary" icon="refresh-cw" onclick={load}>Erneut versuchen</Button></div>
      </div>
    </div>
  </div>
{:else}
  <div class="doc-shell">
    <header class="doc-bar">
      <IconButton name="arrow-left" label="Zurück zu Dateien" onclick={() => navigate(`/files/${node?.parentId || ''}`)} />
      <div class="doc-bar__title">
        <h1 title={node?.name}>{title}</h1>
        <span class="doc-bar__path">{docPath || 'Ohne Ordner'}</span>
      </div>

      <span class="save-state" data-state={saveState} role="status">
        <span class="save-state__dot"></span>
        {saveState === 'saving' ? 'Speichert …' : saveState === 'error' ? 'Fehler' : saveState === 'offline' ? 'Offline — wird nachgeholt' : 'Gespeichert'}
      </span>

      <span class="doc-bar__spacer"></span>

      {#if peers.length || connState === 'connected'}
        <div class="presence" aria-label="Anwesend">
          <span class="avatar-chip" style="background:{colorFor($userStore?.id)}" title="Du">{initials($userStore?.displayName)}</span>
          {#each peers.slice(0, 3) as peer (peer.clientId)}
            <span class="avatar-chip" style="background:{peer.color}" title={peer.name}>{initials(peer.name)}</span>
          {/each}
          {#if peers.length > 3}<span class="presence__more">+{peers.length - 3}</span>{/if}
        </div>
      {/if}

      <span class="conn-state" data-state={connState} title={connState === 'connected' ? 'Gemeinsame Bearbeitung aktiv' : 'Verbindung'}>
        <span class="conn-state__dot"></span>
        <span class="label-wide">{connState === 'connected' ? (peers.length ? `${peers.length + 1} aktiv` : 'Verbunden') : connState === 'denied' ? 'Kein Zugriff' : connState === 'offline' ? 'Offline' : 'Verbinde …'}</span>
      </span>

      <IconButton name="message-square" label="Kommentare" active={panel === 'comments'} onclick={() => togglePanel('comments')} />
      <IconButton name="history" label="Versionen" active={panel === 'versions'} onclick={() => togglePanel('versions')} />
      <IconButton name={readMode ? 'pencil' : 'eye'} label={readMode ? 'Bearbeiten' : 'Lesemodus'} active={readMode} disabled={docReadOnly} onclick={() => { readMode = !readMode; editor?.setEditable(!readMode && !sourceMode && !docReadOnly); formatPos = null; }} />
      <Button size="sm" variant="secondary" icon="share-2" onclick={() => { shareOpen = true; }}>Teilen</Button>

      <div style="position:relative">
        <IconButton name="ellipsis" label="Weitere Aktionen" active={menuOpen} onclick={() => (menuOpen = !menuOpen)} />
        {#if menuOpen}
          <!-- svelte-ignore a11y-no-static-element-interactions -->
          <div class="menu doc-menu" role="menu" on:click={() => (menuOpen = false)} on:keydown={() => (menuOpen = false)}>
            <button class="menu-item" role="menuitem" on:click={() => { renameValue = node.name; renameOpen = true; }}><Icon name="pencil" size={16} /> Umbenennen</button>
            <button class="menu-item" role="menuitem" on:click={toggleSource}><Icon name="code" size={16} /> {sourceMode ? 'Visueller Editor' : 'Quelltext'} <small>{sourceMode ? 'WYSIWYG' : 'Markdown'}</small></button>
            <button class="menu-item" role="menuitem" on:click={() => { importOpen = true; menuOpen = false; }}><Icon name="upload" size={16} /> Importieren …</button>
            <div class="menu-sep" role="separator"></div>
            <div class="menu-label">Export</div>
            <button class="menu-item" role="menuitem" on:click={() => exportAs('md')}><Icon name="file-text" size={16} /> Markdown (.md)</button>
            <button class="menu-item" role="menuitem" on:click={() => exportAs('html')}><Icon name="code" size={16} /> HTML</button>
            <button class="menu-item" role="menuitem" on:click={() => exportAs('txt')}><Icon name="align-left" size={16} /> Nur Text</button>
            <button class="menu-item" role="menuitem" on:click={() => exportAs('pdf')}><Icon name="file-down" size={16} /> PDF (Druck)</button>
            <button class="menu-item" role="menuitem" on:click={() => exportAs('docx')}><Icon name="file-type" size={16} /> Word (.docx)</button>
            <div class="menu-sep" role="separator"></div>
            <button class="menu-item" role="menuitem" on:click={() => { statusOpen = true; menuOpen = false; }}><Icon name="circle-check" size={16} /> Status: {statusLabel}</button>
            <button class="menu-item" role="menuitem" on:click={() => saveNow(true)}><Icon name="save" size={16} /> Sofort speichern <small>Strg S</small></button>
          </div>
        {/if}
      </div>
    </header>

    <div class="doc-body" data-panel={panel}>
      <div class="doc-scroll" bind:this={scrollEl} on:scroll={onScroll} role="presentation">
        <div class="doc-width" class:doc-read={readMode}>
          {#if toc.length > 2 && !readMode}
            <nav class="doc-toc" aria-label="Inhaltsverzeichnis">
              {#each toc as heading, i}
                <a href="#h-{i}" class:is-current={currentHeading === i} data-level={heading.level} on:click|preventDefault={() => scrollToHeading(i)}>{heading.text}</a>
              {/each}
            </nav>
          {/if}

          {#if sourceMode}
            <textarea class="doc-source" spellcheck="false" value={sourceText} on:input={onSourceInput} aria-label="Markdown-Quelltext"></textarea>
            <p class="doc-meta-hint">Markdown wird beim Umschalten in den visuellen Editor formatiert.</p>
          {:else}
            <div bind:this={host} data-doc-id={docId}></div>
          {/if}

          <footer class="doc-foot">
            <span>{words.toLocaleString('de-DE')} Wörter</span>
            <span>·</span>
            <span>{content.length.toLocaleString('de-DE')} Zeichen</span>
            {#if revision}<span>·</span><span>Fassung {revision}</span>{/if}
            <span>·</span>
            <button class="linkish" on:click={() => { statusOpen = true; }}>{statusLabel}</button>
          </footer>
        </div>
      </div>

      {#if panel === 'comments'}
        <aside class="doc-panel" aria-label="Kommentare">
          <CommentPanel
            {comments}
            {activeCommentId}
            authorName={$userStore?.displayName || $userStore?.username || ''}
            on:add={(e) => addComment(e.detail.body, anchorSelection(), e.detail.parentId || null)}
            on:update={(e) => updateComment(e.detail.id, e.detail.body)}
            on:resolve={(e) => resolveComment(e.detail.id, e.detail.resolved)}
            on:remove={(e) => removeComment(e.detail.id)}
            on:close={() => (panel = 'none')}
            on:focus={(e) => (activeCommentId = e.detail)}
          />
        </aside>
      {:else if panel === 'versions'}
        <aside class="doc-panel" aria-label="Versionen">
          <VersionPanel
            {versions}
            {versionDiff}
            currentLabel={content ? 'Aktueller Stand' : ''}
            on:create={(e) => createNamedVersion(e.detail.label)}
            on:restore={(e) => restoreVersion(e.detail.id)}
            on:compare={(e) => compareVersions(e.detail.from, e.detail.to)}
            on:copy={(e) => copyVersionText(e.detail.id)}
            on:close={() => { panel = 'none'; versionDiff = null; }}
          />
        </aside>
      {/if}
    </div>
  </div>

  {#if formatPos && !readMode && !sourceMode && editor && revisionTick >= 0}
    <FormatBar {editor} x={formatPos.x} y={formatPos.y} on:image={pickImage} on:file={pickEmbed} on:video={promptVideo} />
  {/if}

  {#if slash.open && !readMode && !sourceMode}
    <SlashMenu
      x={slash.x} y={slash.y}
      items={slashFiltered}
      index={slash.index}
      query={slash.query}
      on:pick={(e) => runSlash(e.detail)}
      on:keydown={handleSlashKey}
      on:close={() => (slash = { ...slash, open: false })}
    />
  {/if}
{/if}

<input type="file" accept="image/*" hidden bind:this={fileInput} on:change={onImageChange} />
<input type="file" hidden bind:this={embedInput} on:change={onEmbedChange} />
<input type="file" accept=".md,.markdown,.txt,.html,.htm,.docx" hidden bind:this={importInput} on:change={onImportChange} />

<Dialog open={renameOpen} title="Dokument umbenennen" size="sm" onclose={() => (renameOpen = false)}>
  <form on:submit|preventDefault={rename}>
    <Field label="Name">
      <input class="input" bind:value={renameValue} maxlength="255" autofocus />
    </Field>
    <div class="dialog__actions">
      <Button variant="ghost" onclick={() => (renameOpen = false)}>Abbrechen</Button>
      <Button variant="primary" type="submit">Speichern</Button>
    </div>
  </form>
</Dialog>

<Dialog open={shareOpen} title="Dokument teilen" size="sm" onclose={() => (shareOpen = false)}>
  <p class="muted">Nutze die Freigabe der zugrunde liegenden Datei — Dokumente sind echte Dateien im Baum.</p>
  <div class="dialog__actions">
    <Button variant="secondary" icon="folder-open" onclick={() => { shareOpen = false; navigate(`/files/${node?.parentId || ''}`); }}>In Dateien öffnen</Button>
    <Button variant="primary" onclick={() => (shareOpen = false)}>Fertig</Button>
  </div>
</Dialog>

<Dialog open={statusOpen} title="Review-Status" size="sm" onclose={() => (statusOpen = false)}>
  <div class="status-grid">
    {#each [['draft', 'Entwurf'], ['review', 'In Prüfung'], ['changes', 'Änderungen'], ['approved', 'Freigegeben']] as [value, label]}
      <button class="status-chip" class:is-active={status === value} on:click={() => setStatus(value)}>
        <Icon name={value === 'approved' ? 'circle-check' : value === 'review' ? 'clock' : value === 'changes' ? 'triangle-alert' : 'file-text'} size={16} />
        {label}
      </button>
    {/each}
  </div>
  <div class="dialog__actions"><Button variant="secondary" onclick={() => (statusOpen = false)}>Schließen</Button></div>
</Dialog>

<Dialog open={importOpen} title="In das Dokument importieren" size="sm" onclose={() => (importOpen = false)}>
  <p class="muted">Unterstützt: <strong>.md</strong>, <strong>.txt</strong>, <strong>.html</strong> (bereinigt), <strong>.docx</strong>. Der Inhalt wird angehängt, nicht ersetzt.</p>
  <div class="dialog__actions">
    <Button variant="ghost" onclick={() => (importOpen = false)}>Abbrechen</Button>
    <Button variant="primary" icon="upload" onclick={() => { importOpen = false; importInput?.click(); }}>Datei wählen</Button>
  </div>
</Dialog>

<script context="module">
  export function initials(name) {
    const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    return parts.slice(0, 2).map((p) => p[0].toUpperCase()).join('');
  }
</script>

<style>
  .doc-foot {
    display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center;
    margin-top: var(--space-12); padding-top: var(--space-4);
    border-top: 1px solid var(--color-border-subtle);
    font-size: var(--text-xs); color: var(--color-text-secondary);
  }
  .linkish { background: none; border: 0; color: var(--color-text-secondary); font-size: var(--text-xs); padding: 0; text-decoration: underline; text-underline-offset: 3px; }
  .linkish:hover { color: var(--color-text-primary); }
  .doc-meta-hint { font-size: var(--text-xs); color: var(--color-text-secondary); margin-top: var(--space-2); }

  .status-grid { display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-2); }
  .status-chip {
    display: flex; align-items: center; gap: var(--space-2); min-height: 2.75rem;
    padding: 0 var(--space-3); border-radius: var(--radius-md);
    border: 1px solid var(--color-border-subtle); background: var(--color-bg-elevated);
    color: var(--color-text-primary); font-size: var(--text-sm); text-align: left;
  }
  .status-chip:hover { border-color: var(--color-border-default); }
  .status-chip.is-active { border-color: var(--color-accent-brand); background: color-mix(in srgb, var(--color-accent-brand) 12%, transparent); }

  .muted { color: var(--color-text-secondary); font-size: var(--text-sm); line-height: 1.6; }
  .skeleton {
    background: linear-gradient(90deg, var(--color-bg-elevated) 25%, var(--color-bg-active) 50%, var(--color-bg-elevated) 75%);
    background-size: 200% 100%; animation: sk 1.3s ease-in-out infinite; border-radius: var(--radius-sm);
  }
  @keyframes sk { to { background-position: -200% 0; } }

  .print-sheet { display: none; }

  @media print {
    .doc-shell, .format-bar, .slash-menu, .doc-panel { display: none !important; }
    .print-sheet { display: block; font-family: Georgia, serif; font-size: 11pt; line-height: 1.6; }
    .print-sheet h1 { font-size: 20pt; margin: 0 0 12pt; }
    .print-sheet img { max-width: 100%; }
    .print-sheet pre { white-space: pre-wrap; font-size: 9pt; }
    .print-sheet table { width: 100%; border-collapse: collapse; }
    .print-sheet td, .print-sheet th { border: 1px solid #999; padding: 4pt 6pt; }
  }
</style>
