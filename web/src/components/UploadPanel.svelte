<script>
  import { onMount } from 'svelte';
  import { queue, pause, resume, retry, remove, clearFinished, totalProgress, attachFile, restoreQueue, resolveConflict, concurrency } from '../lib/uploads.js';
  import { jobs, removeJob, clearFinishedJobs } from '../lib/jobs.js';
  import { uploadsOpen } from '../lib/stores.js';
  import { bytes } from '../lib/format.js';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';
  import ProgressBar from './ProgressBar.svelte';
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';

  let fileInput;
  let pendingItem = null;
  let conflictChoice = 'keepBoth';
  let conflictAll = false;
  const MAX_VISIBLE_ITEMS = 20;
  const labels = {
    queued: 'Wartet', uploading: 'Lädt hoch', paused: 'Pausiert', done: 'Fertig',
    error: 'Fehlgeschlagen', canceled: 'Abgebrochen', 'needs-file': 'Datei erneut wählen',
    conflict: 'Name vergeben',
  };

  $: items = $queue;
  $: visibleItems = $queue.slice(0, MAX_VISIBLE_ITEMS);
  $: progress = totalProgress(items);
  $: active = items.filter((item) => !['done', 'canceled'].includes(item.status));
  $: conflictItem = items.find((item) => item.status === 'conflict') || null;
  $: jobItems = $jobs;
  $: activeJobs = jobItems.filter((job) => job.status === 'running');
  $: openCount = active.length + activeJobs.length;
  $: totalItems = items.length + jobItems.length;

  // Auto-open panel when uploads or background jobs start
  $: if (openCount > 0 && !$uploadsOpen) {
    uploadsOpen.set(true);
  }

  // Auto-close panel 10s after everything is done
  let closeTimer = null;
  $: if (totalItems > 0 && openCount === 0) {
    if (!closeTimer) {
      closeTimer = setTimeout(() => {
        uploadsOpen.set(false);
        closeTimer = null;
      }, 10000);
    }
  } else {
    if (closeTimer) { clearTimeout(closeTimer); closeTimer = null; }
  }

  onMount(() => {
    restoreQueue();
  });

  function resolve(choice, applyAll) {
    if (conflictItem) resolveConflict(conflictItem.id, choice, applyAll);
  }

  function chooseFile(item) {
    pendingItem = item;
    fileInput?.click();
  }

  function onFileChosen(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file && pendingItem) attachFile(pendingItem.id, file);
    pendingItem = null;
  }

  function statusText(item) {
    if (item.status === 'uploading') {
      const speed = item.speed ? `${bytes(item.speed)}/s` : 'lädt';
      const eta = item.eta ? ` · noch ${Math.ceil(item.eta)} s` : '';
      return `${speed}${eta}`;
    }
    if (item.status === 'done') return item.skipped ? 'Übersprungen' : 'Abgeschlossen';
    if (item.status === 'conflict') return 'Name bereits vorhanden';
    return labels[item.status] || item.status;
  }
</script>

<input class="sr-only" type="file" bind:this={fileInput} on:change={onFileChosen} />

