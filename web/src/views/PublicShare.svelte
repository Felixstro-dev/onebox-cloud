<script>
  import { onMount } from 'svelte';
  import { get, post } from '../lib/api.js';
  import { bytes, dateTime } from '../lib/format.js';
  import Icon from '../components/Icon.svelte';
  import Button from '../components/Button.svelte';
  import Field from '../components/Field.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import ProgressBar from '../components/ProgressBar.svelte';
  import { autofocus } from '../lib/focus.js';

  export let token = '';

  let meta = null;
  let loading = true;
  let error = '';
  let access = sessionStorage.getItem(`onebox-share-${token}`) || '';
  let password = '';
  let unlocking = false;
  let unlockError = '';
  let path = [];
  let listing = null;
  let listingLoading = false;
  let preview = null;

  onMount(load);

  async function load() {
    loading = true;
    error = '';
    try {
      const data = await get(`/api/v1/public/shares/${encodeURIComponent(token)}`, { access });
      meta = data.share;
      if (meta.status !== 'active') return;
      if (!meta.requiresPassword || access) await loadFiles([]);
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  async function unlock() {
    unlocking = true;
    unlockError = '';
    try {
      const data = await post(`/api/v1/public/shares/${encodeURIComponent(token)}/unlock`, { password });
      access = data.accessToken;
      sessionStorage.setItem(`onebox-share-${token}`, access);
      password = '';
      await loadFiles([]);
    } catch (err) {
      unlockError = err.message;
    } finally {
      unlocking = false;
    }
  }

  async function loadFiles(nextPath) {
    listingLoading = true;
    try {
      const query = nextPath.map(encodeURIComponent).join('/');
      const data = await get(`/api/v1/public/shares/${encodeURIComponent(token)}/files${query ? `?path=${encodeURIComponent(query)}` : ''}`, { access });
      path = nextPath;
      listing = data;
    } catch (err) {
      error = err.message;
    } finally {
      listingLoading = false;
    }
  }

  function openItem(item) {
    if (item.kind === 'folder') loadFiles([...path, item.name]);
    else if (item.isImage) preview = item;
    else download(item);
  }

  function pathParts(item) {
    if (!path.length && listing?.node?.kind === 'file' && item.id === listing.node.id) return [];
    return [...path, item.name];
  }

  function download(item) {
    const query = pathParts(item).map(encodeURIComponent).join('/');
    const url = `/api/v1/public/shares/${encodeURIComponent(token)}/download?path=${encodeURIComponent(query)}&access=${encodeURIComponent(access)}`;
    window.location.href = url;
  }

  function fileUrl(item) {
    const query = pathParts(item).map(encodeURIComponent).join('/');
    return `/api/v1/public/shares/${encodeURIComponent(token)}/download?path=${encodeURIComponent(query)}&access=${encodeURIComponent(access)}`;
  }

  function thumbUrl(item) {
    const query = pathParts(item).map(encodeURIComponent).join('/');
    return `/api/v1/public/shares/${encodeURIComponent(token)}/thumbnail?path=${encodeURIComponent(query)}&size=768&access=${encodeURIComponent(access)}`;
  }

  function statusText(status) {
    return { revoked: 'Dieser Link wurde widerrufen.', expired: 'Dieser Link ist abgelaufen.', used_up: 'Das Download-Limit ist erreicht.' }[status] || null;
  }

  $: node = listing?.node || meta?.node || null;
  $: isFile = node?.kind === 'file';
  $: shareLabel = node?.kind === 'folder' ? 'Geteilter Ordner' : node?.kind === 'file' ? 'Geteilte Datei' : 'Freigabe';
  $: itemCount = listing?.items?.length || 0;
  $: countText = itemCount === 1 ? '1 Element' : `${itemCount} Elemente`;
  $: filePreview = isFile && node?.isImage ? fileUrl(node) : null;
</script>

<div class="public-shell">
  <header class="public-top">
    <span class="brand-mark" aria-hidden="true">ob</span>
    <span class="brand-name">Onebox</span>
    <span class="tag"><Icon name="link" size={13} /> {shareLabel}</span>
  </header>
  <main class="public-main">
    {#if loading}
      <div class="card loading-block"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div>
    {:else if error}
      <EmptyState icon="link-2-off" title="Link nicht verfügbar" text={error} />
    {:else if meta && meta.status !== 'active'}
      <EmptyState icon="link-2-off" title="Dieser Link ist nicht mehr aktiv" text={statusText(meta.status)} />
    {:else if meta?.requiresPassword && !access}
      <div class="auth-card" style="margin:0 auto">
        <div class="auth-brand"><span class="brand-mark" aria-hidden="true">lock</span> Geschützter Link</div>
        <h1>Passwort nötig</h1>
        <p class="lede">Der Besitzer hat diesen Link mit einem Passwort geschützt. Frage danach, wenn du es nicht kennst.</p>
        <form class="auth-form" on:submit|preventDefault={unlock}>
          <Field label="Passwort" id="share-unlock" error={unlockError} required>
            <input id="share-unlock" class="input" type="password" bind:value={password} autocomplete="current-password" use:autofocus />
          </Field>
          <Button type="submit" variant="primary" full loading={unlocking} disabled={!password}>Entsperren</Button>
        </form>
      </div>
    {:else if meta}
      <div class="public-head">
        <div>
          {#if path.length}
            <nav class="crumbs" aria-label="Pfad" style="margin-bottom:var(--space-2)">
              <button type="button" class="crumb" on:click={() => loadFiles([])}>Start</button>
              {#each path as part, index}
                <span class="crumb-sep" aria-hidden="true"><Icon name="chevron-right" size={13} /></span>
                <button type="button" class="crumb" aria-current={index === path.length - 1 ? 'page' : undefined} on:click={() => loadFiles(path.slice(0, index + 1))}>{part}</button>
              {/each}
            </nav>
          {/if}
          <h1>{node?.name || 'Freigabe'}</h1>
          {#if isFile}
            <p>{bytes(node.size)} · {dateTime(node.updatedAt)}</p>
          {:else}
            <p>{countText} · geteilt mit dir</p>
          {/if}
        </div>
        {#if isFile}
          <Button variant="primary" icon="download" onclick={() => download(node)}>Herunterladen</Button>
        {/if}
      </div>

      {#if !isFile && listing?.items?.some((item) => item.isImage)}
        <div class="public-preview">
          {#each listing.items.filter((item) => item.isImage).slice(0, 8) as item}
            <button type="button" class="public-preview__item" on:click={() => (preview = item)} aria-label={`${item.name} öffnen`}><img src={thumbUrl(item)} alt={item.name} loading="lazy" /></button>
          {/each}
        </div>
      {/if}

      {#if listingLoading}
        <div class="card loading-block"><span class="skeleton"></span><span class="skeleton"></span></div>
      {:else if isFile}
        {#if filePreview}
          <div class="public-file-preview">
            <button type="button" on:click={() => (preview = node)} aria-label={`${node.name} in voller Größe öffnen`}>
              <img src={filePreview} alt={node.name} />
            </button>
          </div>
        {:else}
          <div class="public-card public-file-single">
            <div class="public-file-single__icon"><Icon name={node.isImage ? 'image' : 'file'} size={40} /></div>
            <p class="stat-foot">{bytes(node.size)} · {dateTime(node.updatedAt)}</p>
            <Button variant="secondary" icon="download" onclick={() => download(node)}>Datei herunterladen</Button>
          </div>
        {/if}
      {:else if itemCount}
        <div class="public-card">
          <div class="public-file-list">
            {#each listing.items as item}
              <button type="button" class="public-file" on:click={() => openItem(item)}>
                <Icon name={item.kind === 'folder' ? 'folder' : item.isImage ? 'image' : 'file'} size={18} />
                <span class="public-file__name">{item.name}</span>
                <span class="public-file__size">{item.kind === 'folder' ? 'Ordner' : bytes(item.size)}</span>
                <Icon name={item.kind === 'folder' ? 'chevron-right' : 'download'} size={16} />
              </button>
            {/each}
          </div>
        </div>
      {:else}
        <EmptyState icon="folder-open" title="Dieser Ordner ist leer" text="Hier wurden noch keine Dateien abgelegt." />
      {/if}
      <p class="stat-foot" style="margin-top:var(--space-6);display:flex;align-items:center;gap:var(--space-2)"><Icon name="lock" size={13} /> Bereitgestellt über Onebox. Der Link kann jederzeit widerrufen werden.</p>
    {/if}
  </main>
</div>

{#if preview}
  <div class="viewer" role="dialog" aria-modal="true" aria-label={preview.name}>
    <div class="viewer__bar">
      <span class="viewer__title">{preview.name}</span>
      <Button variant="secondary" size="sm" icon="download" onclick={() => download(preview)}>Herunterladen</Button>
      <button type="button" class="icon-btn" aria-label="Schließen" on:click={() => (preview = null)}><Icon name="x" size={18} /></button>
    </div>
    <div class="viewer__stage"><img src={fileUrl(preview)} alt={preview.name} style="max-width:100%;max-height:100%" /></div>
    <div class="viewer__strip"><span class="tag">{bytes(preview.size)}</span></div>
  </div>
{/if}
