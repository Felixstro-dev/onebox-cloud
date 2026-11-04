<script>
  import { onMount } from 'svelte';
  import { get } from '../lib/api.js';
  import { addFiles } from '../lib/uploads.js';
  import { user, refreshKey, uploadsOpen, notify } from '../lib/stores.js';
  import { bytes, relative, initials, fileKind } from '../lib/format.js';
  import { navigate } from '../lib/router.js';
  import Icon from '../components/Icon.svelte';
  import Button from '../components/Button.svelte';
  import ProgressBar from '../components/ProgressBar.svelte';
  import EmptyState from '../components/EmptyState.svelte';

  let loading = true;
  let overview = { usedBytes: 0, fileCount: 0 };
  let storage = { used: 0, quota: 0, quotaUsedPercent: null, trash: { size: 0, count: 0 } };
  let recent = [];
  let activity = [];
  let shareCount = 0;
  let photoCount = 0;
  let failed = false;
  let uploadInput;

  const actionLabels = {
    'file.download': 'Datei heruntergeladen',
    'node.update': 'Umbenannt oder verschoben',
    'node.copy': 'Kopie erstellt',
    'node.trash': 'In den Papierkorb',
    'node.delete': 'Endgültig gelöscht',
    'folder.create': 'Ordner erstellt',
    'share.create': 'Freigabe erstellt',
    'share.download': 'Freigabe heruntergeladen',
    'share.upload': 'Upload eingegangen',
    'photo.edit': 'Foto bearbeitet',
    'auth.login': 'Angemeldet',
    'backup.job.create': 'Backup-Auftrag erstellt',
    'agent.create': 'Backup-Agent verbunden',
    'setup.completed': 'Instanz eingerichtet',
  };

  async function load() {
    loading = true;
    failed = false;
    try {
      const [o, s, r, a, sh, ph] = await Promise.all([
        get('/api/v1/overview'),
        get('/api/v1/storage'),
        get('/api/v1/files/recent'),
        get('/api/v1/activity'),
        get('/api/v1/shares'),
        get('/api/v1/photos?limit=1'),
      ]);
      overview = o;
      storage = s;
      recent = r.items;
      activity = a.items;
      shareCount = sh.items.filter((item) => item.status === 'active').length;
      photoCount = ph.total;
    } catch {
      failed = true;
    } finally {
      loading = false;
    }
  }

  onMount(load);
  $: if ($refreshKey) load();

  $: quota = storage.quota || $user?.quotaBytes || 0;
  $: percent = quota ? Math.min(100, Math.round((storage.used / quota) * 100)) : null;

  function chooseUploads() { uploadInput?.click(); }

  function onUploads(event) {
    const files = [...(event.target.files || [])];
    if (files.length) {
      addFiles(files, null);
      notify(`${files.length} ${files.length === 1 ? 'Datei' : 'Dateien'} zur Warteschlange hinzugefügt.`, 'success');
    }
    event.target.value = '';
  }

  function openNode(item) {
    if (item.kind === 'folder') navigate(`/files/${item.id}`);
    else navigate(`/files/${item.parentId || ''}?preview=${item.id}`);
  }
</script>

