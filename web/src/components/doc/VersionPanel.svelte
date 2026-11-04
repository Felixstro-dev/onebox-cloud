<script>
  import { createEventDispatcher } from 'svelte';
  import Icon from '../Icon.svelte';
  import IconButton from '../IconButton.svelte';
  import Button from '../Button.svelte';
  import Dialog from '../Dialog.svelte';

  export let versions = [];
  export let versionDiff = null;
  export let currentLabel = 'Aktueller Stand';

  const dispatch = createEventDispatcher();

  let label = '';
  let nameOpen = false;
  let compareOpen = false;
  let compareFrom = '';
  let compareTo = '';

  function stamp(at) {
    return new Date(at).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  function create() {
    const value = label.trim();
    if (!value) return;
    dispatch('create', { label: value });
    label = '';
    nameOpen = false;
  }

  function startCompare() {
    compareOpen = false;
    dispatch('compare', { from: compareFrom, to: compareTo });
  }
</script>

<header class="doc-panel__head">
  <Icon name="history" size={16} />
  <h2>Versionen{versions.length ? ` · ${versions.length}` : ''}</h2>
  <span class="spacer"></span>
  <IconButton name="x" label="Schließen" onclick={() => dispatch('close')} />
</header>

<div class="doc-panel__body">
  <div class="panel-toolbar">
    <Button size="sm" variant="secondary" icon="plus" onclick={() => (nameOpen = true)}>Momentaufnahme</Button>
    <Button size="sm" variant="ghost" icon="columns-2" onclick={() => (compareOpen = true)}>Vergleichen</Button>
  </div>

  <article class="version is-current">
    <div class="version__top">
      <Icon name="circle-check" size={14} />
      <span class="version__label">{currentLabel || 'Aktueller Stand'}</span>
    </div>
    <span class="version__meta">wird bei jeder Änderung gespeichert</span>
  </article>

  {#if !versions.length}
    <p class="empty-hint">Noch keine benannten Versionen. Nimm eine Momentaufnahme, bevor du umstrittene Änderungen machst.</p>
  {/if}

  {#each versions as version (version.id)}
    <article class="version">
      <div class="version__top">
        <Icon name={version.kind === 'named' ? 'tag' : 'file-text'} size={14} />
        <span class="version__label">{version.label || (version.kind === 'auto' ? 'Automatisch gespeichert' : 'Ohne Namen')}</span>
      </div>
      <span class="version__meta">{stamp(version.createdAt)}{version.size ? ` · ${version.size} B` : ''}</span>
      <div class="version__actions">
        <button on:click={() => dispatch('restore', { id: version.id })}>Wiederherstellen</button>
        <button on:click={() => dispatch('copy', { id: version.id })}>Kopieren</button>
        <button on:click={() => dispatch('compare', { from: version.id, to: '' })}>Vergleich</button>
      </div>
    </article>
  {/each}

  {#if versionDiff}
    <section class="version" aria-label="Vergleich">
      <div class="version__top">
        <Icon name="columns-2" size={14} />
        <span class="version__label">Vergleich</span>
        <IconButton name="x" size={14} label="Vergleich schließen" onclick={() => dispatch('compare', { from: null, to: null, clear: true })} />
      </div>
      <div class="diff-stats">
        <span class="add">+{versionDiff.added}</span>
        <span class="del">−{versionDiff.removed}</span>
        {#if versionDiff.identical}<span>identisch</span>{/if}
      </div>
      <div class="diff-view">
        {#each versionDiff.blocks as block, i (i)}
          <div class="diff-line" class:diff-line--add={block.added} class:diff-line--del={block.removed} class:diff-line--ctx={!block.added && !block.removed}>
            {#if block.added}+ {/if}{#if block.removed}− {/if}{block.value.replace(/\n$/, '')}
          </div>
        {/each}
      </div>
    </section>
  {/if}
</div>

<Dialog open={nameOpen} onclose={() => (nameOpen = false)} title="Version benennen" size="sm">
  <form on:submit|preventDefault={create}>
    <input class="input" bind:value={label} placeholder="z. B. Entwurf vor Besprechung" aria-label="Versionsname" />
    <div class="dialog__actions">
      <Button variant="ghost" onclick={() => (nameOpen = false)}>Abbrechen</Button>
      <Button variant="primary" type="submit" disabled={!label.trim()}>Speichern</Button>
    </div>
  </form>
</Dialog>

<Dialog open={compareOpen} onclose={() => (compareOpen = false)} title="Versionen vergleichen" size="sm">
  <div style="display:grid;gap:var(--space-3)">
    <label class="field__label">Von
      <select class="input" bind:value={compareFrom}>
        <option value="">Aktueller Stand</option>
        {#each versions as v (v.id)}<option value={v.id}>{v.label}</option>{/each}
      </select>
    </label>
    <label class="field__label">Bis
      <select class="input" bind:value={compareTo}>
        <option value="">Aktueller Stand</option>
        {#each versions as v (v.id)}<option value={v.id}>{v.label}</option>{/each}
      </select>
    </label>
  </div>
  <div class="dialog__actions">
    <Button variant="ghost" onclick={() => (compareOpen = false)}>Abbrechen</Button>
    <Button variant="primary" onclick={startCompare}>Vergleichen</Button>
  </div>
</Dialog>

<style>
  .empty-hint { font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.6; }
</style>
