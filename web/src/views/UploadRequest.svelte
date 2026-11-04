<script>
  import { onMount } from 'svelte';
  import { get, post } from '../lib/api.js';
  import { bytes } from '../lib/format.js';
  import Icon from '../components/Icon.svelte';
  import Button from '../components/Button.svelte';
  import Field from '../components/Field.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import ProgressBar from '../components/ProgressBar.svelte';
  import { autofocus } from '../lib/focus.js';

  export let token = '';

  const CHUNK = 4 * 1024 * 1024;
  const MAX_VISIBLE_ITEMS = 20;

  let meta = null;
  let loading = true;
  let error = '';
  let access = sessionStorage.getItem(`onebox-upload-${token}`) || '';
  let password = '';
  let unlocking = false;
  let unlockError = '';
  let items = [];
  let dragOver = false;
  let input;
  let uploading = false;

  $: visibleItems = items.slice(0, MAX_VISIBLE_ITEMS);

  onMount(load);

  async function load() {
    loading = true;
    error = '';
    try {
      meta = (await get(`/api/v1/public/uploads/${encodeURIComponent(token)}`)).request;
    } catch (err) { error = err.message; } finally { loading = false; }
  }

  async function unlock() {
    unlocking = true;
    unlockError = '';
    try {
      const data = await post(`/api/v1/public/uploads/${encodeURIComponent(token)}/unlock`, { password });
      access = data.accessToken;
      sessionStorage.setItem(`onebox-upload-${token}`, access);
      password = '';
    } catch (err) { unlockError = err.message; } finally { unlocking = false; }
  }

  function accept(files) {
    const additions = [...files].map((file) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      file, name: file.name, size: file.size, mime: file.type || 'application/octet-stream',
      uploaded: 0, status: 'queued', error: '',
    }));
    items = [...items, ...additions];
    process();
  }

  async function process() {
    if (uploading) return;
    uploading = true;
    try {
      for (let index = 0; index < items.length; index += 1) {
        if (items[index].status === 'queued') await uploadOne(items[index]);
      }
    } finally { uploading = false; }
  }

  function update(id, patch) {
    items = items.map((item) => item.id === id ? { ...item, ...patch } : item);
  }

  function validate(item) {
    if (meta.maxFileSize && item.size > meta.maxFileSize) return `Datei ist größer als ${bytes(meta.maxFileSize)}.`;
    if (meta.maxTotalSize && meta.totalUploaded + item.size > meta.maxTotalSize) return 'Das Gesamtlimit dieser Anfrage ist erreicht.';
    if (meta.allowedTypes?.length) {
      const ok = meta.allowedTypes.some((pattern) => pattern.endsWith('/*') ? item.mime.startsWith(pattern.slice(0, -1)) : pattern.startsWith('.') ? item.name.toLowerCase().endsWith(pattern.toLowerCase()) : item.mime === pattern);
      if (!ok) return `Dateityp ${item.mime} ist nicht erlaubt.`;
    }
    return '';
  }

  async function uploadOne(item) {
    const invalid = validate(item);
    if (invalid) { update(item.id, { status: 'error', error: invalid }); return; }
    update(item.id, { status: 'uploading' });
    try {
      const created = await post(`/api/v1/public/uploads/${encodeURIComponent(token)}/sessions`, {
        name: item.name, size: item.size, mime: item.mime,
      }, { access });
      let offset = created.session.offset || 0;
      while (offset < item.size) {
        const end = Math.min(offset + CHUNK, item.size);
        const chunk = item.file.slice(offset, end);
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PATCH', `/api/v1/public/uploads/${encodeURIComponent(token)}/sessions/${created.session.id}`);
          xhr.withCredentials = true;
          xhr.setRequestHeader('content-type', 'application/octet-stream');
          xhr.setRequestHeader('upload-offset', String(offset));
          xhr.setRequestHeader('x-share-access', access);
          xhr.upload.onprogress = (event) => {
            if (event.lengthComputable) update(item.id, { uploaded: offset + event.loaded });
          };
          xhr.onload = () => {
            offset = end;
            update(item.id, { uploaded: offset });
            resolve();
          };
          xhr.onerror = () => reject(new Error('Die Verbindung wurde unterbrochen.'));
          xhr.send(chunk);
        });
      }
      await post(`/api/v1/public/uploads/${encodeURIComponent(token)}/sessions/${created.session.id}/complete`, {}, { access });
      update(item.id, { status: 'done', uploaded: item.size });
      meta.totalUploaded += item.size;
      meta = { ...meta };
    } catch (err) {
      update(item.id, { status: 'error', error: err.message });
    }
  }

  function onDrop(event) {
    event.preventDefault();
    dragOver = false;
    if (event.dataTransfer?.files?.length) accept(event.dataTransfer.files);
  }

  function onChoose(event) {
    if (event.target.files?.length) accept(event.target.files);
    event.target.value = '';
  }
