<script>
  import { onMount } from 'svelte';
  import { slide, fade } from 'svelte/transition';
  import { queue, pause, resume, retry, remove, clearFinished, totalProgress, attachFile, restoreQueue, resolveConflict } from '../lib/uploads.js';
  import { jobs, dismissJob } from '../lib/jobs.js';
  import { uploadsOpen } from '../lib/stores.js';
  import { bytes } from '../lib/format.js';
  import Icon from './Icon.svelte';
  import IconButton from './IconButton.svelte';
  import ProgressLoader from './ProgressLoader.svelte';
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';

  let fileInput;
  let pendingItem = null;
  let conflictChoice = 'keepBoth';
  let conflictAll = false;
  let clock = Date.now();
  const MAX_VISIBLE_ITEMS = 20;
  const SETTLE_MS = 2000;
  const labels = {
    queued: 'Wartet', uploading: 'Lädt hoch', paused: 'Pausiert', done: 'Fertig',
    error: 'Fehlgeschlagen', canceled: 'Abgebrochen', 'needs-file': 'Datei erneut wählen',
    conflict: 'Name vergeben',
  };

  $: items = $queue;
  $: visibleItems = $queue.slice(0, MAX_VISIBLE_ITEMS);
  $: progress = totalProgress(items);
  $: active = items.filter((item) => !['done', 'canceled'].includes(item.status));
  $: recentDone = items.filter((item) => item.status === 'done' && item.finishedAt && clock - item.finishedAt < SETTLE_MS);
  $: conflictItem = items.find((item) => item.status === 'conflict') || null;
  $: jobItems = $jobs;
  $: runningJobs = jobItems.filter((job) => job.status === 'running' || job.status === 'queued');
  $: openCount = active.length + runningJobs.length;

  // Das Feld existiert nur, solange es Uploads oder Jobs gibt.
  $: hasUploads = active.length > 0 || recentDone.length > 0;
  $: hasContent = hasUploads || jobItems.length > 0;

  // Neue Aktivität öffnet das Feld. Ein manuelles Schließen bleibt bestehen,
  // bis tatsächlich ein weiterer Job dazukommt.
  let knownActive = new Set();
  $: activeIds = [
    ...active.map((item) => `u:${item.id}`),
    ...jobItems.map((job) => `j:${job.id}`),
  ];
  $: {
    const fresh = activeIds.some((id) => !knownActive.has(id));
    knownActive = new Set(activeIds);
    if (fresh && !$uploadsOpen) uploadsOpen.set(true);
  }

  $: if (!hasContent && $uploadsOpen) uploadsOpen.set(false);

  onMount(() => {
    restoreQueue();
    const tick = setInterval(() => { clock = Date.now(); }, 500);
    return () => clearInterval(tick);
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

  function loaderState(status) {
    if (status === 'done' || status === 'skipped') return 'done';
    if (status === 'error' || status === 'conflict') return 'error';
    return 'running';
  }
</script>

{#if $uploadsOpen && hasContent}
  <section class="upload-panel" aria-label="Aktivität" transition:slide={{ duration: 220 }}>
    <input class="sr-only" type="file" data-testid="activity-upload-input" bind:this={fileInput} on:change={onFileChosen} />
    <header class="upload-head">
      <Icon name="activity" size={18} />
      <strong>Aktivität</strong>
      <span class="sub">{openCount ? `${openCount} offen` : 'Alles erledigt'}</span>
      <IconButton name="minus" label="Aktivitäten einklappen" onclick={() => ($uploadsOpen = false)} />
    </header>

    {#if jobItems.length}
      <ol class="activity-list" aria-label="Hintergrund-Jobs">
        {#each jobItems as job (job.id)}
          <li class="activity-job" data-state={job.status}>
            <ProgressLoader
              value={job.progress}
              status={job.status === 'error' ? 'error' : job.status === 'done' ? 'done' : 'running'}
              label={job.title}
              detail={job.status === 'error' ? (job.message || job.detail) : job.detail}
              compact
            />
            {#if job.status === 'running' || job.status === 'queued'}
              <span class="activity-job__state">{job.progress === null ? 'läuft' : `${job.progress} %`}</span>
            {:else}
              <IconButton name="x" label="Job entfernen" onclick={() => dismissJob(job.id)} />
            {/if}
          </li>
        {/each}
      </ol>
    {/if}

    {#if active.length || recentDone.length}
      {#if $queue.length > MAX_VISIBLE_ITEMS}
        <p class="menu-note" style="margin:0;padding:var(--space-2) var(--space-4)">{$queue.length - MAX_VISIBLE_ITEMS} weitere Uploads werden nicht angezeigt.</p>
      {/if}
      <ol class="upload-list" aria-label="Uploads">
        {#each visibleItems as item (item.id)}
          {#if item.status !== 'canceled' && (item.status !== 'done' || recentDone.includes(item))}
            <li class="upload-item" data-state={item.status}>
              <ProgressLoader
                value={item.status === 'done' ? 100 : Math.round((item.uploaded / (item.size || 1)) * 100)}
                status={loaderState(item.status)}
                label={item.name}
                detail={item.error || statusText(item)}
                compact
              />
              <div class="upload-item__actions">
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
            </li>
          {/if}
        {/each}
      </ol>
      <footer class="upload-foot">
        <span>{progress.percent}% gesamt</span>
        <span style="margin-left:auto">{active.length || 0} aktiv</span>
        <button class="btn btn--quiet btn--sm" type="button" on:click={() => { clearFinished(); }}>Erledigte entfernen</button>
      </footer>
    {/if}

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
  </section>
{:else if hasContent && !$uploadsOpen}
  <button
    type="button"
    class="activity-pill"
    on:click={() => ($uploadsOpen = true)}
    aria-label={`Aktivität öffnen, ${openCount || 0} offen`}
    transition:fade={{ duration: 160 }}
  >
    <span class="spinner-ring" class:is-done={openCount === 0} style={`--p:${openCount ? progress.percent : 100}`} aria-hidden="true"></span>
    <span>{openCount ? `${openCount} aktiv` : 'Fertig'}</span>
  </button>
{/if}
