<script>
  import { onMount } from 'svelte';
  import { get, del } from '../lib/api.js';
  import { notify, confirmAction } from '../lib/stores.js';
  import { navigate } from '../lib/router.js';
  import { bytes, dateTime, relative } from '../lib/format.js';
  import Icon from '../components/Icon.svelte';
  import Button from '../components/Button.svelte';
  import IconButton from '../components/IconButton.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import ShareDialog from '../components/ShareDialog.svelte';

  let items = [];
  let loading = true;
  let failed = '';
  let filter = 'active';
  let shareNode = null;

  $: shown = filter === 'all' ? items : items.filter((item) => filter === 'closed' ? item.status !== 'active' : item.status === 'active');

  onMount(load);

  async function load() {
    loading = true;
    failed = '';
    try {
      const data = await get('/api/v1/shares');
      items = data.items;
    } catch (err) { failed = err.message; } finally { loading = false; }
  }

  async function revoke(item) {
    const ok = await confirmAction({
      title: 'Freigabe widerrufen?',
      description: `Der Link zu „${item.nodeName || 'diesem Element'}“ funktioniert danach nicht mehr.`,
      detail: item.kind === 'upload' ? 'Bereits hochgeladene Dateien bleiben erhalten.' : undefined,
      confirmLabel: 'Widerrufen', danger: true,
    });
    if (!ok) return;
    try {
      await del(`/api/v1/shares/${item.id}`);
      notify('Freigabe widerrufen.', 'success');
      load();
    } catch (err) { notify(err.message, 'error'); }
  }

  function recreate(item) {
    shareNode = { id: item.nodeId, name: item.nodeName || 'Element', kind: item.nodeKind || 'file' };
  }

  const statusLabels = { active: 'Aktiv', expired: 'Abgelaufen', revoked: 'Widerrufen', used_up: 'Limit erreicht' };
</script>

<div class="page page--wide">
  <header class="page-head">
    <div>
      <h1>Freigaben</h1>
      <p class="lede">Links und Upload-Anfragen, die du erstellt hast. Aus Sicherheitsgründen zeigen wir Links nur einmal beim Erstellen – du kannst jederzeit einen neuen erzeugen.</p>
    </div>
  </header>

  <div class="files-toolbar">
    <div class="segmented" role="group" aria-label="Freigaben filtern">
      <button type="button" aria-pressed={filter === 'active'} on:click={() => (filter = 'active')}>Aktiv</button>
      <button type="button" aria-pressed={filter === 'all'} on:click={() => (filter = 'all')}>Alle</button>
      <button type="button" aria-pressed={filter === 'closed'} on:click={() => (filter = 'closed')}>Beendet</button>
    </div>
    <span class="grow"></span>
    <span class="tag">{shown.length} {shown.length === 1 ? 'Freigabe' : 'Freigaben'}</span>
  </div>

  {#if failed}
    <EmptyState icon="cloud-off" title="Freigaben konnten nicht geladen werden" text={failed} action={load} actionLabel="Erneut versuchen" />
  {:else if loading}
    <div class="list-stack"><div class="card loading-block"><span class="skeleton"></span><span class="skeleton"></span></div></div>
  {:else if !shown.length}
    <EmptyState
      icon="link"
      title={filter === 'active' ? 'Keine aktiven Freigaben' : 'Nichts gefunden'}
      text="Öffne eine Datei oder einen Ordner und wähle „Teilen“, um einen Link zu erstellen."
      action={() => navigate('/files')}
      actionLabel="Zu den Dateien"
    />
  {:else}
    <div class="list-stack">
      {#each shown as item (item.id)}
        <article class="row-card">
          <span class="file-icon file-icon--folder" aria-hidden="true"><Icon name={item.kind === 'upload' ? 'upload' : item.nodeKind === 'folder' ? 'folder' : 'file'} size={18} /></span>
          <div class="row-card__main">
            <h3>{item.nodeName || 'Unbekanntes Element'}</h3>
            <p>{item.kind === 'upload' ? 'Upload-Anfrage' : 'Freigabe-Link'} · Präfix {item.tokenPrefix}…{#if item.passwordProtected} · passwortgeschützt{/if}{#if item.expiresAt} · läuft {relative(item.expiresAt)}{/if}</p>
            <div class="row-card__meta" style="margin-top:var(--space-2)">
              <span class="tag tag--{item.status === 'active' ? 'success' : 'warning'}">{statusLabels[item.status] || item.status}</span>
              {#if item.kind === 'upload'}
                <span>{bytes(item.totalUploaded)} eingegangen{#if item.maxTotalSize} von {bytes(item.maxTotalSize)}{/if}</span>
              {:else if item.maxDownloads}
                <span>{item.downloadCount} / {item.maxDownloads} Downloads</span>
              {:else}
                <span>{item.downloadCount} Downloads</span>
              {/if}
              <span>Erstellt {dateTime(item.createdAt)}</span>
            </div>
          </div>
          <div class="page-actions">
            {#if item.status === 'active'}
              <Button variant="secondary" size="sm" icon="refresh-cw" onclick={() => recreate(item)}>Neuer Link</Button>
              <IconButton name="trash-2" label="Freigabe widerrufen" onclick={() => revoke(item)} />
            {:else}
              <Button variant="quiet" size="sm" icon="refresh-cw" onclick={() => recreate(item)}>Erneut teilen</Button>
            {/if}
          </div>
        </article>
      {/each}
    </div>
  {/if}
</div>

<ShareDialog open={Boolean(shareNode)} node={shareNode} onclose={() => { shareNode = null; load(); }} />
