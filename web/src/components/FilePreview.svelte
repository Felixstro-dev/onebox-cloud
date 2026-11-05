<script>
  import { onMount } from 'svelte';
  import { get } from '../lib/api.js';
  import { bytes, dateTime, fileKind } from '../lib/format.js';
  import IconButton from './IconButton.svelte';
  import Icon from './Icon.svelte';
  import Button from './Button.svelte';
  import PdfViewer from './PdfViewer.svelte';

  export let node = null;
  export let onclose = () => {};
  let textBody = '';
  let loadingText = false;
  let textError = false;
  let imageLoading = false;
  let mediaError = false;
  let copied = false;

  $: kind = fileKind(node);
  $: contentUrl = node ? `/api/v1/files/${node.id}/content` : '';

  onMount(() => {
    loadText();
    const onKey = (event) => { if (event.key === 'Escape') onclose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  $: if (node) loadText();

  async function loadText() {
    if (!node || fileKind(node) !== 'text') { textBody = ''; textError = false; return; }
    loadingText = true;
    textError = false;
    try {
      const response = await fetch(contentUrl, { credentials: 'same-origin' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const text = await response.text();
      textBody = text.length > 200000 ? `${text.slice(0, 200000)}\n\n… gekürzt` : text;
    } catch {
      textBody = '';
      textError = true;
    } finally {
      loadingText = false;
    }
  }

  function retryText() { loadText(); }
  function resetMedia() {
    imageLoading = kind === 'image';
    mediaError = false;
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${contentUrl}`);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {}
  }
</script>

{#if node}
  <div class="viewer" role="dialog" aria-modal="true" aria-label={`Vorschau von ${node.name}`}>
    <div class="viewer__bar">
      <Icon name={kind === 'image' ? 'image' : 'file'} size={18} />
      <span class="viewer__title">{node.name}</span>
      <span class="tag">{bytes(node.size)}</span>
      <Button variant="quiet" size="sm" icon={copied ? 'check' : 'link'} onclick={copyLink}>{copied ? 'Kopiert' : 'Link'}</Button>
      <Button variant="secondary" size="sm" icon="download" href={`${contentUrl}?download=1`}>Herunterladen</Button>
      <IconButton name="x" label="Vorschau schließen" onclick={onclose} />
    </div>
    <div class="viewer__stage" class:viewer__stage--pdf={kind === 'pdf'} aria-busy={loadingText || imageLoading}>
      {#if kind === 'image'}
        {#if imageLoading}<div class="preview-state" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span>Vorschau wird geladen …</span></div>{/if}
        {#if mediaError}
          <div class="preview-state preview-state--error" role="alert">
            <Icon name="image-off" size={32} />
            <strong>Bild konnte nicht geladen werden</strong>
            <Button variant="secondary" size="sm" icon="rotate-ccw" onclick={resetMedia}>Erneut versuchen</Button>
          </div>
        {:else}
          <img src={contentUrl} alt={node.name} on:load={() => { imageLoading = false; }} on:error={() => { imageLoading = false; mediaError = true; }} on:loadstart={resetMedia} />
        {/if}
      {:else if kind === 'video'}
        {#if mediaError}
          <div class="preview-state preview-state--error" role="alert"><Icon name="video-off" size={32} /><strong>Video konnte nicht geladen werden</strong><Button variant="secondary" size="sm" icon="download" href={`${contentUrl}?download=1`}>Herunterladen</Button></div>
        {:else}
          <video src={contentUrl} controls playsinline on:error={() => { mediaError = true; }} on:loadstart={resetMedia} style="max-width:100%;max-height:100%"><track kind="captions" label="Keine Untertitel verfügbar" /></video>
        {/if}
      {:else if kind === 'audio'}
        <div class="card" style="display:grid;gap:var(--space-4);justify-items:center;min-width:min(24rem,90vw)">
          <Icon name="audio-lines" size={40} label="Audiodatei" />
          <audio src={contentUrl} controls style="width:100%"></audio>
        </div>
      {:else if kind === 'pdf'}
        {#key node.id}
          <PdfViewer {node} {contentUrl} {onclose} />
        {/key}
      {:else if kind === 'text'}
        {#if loadingText}
          <div class="preview-state" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span>Text wird geladen …</span></div>
        {:else if textError}
          <div class="preview-state preview-state--error" role="alert"><Icon name="file-warning" size={32} /><strong>Textdatei konnte nicht geladen werden</strong><Button variant="secondary" size="sm" icon="rotate-ccw" onclick={retryText}>Erneut versuchen</Button></div>
        {:else}
          <pre class="text-preview">{textBody || 'Die Datei ist leer.'}</pre>
        {/if}
      {:else}
        <div class="card" style="display:grid;gap:var(--space-3);justify-items:center;text-align:center">
          <Icon name="file" size={42} />
          <h2 style="font-size:var(--text-lg)">Keine Vorschau für diesen Dateityp</h2>
          <p class="stat-foot">{node.mime || 'Unbekannter Typ'} · {dateTime(node.updatedAt)}</p>
          <Button variant="primary" icon="download" href={`${contentUrl}?download=1`}>Datei herunterladen</Button>
        </div>
      {/if}
    </div>
    <div class="viewer__strip">
      <span class="tag">Geändert {dateTime(node.updatedAt)}</span>
      <span class="tag">{node.mime || 'Datei'}</span>
    </div>
  </div>
{/if}

<style>
  .preview-state { display: grid; justify-items: center; gap: var(--space-3); padding: var(--space-8); color: var(--color-text-secondary); text-align: center; }
  .preview-state--error { color: var(--color-error); }
  .preview-state strong { color: var(--color-text-primary); font-size: var(--text-sm); font-weight: var(--weight-medium); }
  .viewer__stage > img { max-width: 100%; max-height: 100%; object-fit: contain; border-radius: var(--radius-md); animation: preview-in var(--duration-base) var(--ease-out); }
  .viewer__stage > video { animation: preview-in var(--duration-base) var(--ease-out); }
  .text-preview { width: min(60rem, 100%); max-height: 100%; margin: 0; overflow: auto; padding: var(--space-6); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-lg); background: var(--color-bg-deep); color: var(--color-text-primary); font-family: var(--font-mono); font-size: var(--text-sm); line-height: 1.7; white-space: pre-wrap; overflow-wrap: anywhere; text-align: left; }
  @keyframes preview-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
</style>
