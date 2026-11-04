<script>
  import Icon from './Icon.svelte';

  /** 0–100 oder null für einen nicht messbaren Fortschritt. */
  export let value = null;
  export let status = 'running';
  export let label = '';
  export let detail = '';
  export let compact = false;

  const state = () => (status === 'done' ? 'done' : status === 'error' ? 'error' : 'running');
  $: progress = value === null || value === undefined ? null : Math.max(0, Math.min(100, Number(value)));
  $: current = state();
</script>

<div class="progress-loader" data-state={current} data-compact={compact} data-indeterminate={progress === null}>
  <span class="progress-loader__icon" aria-hidden="true">
    {#if current === 'done'}
      <Icon name="check" size={15} />
    {:else if current === 'error'}
      <Icon name="alert-triangle" size={15} />
    {:else}
      <span class="spinner"></span>
    {/if}
  </span>

  <span class="progress-loader__body">
    <span class="progress-loader__row">
      {#if label}<strong class="progress-loader__label">{label}</strong>{/if}
      {#if progress !== null && current === 'running'}<span class="progress-loader__value">{progress} %</span>{/if}
    </span>
    {#if detail}<span class="progress-loader__detail">{detail}</span>{/if}
    {#if current !== 'done'}
      <span
        class="progress-loader__track"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={progress === null ? undefined : progress}
        aria-label={label || undefined}
      >
        <span class="progress-loader__fill" style:transform={progress === null ? undefined : `scaleX(${progress / 100})`}></span>
      </span>
    {/if}
  </span>
</div>
