<script>
  import Icon from './Icon.svelte';
  export let variant = 'secondary';
  export let size = 'md';
  export let type = 'button';
  export let disabled = false;
  export let loading = false;
  export let icon = null;
  export let full = false;
  export let href = null;
  export let title = '';
  export let onclick = null;
</script>

<svelte:element
  this={href ? 'a' : 'button'}
  href={href}
  type={href ? undefined : type}
  class="btn btn--{variant} btn--{size}"
  class:btn--full={full}
  disabled={href ? undefined : disabled || loading}
  aria-busy={loading}
  aria-disabled={disabled || loading || undefined}
  title={title || undefined}
  data-route={href ? '' : undefined}
  role={href ? 'link' : 'button'}
  on:click={onclick}
>
  {#if loading}
    <span class="spinner" aria-hidden="true"></span>
  {:else}
    {#if icon}<Icon name={icon} size={18} />{/if}
    <slot />
  {/if}
</svelte:element>
