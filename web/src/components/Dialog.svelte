<script>
  import { onMount, tick } from 'svelte';
  import IconButton from './IconButton.svelte';
  export let open = false;
  export let title = '';
  export let description = '';
  export let size = 'md';
  export let closable = true;
  export let onclose = () => {};
  let dialog;
  let closing = false;

  $: if (dialog) {
    if (open && !dialog.open) {
      dialog.showModal();
      tick().then(() => dialog.querySelector('[autofocus],input,select,textarea,button')?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }

  function close() {
    if (!closable) return;
    onclose();
  }

  function onCancel(event) {
    event.preventDefault();
    close();
  }

  let drag = null;
  function pointerDown(event) {
    if (window.innerWidth > 700) return;
    drag = { start: event.clientY, delta: 0, time: Date.now() };
    dialog.setPointerCapture(event.pointerId);
  }
  function pointerMove(event) {
    if (!drag) return;
    drag.delta = Math.max(0, event.clientY - drag.start);
    dialog.style.setProperty('--drag-y', `${drag.delta}px`);
  }
  function pointerUp() {
    if (!drag) return;
    const velocity = drag.delta / Math.max(1, Date.now() - drag.time);
    if (drag.delta > 110 || velocity > 0.5) close();
    dialog.style.removeProperty('--drag-y');
    drag = null;
  }
</script>

<dialog
  bind:this={dialog}
  class="dialog dialog--{size}"
  class:dialog--closing={closing}
  on:cancel={onCancel}
  on:close={() => { if (open) onclose(); }}
>
  <div class="dialog__grab" role="presentation" on:pointerdown={pointerDown} on:pointermove={pointerMove} on:pointerup={pointerUp} on:pointercancel={pointerUp}></div>
  {#if title || closable}
    <header class="dialog__head">
      <div>
        {#if title}<h2 class="dialog__title">{title}</h2>{/if}
        {#if description}<p class="dialog__desc">{description}</p>{/if}
      </div>
      {#if closable}
        <IconButton name="x" label="Schließen" onclick={close} />
      {/if}
    </header>
  {/if}
  <div class="dialog__body">
    <slot />
  </div>
  {#if $$slots.footer}
    <footer class="dialog__foot">
      <slot name="footer" />
    </footer>
  {/if}
</dialog>
