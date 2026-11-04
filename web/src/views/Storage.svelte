<script>
  import { onMount } from 'svelte';
  import { get, post, put } from '../lib/api.js';
  import { user } from '../lib/stores.js';
  import { bytes } from '../lib/format.js';
  import Icon from '../components/Icon.svelte';
  import ProgressBar from '../components/ProgressBar.svelte';
  import EmptyState from '../components/EmptyState.svelte';

  let storage = null;
  let overview = null;
  let locations = [];
  let selectedLocationId = '';
  let loading = true;
  let failed = '';
  let newLocationName = '';
  let newLocationRoot = '';
  let newLocationSource = '';
  let creating = false;
  let createError = '';

  onMount(load);

  async function load() {
    loading = true;
    failed = '';
    try {
      storage = await get('/api/v1/storage');
      locations = (await get('/api/v1/storage/locations')).locations || [];
      if (selectedLocationId && !locations.some((location) => location.id === selectedLocationId)) selectedLocationId = locations[0]?.id || '';
      if ($user?.role === 'admin') overview = await get('/api/v1/storage/overview');
    } catch (err) { failed = err.message; } finally { loading = false; }
  }

  async function selectStorage() {
    const location = locations.find((entry) => entry.id === selectedLocationId) || locations[0];
    if (!location) return;
    await put(`/api/v1/storage/locations/${location.id}`, { isDefault: true, source: location.source || location.rootPath });
    storage = await get('/api/v1/storage');
  }

  async function createLocation(event) {
    event?.preventDefault?.();
    creating = true;
    createError = '';
    try {
      await post('/api/v1/storage/locations', { name: newLocationName, rootPath: newLocationRoot, source: newLocationSource || undefined, isDefault: false });
      newLocationName = '';
      newLocationRoot = '';
      newLocationSource = '';
      await load();
    } catch (err) { createError = err.message; } finally { creating = false; }
  }

  const family = {
    'image/': 'Bilder', 'video/': 'Videos', 'audio/': 'Audio', 'text/': 'Text',
    'application/pdf': 'Dokumente', 'application/zip': 'Archive', 'application/x-tar': 'Archive',
    'application/vnd.': 'Dokumente', 'application/msword': 'Dokumente',
    'application/x-7z': 'Archive', 'application/gzip': 'Archive',
  };

  function category(mime) {
    if (!mime) return 'Sonstiges';
    for (const [prefix, label] of Object.entries(family)) if (mime.startsWith(prefix)) return label;
    return 'Sonstiges';
  }

  $: types = storage ? groupTypes(storage.byType) : [];

  function groupTypes(rows) {
    const map = new Map();
    for (const row of rows) {
      const label = category(row.mime);
      const current = map.get(label) || { label, size: 0, count: 0 };
      current.size += Number(row.size) || 0;
      current.count += Number(row.count) || 0;
      map.set(label, current);
    }
    return [...map.values()].sort((a, b) => b.size - a.size);
  }

  $: percent = storage?.quota ? Math.min(100, Math.round((storage.used / storage.quota) * 100)) : null;
</script>

