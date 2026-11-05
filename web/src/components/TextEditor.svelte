<script>
  import { tick } from 'svelte';
  import { post, patch } from '../lib/api.js';
  import { notify } from '../lib/stores.js';
  import IconButton from './IconButton.svelte';
  import Button from './Button.svelte';

  export let file = null;
  export let open = false;
  export let onclose = () => {};
  export let onsaved = () => {};

  let content = '';
  let originalContent = '';
  let saving = false;
  let loading = false;
  let loadError = false;
  let uploadInput;

  $: dirty = content !== originalContent;

  $: if (file) load();

  async function load() {
    if (!file || !open) return;
    loading = true;
    loadError = false;
    try {
      const res = await fetch(`/api/v1/files/${file.id}/content`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      content = await res.text();
      originalContent = content;
    } catch (e) {
      content = '';
      originalContent = '';
      loadError = true;
    } finally { loading = false; }
  }

  async function save() {
    if (!file) return;
    saving = true;
    try {
      await patch(`/api/v1/files/${file.id}/content`, { content });
      originalContent = content;
      notify('Gespeichert.', 'success');
      onsaved();
    } catch (e) { notify('Fehler beim Speichern.', 'error'); } finally { saving = false; }
  }

  function closeEditor() {
    if (dirty && !window.confirm('Ungespeicherte Änderungen verwerfen?')) return;
    open = false;
    onclose();
  }

  function handleKeydown(event) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      if (dirty && !saving) save();
    }
  }

  function insert(text) {
    const el = document.getElementById('md-editor');
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    content = content.slice(0, start) + text + content.slice(end);
    tick().then(() => { el.focus(); el.selectionStart = start + text.length; el.selectionEnd = start + text.length; });
  }

  function bold() { insert('**Text**'); }
  function italic() { insert('*Text*'); }
  function heading() { insert('# Überschrift\n'); }
  function listItem() { insert('- Eintrag\n'); }
  function link() { insert('[Titel](https://)'); }

  async function imageUpload() {
    uploadInput?.click();
  }
  async function onImageChange(e) {
    const f = e.target.files?.[0];
    if (!f) return;
    const form = new FormData();
    form.append('file', f);
    try {
      const res = await post(`/api/v1/upload`, form);
      insert(`![${f.name}](/api/v1/files/${res.node?.id}/content)`);
    } catch (err) { notify('Bild-Upload fehlgeschlagen.', 'error'); }
  }
</script>

<dialog open={open} on:close={closeEditor} on:keydown={handleKeydown} class="text-editor">
  <div class="text-editor__shell">
    <div class="text-editor__head">
      <div class="text-editor__title">
        <h2>{file?.name || 'Text-Editor'}</h2>
        <span class:status-dirty={dirty} class="text-editor__status">{loading ? 'Laden …' : loadError ? 'Laden fehlgeschlagen' : dirty ? 'Ungespeicherte Änderungen' : 'Gespeichert'}</span>
      </div>
      <div class="text-editor__actions">
        <Button variant="quiet" size="sm" onclick={closeEditor}>Schließen</Button>
        <Button variant="primary" size="sm" loading={saving} disabled={!dirty || loading || loadError} onclick={save}>Speichern</Button>
      </div>
    </div>
    <div class="text-editor__toolbar" aria-label="Formatierung">
      <IconButton name="bold" size={16} onclick={bold} label="Fett" />
      <IconButton name="italic" size={16} onclick={italic} label="Kursiv" />
      <IconButton name="heading-1" size={16} onclick={heading} label="Überschrift" />
      <IconButton name="list" size={16} onclick={listItem} label="Liste" />
      <IconButton name="link" size={16} onclick={link} label="Link" />
      <IconButton name="image" size={16} onclick={imageUpload} label="Bild" />
    </div>
    {#if loadError}
      <div class="text-editor__error" role="alert">Die Datei konnte nicht geladen werden. Schließe den Editor und versuche es erneut.</div>
    {:else}
      <textarea id="md-editor" bind:value={content} disabled={loading} placeholder="# Überschrift

    Text hier..."></textarea>
    {/if}
    <input style="display:none;" type="file" bind:this={uploadInput} on:change={onImageChange} accept="image/*" />
  </div>
</dialog>

<style>
  .text-editor { width: min(52rem, 92vw); height: min(80vh, 48rem); max-width: none; padding: 0; border: 1px solid var(--color-border-default); border-radius: var(--radius-xl); background: var(--color-bg-base); color: var(--color-text-primary); box-shadow: var(--shadow-menu); }
  .text-editor::backdrop { background: color-mix(in srgb, var(--color-bg-deep) 64%, transparent); backdrop-filter: blur(3px); }
  .text-editor__shell { display: flex; flex-direction: column; height: 100%; padding: var(--space-5); gap: var(--space-3); }
  .text-editor__head, .text-editor__actions, .text-editor__title { display: flex; align-items: center; }
  .text-editor__head { justify-content: space-between; gap: var(--space-4); }
  .text-editor__title { min-width: 0; display: grid; gap: 2px; }
  .text-editor__title h2 { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-family: var(--font-ui); font-size: var(--text-lg); font-weight: var(--weight-medium); }
  .text-editor__status { color: var(--color-text-secondary); font-size: var(--text-xs); }
  .text-editor__status::before { content: ''; display: inline-block; width: .45rem; height: .45rem; margin-right: .4rem; border-radius: 50%; background: var(--color-success); }
  .text-editor__status.status-dirty { color: var(--color-warning); }
  .text-editor__status.status-dirty::before { background: var(--color-warning); }
  .text-editor__actions { gap: var(--space-2); }
  .text-editor__toolbar { display: flex; gap: 2px; flex-wrap: wrap; padding: 2px; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-md); background: var(--color-bg-sidebar); }
  #md-editor { flex: 1; min-height: 0; resize: none; padding: var(--space-4); border: 1px solid var(--color-border-default); border-radius: var(--radius-lg); background: var(--color-bg-deep); color: var(--color-text-primary); font-family: var(--font-mono); font-size: var(--text-sm); line-height: 1.7; outline: none; }
  #md-editor:focus { border-color: var(--color-focus-ring); }
  #md-editor:disabled { opacity: .6; }
  .text-editor__error { display: grid; place-items: center; flex: 1; min-height: 12rem; padding: var(--space-6); border: 1px dashed var(--color-error); border-radius: var(--radius-lg); color: var(--color-error); text-align: center; }
  @media (max-width: 600px) { .text-editor { width: 100vw; height: 100dvh; border: 0; border-radius: 0; } .text-editor__shell { padding: var(--space-4); } .text-editor__head { align-items: flex-start; } }
</style>