{#if $uploadsOpen}
  <section class="upload-panel" aria-label="Upload-Warteschlange">
    <header class="upload-head">
      <Icon name="cloud-upload" size={18} />
      <strong>Jobs</strong>
      <span class="sub">{openCount ? `${openCount} offen` : 'Alles erledigt'}</span>
      <IconButton name="minus" label="Job-Panel schließen" onclick={() => ($uploadsOpen = false)} />
    </header>

    {#if jobItems.length}
      <ol class="upload-jobs" aria-label="Hintergrund-Jobs">
        {#each jobItems as job (job.id)}
          <li data-state={job.status === 'running' ? 'active' : job.status === 'error' ? 'error' : 'done'}>
            <span class="upload-job__icon" aria-hidden="true">
              {#if job.status === 'running'}
                <span class="spinner"></span>
              {:else}
                <Icon name={job.status === 'error' ? 'alert-triangle' : 'check'} size={16} />
              {/if}
            </span>
            <span class="upload-job__text">
              <strong>{job.title}</strong>
              {#if job.detail}<span>{job.detail}</span>{/if}
            </span>
            {#if job.status === 'running' && job.cancel}
              <IconButton name="x" label="Job abbrechen" onclick={() => job.cancel()} />
            {:else if job.status !== 'running'}
              <IconButton name="x" label="Job entfernen" onclick={() => removeJob(job.id)} />
            {/if}
          </li>
        {/each}
      </ol>
    {/if}

    {#if items.length}
      {#if $queue.length > MAX_VISIBLE_ITEMS}
        <p class="menu-note" style="margin:0 0 var(--space-3)">{ $queue.length - MAX_VISIBLE_ITEMS} weitere Uploads werden nicht angezeigt.</p>
      {/if}
      <ol class="steps" style="padding:var(--space-3) var(--space-4)">
        {#each visibleItems as item (item.id)}
          <li data-state={item.status === 'done' ? 'done' : item.status === 'uploading' ? 'active' : item.status === 'error' ? 'error' : 'todo'}>
            <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{item.name}</span>
            <span class="tag">{item.status === 'done' ? 'Fertig' : item.status === 'error' ? 'Fehler' : item.status === 'uploading' ? `${Math.round((item.uploaded / (item.size || 1)) * 100)}%${item.eta ? ` · noch ${Math.ceil(item.eta)} s` : ''}` : 'Wartet'}</span>
            <div class="upload-item__actions" style="margin-left:auto">
              {#if item.status === 'needs-file'}
                <IconButton name="folder-open" label="Datei wählen" onclick={() => chooseFile(item)} />
              {:else if item.status === 'uploading'}
                <IconButton name="pause" label="Upload pausieren" onclick={() => pause(item.id)} />
              {:else if item.status === 'paused'}
                <IconButton name="play" label="Upload fortsetzen" onclick={() => resume(item.id)} />
              {:else if item.status === 'error'}
                <IconButton name="rotate-ccw" label="Upload wiederholen" onclick={() => retry(item.id)} />
              {/if}
              <IconButton name="x" label="Aus Liste entfernen" onclick={() => remove(item.id)} />
            </div>
            {#if item.status === 'uploading' || item.status === 'error'}
              <ProgressBar value={Math.min(item.uploaded, item.size)} max={item.size || 1} size="sm" tone={item.status === 'error' ? 'over' : 'brand'} label={`${item.name}: ${Math.round((item.uploaded / (item.size || 1)) * 100)} Prozent`} />
            {/if}
            {#if item.error}<p class="field__hint field__hint--error" style="width:100%">{item.error}</p>{/if}
            <span class="upload-item__meta" style="width:100%;display:flex;justify-content:space-between;font-size:var(--text-xs);color:var(--color-text-secondary)">
              <span>{statusText(item)}</span>
              <span>{bytes(item.uploaded || 0)} / {bytes(item.size)}</span>
            </span>
          </li>
        {/each}
      </ol>
      <footer class="upload-foot">
        <span>{progress.percent}% gesamt</span>
        <span style="margin-left:auto">{active.length || 0} aktiv</span>
        <button class="btn btn--quiet btn--sm" type="button" on:click={() => { clearFinished(); clearFinishedJobs(); }}>Erledigte entfernen</button>
      </footer>
    {:else if !jobItems.length}
      <p class="menu-note" style="padding:var(--space-6)">Noch keine Uploads. Ziehe Dateien in den Dateibereich oder wähle sie über „Hochladen“.</p>
    {/if}
  </section>

  <Dialog open={Boolean(conflictItem)} title="Name bereits vorhanden" description={conflictItem ? `„${conflictItem.name}“ existiert in diesem Ordner schon.` : ''} size="sm" onclose={() => resolve('keepBoth', false)}>
    <p class="field__hint">Was soll mit der neuen Datei passieren?</p>
    <div class="extract-options">
      <label class="extract-option">
        <input type="radio" name="upload-conflict" value="replace" bind:group={conflictChoice} />
        <span><strong>Ersetzen</strong><small>Die vorhandene Datei wandert in den Papierkorb.</small></span>
      </label>
      <label class="extract-option">
        <input type="radio" name="upload-conflict" value="keepBoth" bind:group={conflictChoice} />
        <span><strong>Beide behalten</strong><small>Die neue Datei bekommt automatisch einen Zusatz.</small></span>
      </label>
      <label class="extract-option">
        <input type="radio" name="upload-conflict" value="skip" bind:group={conflictChoice} />
        <span><strong>Überspringen</strong><small>Die vorhandene Datei bleibt unverändert.</small></span>
      </label>
    </div>
    <label class="checkline"><input type="checkbox" bind:checked={conflictAll} /> Für alle weiteren Dateien anwenden</label>
    <svelte:fragment slot="footer">
      <Button variant="primary" onclick={() => resolve(conflictChoice, conflictAll)}>Übernehmen</Button>
    </svelte:fragment>
  </Dialog>
{:else if openCount}
  <button type="button" class="upload-fab" on:click={() => ($uploadsOpen = true)} aria-label={`Jobs öffnen, ${openCount} offen`}>
    <span class="spinner-ring" style={`--p:${progress.percent}`} aria-hidden="true"></span>
    <span>{openCount}</span>
  </button>
{/if}
