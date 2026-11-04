<script>
  import { slide } from 'svelte/transition';
  import { selectionBar } from '../lib/selection-bar.js';
  import Button from './Button.svelte';
</script>

{#if $selectionBar}
  <div class="selection-bar" role="toolbar" aria-label="Auswahl" transition:slide={{ duration: 220 }}>
    <div class="selection-bar__count-box">
      <strong class="selection-bar__count">
        {#if $selectionBar.count === undefined}
          {$selectionBar.label}
        {:else}
          {$selectionBar.count.toLocaleString('de-DE')} von {$selectionBar.total.toLocaleString('de-DE')} ausgewählt
        {/if}
      </strong>
    </div>

    <div class="selection-bar__actions">
      <Button variant="quiet" size="sm" icon="x" onclick={$selectionBar.onClear}>Aufheben</Button>

    {#if $selectionBar.single}
      <Button variant="quiet" size="sm" icon="link" onclick={$selectionBar.onShare}>Teilen</Button>
      <Button variant="quiet" size="sm" icon="folder-input" onclick={$selectionBar.onMove}>Verschieben</Button>
    {/if}

    {#if $selectionBar.onDownloadZip}
      <Button variant="quiet" size="sm" icon="file-archive" onclick={$selectionBar.onDownloadZip}>Als ZIP herunterladen</Button>
    {/if}

    {#if $selectionBar.onCreateZip}
      <Button variant="quiet" size="sm" icon="folder-archive" onclick={$selectionBar.onCreateZip}>ZIP erstellen</Button>
    {/if}

    {#if $selectionBar.zipSingle}
      <Button variant="quiet" size="sm" icon="package-open" onclick={$selectionBar.onExtract}>Entpacken</Button>
    {/if}

    <Button variant="danger" size="sm" icon="trash-2" loading={$selectionBar.busy} disabled={$selectionBar.busy} onclick={$selectionBar.onTrash}>
      {$selectionBar.trashLabel || 'Löschen'}
    </Button>
    </div>
  </div>
{/if}