<div class="page page--wide">
  <input class="sr-only" type="file" multiple bind:this={uploadInput} on:change={onUploads} />
  <header class="hello">
    <div>
      <p class="lede">{[ 'Guten Morgen', 'Guten Tag', 'Guten Abend' ][Math.floor(new Date().getHours() / 8)] || 'Hallo'}, {$user?.displayName || $user?.username}.</p>
      <h1>Deine Dateien,<br />in Reichweite.</h1>
    </div>
    <div class="page-actions">
      <Button variant="secondary" icon="upload" onclick={chooseUploads}>Hochladen</Button>
      <Button variant="primary" icon="folder-plus" href="/files">Ordner öffnen</Button>
    </div>
  </header>

  {#if failed}
    <EmptyState icon="cloud-off" title="Übersicht konnte nicht geladen werden" text="Der Server hat nicht geantwortet. Prüfe die Verbindung und versuche es erneut." action={load} actionLabel="Erneut versuchen" />
  {:else if loading}
    <div class="stat-grid">
      {#each [0, 1, 2, 3] as i}
        <div class="stat-card"><span class="skeleton" style="width:40%"></span><span class="skeleton" style="width:65%;height:2rem"></span><span class="skeleton" style="width:50%"></span></div>
      {/each}
    </div>
    <div class="two-col section">
      <div class="card loading-block"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div>
      <div class="card loading-block"><span class="skeleton"></span><span class="skeleton"></span></div>
    </div>
  {:else}
    <div class="stat-grid">
      <div class="stat-card">
        <div class="stat-top"><span class="stat-label">Belegt</span><Icon name="hard-drive" size={17} /></div>
        <strong class="stat-value">{bytes(storage.used)}</strong>
        <span class="stat-foot">{quota ? `von ${bytes(quota)}` : 'ohne Kontingent'}</span>
      </div>
      <div class="stat-card">
        <div class="stat-top"><span class="stat-label">Dateien</span><Icon name="file-stack" size={17} /></div>
        <strong class="stat-value">{overview.fileCount.toLocaleString('de-DE')}</strong>
        <span class="stat-foot">{photoCount.toLocaleString('de-DE')} Fotos</span>
      </div>
      <div class="stat-card">
        <div class="stat-top"><span class="stat-label">Aktive Links</span><Icon name="link" size={17} /></div>
        <strong class="stat-value">{shareCount}</strong>
        <span class="stat-foot">Freigaben und Upload-Anfragen</span>
      </div>
      <div class="stat-card">
        <div class="stat-top"><span class="stat-label">Papierkorb</span><Icon name="trash-2" size={17} /></div>
        <strong class="stat-value">{storage.trash.count}</strong>
        <span class="stat-foot">{bytes(storage.trash.size)} warten auf Löschung</span>
      </div>
    </div>

    <div class="two-col section">
      <section aria-labelledby="recent-title">
        <div class="section-head">
          <h2 id="recent-title">Zuletzt geändert</h2>
          <a href="/files" data-route>Alle Dateien</a>
        </div>
        {#if recent.length}
          <div class="card" style="padding-top:var(--space-2);padding-bottom:var(--space-2)">
            <div class="recent-list">
              {#each recent as item}
                <button class="recent-row" type="button" on:click={() => openNode(item)}>
                  <span class="file-icon file-icon--{fileKind(item)}" aria-hidden="true"><Icon name={fileKind(item) === 'folder' ? 'folder' : fileKind(item) === 'image' ? 'image' : 'file'} size={17} /></span>
                  <span class="recent-name">{item.name}</span>
                  <span class="recent-meta">{bytes(item.size)} · {relative(item.updatedAt)}</span>
                </button>
              {/each}
            </div>
          </div>
        {:else}
          <EmptyState icon="file-plus" title="Noch keine Dateien" text="Lade die erste Datei hoch oder lege einen Ordner an." action={chooseUploads} actionLabel="Datei hochladen" compact />
        {/if}
      </section>

      <aside style="display:grid;gap:var(--space-4)">
        <div class="card storage-card">
          <div class="card-head"><h3>Speicher</h3><Icon name="pie-chart" size={17} /></div>
          <div class="storage-figure"><strong>{bytes(storage.used)}</strong><span>{quota ? `von ${bytes(quota)}` : 'belegt'}</span></div>
          {#if percent !== null}
            <ProgressBar value={storage.used} max={quota || 1} tone={percent > 90 ? 'over' : percent > 75 ? 'warn' : 'brand'} label="Speicherbelegung" />
            <span class="stat-foot">{percent}% des Kontingents</span>
          {:else}
            <p class="stat-foot">Für dieses Konto ist kein Limit gesetzt.</p>
          {/if}
          <Button variant="secondary" size="sm" href="/storage">Speicher ansehen</Button>
        </div>
        <div class="card">
          <div class="card-head"><h3>In deiner Nähe</h3><Icon name="sparkles" size={17} /></div>
          <div class="list-stack">
            <button class="menu-item" type="button" on:click={chooseUploads}><Icon name="upload" size={16} /> Dateien hochladen</button>
            <a class="menu-item" href="/files" data-route><Icon name="folder-plus" size={16} /> Neuen Ordner anlegen</a>
            <a class="menu-item" href="/shared" data-route><Icon name="link" size={16} /> Link teilen</a>
            <a class="menu-item" href="/backups" data-route><Icon name="database-backup" size={16} /> Backup einrichten</a>
          </div>
        </div>
      </aside>
    </div>

    <section class="section" aria-labelledby="activity-title">
      <div class="section-head"><h2 id="activity-title">Aktivität</h2><a href="/settings" data-route>Einstellungen</a></div>
      {#if activity.length}
        <div class="card">
          <div class="timeline">
            {#each activity.slice(0, 8) as entry}
              <div class="timeline-item">
                <span class="timeline-icon" aria-hidden="true"><Icon name={entry.action.startsWith('share') ? 'link' : entry.action.startsWith('backup') || entry.action.startsWith('agent') ? 'database-backup' : entry.action.startsWith('photo') ? 'image' : entry.action.includes('trash') ? 'trash-2' : 'check'} size={15} /></span>
                <div class="timeline-body">
                  <p>{actionLabels[entry.action] || entry.action}{#if entry.detail} <span style="color:var(--color-text-secondary)">· {entry.detail}</span>{/if}</p>
                  <small>{relative(entry.createdAt)}</small>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <EmptyState icon="history" title="Noch ruhig hier" text="Sobald du Dateien hochlädst oder teilst, erscheint hier ein Verlauf." compact />
      {/if}
    </section>
  {/if}
</div>
