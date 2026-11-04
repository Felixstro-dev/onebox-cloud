<script>
  import { confirmState } from '../lib/stores.js';
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';
  import Icon from './Icon.svelte';
  let busy = false;

  $: state = $confirmState;
</script>

<Dialog
  open={Boolean(state)}
  title={state?.title || 'Bestätigen'}
  description={state?.description || ''}
  size="sm"
  onclose={() => state?.resolve(false)}
>
  {#if state?.detail}
    <div class="confirm-detail">
      <Icon name={state.icon || 'triangle-alert'} size={18} />
      <p>{state.detail}</p>
    </div>
  {/if}
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => state?.resolve(false)}>Abbrechen</Button>
    <Button
      variant={state?.danger ? 'danger' : 'primary'}
      loading={busy}
      onclick={async () => {
        busy = true;
        try { await state?.resolve(true); } finally { busy = false; }
      }}
    >{state?.confirmLabel || 'Bestätigen'}</Button>
  </svelte:fragment>
</Dialog>
