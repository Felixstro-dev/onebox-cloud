<script>
  import { onMount } from 'svelte';
  import { del as deleteRequest, get, patch, post } from '../lib/api.js';
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
  let sessions = [];
  let sessionsLoading = false;
  let twoFactor = { enabled: false, recoveryCodesRemaining: 0 };
  let securityBusy = false;
  let setupOpen = false;
  let setupData = null;
  let setupCode = '';
  let setupError = '';
  let recoveryCodes = null;
  let recoveryOpen = false;
  let disableOpen = false;
  let disablePassword = '';
  let disableError = '';
  let updateStatus = null;
  let updateCheckBusy = false;
  let updateBusy = false;
  let updateError = '';
  let widgetOpen = false;
  let widgetTitle = 'Meine Onebox';
  let widgetSize = 'medium';
  let widgetColor = '#d97757';
  let widgetImage = '';
  let widgetImageName = '';
  let widgetInput;

  $: isAdmin = $user?.role === 'admin';

  onMount(() => { load(); loadMetrics(); loadSecurity(); loadWidget(); });

  function loadWidget() {
    try {
      const saved = JSON.parse(localStorage.getItem('onebox-home-widget') || '{}');
      widgetTitle = saved.title || widgetTitle;
      widgetSize = saved.size || widgetSize;
      widgetColor = saved.color || widgetColor;
      widgetImage = saved.image || '';
      widgetImageName = saved.imageName || '';
    } catch {}
  }

  function openWidgetDesigner() {
    loadWidget();
    widgetOpen = true;
  }

  function chooseWidgetImage() {
    widgetInput?.click();
  }

  function onWidgetImage(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      widgetImage = reader.result;
      widgetImageName = file.name;
    };
    reader.readAsDataURL(file);
    event.currentTarget.value = '';
  }

  function saveWidget() {
    try {
      localStorage.setItem('onebox-home-widget', JSON.stringify({
        title: widgetTitle.trim() || 'Meine Onebox',
        size: widgetSize,
        color: widgetColor,
        image: widgetImage,
        imageName: widgetImageName,
      }));
      widgetOpen = false;
      notify('Widget-Design auf diesem Gerät gespeichert.', 'success');
    } catch {
      notify('Das Bild ist zu groß für den lokalen Gerätespeicher.', 'error');
    }
  }

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

  async function loadSecurity() {
    sessionsLoading = true;
    try {
      const [sessionData, factorData] = await Promise.all([
        get('/api/v1/auth/sessions').catch(() => ({ items: [] })),
        get('/api/v1/auth/2fa').catch(() => ({ enabled: false, recoveryCodesRemaining: 0 })),
      ]);
      sessions = sessionData.items || [];
      twoFactor = factorData;
    } finally { sessionsLoading = false; }
  }

  async function revoke(session) {
    if (session.current) {
      const ok = await confirmAction({ title: 'Diese Sitzung beenden?', description: 'Du wirst in diesem Browser abgemeldet.', confirmLabel: 'Abmelden', danger: true });
      if (!ok) return;
    }
    try {
      const result = await deleteRequest(`/api/v1/auth/sessions/${session.id}`);
      if (result?.signedOut) { window.location.href = '/login'; return; }
      notify('Sitzung beendet.', 'success');
      await loadSecurity();
    } catch (err) { notify(err.message, 'error'); }
  }

  async function startTwoFactor() {
    securityBusy = true;
    setupError = '';
    try {
      setupData = await post('/api/v1/auth/2fa/setup', {});
      setupCode = '';
      setupOpen = true;
    } catch (err) { notify(err.message, 'error'); } finally { securityBusy = false; }
  }

  async function enableTwoFactor() {
    securityBusy = true;
    setupError = '';
    try {
      await post('/api/v1/auth/2fa/enable', { code: setupCode });
      setupOpen = false;
      recoveryCodes = setupData.recoveryCodes;
      recoveryOpen = true;
      setupData = null;
      twoFactor = { enabled: true, recoveryCodesRemaining: recoveryCodes.length };
      notify('Zwei-Faktor-Authentifizierung aktiv.', 'success');
    } catch (err) { setupError = err.message; } finally { securityBusy = false; }
  }

  async function disableTwoFactor() {
    securityBusy = true;
    disableError = '';
    try {
      await post('/api/v1/auth/2fa/disable', { password: disablePassword });
      disableOpen = false;
      disablePassword = '';
      twoFactor = { enabled: false, recoveryCodesRemaining: 0 };
      notify('Zwei-Faktor-Authentifizierung deaktiviert.', 'success');
    } catch (err) { disableError = err.message; } finally { securityBusy = false; }
  }

  async function newRecoveryCodes() {
    securityBusy = true;
    disableError = '';
    try {
      const data = await post('/api/v1/auth/2fa/recovery', { password: disablePassword });
      recoveryCodes = data.recoveryCodes;
      recoveryOpen = true;
      disableOpen = false;
      disablePassword = '';
      twoFactor = { ...twoFactor, recoveryCodesRemaining: recoveryCodes.length };
    } catch (err) { disableError = err.message; } finally { securityBusy = false; }
  }

  function copyRecoveryCodes() {
    navigator.clipboard?.writeText(recoveryCodes.join('\n')).then(
      () => notify('Wiederherstellungscodes kopiert.', 'success'),
      () => notify('Kopieren nicht möglich. Bitte Codes notieren.', 'warning'),
    );
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
    if (isAdmin) checkUpdates({ quiet: true });
  }

  async function checkUpdates({ quiet = false } = {}) {
    if (!isAdmin) return;
    if (!quiet) updateCheckBusy = true;
    updateError = '';
    try {
      updateStatus = await get('/api/v1/system/update/status');
      if (!quiet && !updateStatus.updateAvailable) notify('Onebox ist auf dem neuesten Stand.', 'success');
    } catch (err) {
      updateError = err.message;
      if (!quiet) notify(err.message, 'error');
    } finally { updateCheckBusy = false; }
  }

  async function startUpdate() {
    const ok = await confirmAction({
      title: 'Onebox jetzt aktualisieren?',
      description: 'Die Instanz geht für mindestens 30 Sekunden in den Wartungsmodus, führt Datenbank-Migrationen aus und startet den Container neu.',
      confirmLabel: 'Update starten',
    });
    if (!ok) return;
    updateBusy = true;
    updateError = '';
    try {
      await post('/api/v1/system/update', {});
      window.location.assign('/maintenance');
    } catch (err) {
      updateError = err.message;
      notify(err.message, 'error');
      updateBusy = false;
    }
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
        chatEnabled: settings.chatEnabled,
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
      notify('Passwort geändert.', 'success');
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

      <section class="section" aria-labelledby="update-title">
        <div class="section-head"><h2 id="update-title">Updates</h2><span class="tag">Admin</span></div>
        <div class="card" style="display:grid;gap:var(--space-4)">
          <div class="kv">
            <dt>Installiert</dt><dd>{updateStatus?.current || health?.version || '–'}</dd>
            <dt>Verfügbar</dt><dd>{updateStatus?.latest || (updateStatus ? '–' : 'noch nicht geprüft')}</dd>
            <dt>Status</dt>
            <dd>
              {#if updateStatus?.updateAvailable}
                <span class="tag tag--success">Update verfügbar</span>
              {:else if updateStatus?.error}
                <span class="tag tag--warning">Prüfung fehlgeschlagen</span>
              {:else if updateStatus}
                <span class="tag">Aktuell</span>
              {:else}
                <span class="tag">–</span>
              {/if}
            </dd>
            <dt>Auto-Update</dt><dd>{updateStatus?.autoUpdate ? 'bereit' : 'nicht konfiguriert (siehe README)'}</dd>
          </div>
          {#if updateStatus?.error}<p class="field__hint" style="color:var(--color-warning)">{updateStatus.error}</p>{/if}
          {#if updateError}<p class="field__hint" style="color:var(--color-error)">{updateError}</p>{/if}
          {#if updateStatus?.notes}
            <details>
              <summary style="cursor:pointer;font-size:var(--text-sm);color:var(--color-text-secondary)">Änderungen ansehen</summary>
              <pre class="code-block" style="max-height:14rem;overflow:auto">{updateStatus.notes}</pre>
            </details>
          {/if}
          <div class="page-actions">
            <Button variant="secondary" size="sm" icon="refresh-cw" loading={updateCheckBusy} onclick={() => checkUpdates()}>Nach Updates suchen</Button>
            {#if updateStatus?.updateAvailable}
              <Button variant="primary" size="sm" icon="download" loading={updateBusy} disabled={!updateStatus?.autoUpdate} onclick={startUpdate}>Jetzt aktualisieren</Button>
            {/if}
            {#if updateStatus?.url}
              <Button variant="quiet" size="sm" href={updateStatus.url} title="Release-Seite auf GitHub öffnen">Release-Notizen</Button>
            {/if}
          </div>
          {#if updateStatus?.updateAvailable && !updateStatus?.autoUpdate}
            <p class="field__hint">Für Ein-Klick-Updates muss der Updater-Container laufen. Anleitung im README unter „Updates“.</p>
          {/if}
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

        <section class="card" aria-labelledby="twofactor-title">
          <div class="card-head"><h3 id="twofactor-title">Zwei-Faktor-Anmeldung</h3><span class="tag">{twoFactor.enabled ? 'Aktiv' : 'Aus'}</span></div>
          <p class="stat-foot" style="margin-bottom:var(--space-4)">
            Ein Code aus deiner Authenticator-App schützt die Anmeldung zusätzlich. Bewahre die Wiederherstellungscodes sicher auf.
          </p>
          {#if twoFactor.enabled}
            <div class="kv" style="margin-bottom:var(--space-4)">
              <dt>Status</dt><dd>Aktiv</dd>
              <dt>Codes übrig</dt><dd>{twoFactor.recoveryCodesRemaining}</dd>
            </div>
            <div class="page-actions">
              <Button variant="secondary" size="sm" icon="refresh-cw" loading={securityBusy} onclick={() => { recoveryCodes = null; disableError = ''; disablePassword = ''; disableOpen = true; }}>Codes erneuern</Button>
              <Button variant="quiet" size="sm" icon="shield-off" onclick={() => { disableError = ''; disablePassword = ''; disableOpen = true; }}>Deaktivieren</Button>
            </div>
          {:else}
            <Button variant="primary" size="sm" icon="shield-check" loading={securityBusy} onclick={startTwoFactor}>Einrichten</Button>
          {/if}
        </section>

        <section class="card widget-settings-card" aria-labelledby="widget-title">
          <div class="card-head"><h3 id="widget-title">Home-Bildschirm-Widget</h3><Icon name="tablet" size={17} /></div>
          <p class="stat-foot">Gestalte eine persönliche Onebox-Kachel für deinen iPad-Home-Bildschirm. Bild, Name und Farbe bleiben auf diesem Gerät gespeichert.</p>
          <Button variant="secondary" size="sm" icon="sparkles" onclick={openWidgetDesigner}>Widget gestalten</Button>
        </section>

        <section class="card" aria-labelledby="dav-title">
          <div class="card-head"><h3 id="dav-title">WebDAV</h3><Icon name="network" size={17} /></div>
          <p class="stat-foot" style="margin-bottom:var(--space-3)">Binde Onebox in deinem Dateimanager ein. Melde dich mit deinem Benutzernamen und Passwort an.</p>
          <div class="code-block">{davUrl}</div>
        </section>
      </aside>
    </div>

    <section class="section danger-zone" aria-labelledby="sessions-title">
      <div class="card-head">
        <h2 id="sessions-title" style="font-size:var(--text-lg)">Aktive Sitzungen</h2>
        <Button variant="quiet" size="sm" icon="refresh-cw" loading={sessionsLoading} onclick={loadSecurity}>Aktualisieren</Button>
      </div>
      <p class="stat-foot">Geräte, die mit deinem Konto angemeldet sind. Beende fremde Sitzungen, wenn dir etwas unklar vorkommt.</p>
      {#if sessions.length}
        <ul class="session-list">
          {#each sessions as session (session.id)}
            <li class="session-item">
              <span class="session-icon" aria-hidden="true"><Icon name={session.current ? 'monitor' : 'smartphone'} size={18} /></span>
              <div class="session-body">
                <strong>{session.current ? 'Dieser Browser' : (session.userAgent || 'Unbekanntes Gerät')}</strong>
                <span class="stat-foot">{session.ip || 'unbekannte IP'} · zuletzt {new Date(session.lastSeenAt).toLocaleString('de-DE')}</span>
              </div>
              <Button variant={session.current ? 'quiet' : 'secondary'} size="sm" onclick={() => revoke(session)}>{session.current ? 'Abmelden' : 'Beenden'}</Button>
            </li>
          {/each}
        </ul>
      {:else if !sessionsLoading}
        <p class="stat-foot">Keine aktiven Sitzungen gefunden.</p>
      {/if}
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

<Dialog open={setupOpen} title="Zwei-Faktor-Authentifizierung einrichten" description="Scanne den Schlüssel in deiner Authenticator-App und bestätige mit einem Code." size="sm" onclose={() => (setupOpen = false)}>
  {#if setupData}
    <div style="display:grid;gap:var(--space-4)">
      <div class="code-block" style="word-break:break-all">{setupData.secret}</div>
      <div class="code-block" style="word-break:break-all;font-size:var(--text-xs)">{setupData.otpauth}</div>
      <Field label="Code aus der App" id="totp-code" error={setupError}>
        <input id="totp-code" class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" bind:value={setupCode} placeholder="123456" />
      </Field>
    </div>
  {/if}
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (setupOpen = false)}>Abbrechen</Button>
    <Button variant="primary" loading={securityBusy} disabled={!setupCode.trim()} onclick={enableTwoFactor}>Aktivieren</Button>
  </svelte:fragment>
</Dialog>

<Dialog open={disableOpen} title={twoFactor.enabled ? 'Zwei-Faktor-Authentifizierung' : 'Codes erneuern'} description="Bestätige mit deinem Passwort." size="sm" onclose={() => (disableOpen = false)}>
  <Field label="Passwort" id="totp-password" error={disableError}>
    <input id="totp-password" class="input" type="password" bind:value={disablePassword} autocomplete="current-password" />
  </Field>
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (disableOpen = false)}>Abbrechen</Button>
    <Button variant="secondary" loading={securityBusy} disabled={!disablePassword} onclick={newRecoveryCodes}>Neue Codes</Button>
    <Button variant="danger" loading={securityBusy} disabled={!disablePassword} onclick={disableTwoFactor}>Deaktivieren</Button>
  </svelte:fragment>
</Dialog>

<Dialog open={recoveryOpen} title="Wiederherstellungscodes" description="Jeder Code funktioniert genau einmal. Bewahre sie getrennt vom Passwort auf." size="sm" onclose={() => (recoveryOpen = false)}>
  {#if recoveryCodes}
    <div class="recovery-grid">
      {#each recoveryCodes as code (code)}<code>{code}</code>{/each}
    </div>
  {/if}
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (recoveryOpen = false)}>Schließen</Button>
    <Button variant="primary" icon="copy" onclick={copyRecoveryCodes}>Kopieren</Button>
  </svelte:fragment>
</Dialog>

<Dialog open={widgetOpen} title="Home-Bildschirm-Widget" description="Deine Gestaltung wird nur in diesem Browser auf dem iPad gespeichert." size="md" onclose={() => (widgetOpen = false)}>
  <div class="widget-editor">
    <div class="widget-preview-wrap">
      <div class="widget-preview widget-preview--{widgetSize}" style:--widget-color={widgetColor}>
        {#if widgetImage}<img src={widgetImage} alt="" />{/if}
        <div class="widget-preview__scrim"></div>
        <div class="widget-preview__content">
          <span class="widget-preview__mark"><Icon name="cloud" size={18} /></span>
          <strong>{widgetTitle.trim() || 'Meine Onebox'}</strong>
          <span>Deine Dateien, überall</span>
        </div>
      </div>
    </div>

    <div class="widget-fields">
      <Field label="Name des Widgets" id="widget-name" hint="Wird direkt auf der Kachel angezeigt.">
        <input id="widget-name" class="input" maxlength="32" bind:value={widgetTitle} placeholder="Meine Onebox" />
      </Field>
      <div class="widget-field-row">
        <Field label="Größe" id="widget-size">
          <select id="widget-size" class="input" bind:value={widgetSize}>
            <option value="small">Klein</option>
            <option value="medium">Mittel</option>
            <option value="large">Groß</option>
          </select>
        </Field>
        <Field label="Akzentfarbe" id="widget-color">
          <input id="widget-color" class="widget-color-input" type="color" bind:value={widgetColor} aria-label="Akzentfarbe auswählen" />
        </Field>
      </div>
      <div class="widget-image-picker">
        <input class="sr-only" type="file" accept="image/*" bind:this={widgetInput} on:change={onWidgetImage} />
        <div>
          <strong>Eigenes Bild</strong>
          <span class="stat-foot">PNG oder JPG als Hintergrund</span>
          {#if widgetImageName}<span class="widget-image-name">{widgetImageName}</span>{/if}
        </div>
        <Button variant="secondary" size="sm" icon="image-plus" onclick={chooseWidgetImage}>Bild auswählen</Button>
      </div>
      <p class="widget-note"><Icon name="info" size={16} /> Nach dem Speichern in Safari: Teilen → „Zum Home-Bildschirm“. Das Widget kann anschließend über „Widget hinzufügen“ platziert werden.</p>
    </div>
  </div>
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (widgetOpen = false)}>Abbrechen</Button>
    <Button variant="primary" icon="check" onclick={saveWidget}>Widget speichern</Button>
  </svelte:fragment>
</Dialog>

<style>
  .widget-settings-card { display: grid; gap: var(--space-3); }
  .widget-editor { display: grid; grid-template-columns: minmax(12rem, 0.85fr) minmax(15rem, 1.15fr); gap: var(--space-6); align-items: start; }
  .widget-preview-wrap { display: grid; place-items: center; min-height: 15rem; padding: var(--space-5); border-radius: var(--radius-xl); background: var(--color-bg-deep); }
  .widget-preview { position: relative; display: flex; overflow: hidden; width: 9.5rem; aspect-ratio: 1; border-radius: 1.35rem; background: var(--widget-color); color: #fff; isolation: isolate; }
  .widget-preview--small { width: 7.5rem; }
  .widget-preview--large { width: 11rem; aspect-ratio: 2 / 1; }
  .widget-preview img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; z-index: -2; }
  .widget-preview__scrim { position: absolute; inset: 0; z-index: -1; background: linear-gradient(145deg, color-mix(in srgb, var(--widget-color) 76%, transparent), rgba(0, 0, 0, .45)); }
  .widget-preview__content { display: grid; align-content: space-between; gap: .4rem; width: 100%; padding: 1rem; text-shadow: 0 1px 5px rgba(0, 0, 0, .35); }
  .widget-preview__content strong { overflow-wrap: anywhere; font-size: var(--text-sm); }
  .widget-preview__content > span:last-child { font-size: .68rem; opacity: .8; }
  .widget-preview__mark { display: grid; place-items: center; width: 2rem; height: 2rem; border-radius: .7rem; background: rgba(255, 255, 255, .2); }
  .widget-fields { display: grid; gap: var(--space-4); }
  .widget-field-row { display: grid; grid-template-columns: 1fr 5rem; gap: var(--space-3); align-items: end; }
  .widget-color-input { width: 100%; height: 2.75rem; padding: .25rem; border: 1px solid var(--color-border-default); border-radius: var(--radius-md); background: var(--color-bg-elevated); cursor: pointer; }
  .widget-image-picker { display: flex; justify-content: space-between; gap: var(--space-3); align-items: center; padding: var(--space-3); border: 1px solid var(--color-border-subtle); border-radius: var(--radius-lg); }
  .widget-image-picker > div { display: grid; gap: .2rem; min-width: 0; }
  .widget-image-name { overflow: hidden; color: var(--color-text-secondary); font-size: var(--text-xs); text-overflow: ellipsis; white-space: nowrap; }
  .widget-note { display: flex; gap: .5rem; align-items: flex-start; margin: 0; color: var(--color-text-secondary); font-size: var(--text-xs); line-height: 1.5; }
  @media (max-width: 640px) {
    .widget-editor { grid-template-columns: 1fr; }
    .widget-preview-wrap { min-height: 12rem; }
  }
</style>
