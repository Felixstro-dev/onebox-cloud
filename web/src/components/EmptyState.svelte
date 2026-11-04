<script>
  import Icon from './Icon.svelte';
  import Button from './Button.svelte';
  export let icon = 'box';
  export let title = '';
  export let text = '';
  export let action = null;
  export let actionLabel = '';
  export let compact = false;
</script>

<div class="empty" class:empty--compact={compact}>
  <span class="empty__icon"><Icon name={icon} size={compact ? 20 : 26} /></span>
  <div>
    <h3>{title}</h3>
    {#if text}<p>{text}</p>{/if}
    {#if action}
      <div class="empty__action">
        <Button variant="secondary" size="sm" onclick={action}>{actionLabel}</Button>
      </div>
    {/if}
    <slot />
  </div>
</div>
