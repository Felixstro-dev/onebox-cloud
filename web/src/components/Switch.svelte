<script>
  import { createEventDispatcher } from 'svelte';
  export let checked = false;
  export let label = '';
  export let description = '';
  export let disabled = false;
  export let id = `switch-${Math.random().toString(36).slice(2, 8)}`;
  const dispatch = createEventDispatcher();
</script>

<label class="switch-row" class:is-disabled={disabled} for={id}>
  <span class="switch-copy">
    {#if label}<span class="switch-label">{label}</span>{/if}
    {#if description}<span class="switch-desc">{description}</span>{/if}
  </span>
  <span class="switch">
    <input {id} type="checkbox" bind:checked {disabled} on:change={(event) => dispatch('change', event.currentTarget.checked)} />
    <span aria-hidden="true"></span>
  </span>
</label>
