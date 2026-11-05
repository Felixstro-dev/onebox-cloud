<script>
  import { onMount } from 'svelte';
  import { get, post, patch, del } from '../lib/api.js';
  import { user, notify, confirmAction } from '../lib/stores.js';
  import { bytes, dateTime, relative } from '../lib/format.js';
  import Icon from '../components/Icon.svelte';
  import Button from '../components/Button.svelte';
  import IconButton from '../components/IconButton.svelte';
  import Field from '../components/Field.svelte';
  import Switch from '../components/Switch.svelte';
  import Dialog from '../components/Dialog.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import FolderPicker from '../components/FolderPicker.svelte';

  let jobs = [];
  let agents = [];
  let locations = [];
  let loading = true;
  let failed = '';
  let saving = false;
  let runningId = null;
  let receive = { configured: false };
  let newReceiveToken = '';
  let tokenCopied = false;
  let scriptCopied = false;
  let commandCopied = false;
  let agentCommand = '';
  let agentScript = '';

  // Eine gemeinsame Maske für beide Sicherungsarten. Dadurch gibt es nur
  // einen Einstiegspunkt statt „Auftrag“ und „Agent“ nebeneinander.
  let createOpen = false;
  let createType = 'job';
  let createForm = blankCreate();

  let agentEditOpen = false;
  let agentEditId = null;
  let agentEditName = '';
  let agentEditPaths = '';
  let agentEditSchedule = '';
  let agentEditEnabled = true;
  let agentEditPre = '';
  let agentEditPost = '';
  let agentEditExcludes = '';
  let newAgent = null;

  let restoreRun = null;
  let restorePreview = null;
  let restoreOpen = false;
  let restoreBusy = false;
  let restoreParent = null;
  let restoreDone = null;

  const scheduleOptions = [
    { value: '', label: 'Nur manuell' },
    { value: 'hourly', label: 'Stündlich' },
    { value: 'daily', label: 'Täglich' },
    { value: 'weekly', label: 'Wöchentlich' },
  ];
  const PATH_PLACEHOLDER = '/home/benutzer/Dokumente\n/home/benutzer/Fotos';
  const EXCLUDES_PLACEHOLDER = 'node_modules\n.git\n*.tmp';

  function blankCreate() {
    return {
      name: '',
      sourceNodeId: null,
      sourceName: 'Meine Dateien',
      targetType: 'local',
      path: '/data/backups',
      url: '',
      token: '',
      schedule: 'daily',
      retention: 7,
      enabled: true,
      preRun: '',
      postRun: '',
      paths: '',
      excludes: '',
    };
  }

  $: pathSuggestions = buildPathSuggestions(locations);

  onMount(load);

  async function load() {
    loading = true;
    failed = '';
    try {
      const [j, a, r, s] = await Promise.all([
        get('/api/v1/backups/jobs'),
        get('/api/v1/backup-agents'),
        $user?.role === 'admin' ? get('/api/v1/backups/receive-token') : Promise.resolve({ configured: false }),
        get('/api/v1/storage/locations').catch(() => ({ locations: [] })),
      ]);
      jobs = j.items;
      agents = a.items;
      receive = r;
      locations = s.locations || [];
    } catch (err) { failed = err.message; } finally { loading = false; }
  }

  function buildPathSuggestions(list) {
    const paths = new Set(['/data/backups', '/backups']);
    for (const location of list) {
      if (location?.rootPath) paths.add(location.rootPath.replace(/\/$/, '') + '/backups');
    }
    return [...paths];
  }

  function openCreate(type = 'job') {
    createType = type;
    createForm = blankCreate();
    createOpen = true;
  }

  function lines(value) {
    return String(value || '').split('\n').map((line) => line.trim()).filter(Boolean);
  }

  async function submitCreate() {
    if (!createForm.name.trim()) return;
    saving = true;
    try {
      if (createType === 'agent') {
        const result = await post('/api/v1/backup-agents', {
          name: createForm.name.trim(),
          paths: lines(createForm.paths),
          schedule: createForm.schedule || null,
          enabled: createForm.enabled,
          excludes: createForm.excludes || null,
        });
        newAgent = result.agent;
        createOpen = false;
        const base = window.location.origin;
        const scriptPath = '/pfad/zu/onebox/agent/bin/onebox-backup.js';
        agentCommand = `ONEBOX_AGENT_URL=${base} ONEBOX_AGENT_TOKEN=${result.agent.token} node ${scriptPath}`;
        agentScript = [
          '#!/bin/sh',
          '# Onebox Backup Agent – auf dem Quellrechner ausführen',
          `export ONEBOX_AGENT_URL=${base}`,
          `export ONEBOX_AGENT_TOKEN=${result.agent.token}`,
          `exec node ${scriptPath}`,
        ].join('\n');
      } else {
        const targetConfig = createForm.targetType === 'onebox'
          ? { url: createForm.url.trim(), token: createForm.token.trim() }
          : { path: createForm.path.trim() };
        await post('/api/v1/backups/jobs', {
          name: createForm.name.trim(),
          sourceNodeId: createForm.sourceNodeId || null,
          targetType: createForm.targetType,
          targetConfig,
          schedule: createForm.schedule || null,
          retention: Number(createForm.retention) || 7,
          enabled: createForm.enabled,
          preRun: createForm.preRun.trim() || null,
          postRun: createForm.postRun.trim() || null,
        });
        notify('Sicherung angelegt. Der erste Lauf startet auf Knopfdruck.', 'success');
        createOpen = false;
      }
      load();
    } catch (err) { notify(err.message, 'error'); } finally { saving = false; }
  }

  async function runJob(job) {
    runningId = job.id;
    try {
      const result = await post(`/api/v1/backups/jobs/${job.id}/run`, {});
      if (result.run?.status === 'success') notify(`Sicherung „${job.name}“ abgeschlossen: ${result.run.fileCount} Dateien, ${bytes(result.run.size)}.`, 'success');
      else notify(`Sicherung „${job.name}“: ${result.run?.error || 'Lauf beendet.'}`, result.run?.status === 'success' ? 'success' : 'error', 8000);
      load();
    } catch (err) { notify(err.message, 'error'); } finally { runningId = null; }
  }

  async function toggleJob(job, enabled) {
    try {
      await patch(`/api/v1/backups/jobs/${job.id}`, { enabled });
      job.enabled = enabled;
      jobs = jobs;
    } catch (err) { notify(err.message, 'error'); }
  }

  async function deleteJob(job) {
    const ok = await confirmAction({ title: `Sicherung „${job.name}“ löschen?`, description: 'Bereits erzeugte Sicherungen bleiben auf dem Ziel erhalten.', confirmLabel: 'Sicherung löschen', danger: true });
    if (!ok) return;
    try { await del(`/api/v1/backups/jobs/${job.id}`); notify('Sicherung gelöscht.', 'success'); load(); } catch (err) { notify(err.message, 'error'); }
  }

  async function openRestore(job, chosen = null) {
    const success = chosen || job.runs.find((run) => run.status === 'success');
    if (!success) { notify('Für diese Sicherung gibt es noch keinen erfolgreichen Lauf.', 'warning'); return; }
    if (success.status !== 'success') { notify('Nur erfolgreiche Läufe lassen sich wiederherstellen.', 'warning'); return; }
    restoreRun = success;
    restoreDone = null;
    restoreParent = { id: null, name: 'Meine Dateien' };
    restoreOpen = true;
    restorePreview = null;
    try {
      restorePreview = await post(`/api/v1/backups/runs/${success.id}/restore/preview`, {});
    } catch (err) { notify(err.message, 'error'); restoreOpen = false; }
  }

  async function doRestore() {
    restoreBusy = true;
    try {
      restoreDone = await post(`/api/v1/backups/runs/${restoreRun.id}/restore`, { parentId: restoreParent?.id || null });
      notify('Wiederherstellung abgeschlossen.', 'success');
      load();
    } catch (err) { notify(err.message, 'error'); } finally { restoreBusy = false; }
  }

  function openAgentEditor(agent) {
    agentEditId = agent.id;
    agentEditName = agent.name;
    agentEditPaths = agent.paths?.join('\n') || '';
    agentEditSchedule = agent.schedule || '';
    agentEditEnabled = agent.enabled !== false;
    agentEditPre = agent.preRun || '';
    agentEditPost = agent.postRun || '';
    agentEditExcludes = agent.excludes || '';
    agentEditOpen = true;
  }

  async function saveAgent() {
    if (!agentEditId) return;
    saving = true;
    try {
      await patch(`/api/v1/backup-agents/${agentEditId}/paths`, {
        paths: lines(agentEditPaths),
        schedule: agentEditSchedule || null,
        enabled: agentEditEnabled,
        preRun: agentEditPre || null,
        postRun: agentEditPost || null,
        excludes: agentEditExcludes || null,
      });
      notify('Agent-Konfiguration aktualisiert.', 'success');
      agentEditOpen = false;
      load();
    } catch (err) { notify(err.message, 'error'); } finally { saving = false; }
  }

  async function revokeAgent(agent) {
    const ok = await confirmAction({ title: `Agent „${agent.name}“ entfernen?`, description: 'Der Agent kann danach keine Dateien mehr hochladen.', confirmLabel: 'Entfernen', danger: true });
    if (!ok) return;
    try { await del(`/api/v1/backup-agents/${agent.id}`); notify('Agent entfernt.', 'success'); load(); } catch (err) { notify(err.message, 'error'); }
  }

  async function makeJobFromAgent(agent) {
    if (!agent) return;
    agentEditOpen = false;
    createForm = blankCreate();
    createType = 'job';
    createForm.name = `${agent.name} sichern`;
    createForm.sourceNodeId = agent.rootFolderId;
    createForm.sourceName = agent.name;
    createForm.schedule = agent.schedule || 'daily';
    createOpen = true;
  }

  async function generateReceive() {
    try {
      const result = await post('/api/v1/backups/receive-token', {});
      newReceiveToken = result.token;
      notify('Empfangs-Token erzeugt. Er wird nur jetzt angezeigt.', 'success');
      load();
    } catch (err) { notify(err.message, 'error'); }
  }

  async function copy(value) {
    try { await navigator.clipboard.writeText(value); tokenCopied = true; setTimeout(() => (tokenCopied = false), 1800); } catch {}
  }

  function scheduleLabel(schedule) {
    return { hourly: 'Stündlich', daily: 'Täglich', weekly: 'Wöchentlich' }[schedule] || 'Manuell';
  }

  function targetLabel(job) {
    try {
      const cfg = JSON.parse(job.targetConfig);
      return job.targetType === 'onebox' ? cfg.url || 'Remote' : cfg.path || 'Lokaler Ordner';
    } catch { return job.targetType; }
  }
