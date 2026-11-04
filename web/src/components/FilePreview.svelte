<script>
  import { onMount } from 'svelte';
  import { get } from '../lib/api.js';
  import { bytes, dateTime, fileKind } from '../lib/format.js';
  import IconButton from './IconButton.svelte';
  import Icon from './Icon.svelte';
  import Button from './Button.svelte';

  export let node = null;
  export let onclose = () => {};
  let content = '';
  let textBody = '';
  let loadingText = false;
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
    if (!node || fileKind(node) !== 'text') { textBody = ''; return; }
    loadingText = true;
    try {
      const response = await fetch(contentUrl, { credentials: 'same-origin' });
      const text = await response.text();
      textBody = text.length > 200000 ? `${text.slice(0, 200000)}\n\n… gekürzt` : text;
    } catch {
      textBody = 'Die Datei konnte nicht geladen werden.';
    } finally {
      loadingText = false;
    }
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
    <div class="viewer__stage">
      {#if kind === 'image'}
        <img src={contentUrl} alt={node.name} />
      {:else if kind === 'video'}
        <video src={contentUrl} controls playsinline style="max-width:100%;max-height:100%"><track kind="captions" label="Keine Untertitel verfügbar" /></video>
      {:else if kind === 'audio'}
        <div class="card" style="display:grid;gap:var(--space-4);justify-items:center;min-width:min(24rem,90vw)">
          <Icon name="audio-lines" size={40} label="Audiodatei" />
          <audio src={contentUrl} controls style="width:100%"></audio>
        </div>
      {:else if kind === 'pdf'}
        <iframe src={contentUrl} title={node.name} class="preview-frame"></iframe>
      {:else if kind === 'text'}
        <pre class="text-preview">{loadingText ? 'Wird geladen …' : textBody}</pre>
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
