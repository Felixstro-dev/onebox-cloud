<script>
  import { onMount, onDestroy } from 'svelte';
  import { get, post, del } from '../lib/api.js';
  import { notify, refresh, refreshKey, confirmAction } from '../lib/stores.js';
  import { bytes, dateTime, dayLabel } from '../lib/format.js';
  import Icon from '../components/Icon.svelte';
  import Button from '../components/Button.svelte';
  import { selectionBar } from '../lib/selection-bar.js';
  import EmptyState from '../components/EmptyState.svelte';

  let groups = [];
  let loading = true;
  let failed = '';
  let selected = new Set();
  let busy = false;

  $: if ($refreshKey) load();
  $: selectionBar.set(selected.size > 0 ? {
    label: `${selected.size} ausgewählt`,
    busy,
    onClear: () => (selected = new Set()),
    onTrash: () => deleteForever([...selected]),
    trashLabel: 'Endgültig löschen',
  } : null);

  onDestroy(() => selectionBar.set(null));

  onMount(load);

  async function load() {
    loading = true;
    failed = '';
    try {
      const data = await get('/api/v1/files/trash');
      groups = data.groups;
      selected = new Set();
    } catch (err) { failed = err.message; } finally { loading = false; }
  }

  function toggle(id) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id); else next.add(id);
    selected = next;
  }

  async function restore(stamp) {
    busy = true;
    try {
      const result = await post('/api/v1/files/trash/restore', { stamp });
      notify(`${result.restored} ${result.restored === 1 ? 'Element' : 'Elemente'} wiederhergestellt.`, 'success');
      refresh();
      load();
    } catch (err) { notify(err.message, 'error'); } finally { busy = false; }
  }

  async function deleteForever(ids) {
    const ok = await confirmAction({
      title: ids ? `${ids.length} ${ids.length === 1 ? 'Element' : 'Elemente'} endgültig löschen?` : 'Papierkorb leeren?',
      description: 'Das lässt sich nicht rückgängig machen. Die Dateien werden von der Festplatte entfernt.',
      confirmLabel: 'Endgültig löschen', danger: true,
    });
    if (!ok) return;
    busy = true;
    try {
      if (ids) {
        await post('/api/v1/files/delete', { ids });
      } else {
        await del('/api/v1/files/trash');
      }
      notify('Endgültig gelöscht.', 'success');
      refresh();
      load();
    } catch (err) { notify(err.message, 'error'); } finally { busy = false; }
  }
</script>

<div class="page page--wide">
  <header class="page-head">
    <div>
      <h1>Papierkorb</h1>
      <p class="lede">Gelöschte Dateien bleiben hier, bis du sie wiederherstellst oder endgültig entfernst.</p>
    </div>
    <div class="page-actions">
      {#if groups.length}
        <Button variant="danger" icon="trash-2" loading={busy} onclick={() => deleteForever(null)}>Papierkorb leeren</Button>
      {/if}
    </div>
  </header>

  {#if failed}
    <EmptyState icon="cloud-off" title="Papierkorb konnte nicht geladen werden" text={failed} action={load} actionLabel="Erneut versuchen" />
  {:else if loading}
    <div class="file-list loading-block"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div>
  {:else if !groups.length}
    <EmptyState icon="trash-2" title="Der Papierkorb ist leer" text="Gelöschte Dateien und Ordner erscheinen hier." />
  {:else}
    {#each groups as group (group.stamp)}
      <section class="section" style="margin-top:var(--space-6)">
        <div class="section-head">
          <h2>{dayLabel(group.stamp)} <span class="tag">{group.items.length}</span></h2>
          <button type="button" on:click={() => restore(group.stamp)} disabled={busy}>Alle wiederherstellen</button>
        </div>
        <div class="file-list">
          {#each group.items as item (item.id)}
            <div class="file-row" class:is-selected={selected.has(item.id)} style="grid-template-columns:2.5rem minmax(0,1fr) auto auto">
              <span class="file-row__check"><input type="checkbox" checked={selected.has(item.id)} on:change={() => toggle(item.id)} aria-label={`${item.name} auswählen`} /></span>
              <span class="file-row__main" style="cursor:default">
                <span class="file-icon" aria-hidden="true"><Icon name={item.kind === 'folder' ? 'folder' : 'file'} size={17} /></span>
                <span style="min-width:0"><span class="file-name">{item.name}</span><span class="file-sub">{dateTime(item.trashedAt)}</span></span>
              </span>
              <span class="file-cell">{item.kind === 'file' ? bytes(item.size) : 'Ordner'}</span>
              <span class="file-row__menu"><Button variant="quiet" size="sm" onclick={() => deleteForever([item.id])} icon="trash-2">Löschen</Button></span>
            </div>
          {/each}
        </div>
      </section>
    {/each}

  {/if}
</div>
