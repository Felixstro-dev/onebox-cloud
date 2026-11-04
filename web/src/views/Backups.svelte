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

  let jobOpen = false;
  let jobForm = blankJob();
  let agentOpen = false;
  let agentForm = { name: '', paths: '' };
  let newAgent = null;
  let agentEditOpen = false;
  let agentEdit = null;
  let agentEditPaths = '';
  let agentEditSchedule = '';
  let agentEditEnabled = true;
  let agentEditPre = '';
  let agentEditPost = '';
  let agentEditExcludes = '';
  let restoreRun = null;
  let restorePreview = null;
  let restoreOpen = false;
  let restoreBusy = false;
  let restoreParent = null;
  let restoreDone = null;

  function blankJob() {
    return { name: '', sourceNodeId: null, sourceName: 'Meine Dateien', targetType: 'local', path: './backups', url: '', token: '', schedule: null, retention: 7, enabled: true, preRun: '', postRun: '', version: '' };
  }

  onMount(load);

  async function load() {
    loading = true;
    failed = '';
    try {
      const [j, a, r] = await Promise.all([
        get('/api/v1/backups/jobs'),
        get('/api/v1/backup-agents'),
        $user?.role === 'admin' ? get('/api/v1/backups/receive-token') : Promise.resolve({ configured: false }),
      ]);
      jobs = j.items;
      agents = a.items;
      receive = r;
    } catch (err) { failed = err.message; } finally { loading = false; }
  }

  function openNewJob() {
    jobForm = blankJob();
    jobOpen = true;
  }

  async function createJob() {
    if (!jobForm.name.trim()) return;
    saving = true;
    try {
      const targetConfig = jobForm.targetType === 'onebox'
        ? { url: jobForm.url.trim(), token: jobForm.token.trim() }
        : { path: jobForm.path.trim() };
      await post('/api/v1/backups/jobs', {
        name: jobForm.name.trim(),
        sourceNodeId: jobForm.sourceNodeId || null,
        targetType: jobForm.targetType,
        targetConfig,
        schedule: jobForm.schedule || null,
        retention: Number(jobForm.retention) || 7,
        enabled: jobForm.enabled,
      });
      notify('Backup-Auftrag angelegt. Der erste Lauf startet auf Knopfdruck.', 'success');
      jobOpen = false;
      load();
    } catch (err) { notify(err.message, 'error'); } finally { saving = false; }
  }

  async function runJob(job) {
    runningId = job.id;
    try {
      const result = await post(`/api/v1/backups/jobs/${job.id}/run`, {});
      if (result.run?.status === 'success') notify(`Backup „${job.name}“ abgeschlossen: ${result.run.fileCount} Dateien, ${bytes(result.run.size)}.`, 'success');
      else notify(`Backup „${job.name}“: ${result.run?.error || 'Lauf beendet.'}`, result.run?.status === 'success' ? 'success' : 'error', 8000);
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
    const ok = await confirmAction({ title: `Auftrag „${job.name}“ löschen?`, description: 'Bereits erzeugte Sicherungen bleiben auf dem Ziel erhalten.', confirmLabel: 'Auftrag löschen', danger: true });
    if (!ok) return;
    try { await del(`/api/v1/backups/jobs/${job.id}`); notify('Auftrag gelöscht.', 'success'); load(); } catch (err) { notify(err.message, 'error'); }
  }

  async function openRestore(job, chosen = null) {
    const success = chosen || job.runs.find((run) => run.status === 'success');
    if (!success) { notify('Für diesen Auftrag gibt es noch keinen erfolgreichen Lauf.', 'warning'); return; }
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

  async function createAgent() {
    if (!agentForm.name.trim()) return;
    saving = true;
    try {
      const result = await post('/api/v1/backup-agents', {
        name: agentForm.name.trim(),
        paths: agentForm.paths.split('\n').map((line) => line.trim()).filter(Boolean),
      });
      newAgent = result.agent;
      agentOpen = false;
      try {
        await post('/api/v1/backups/jobs', {
          name: agentForm.name.trim() + ' Backup',
          sourceNodeId: result.agent.rootFolderId,
          targetType: 'local',
          targetConfig: { path: './backups' },
          retention: 7,
          enabled: true,
          schedule: agentForm.paths ? null : 'manual',
        });
      } catch (e) { console.error('Auto-Job:', e.message); }
      const agentPath = '/home/felix/Dokumente/Programmieren/onebox-cloud/agent/bin/onebox-backup.js';
      agentCommand = `ONEB` + `OX_AGENT_URL=${window.location.origin} ONEB` + `OX_AGENT_TOKEN=${result.agent.token} node ${agentPath}`;
      agentScript = [
        '#!/bin/sh',
        '# Onebox Backup Agent',
        `export ONEBOX_AGENT_URL=${window.location.origin}`,
        `export ONEBOX_AGENT_TOKEN=${result.agent.token}`,
        `exec node /home/felix/Dokumente/Programmieren/onebox-cloud/agent/bin/onebox-backup.js`,
      ].join('\n');
      load();
    } catch (err) { notify(err.message, 'error'); } finally { saving = false; }
  }

  async function saveAgentPaths() {
    if (!agentEdit) return;
    saving = true;
    try {
      await patch(`/api/v1/backup-agents/${agentEdit.id}/paths`, { paths: agentEditPaths.split('\n').map((line) => line.trim()).filter(Boolean), schedule: agentEditSchedule || null, enabled: agentEditEnabled, preRun: agentEditPre || null, postRun: agentEditPost || null, excludes: agentEditExcludes || null });
      notify('Agent-Konfiguration aktualisiert.', 'success');
      agentEdit = null;
      agentEditOpen = false;
      load();
    } catch (err) { notify(err.message, 'error'); } finally { saving = false; }
  }

  async function revokeAgent(agent) {
    const ok = await confirmAction({ title: `Agent „${agent.name}“ entfernen?`, description: 'Der Agent kann danach keine Dateien mehr hochladen.', confirmLabel: 'Entfernen', danger: true });
    if (!ok) return;
    try { await del(`/api/v1/backup-agents/${agent.id}`); notify('Agent entfernt.', 'success'); load(); } catch (err) { notify(err.message, 'error'); }
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
      <p class="lede">Sichere Ordner auf eine lokale Festplatte oder an eine andere Onebox-Instanz. Wiederherstellungen landen in einem eigenen Ordner.</p>
    </div>
    <div class="page-actions">
      <Button variant="secondary" icon="server" onclick={() => { agentOpen = true; agentForm = { name: '', paths: '' }; }}>Agent verbinden</Button>
      <Button variant="primary" icon="plus" onclick={openNewJob}>Backup-Auftrag</Button>
    </div>
  </header>

  {#if failed}
    <EmptyState icon="cloud-off" title="Backups konnten nicht geladen werden" text={failed} action={load} actionLabel="Erneut versuchen" />
  {:else if loading}
    <div class="list-stack"><div class="card loading-block"><span class="skeleton"></span><span class="skeleton"></span></div></div>
  {:else}
    <section aria-labelledby="jobs-title">
      <div class="section-head"><h2 id="jobs-title">Aufträge</h2><span class="tag">{jobs.length}</span></div>
      {#if !jobs.length}
        <EmptyState icon="database-backup" title="Noch kein Backup eingerichtet" text="Lege einen Auftrag an und sichere einen Ordner – manuell oder nach Zeitplan." action={openNewJob} actionLabel="Ersten Auftrag anlegen" />
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
                <p>{job.targetType === 'onebox' ? 'Remote' : 'Lokal'} · {targetLabel(job)} · Aufbewahrung {job.retention} Läufe</p>
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
                              <td><span class="tag tag--{run.status === 'success' ? 'success' : run.status === 'error' ? 'error' : 'warning'}">{run.status}</span></td>
                              <td>{run.fileCount} Dateien · {bytes(run.size)}</td>
                              <td class="actions-cell"><Button variant="quiet" size="sm" onclick={() => openRestore(job, run)}>Wiederherstellen</Button></td>
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
                  <IconButton name="trash-2" label={`Auftrag ${job.name} löschen`} onclick={() => deleteJob(job)} />
                </div>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </section>

    <section class="section" aria-labelledby="agents-title">
      <div class="section-head"><h2 id="agents-title">Backup-Agenten</h2><span class="tag">{agents.length}</span></div>
      <p class="lede" style="margin-bottom:var(--space-4)">Agenten sichern Ordner von anderen Rechnern in diese Instanz. Jeder Agent hat ein eigenes Token und einen eigenen Zielordner.</p>
      {#if agents.length}
        <div class="list-stack">
          {#each agents as agent}
            <article class="row-card">
              <span class="file-icon" aria-hidden="true"><Icon name="server" size={18} /></span>
              <div class="row-card__main">
                <h3>{agent.name}</h3>
                <p>Token {agent.tokenPrefix}… · {agent.paths?.length ? agent.paths.join(', ') : 'keine Pfade hinterlegt'}</p>
                <div class="row-card__meta" style="margin-top:var(--space-2)">
                  <span class="tag tag--{agent.connected ? 'success' : 'error'}">{agent.connected ? 'Verbunden' : 'Connecting'}</span>
                  {#if agent.agentVersion && agent.agentVersion !== '1.0.0'}<span class="tag tag--warning">v{agent.agentVersion}</span>{:else}<span class="tag">v{agent.agentVersion || '1.0.0'}</span>{/if}
                  <span>{agent.lastSeenAt ? `Zuletzt gesehen ${relative(agent.lastSeenAt)}` : 'Noch nie verbunden'}</span>
                  <span>Angelegt {dateTime(agent.createdAt)}</span>
                </div>
              </div>
              <div style="display:flex;gap:var(--space-2);align-items:center">
                <Button variant="primary" size="sm" icon="play" onclick={async () => {
                  try {
                    const j = await post('/api/v1/backups/jobs', { name: agent.name + ' Backup', sourceNodeId: agent.rootFolderId, targetType: 'local', path: './backups', enabled: true });
                    await post(`/api/v1/backups/jobs/${j.job.id}/run`, {});
                    notify('Backup gestartet.', 'success'); load();
                  } catch (err) { notify(err.message, 'error'); }
                }}>Jetzt sichern</Button>
                <IconButton name="pencil" label={`Agent ${agent.name} konfigurieren`} onclick={() => { agentEdit = agent; agentEditPaths = agent.paths?.join('\n') || ''; agentEditSchedule = agent.schedule || ''; agentEditEnabled = agent.enabled !== false; agentEditPre = agent.preRun || ''; agentEditPost = agent.postRun || ''; agentEditExcludes = agent.excludes || ''; agentEditOpen = true; }} />
                <IconButton name="trash-2" label={`Agent ${agent.name} entfernen`} onclick={() => revokeAgent(agent)} />
              </div>
            </article>
          {/each}
        </div>
      {:else}
        <EmptyState icon="server" title="Keine Agenten verbunden" text="Verbinde einen Rechner, um dessen Ordner automatisch in Onebox zu sichern." action={() => { agentOpen = true; agentForm = { name: '', paths: '' }; }} actionLabel="Agent anlegen" compact />
      {/if}
    </section>

    {#if $user?.role === 'admin'}
      <section class="section" aria-labelledby="receive-title">
        <div class="section-head"><h2 id="receive-title">Diese Instanz als Backup-Ziel</h2></div>
        <div class="card" style="display:grid;gap:var(--space-4)">
          <p class="lede">Erzeuge ein Empfangs-Token, damit andere Onebox-Instanzen hierher sichern können. Das Token gilt für alle Remote-Aufträge dieser Instanz.</p>
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

<Dialog open={jobOpen} title="Backup-Auftrag anlegen" description="Wähle Quelle, Ziel und Rhythmus." size="lg" onclose={() => (jobOpen = false)}>
  <Field label="Name" id="job-name" required>
    <input id="job-name" class="input" bind:value={jobForm.name} placeholder="z. B. Projektarchiv" />
  </Field>
  <FolderPicker onchange={(folder) => { jobForm.sourceNodeId = folder.id; jobForm.sourceName = folder.name; }} />
  <div class="field">
    <span class="field__label">Ziel</span>
    <div class="segmented" role="group" aria-label="Backup-Ziel">
      <button type="button" aria-pressed={jobForm.targetType === 'local'} on:click={() => (jobForm.targetType = 'local')}>Lokaler Ordner</button>
      <button type="button" aria-pressed={jobForm.targetType === 'onebox'} on:click={() => (jobForm.targetType = 'onebox')}>Andere Onebox</button>
    </div>
  </div>
  {#if jobForm.targetType === 'local'}
    <Field label="Zielverzeichnis" id="job-path" hint="Pfad im Container, z. B. /backups. Das Verzeichnis muss beschreibbar sein." required>
      <input id="job-path" class="input" bind:value={jobForm.path} placeholder="./backups" />
    </Field>
  {:else}
    <Field label="URL der Ziel-Instanz" id="job-url" required>
      <input id="job-url" class="input" bind:value={jobForm.url} placeholder="https://cloud.example.com" />
    </Field>
    <Field label="Empfangs-Token" id="job-token" required hint="Erzeuge es auf der Ziel-Instanz unter Backups.">
      <input id="job-token" class="input" type="password" bind:value={jobForm.token} autocomplete="off" />
    </Field>
  {/if}
  <div class="field">
    <span class="field__label">Zeitplan</span>
    <input class="input" bind:value={jobForm.schedule} placeholder="manual / daily / 01:00" aria-label="Zeitplan" />
  </div>
  <Field label="Aufbewahrung" id="job-retention" hint="So viele erfolgreiche Läufe bleiben erhalten.">
    <input id="job-retention" class="input" type="number" min="1" max="365" bind:value={jobForm.retention} />
  </Field>
  <Field label="Version / Tags" id="job-version" hint="z. B. v1.2 — wird im Ordnernamen verwendet.">
    <input id="job-version" class="input" bind:value={jobForm.version} placeholder="v1" />
  </Field>
  <Field label="Befehl vor Backup" id="job-prerun" hint="z. B. systemctl stop minecraft
Wird direkt auf dem Server ausgeführt.">
    <textarea id="job-prerun" class="textarea" bind:value={jobForm.preRun} placeholder="systemctl stop mc-server"></textarea>
  </Field>
  <Field label="Befehl nach Backup" id="job-postrun" hint="z. B. systemctl start minecraft">
    <textarea id="job-postrun" class="textarea" bind:value={jobForm.postRun} placeholder="systemctl start mc-server"></textarea>
  </Field>
  <Switch bind:checked={jobForm.enabled} label="Auftrag aktiv" description="Pausierte Aufträge laufen nur manuell." />
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (jobOpen = false)}>Abbrechen</Button>
    <Button variant="primary" loading={saving} disabled={!jobForm.name.trim()} onclick={createJob}>Auftrag anlegen</Button>
  </svelte:fragment>
</Dialog>

<Dialog open={agentOpen} title="Backup-Agent anlegen" description="Der Agent läuft auf dem Quellrechner und lädt Dateien über die API hoch." onclose={() => (agentOpen = false)}>
  <Field label="Name" id="agent-name" hint="Erscheint als Ordner unter „Backups“." required>
    <input id="agent-name" class="input" bind:value={agentForm.name} placeholder="z. B. Heimserver" />
  </Field>
  <Field label="Quellordner (echter Pfad)" id="agent-paths" hint="z. B. /home/felix/Downloads / /home/felix/Dokumente">
    <input id="agent-paths" class="input" bind:value={agentForm.paths} placeholder="/home/felix/Downloads" />
  </Field>
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (agentOpen = false)}>Abbrechen</Button>
    <Button variant="primary" loading={saving} disabled={!agentForm.name.trim()} onclick={createAgent}>Agent anlegen</Button>
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

<Dialog open={agentEditOpen} title="Agent konfigurieren" description="Pfade, Zeitplan und Status des Agenten." onclose={() => (agentEditOpen = false)}>
  <Field label="Pfade" id="agent-edit-paths" hint="Ein Pfad pro Zeile.">
    <textarea id="agent-edit-paths" class="textarea" bind:value={agentEditPaths} placeholder="/home/felix/Dokumente"></textarea>
  </Field>
  <Field label="Zeitplan" id="agent-edit-schedule" hint="z. B. hourly, daily, weekly, 01:00, Sonntag">
    <input id="agent-edit-schedule" class="input" bind:value={agentEditSchedule} placeholder="daily" />
  </Field>
  <Field label="Ausschlussmuster (.gitignore-Stil)" id="agent-excludes" hint="Z. B. node_modules, .git, *.log — jede Zeile ein Muster.">
    <textarea id="agent-excludes" class="textarea" bind:value={agentEditExcludes} placeholder="node_modules
.git
*.tmp"></textarea>
  </Field>
  <Switch bind:checked={agentEditEnabled} label="Agent aktiv" description="Wenn aus, läuft der Agent nicht mehr." />
  <Field label="Befehl vor Agent-Lauf" id="agent-pre" hint="z. B. systemctl stop minecraft">
    <textarea id="agent-pre" class="textarea" bind:value={agentEditPre} placeholder="systemctl stop mc-server"></textarea>
  </Field>
  <Field label="Befehl nach Agent-Lauf" id="agent-post" hint="z. B. systemctl start minecraft">
    <textarea id="agent-post" class="textarea" bind:value={agentEditPost} placeholder="systemctl start mc-server"></textarea>
  </Field>
  <Button variant="primary" onclick={() => { agentEdit = null; agentEditOpen = false; jobForm = blankJob(); jobForm.sourceNodeId = agentEdit?.rootFolderId || agentEdit?.rootFolderId; jobForm.sourceName = agentEdit?.name || ''; jobOpen = true; }}>Backup-Auftrag anlegen</Button>
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (agentEditOpen = false)}>Abbrechen</Button>
    <Button variant="primary" loading={saving} disabled={!agentEditPaths.trim()} onclick={saveAgentPaths}>Speichern</Button>
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
