<script>
  export let label = '';
  export let hint = '';
  export let error = '';
  export let id = `field-${Math.random().toString(36).slice(2, 8)}`;
  export let required = false;
</script>

<div class="field" class:field--error={Boolean(error)}>
  {#if label}
    <label class="field__label" for={id}>{label}{#if required}<span class="field__req" aria-hidden="true"> *</span>{/if}</label>
  {/if}
  <slot {id} />
  {#if error}
    <p class="field__hint field__hint--error" role="alert">{error}</p>
  {:else if hint}
    <p class="field__hint">{hint}</p>
  {/if}
</div>
