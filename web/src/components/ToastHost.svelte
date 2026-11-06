<script>
  import { toasts, dismiss, runToastAction, runToastChoice } from '../lib/stores.js';
  import Icon from './Icon.svelte';
  const icons = { success: 'circle-check', error: 'circle-alert', warning: 'triangle-alert', info: 'info' };
</script>

<div class="toast-host" role="status" aria-live="polite">
  {#each $toasts as toast (toast.id)}
    <div class="toast toast--app" data-kind={toast.kind}>
      <Icon name={icons[toast.kind] || 'info'} size={18} />
      <p>{toast.message}</p>
      {#if toast.actions}
        {#each toast.actions as choice}
          <button type="button" class="toast__action" aria-label={choice.label} title={choice.label} on:click={() => runToastChoice(toast, choice)}>
            {#if choice.icon}<Icon name={choice.icon} size={15} />{/if}<span>{choice.label}</span>
          </button>
        {/each}
      {/if}
      {#if toast.action}
        <button type="button" class="toast__action" on:click={() => runToastAction(toast)}>{toast.action.label}</button>
      {/if}
      <button type="button" class="toast__close" aria-label="Hinweis schließen" on:click={() => dismiss(toast.id)}>
        <Icon name="x" size={15} />
      </button>
    </div>
  {/each}
</div>
