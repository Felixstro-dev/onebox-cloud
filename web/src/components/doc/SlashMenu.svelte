<script>
  import { createEventDispatcher, tick } from 'svelte';
  import Icon from '../Icon.svelte';

  export let x = 0;
  export let y = 0;
  export let items = [];
  export let index = 0;
  export let query = '';

  const dispatch = createEventDispatcher();
  let listEl;

  $: if (listEl && items.length) {
    const active = listEl.querySelector('.is-active');
    active?.scrollIntoView({ block: 'nearest' });
  }

  function onKeydown(event) {
    dispatch('keydown', event);
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div
  class="slash-menu"
  style="left:{Math.max(8, x)}px;top:{Math.max(8, y)}px"
  role="listbox"
  aria-label="Einfügen"
  bind:this={listEl}
>
  {#if !items.length}
    <p class="slash-empty">Kein passendes Element für „{query}“.</p>
  {/if}
  {#each items as item, i (item.id)}
    <button
      type="button"
      class="slash-item"
      class:is-active={i === index}
      role="option"
      aria-selected={i === index}
      on:mousedown|preventDefault={() => dispatch('pick', item)}
      on:mouseenter={() => dispatch('index', i)}
    >
      <span class="slash-item__icon"><Icon name={item.icon} size={15} /></span>
      <span class="slash-item__copy">
        <span>{item.label}</span>
        <small>{item.hint}</small>
      </span>
    </button>
  {/each}
</div>
