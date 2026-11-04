<script>
  import { toasts, dismiss } from '../lib/stores.js';
  import Icon from './Icon.svelte';
  const icons = { success: 'circle-check', error: 'circle-alert', warning: 'triangle-alert', info: 'info' };
</script>

<div class="toast-host" role="status" aria-live="polite">
  {#each $toasts as toast (toast.id)}
    <div class="toast toast--app" data-kind={toast.kind}>
      <Icon name={icons[toast.kind] || 'info'} size={18} />
      <p>{toast.message}</p>
      <button type="button" class="toast__close" aria-label="Hinweis schließen" on:click={() => dismiss(toast.id)}>
        <Icon name="x" size={15} />
      </button>
    </div>
  {/each}
</div>
