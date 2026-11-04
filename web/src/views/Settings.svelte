<script>
  import { onMount } from 'svelte';
  import { get, patch, post } from '../lib/api.js';
  import { user, settings as settingsStore, notify, confirmAction } from '../lib/stores.js';
  import { setUploadConcurrency } from '../lib/uploads.js';
  import { bytes } from '../lib/format.js';
  import Icon from '../components/Icon.svelte';
  import Button from '../components/Button.svelte';
  import Field from '../components/Field.svelte';
  import Switch from '../components/Switch.svelte';
  import Dialog from '../components/Dialog.svelte';
  import EmptyState from '../components/EmptyState.svelte';

  let loading = true;
  let failed = '';
  let settings = null;
  let profiles = {};
  let limits = {};
  let savingProfile = false;
  let savingGeneral = false;
  let displayName = '';
  let savingName = false;
  let passwordOpen = false;
  let currentPassword = '';
  let newPassword = '';
  let repeatPassword = '';
  let passwordBusy = false;
  let passwordError = '';
  let quotaGb = 0;
  let metrics = null;
  let health = null;
  let metricsLoading = false;

  $: isAdmin = $user?.role === 'admin';

  onMount(() => { load(); loadMetrics(); });

  async function load() {
    loading = true;
    failed = '';
    try {
      const data = await get('/api/v1/settings');
      settings = data.settings;
      profiles = data.profiles;
      limits = data.limits;
      quotaGb = settings.defaultQuota ? Math.round((settings.defaultQuota / 1073741824) * 10) / 10 : 0;
      displayName = $user?.displayName || $user?.username || '';
      settingsStore.set(settings);
      setUploadConcurrency(limits.uploads || 3);
    } catch (err) { failed = err.message; } finally { loading = false; }
  }

  async function loadMetrics() {
    metricsLoading = true;
    try {
      const [m, h] = await Promise.all([
        get('/api/v1/system/metrics').catch(() => null),
        get('/api/v1/system/health').catch(() => null),
      ]);
      metrics = m;
      health = h;
    } finally { metricsLoading = false; }
  }

  async function chooseProfile(key) {
    if (!isAdmin) { notify('Nur Administratoren können das Profil ändern.', 'warning'); return; }
    if (settings.performanceProfile === key) return;
    savingProfile = true;
    try {
      const data = await patch('/api/v1/settings', { performanceProfile: key });
      settings.performanceProfile = key;
      settings = { ...settings };
      limits = data.limits;
      setUploadConcurrency(limits.uploads || 3);
      notify(`Profil „${profileLabel(key)}“ aktiv.`, 'success');
    } catch (err) { notify(err.message, 'error'); } finally { savingProfile = false; }
  }

  async function saveGeneral() {
    if (!isAdmin) return;
    savingGeneral = true;
    try {
      await patch('/api/v1/settings', {
        autoThrottle: settings.autoThrottle,
        registrationOpen: settings.registrationOpen,
        defaultQuota: Math.round((Number(quotaGb) || 0) * 1073741824),
      });
      notify('Einstellungen gespeichert.', 'success');
    } catch (err) { notify(err.message, 'error'); } finally { savingGeneral = false; }
  }

  async function saveName() {
    savingName = true;
    try {
      const data = await patch('/api/v1/auth/me', { displayName });
      user.set({ ...$user, displayName: data.user.displayName });
      notify('Anzeigename gespeichert.', 'success');
    } catch (err) { notify(err.message, 'error'); } finally { savingName = false; }
  }

  async function changePassword() {
    passwordError = '';
    if (newPassword !== repeatPassword) { passwordError = 'Die neuen Passwörter stimmen nicht überein.'; return; }
    passwordBusy = true;
    try {
      await post('/api/v1/auth/password', { currentPassword, newPassword });
      passwordOpen = false;
      notify('Passwort geändert. Bitte melde dich neu an.', 'success');
      setTimeout(() => window.location.reload(), 900);
    } catch (err) { passwordError = err.message; } finally { passwordBusy = false; }
  }

  function profileLabel(key) {
    return { low: 'Sparsam', balanced: 'Ausgewogen', high: 'Leistungsstark' }[key] || key;
  }

  function profileDesc(key) {
    return {
      low: 'Wenig CPU und Speicher. Gut für kleine Server oder parallele Dienste.',
      balanced: 'Guter Standard für die meisten Instanzen.',
      high: 'Mehr parallele Uploads, Backups und Vorschaubilder.',
    }[key];
  }

  $: davUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}/dav`;
</script>

<div class="page page--wide">
  <header class="page-head">
    <div>
      <h1>Einstellungen</h1>
      <p class="lede">Profil, Leistung und Zugang zu deiner Onebox.</p>
    </div>
  </header>

  {#if failed}
    <EmptyState icon="cloud-off" title="Einstellungen konnten nicht geladen werden" text={failed} action={load} actionLabel="Erneut versuchen" />
  {:else if loading}
    <div class="list-stack"><div class="card loading-block"><span class="skeleton"></span><span class="skeleton"></span></div></div>
  {:else}
    <section aria-labelledby="profile-title">
      <div class="section-head"><h2 id="profile-title">Leistungsprofil</h2><span class="tag">{isAdmin ? 'Admin' : 'Nur lesbar'}</span></div>
      <p class="lede" style="margin-bottom:var(--space-4)">Das Profil steuert, wie viele Uploads, Backups und Vorschaubilder gleichzeitig laufen. Was zu deiner Hardware passt, entscheidest du.</p>
      <div class="profile-grid">
        {#each Object.entries(profiles) as [key, values]}
          <button type="button" class="profile-card" class:is-active={settings.performanceProfile === key} aria-pressed={settings.performanceProfile === key} on:click={() => chooseProfile(key)} disabled={savingProfile}>
            <div style="display:flex;justify-content:space-between;align-items:center"><h3>{profileLabel(key)}</h3>{#if settings.performanceProfile === key}<Icon name="circle-check" size={18} />{/if}</div>
            <p>{profileDesc(key)}</p>
            <div class="profile-numbers">
              <span><strong>{values.uploads}</strong>Uploads</span>
              <span><strong>{values.backups}</strong>Backups</span>
              <span><strong>{values.thumbnails}</strong>Vorschauen</span>
            </div>
          </button>
        {/each}
      </div>
    </section>

    {#if isAdmin}
      <section class="section" aria-labelledby="system-title">
        <div class="section-head"><h2 id="system-title">System &amp; Leistung</h2><span class="tag">Admin</span></div>
        <div class="card" style="display:grid;gap:var(--space-5)">
          {#if metricsLoading && !metrics}
            <div class="card loading-block"><span class="skeleton"></span><span class="skeleton"></span></div>
          {:else if metrics}
            <div class="kv">
              <dt>Status</dt><dd>{health?.status || 'ok'}</dd>
              <dt>Version</dt><dd>{health?.version || '–'}</dd>
              <dt>Uptime</dt><dd>{health?.uptime ? `${Math.floor(health.uptime / 60)} Min` : '–'}</dd>
              <dt>CPU</dt><dd>{metrics.cpu?.percent ?? 0}% · {metrics.cpu?.cores ?? 0} Kerne</dd>
              <dt>Speicher</dt><dd>{metrics.memory?.used ? bytes(metrics.memory.used) : '–'} von {metrics.memory?.total ? bytes(metrics.memory.total) : '–'} ({metrics.memory?.percent ?? 0}%)</dd>
              <dt>Plattenspeicher</dt><dd>{metrics.disk?.used ? bytes(metrics.disk.used) : '–'} von {metrics.disk?.total ? bytes(metrics.disk.total) : '–'}</dd>
              <dt>Last</dt><dd>{metrics.throttled ? 'Gesenkt (Throttle aktiv)' : 'Normal'}</dd>
            </div>
            <div style="display:grid;gap:var(--space-3)">
              <h4 style="margin:0">Job-Queues</h4>
              <div class="cluster">
                {#each Object.entries(metrics.queues || {}) as [name, queue]}
                  <div class="card" style="padding:var(--space-4);display:grid;gap:var(--space-2)">
                    <strong>{name}</strong>
                    <span class="stat-foot">{queue.running} aktiv · {queue.waiting} wartend · {queue.completed} fertig · {queue.failed} fehlgeschlagen</span>
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <p class="stat-foot">Systemdaten konnten nicht geladen werden.</p>
          {/if}
          <div><Button variant="secondary" size="sm" loading={metricsLoading} onclick={loadMetrics}>Systemstatus aktualisieren</Button></div>
        </div>
      </section>
    {/if}

    <div class="two-col section">
      <section aria-labelledby="general-title">
        <div class="section-head"><h2 id="general-title">Server</h2></div>
        <div class="card" style="display:grid;gap:var(--space-5)">
          <Switch bind:checked={settings.autoThrottle} disabled={!isAdmin} label="Automatisch drosseln" description="Bei hoher Last werden Hintergrundjobs zurückgenommen." />
          <Switch bind:checked={settings.registrationOpen} disabled={!isAdmin} label="Registrierung offen" description="Neue Konten können sich selbst anlegen. Standardmäßig aus." />
          <Switch bind:checked={settings.chatEnabled} disabled={!isAdmin} label="Chat aktivieren" description="Chat-Funktion ein- oder ausschalten" />

          <Field label="Standard-Kontingent" id="default-quota" hint="Für neue Konten, in Gigabyte. 0 bedeutet unbegrenzt.">
            <input id="default-quota" class="input" type="number" min="0" step="0.5" bind:value={quotaGb} disabled={!isAdmin} />
          </Field>
          {#if isAdmin}
            <div><Button variant="primary" size="sm" loading={savingGeneral} onclick={saveGeneral}>Server-Einstellungen speichern</Button></div>
          {/if}
        </div>
      </section>

      <aside style="display:grid;gap:var(--space-4)">
        <section class="card" aria-labelledby="account-title">
          <div class="card-head"><h3 id="account-title">Dein Konto</h3><span class="avatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span></div>
          <div style="display:grid;gap:var(--space-4)">
            <Field label="Anzeigename" id="account-name">
              <input id="account-name" class="input" bind:value={displayName} />
            </Field>
            <div class="kv">
              <dt>Benutzername</dt><dd>{$user?.username}</dd>
              <dt>Rolle</dt><dd>{isAdmin ? 'Administrator' : 'Mitglied'}</dd>
              <dt>Kontingent</dt><dd>{$user?.quotaBytes ? bytes($user.quotaBytes) : 'unbegrenzt'}</dd>
            </div>
            <div class="page-actions">
              <Button variant="secondary" size="sm" loading={savingName} disabled={!displayName.trim() || displayName === $user?.displayName} onclick={saveName}>Namen speichern</Button>
              <Button variant="quiet" size="sm" icon="key-round" onclick={() => { passwordOpen = true; currentPassword = ''; newPassword = ''; repeatPassword = ''; passwordError = ''; }}>Passwort ändern</Button>
            </div>
          </div>
        </section>

        <section class="card" aria-labelledby="dav-title">
          <div class="card-head"><h3 id="dav-title">WebDAV</h3><Icon name="network" size={17} /></div>
          <p class="stat-foot" style="margin-bottom:var(--space-3)">Binde Onebox in deinem Dateimanager ein. Melde dich mit deinem Benutzernamen und Passwort an.</p>
          <div class="code-block">{davUrl}</div>
        </section>
      </aside>
    </div>

    <section class="section danger-zone" aria-labelledby="sessions-title">
      <div class="card-head"><h2 id="sessions-title" style="font-size:var(--text-lg)">Sitzungen</h2><Icon name="shield-check" size={17} /></div>
      <p class="stat-foot">Wenn du dein Passwort änderst, werden alle Sitzungen beendet. Aktuell bist du in diesem Browser angemeldet.</p>
      <div class="page-actions" style="margin-top:var(--space-4)">
        <Button variant="secondary" size="sm" icon="log-out" onclick={async () => {
          const ok = await confirmAction({ title: 'Alle Sitzungen beenden?', description: 'Du wirst auch in diesem Browser abgemeldet.', confirmLabel: 'Abmelden', danger: true });
          if (ok) { try { await post('/api/v1/auth/logout', {}); } catch {} window.location.href = '/login'; }
        }}>Abmelden</Button>
      </div>
    </section>
  {/if}
</div>

<Dialog open={passwordOpen} title="Passwort ändern" description="Mindestens 10 Zeichen. Danach wirst du abgemeldet." size="sm" onclose={() => (passwordOpen = false)}>
  <Field label="Aktuelles Passwort" id="pw-current" required>
    <input id="pw-current" class="input" type="password" bind:value={currentPassword} autocomplete="current-password" />
  </Field>
  <Field label="Neues Passwort" id="pw-new" required>
    <input id="pw-new" class="input" type="password" bind:value={newPassword} autocomplete="new-password" minlength="10" />
  </Field>
  <Field label="Neues Passwort wiederholen" id="pw-repeat" error={passwordError} required>
    <input id="pw-repeat" class="input" type="password" bind:value={repeatPassword} autocomplete="new-password" />
  </Field>
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (passwordOpen = false)}>Abbrechen</Button>
    <Button variant="primary" loading={passwordBusy} disabled={!currentPassword || newPassword.length < 10} onclick={changePassword}>Passwort ändern</Button>
  </svelte:fragment>
</Dialog>