<div class="page page--wide">
  <header class="page-head">
    <div>
      <h1>Speicher</h1>
      <p class="lede">Was dein Konto belegt, welche Dateitypen Platz brauchen und wie es um die Festplatte steht.</p>
    </div>
  </header>

  {#if failed}
    <EmptyState icon="cloud-off" title="Speicherdaten konnten nicht geladen werden" text={failed} action={load} actionLabel="Erneut versuchen" />
  {:else if loading}
    <div class="stat-grid">{#each [0, 1, 2, 3] as i}<div class="stat-card"><span class="skeleton"></span><span class="skeleton" style="height:2rem"></span></div>{/each}</div>
  {:else}
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-top"><span class="stat-label">Von dir belegt</span><Icon name="user" size={17} /></div>
        <strong class="stat-value">{bytes(storage.used)}</strong>
        <span class="stat-foot">{storage.quota ? `von ${bytes(storage.quota)}` : 'kein Kontingent'}</span>
      </div>
      <div class="stat-card">
        <div class="stat-top"><span class="stat-label">Papierkorb</span><Icon name="trash-2" size={17} /></div>
        <strong class="stat-value">{bytes(storage.trash.size)}</strong>
        <span class="stat-foot">{storage.trash.count} {storage.trash.count === 1 ? 'Element' : 'Elemente'}</span>
      </div>
      <div class="stat-card">
        <div class="stat-top"><span class="stat-label">Datenträger frei</span><Icon name="hard-drive" size={17} /></div>
        <strong class="stat-value">{bytes(storage.disk.free)}</strong>
        <span class="stat-foot">von {bytes(storage.disk.total)}</span>
      </div>
      <div class="stat-card">
        <div class="stat-top"><span class="stat-label">Kontingent</span><Icon name="gauge" size={17} /></div>
        <strong class="stat-value">{percent === null ? '∞' : `${percent}%`}</strong>
        <span class="stat-foot">{percent === null ? 'unbegrenzt' : 'ausgeschöpft'}</span>
      </div>
    </div>

    <div class="two-col section">
      <section aria-labelledby="types-title">
        <div class="section-head"><h2 id="types-title">Nach Dateityp</h2><span class="tag">{types.length} Gruppen</span></div>
        <div class="card">
          {#if types.length}
            <div class="list-stack">
              {#each types as type}
                <div class="metric-row" style="grid-template-columns:6rem minmax(0,1fr) 6rem">
                  <span>{type.label}</span>
                  <ProgressBar value={type.size} max={storage.used || 1} size="sm" tone="brand" label={`${type.label}: ${bytes(type.size)}`} />
                  <strong>{bytes(type.size)}</strong>
                </div>
              {/each}
            </div>
          {:else}
            <EmptyState icon="pie-chart" title="Noch keine Dateien" text="Sobald du Dateien hochlädst, zeigt sich hier die Verteilung." compact />
          {/if}
        </div>
      </section>
      <aside>
        <div class="card storage-card">
          <div class="card-head"><h3>Kontingent</h3><Icon name="gauge" size={17} /></div>
          <div class="storage-figure"><strong>{bytes(storage.used)}</strong><span>{storage.quota ? `von ${bytes(storage.quota)}` : 'belegt'}</span></div>
          {#if percent !== null}
            <ProgressBar value={storage.used} max={storage.quota} tone={percent > 90 ? 'over' : percent > 75 ? 'warn' : 'brand'} label="Speicherbelegung" />
            <p class="stat-foot">{bytes(storage.quota - storage.used)} verfügbar.</p>
          {:else}
            <p class="stat-foot">Für dieses Konto ist kein Limit gesetzt. Der verfügbare Platz richtet sich nach dem Datenträger.</p>
          {/if}
        </div>
      </aside>
    </div>

    {#if overview}
      <section class="section" aria-labelledby="all-users-title">
        <div class="section-head"><h2 id="all-users-title">Alle Konten</h2><span class="tag">Administratoransicht</span></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Konto</th><th>Rolle</th><th>Belegt</th><th>Kontingent</th></tr></thead>
            <tbody>
              {#each overview.users as account}
                <tr>
                  <td><strong style="font-weight:var(--weight-medium)">{account.displayName || account.username}</strong><br /><span class="stat-foot">{account.username}</span></td>
                  <td><span class="tag">{account.role === 'admin' ? 'Administrator' : 'Mitglied'}</span></td>
                  <td class="num">{bytes(account.usedBytes)}</td>
                  <td>{account.quotaBytes ? bytes(account.quotaBytes) : 'unbegrenzt'}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </section>
    {/if}

    {#if overview}
      <section class="section" aria-labelledby="storage-title">
        <div class="section-head"><h2 id="storage-title">Speicher</h2><span class="tag">Administratoransicht</span></div>
        <div class="card storage-card">
          <div class="card-head"><h3>Speicher festlegen</h3><Icon name="hard-drive" size={17} /></div>
          {#if locations.length}
            <div class="input-group">
              <select class="select" bind:value={selectedLocationId} aria-label="Speicher für Uploads auswählen">
                {#each locations as location (location.id)}
                  <option value={location.id}>{location.name} · {location.rootPath}{location.source ? ` · ${location.source}` : ''}</option>
                {/each}
              </select>
              <button class="btn btn--primary" type="button" onclick={selectStorage}>Als Speicher verwenden</button>
            </div>
          {:else}
            <p class="stat-foot">Keine Speicherorte hinterlegt.</p>
          {/if}
          <form class="storage-form" onsubmit={(event) => createLocation(event)}>
            <div class="field">
              <label class="field__label" for="storage-name">Name</label>
              <input id="storage-name" class="input" type="text" bind:value={newLocationName} placeholder="Mein HDD" required />
              <span class="field__hint">Eindeutiger Name für diesen Speicherort.</span>
            </div>
            <div class="field">
              <label class="field__label" for="storage-root">Mount-Pfad</label>
              <input id="storage-root" class="input" type="text" bind:value={newLocationRoot} placeholder="/mnt/onebox-data" required />
              <span class="field__hint">Zielordner, in den der Datenträger gemountet wird (z. B. /mnt/onebox-data).</span>
            </div>
            <div class="field">
              <label class="field__label" for="storage-source">Gerät / Quelle</label>
              <input id="storage-source" class="input" type="text" bind:value={newLocationSource} placeholder="/dev/sdb1" />
              <span class="field__hint">Optional: Geräteeinheit (z. B. /dev/sdb1), die nach dem Mount-Pfad gemountet wird.</span>
            </div>
            <button class="btn btn--primary" type="submit" disabled={creating}>{creating ? '…' : 'Speicher anlegen'}</button>
          </form>
          {#if createError}<p class="stat-foot" role="alert">{createError}</p>{/if}
          <p class="stat-foot">Uploads landen nach der Auswahl im gewählten Datenträger. Der Papierkorb und Objekte des bisherigen Speichers bleiben dort erhalten.</p>
        </div>
      </section>
    {/if}
  {/if}
</div>
