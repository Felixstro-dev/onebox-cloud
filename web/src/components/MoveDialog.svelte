<script>
  import { get, patch } from '../lib/api.js';
  import { notify } from '../lib/stores.js';
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';

  export let open = false;
  export let node = null;
  export let onclose = () => {};
  export let onmoved = () => {};

  let stack = [{ id: null, name: 'Meine Dateien' }];
  let folders = [];
  let loading = true;
  let busy = false;
  let error = '';

  $: current = stack[stack.length - 1];

  $: if (open) resetPicker();

  function resetPicker() {
    stack = [{ id: null, name: 'Meine Dateien' }];
    load(null);
  }

  async function load(parentId) {
    loading = true;
    error = '';
    try {
      const data = await get(`/api/v1/files?parent=${parentId || 'root'}&kind=folder&limit=200&sort=name`);
      folders = data.items.filter((item) => item.kind === 'folder' && item.id !== node?.id);
    } catch (err) {
      error = err.message;
      folders = [];
    } finally {
      loading = false;
    }
  }

  function enter(folder) {
    stack = [...stack, { id: folder.id, name: folder.name }];
    load(folder.id);
  }

  function jump(index) {
    stack = stack.slice(0, index + 1);
    load(current.id);
  }

  async function move() {
    busy = true;
    error = '';
    try {
      await patch(`/api/v1/files/${node.id}`, { parentId: current.id });
      notify(`„${node.name}“ wurde nach „${current.name}“ verschoben.`, 'success');
      onmoved();
      onclose();
    } catch (err) {
      error = err.message;
    } finally {
      busy = false;
    }
  }
</script>

<Dialog {open} title="Verschieben" description={node ? `„${node.name}“ in einen anderen Ordner verschieben.` : ''} onclose={onclose}>
  <nav class="crumbs" aria-label="Zielordner">
    {#each stack as crumb, index}
      {#if index > 0}<span class="crumb-sep" aria-hidden="true"><Icon name="chevron-right" size={13} /></span>{/if}
      <button type="button" class="crumb" aria-current={index === stack.length - 1 ? 'page' : undefined} on:click={() => jump(index)}>{crumb.name}</button>
    {/each}
  </nav>
  <div class="picker-list">
    {#if loading}
      <div class="loading-block"><span class="skeleton"></span><span class="skeleton"></span></div>
    {:else if error}
      <p class="form-error" role="alert">{error}</p>
    {:else if !folders.length}
      <p class="menu-note">Keine Unterordner. Du kannst die Datei hier ablegen.</p>
    {:else}
      {#each folders as folder}
        <button type="button" class="menu-item" on:click={() => enter(folder)}>
          <Icon name="folder" size={17} /><span class="grow-ellipsis">{folder.name}</span><Icon name="chevron-right" size={15} />
        </button>
      {/each}
    {/if}
  </div>
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={onclose}>Abbrechen</Button>
    <Button variant="primary" loading={busy} onclick={move} icon="folder-input">Nach „{current.name}“ verschieben</Button>
  </svelte:fragment>
</Dialog>
