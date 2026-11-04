<script>
  import Icon from './Icon.svelte';
  export let name = 'ellipsis';
  export let label = '';
  export let size = 18;
  export let variant = 'ghost';
  export let disabled = false;
  export let active = false;
  export let onclick = null;
  export let title = null;
</script>

<button
  type="button"
  class="icon-btn icon-btn--{variant}"
  class:is-active={active}
  aria-label={label}
  title={title || label}
  {disabled}
  on:click={onclick}
>
  <Icon {name} {size} />
</button>
