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
  let saving = false;
  let uploadInput;

  $: if (file) load();

  async function load() {
    if (!file || !open) return;
    try {
      const res = await fetch(`/api/v1/files/${file.id}/content`);
      if (res.ok) content = await res.text();
      else content = '';
    } catch (e) { content = ''; }
  }

  async function save() {
    if (!file) return;
    saving = true;
    try {
      await patch(`/api/v1/files/${file.id}/content`, { content });
      notify('Gespeichert.', 'success');
      onsaved();
    } catch (e) { notify('Fehler beim Speichern.', 'error'); } finally { saving = false; }
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

<dialog open={open} on:close={onclose} style="border-radius:1rem;padding:0;max-width:48rem;width:92vw;height:80vh;">
  <div style="padding:var(--space-4);display:flex;flex-direction:column;height:100%;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:var(--space-3);">
      <h2 style="margin:0;font-size:1.125rem;font-weight:600;">{file?.name || 'Text-Editor'}</h2>
      <div style="display:flex;gap:var(--space-2);align-items:center;">
        <Button variant="quiet" size="sm" onclick={() => open = false}>Schließen</Button>
        <Button variant="primary" size="sm" loading={saving} onclick={save}>Speichern</Button>
      </div>
    </div>
    <div style="display:flex;gap:var(--space-1);margin-bottom:var(--space-2);flex-wrap:wrap;">
      <IconButton name="bold" size={16} onclick={bold} label="Fett" />
      <IconButton name="italic" size={16} onclick={italic} label="Kursiv" />
      <IconButton name="heading-1" size={16} onclick={heading} label="Überschrift" />
      <IconButton name="list" size={16} onclick={listItem} label="Liste" />
      <IconButton name="link" size={16} onclick={link} label="Link" />
      <IconButton name="image" size={16} onclick={imageUpload} label="Bild" />
    </div>
    <textarea id="md-editor" bind:value={content} placeholder="# Überschrift

Text hier..." style="flex:1;resize:none;font-family:'Fira Code',monospace;font-size:0.9375rem;line-height:1.6;padding:var(--space-3);border:1px solid var(--border-subtle);border-radius:var(--radius-md);background:var(--surface-base);color:var(--text-primary);outline:none;border-color:transparent;" />
    <input style="display:none;" type="file" bind:this={uploadInput} on:change={onImageChange} accept="image/*" />
  </div>
</dialog>