</script>

<div class="page page--wide">
  <header class="page-head">
    <div>
      <h1>Backups</h1>
      <p class="lede">Sichere Ordner auf eine lokale Festplatte, eine andere Onebox oder von einem anderen Rechner hierher.</p>
    </div>
    <div class="page-actions">
      <Button variant="secondary" icon="server" onclick={() => openCreate('agent')}>Rechner verbinden</Button>
      <Button variant="primary" icon="plus" onclick={() => openCreate('job')}>Neue Sicherung</Button>
    </div>
  </header>

  {#if failed}
    <EmptyState icon="cloud-off" title="Backups konnten nicht geladen werden" text={failed} action={load} actionLabel="Erneut versuchen" />
  {:else if loading}
    <div class="list-stack"><div class="card loading-block"><span class="skeleton"></span><span class="skeleton"></span></div></div>
  {:else}
    <section aria-labelledby="jobs-title">
      <div class="section-head"><h2 id="jobs-title">Sicherungen</h2><span class="tag">{jobs.length}</span></div>
      {#if !jobs.length}
        <EmptyState icon="database-backup" title="Noch keine Sicherung eingerichtet" text="Wähle einen Ordner und ein Ziel – manuell oder nach Zeitplan." action={() => openCreate('job')} actionLabel="Erste Sicherung anlegen" />
      {:else}
        <div class="list-stack">
          {#each jobs as job (job.id)}
            <article class="row-card" style="align-items:flex-start">
              <span class="file-icon file-icon--folder" aria-hidden="true"><Icon name="database-backup" size={18} /></span>
              <div class="row-card__main">
                <div style="display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap">
                  <h3>{job.name}</h3>
                  <span class="tag tag--{job.enabled ? 'success' : 'warning'}">{job.enabled ? 'Aktiv' : 'Pausiert'}</span>
                  <span class="tag">{scheduleLabel(job.schedule)}</span>
                </div>
                <p>{job.targetType === 'onebox' ? 'Andere Onebox' : 'Lokaler Ordner'} · {targetLabel(job)} · Aufbewahrung {job.retention} Läufe</p>
                <div class="row-card__meta" style="margin-top:var(--space-2)">
                  {#if job.lastRunAt}<span>Letzter Lauf {relative(job.lastRunAt)}</span>{:else}<span>Noch nicht gelaufen</span>{/if}
                  {#if job.runs?.[0]}
                    <span>Letzter Status: {job.runs[0].status === 'success' ? 'erfolgreich' : job.runs[0].error || job.runs[0].status}</span>
                    {#if job.runs[0].status === 'success'}<span>{job.runs[0].fileCount} Dateien · {bytes(job.runs[0].size)}</span>{/if}
                  {/if}
                </div>
                {#if job.runs?.length}
                  <details style="margin-top:var(--space-3)">
                    <summary style="cursor:pointer;font-size:var(--text-sm);color:var(--color-text-secondary)">Verlauf anzeigen</summary>
                    <div class="table-wrap" style="margin-top:var(--space-2)">
                      <table class="table">
                        <thead><tr><th>Zeit</th><th>Status</th><th>Umfang</th><th></th></tr></thead>
                        <tbody>
                          {#each job.runs as run}
                            <tr>
                              <td>{dateTime(run.createdAt)}</td>
                              <td><span class="tag tag--{run.status === 'success' ? 'success' : run.status === 'running' ? 'warning' : 'error'}">{run.status}</span></td>
                              <td>{run.fileCount} Dateien · {bytes(run.size)}</td>
                              <td class="actions-cell"><Button variant="quiet" size="sm" disabled={run.status !== 'success'} onclick={() => openRestore(job, run)}>Wiederherstellen</Button></td>
                            </tr>
                          {/each}
                        </tbody>
                      </table>
                    </div>
                  </details>
                {/if}
              </div>
              <div class="page-actions" style="flex-direction:column;align-items:stretch">
                <Button variant="primary" size="sm" icon="play" loading={runningId === job.id} onclick={() => runJob(job)}>Jetzt sichern</Button>
                <Button variant="secondary" size="sm" icon="history" onclick={() => openRestore(job)}>Wiederherstellen</Button>
                <div style="display:flex;gap:var(--space-2);align-items:center;justify-content:space-between">
                  <Switch checked={job.enabled} label="Aktiv" on:change={(event) => toggleJob(job, event.detail)} />
                  <IconButton name="trash-2" label={`Sicherung ${job.name} löschen`} onclick={() => deleteJob(job)} />
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    <section class="section" aria-labelledby="agents-title">
      <div class="section-head"><h2 id="agents-title">Andere Rechner</h2><span class="tag">{agents.length}</span></div>
      <p class="lede" style="margin-bottom:var(--space-4)">Ein Agent läuft auf einem anderen Rechner und lädt dessen Ordner nach Onebox. Du brauchst dafür keinen zusätzlichen Backup-Auftrag.</p>
      {#if agents.length}
        <div class="list-stack">
          {#each agents as agent}
            <article class="row-card">
              <span class="file-icon" aria-hidden="true"><Icon name="server" size={18} /></span>
              <div class="row-card__main">
                <h3>{agent.name}</h3>
                <p>{agent.paths?.length ? agent.paths.join(', ') : 'keine Pfade hinterlegt'}</p>
                <div class="row-card__meta" style="margin-top:var(--space-2)">
                  <span class="tag tag--{agent.connected ? 'success' : 'warning'}">{agent.connected ? 'Verbunden' : 'Noch nicht verbunden'}</span>
                  <span class="tag">{scheduleLabel(agent.schedule)}</span>
                  <span>{agent.lastSeenAt ? `Zuletzt gesehen ${relative(agent.lastSeenAt)}` : 'Noch nie verbunden'}</span>
                </div>
              </div>
              <div style="display:flex;gap:var(--space-2);align-items:center">
                <IconButton name="pencil" label={`Agent ${agent.name} konfigurieren`} onclick={() => openAgentEditor(agent)} />
                <IconButton name="trash-2" label={`Agent ${agent.name} entfernen`} onclick={() => revokeAgent(agent)} />
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <EmptyState icon="server" title="Keine Rechner verbunden" text="Verbinde einen Rechner, um dessen Ordner automatisch nach Onebox zu sichern." action={() => openCreate('agent')} actionLabel="Rechner verbinden" compact />
      {/if}
    </section>

    {#if $user?.role === 'admin'}
      <section class="section" aria-labelledby="receive-title">
        <div class="section-head"><h2 id="receive-title">Diese Instanz als Backup-Ziel</h2></div>
        <div class="card" style="display:grid;gap:var(--space-4)">
          <p class="lede">Erzeuge ein Empfangs-Token, damit andere Onebox-Instanzen hierher sichern können. Das Token gilt für alle Remote-Sicherungen dieser Instanz.</p>
          {#if newReceiveToken}
            <div class="token-reveal">
              <strong>Empfangs-Token</strong>
              <code>{newReceiveToken}</code>
              <div class="page-actions">
                <Button variant="primary" size="sm" icon={tokenCopied ? 'check' : 'copy'} onclick={() => copy(newReceiveToken)}>{tokenCopied ? 'Kopiert' : 'Kopieren'}</Button>
              </div>
              <p class="field__hint">Dieses Token wird nur einmal angezeigt. Bewahre es sicher auf.</p>
            </div>
          {:else}
            <div class="row-card" style="background:transparent;padding:0">
              <div class="row-card__main"><h3>{receive.configured ? 'Token ist eingerichtet' : 'Noch kein Empfangs-Token'}</h3><p>{receive.configured ? 'Ein neues Token ersetzt das bisherige sofort.' : 'Ohne Token können andere Instanzen nicht hierher sichern.'}</p></div>
              <Button variant="secondary" icon="key-round" onclick={generateReceive}>{receive.configured ? 'Token erneuern' : 'Token erzeugen'}</Button>
            </div>
          {/if}
        </div>
      </section>
    {/if}
  {/if}
</div>

<datalist id="backup-path-options">
  {#each pathSuggestions as path}
    <option value={path}></option>
  {/each}
</datalist>

<Dialog open={createOpen} title={createType === 'agent' ? 'Rechner verbinden' : 'Neue Sicherung'} description={createType === 'agent' ? 'Der Agent läuft auf dem Quellrechner und lädt dessen Ordner nach Onebox.' : 'Wähle Quelle, Ziel und Rhythmus.'} size="lg" onclose={() => (createOpen = false)}>
  <div class="field">
    <span class="field__label">Was soll gesichert werden?</span>
    <div class="segmented" role="group" aria-label="Art der Sicherung">
      <button type="button" aria-pressed={createType === 'job'} on:click={() => (createType = 'job')}>Ordner in Onebox</button>
      <button type="button" aria-pressed={createType === 'agent'} on:click={() => (createType = 'agent')}>Ordner von anderem Rechner</button>
    </div>
  </div>

  <Field label="Name" id="create-name" required>
    <input id="create-name" class="input" bind:value={createForm.name} placeholder={createType === 'agent' ? 'z. B. Heimserver' : 'z. B. Projektarchiv'} />
  </Field>

  {#if createType === 'agent'}
    <Field label="Quellordner auf dem Rechner" id="create-paths" hint="Ein echter Pfad pro Zeile, z. B. /home/benutzer/Dokumente.">
      <textarea id="create-paths" class="textarea" bind:value={createForm.paths} placeholder={PATH_PLACEHOLDER}></textarea>
    </Field>
    <Field label="Ausschlussmuster" id="create-excludes" hint="Optional, jede Zeile ein Muster, z. B. node_modules oder *.log.">
      <textarea id="create-excludes" class="textarea" bind:value={createForm.excludes} placeholder={EXCLUDES_PLACEHOLDER}></textarea>
    </Field>
  {:else}
    <FolderPicker onchange={(folder) => { createForm.sourceNodeId = folder.id; createForm.sourceName = folder.name; }} />
    <div class="field">
      <span class="field__label">Ziel</span>
      <div class="segmented" role="group" aria-label="Backup-Ziel">
        <button type="button" aria-pressed={createForm.targetType === 'local'} on:click={() => (createForm.targetType = 'local')}>Lokaler Ordner</button>
        <button type="button" aria-pressed={createForm.targetType === 'onebox'} on:click={() => (createForm.targetType = 'onebox')}>Andere Onebox</button>
      </div>
    </div>
    {#if createForm.targetType === 'local'}
      <Field label="Zielverzeichnis" id="create-path" hint="Tippe, um Vorschläge zu durchsuchen. Der Ordner wird bei Bedarf angelegt." required>
        <input id="create-path" class="input" list="backup-path-options" bind:value={createForm.path} placeholder="/data/backups" autocomplete="off" />
      </Field>
    {:else}
      <Field label="URL der Ziel-Instanz" id="create-url" required>
        <input id="create-url" class="input" bind:value={createForm.url} placeholder="https://cloud.example.com" />
      </Field>
      <Field label="Empfangs-Token" id="create-token" required hint="Erzeuge es auf der Ziel-Instanz unter Backups.">
        <input id="create-token" class="input" type="password" bind:value={createForm.token} autocomplete="off" />
      </Field>
    {/if}
  {/if}

  <Field label="Zeitplan" id="create-schedule">
    <select id="create-schedule" class="select" bind:value={createForm.schedule}>
      {#each scheduleOptions as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </Field>

  {#if createType === 'job'}
    <Field label="Aufbewahrung" id="create-retention" hint="So viele erfolgreiche Läufe bleiben erhalten.">
      <input id="create-retention" class="input" type="number" min="1" max="365" bind:value={createForm.retention} />
    </Field>
    <Field label="Befehl vor der Sicherung" id="create-prerun" hint="Optional, wird auf dem Onebox-Server ausgeführt.">
      <textarea id="create-prerun" class="textarea" bind:value={createForm.preRun} placeholder="systemctl stop mc-server"></textarea>
    </Field>
    <Field label="Befehl nach der Sicherung" id="create-postrun" hint="Optional, wird auf dem Onebox-Server ausgeführt.">
      <textarea id="create-postrun" class="textarea" bind:value={createForm.postRun} placeholder="systemctl start mc-server"></textarea>
    </Field>
  {/if}

  <Switch bind:checked={createForm.enabled} label="Aktiv" description="Pausierte Sicherungen laufen nur manuell." />
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (createOpen = false)}>Abbrechen</Button>
    <Button variant="primary" loading={saving} disabled={!createForm.name.trim()} onclick={submitCreate}>{createType === 'agent' ? 'Agent anlegen' : 'Sicherung anlegen'}</Button>
  </svelte:fragment>
</Dialog>

<Dialog open={Boolean(newAgent)} title="Agent ist bereit" description="Kopiere den Befehl auf den Quellrechner. Das Token wird nur einmal angezeigt." size="lg" onclose={() => (newAgent = null)}>
  <div class="token-reveal">
    <strong>Agent-Token</strong>
    <code>{newAgent?.token}</code>
    <div class="page-actions">
      <Button variant="primary" size="sm" icon={tokenCopied ? 'check' : 'copy'} onclick={() => copy(newAgent?.token || '')}>{tokenCopied ? 'Kopiert' : 'Token kopieren'}</Button>
    </div>
  </div>
  <Field label="Installations-Skript" id="agent-install" hint="Füge dieses Skript auf dem Quellrechner aus und starte den Agenten.">
    <pre class="code-block" id="agent-install">{agentScript}</pre>
    <div class="page-actions" style="margin-top:var(--space-2)">
      <Button variant="secondary" size="sm" icon={scriptCopied ? 'check' : 'copy'} onclick={() => { copy(agentScript); scriptCopied = true; setTimeout(() => scriptCopied = false, 2000); }}>{scriptCopied ? 'Kopiert' : 'Skript kopieren'}</Button>
    </div>
  </Field>
  <Field label="Beispielbefehl" id="agent-command" hint="Ersetze den Pfad durch den Ordner, der gesichert werden soll.">
    <pre class="code-block" id="agent-command">{agentCommand}</pre>
    <div class="page-actions" style="margin-top:var(--space-2)">
      <Button variant="secondary" size="sm" icon={commandCopied ? 'check' : 'copy'} onclick={() => { copy(agentCommand); commandCopied = true; setTimeout(() => commandCopied = false, 2000); }}>{commandCopied ? 'Kopiert' : 'Befehl kopieren'}</Button>
    </div>
  </Field>
  <svelte:fragment slot="footer"><Button variant="primary" onclick={() => (newAgent = null)}>Fertig</Button></svelte:fragment>
</Dialog>

<Dialog open={agentEditOpen} title="Agent konfigurieren" description={`Pfade, Zeitplan und Status von ${agentEditName}.`} size="lg" onclose={() => (agentEditOpen = false)}>
  <Field label="Pfade" id="agent-edit-paths" hint="Ein echter Pfad pro Zeile.">
    <textarea id="agent-edit-paths" class="textarea" bind:value={agentEditPaths} placeholder="/home/benutzer/Dokumente"></textarea>
  </Field>
  <Field label="Zeitplan" id="agent-edit-schedule">
    <select id="agent-edit-schedule" class="select" bind:value={agentEditSchedule}>
      {#each scheduleOptions as option}
        <option value={option.value}>{option.label}</option>
      {/each}
    </select>
  </Field>
  <Field label="Ausschlussmuster" id="agent-excludes" hint="Jede Zeile ein Muster, z. B. node_modules, .git, *.log.">
    <textarea id="agent-excludes" class="textarea" bind:value={agentEditExcludes} placeholder={EXCLUDES_PLACEHOLDER}></textarea>
  </Field>
  <Switch bind:checked={agentEditEnabled} label="Agent aktiv" description="Wenn aus, läuft der Agent nicht mehr." />
  <Field label="Befehl vor Agent-Lauf" id="agent-pre" hint="Optional, wird auf dem Quellrechner ausgeführt.">
    <textarea id="agent-pre" class="textarea" bind:value={agentEditPre} placeholder="systemctl stop mc-server"></textarea>
  </Field>
  <Field label="Befehl nach Agent-Lauf" id="agent-post" hint="Optional, wird auf dem Quellrechner ausgeführt.">
    <textarea id="agent-post" class="textarea" bind:value={agentEditPost} placeholder="systemctl start mc-server"></textarea>
  </Field>
  <Button variant="secondary" icon="database-backup" onclick={() => makeJobFromAgent(agents.find((agent) => agent.id === agentEditId))}>Hochgeladene Dateien zusätzlich sichern</Button>
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (agentEditOpen = false)}>Abbrechen</Button>
    <Button variant="primary" loading={saving} disabled={!agentEditPaths.trim()} onclick={saveAgent}>Speichern</Button>
  </svelte:fragment>
</Dialog>

<Dialog open={restoreOpen} title="Backup wiederherstellen" description={restorePreview ? `${restorePreview.files} Dateien und ${restorePreview.folders} Ordner, ${bytes(restorePreview.size)}.` : 'Vorschau wird geladen …'} onclose={() => (restoreOpen = false)}>
  {#if restoreDone}
    <div class="card" style="display:grid;gap:var(--space-3)">
      <p style="display:flex;align-items:center;gap:var(--space-2)"><Icon name="circle-check" size={18} style="color:var(--color-success)" /> Wiederherstellung abgeschlossen.</p>
      <p class="stat-foot">{restoreDone.files ?? 0} Dateien wurden in einen neuen Ordner geschrieben.</p>
      <Button variant="secondary" size="sm" href="/files" onclick={() => (restoreOpen = false)}>Im Dateibereich ansehen</Button>
    </div>
  {:else if restorePreview}
    <p class="field__hint">Die Wiederherstellung erzeugt einen neuen Ordner „Restored …“ und überschreibt nichts.</p>
    <div class="card" style="padding:var(--space-4)">
      <ul style="display:grid;gap:var(--space-2);font-size:var(--text-sm)">
        {#each restorePreview.sample as file}
          <li style="display:flex;gap:var(--space-2);align-items:center"><Icon name="file" size={14} /><span class="grow-ellipsis">{file.name}</span><small style="margin-left:auto;color:var(--color-text-secondary)">{bytes(file.size)}</small></li>
        {/each}
      </ul>
    </div>
    <FolderPicker onchange={(folder) => (restoreParent = folder)} />
  {:else}
    <div class="loading-block"><span class="skeleton"></span><span class="skeleton"></span></div>
  {/if}
  <svelte:fragment slot="footer">
    {#if restoreDone}
      <Button variant="primary" onclick={() => (restoreOpen = false)}>Schließen</Button>
    {:else}
      <Button variant="quiet" onclick={() => (restoreOpen = false)}>Abbrechen</Button>
      <Button variant="primary" loading={restoreBusy} disabled={!restorePreview} onclick={doRestore} icon="history">Wiederherstellen</Button>
    {/if}
  </svelte:fragment>
</Dialog>
