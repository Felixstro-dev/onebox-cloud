<script>
  import { onMount } from 'svelte';
  import { get } from '../lib/api.js';
  import Icon from './Icon.svelte';

  export let onchange = () => {};
  export let rootLabel = 'Meine Dateien';

  let stack = [{ id: null, name: rootLabel }];
  let folders = [];
  let loading = true;
  let error = '';
  let filter = '';

  $: current = stack[stack.length - 1];
  $: visibleFolders = filter.trim()
    ? folders.filter((folder) => folder.name.toLocaleLowerCase('de').includes(filter.trim().toLocaleLowerCase('de')))
    : folders;

  onMount(() => load(null));

  async function load(parentId) {
    loading = true;
    error = '';
    filter = '';
    try {
      const data = await get(`/api/v1/files?parent=${parentId || 'root'}&kind=folder&limit=500&sort=name`);
      folders = data.items.filter((item) => item.kind === 'folder');
      onchange({ id: parentId, name: stack[stack.length - 1].name });
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
</script>

<div class="field">
  <span class="field__label">Quellordner</span>
  <nav class="crumbs" aria-label="Ordnerauswahl">
    {#each stack as crumb, index}
      {#if index > 0}<span class="crumb-sep" aria-hidden="true"><Icon name="chevron-right" size={13} /></span>{/if}
      <button type="button" class="crumb" aria-current={index === stack.length - 1 ? 'page' : undefined} on:click={() => jump(index)}>{crumb.name}</button>
    {/each}
  </nav>
  <div class="picker-list">
    {#if loading}
      <div class="loading-block"><span class="skeleton"></span></div>
    {:else if error}
      <p class="form-error" role="alert">{error}</p>
    {:else}
      {#if folders.length > 6}
        <label class="sr-only" for="folder-picker-filter">Ordner filtern</label>
        <input id="folder-picker-filter" class="input" type="search" bind:value={filter} placeholder="Ordner durchsuchen …" autocomplete="off" />
      {/if}
      {#if !folders.length}
        <p class="menu-note">Keine Unterordner. Der aktuelle Ordner wird gesichert.</p>
      {:else if !visibleFolders.length}
        <p class="menu-note">Kein Ordner passt zu „{filter}“.</p>
      {:else}
        {#each visibleFolders as folder}
          <button type="button" class="menu-item" on:click={() => enter(folder)}>
            <Icon name="folder" size={16} /><span class="grow-ellipsis">{folder.name}</span><Icon name="chevron-right" size={14} />
          </button>
        {/each}
      {/if}
    {/if}
  </div>
</div>