</script>

<div class="public-shell">
  <header class="public-top">
    <span class="brand-mark" aria-hidden="true">ob</span>
    <span class="brand-name">Onebox</span>
    <span class="tag"><Icon name="upload" size={13} /> Upload-Anfrage</span>
  </header>
  <main class="public-main">
    {#if loading}
      <div class="card loading-block"><span class="skeleton"></span><span class="skeleton"></span></div>
    {:else if error}
      <EmptyState icon="link-2-off" title="Upload-Anfrage nicht verfügbar" text={error} />
    {:else if meta?.requiresPassword && !access}
      <div class="auth-card" style="margin:0 auto">
        <div class="auth-brand"><span class="brand-mark" aria-hidden="true">lock</span> Geschützte Anfrage</div>
        <h1>Passwort nötig</h1>
        <p class="lede">Diese Upload-Anfrage ist passwortgeschützt. Frage den Besitzer nach dem Passwort.</p>
        <form class="auth-form" on:submit|preventDefault={unlock}>
          <Field label="Passwort" id="upload-unlock" error={unlockError} required>
            <input id="upload-unlock" class="input" type="password" bind:value={password} autocomplete="current-password" use:autofocus />
          </Field>
          <Button type="submit" variant="primary" full loading={unlocking} disabled={!password}>Entsperren</Button>
        </form>
      </div>
    {:else if meta}
      <div class="public-head">
        <div>
          <h1>{meta.folderName}</h1>
          <p>{meta.status === 'active' ? 'Lade Dateien hoch. Du brauchst dafür kein Konto.' : 'Diese Anfrage ist geschlossen.'}</p>
        </div>
      </div>

      <div class="limit-list" style="margin-bottom:var(--space-4)">
        {#if meta.maxFileSize}<span><Icon name="file" size={13} /> max. {bytes(meta.maxFileSize)} pro Datei</span>{/if}
        {#if meta.maxTotalSize}<span><Icon name="database" size={13} /> max. {bytes(meta.maxTotalSize)} gesamt ({bytes(meta.totalUploaded || 0)} erreicht)</span>{/if}
        {#if meta.allowedTypes?.length}<span><Icon name="filter" size={13} /> {meta.allowedTypes.join(', ')}</span>{/if}
        {#if meta.expiresAt}<span><Icon name="clock" size={13} /> bis {new Date(meta.expiresAt).toLocaleDateString('de-DE')}</span>{/if}
      </div>

      {#if meta.status !== 'active'}
        <EmptyState icon="lock" title="Keine Uploads mehr möglich" text="Der Besitzer hat diese Anfrage beendet oder das Limit ist erreicht." />
      {:else}
        <input class="sr-only" type="file" multiple bind:this={input} on:change={onChoose} />
        <div
          class="upload-drop" class:is-over={dragOver}
          role="button" tabindex="0"
          on:click={() => input?.click()}
          on:keydown={(event) => (event.key === 'Enter' || event.key === ' ') && input?.click()}
          on:dragenter|preventDefault={() => (dragOver = true)}
          on:dragover|preventDefault
          on:dragleave={() => (dragOver = false)}
          on:drop|preventDefault={onDrop}
        >
          <span class="file-icon file-icon--folder"><Icon name="upload" size={24} /></span>
          <h2>Dateien hier ablegen</h2>
          <p>oder klicken, um sie auszuwählen</p>
          <Button variant="primary" icon="plus">Dateien auswählen</Button>
        </div>

        {#if items.length}
          {#if items.length > MAX_VISIBLE_ITEMS}
            <p class="menu-note" style="margin:0 0 var(--space-3)">Weitere {items.length - MAX_VISIBLE_ITEMS} Uploads werden nicht angezeigt.</p>
          {/if}
          <ol class="steps" style="margin-top:var(--space-4)">
            {#each visibleItems as item (item.id)}
              <li data-state={item.status === 'done' ? 'done' : item.status === 'uploading' ? 'active' : item.status === 'error' ? 'error' : 'todo'}>
                <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{item.name}</span>
                <span class="tag">{item.status === 'done' ? 'Fertig' : item.status === 'error' ? 'Fehler' : item.status === 'uploading' ? `${Math.round((item.uploaded / item.size) * 100)}%${item.eta ? ` · noch ${Math.ceil(item.eta)} s` : ''}` : 'Wartet'}</span>
                {#if item.status === 'uploading'}
                  <ProgressBar value={item.uploaded} max={item.size || 1} size="sm" tone="brand" label={item.name} />
                {/if}
                {#if item.error}<p class="field__hint field__hint--error" style="width:100%">{item.error}</p>{/if}
              </li>
            {/each}
          </ol>
        {/if}
      {/if}
    {:else}
      <EmptyState icon="link-2-off" title="Anfrage nicht gefunden" text="Der Link ist ungültig oder wurde entfernt." />
    {/if}
  </main>
</div>
