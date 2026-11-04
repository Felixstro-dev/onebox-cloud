<script>
  export let name = 'file';
  export let size = null;
  export let label = '';
  export let stroke = null;
  export let filled = false;
</script>

<svg
  xmlns="http://www.w3.org/2000/svg"
  viewBox="0 0 24 24"
  class="icon"
  class:icon--filled={filled}
  style={size ? `width:${size}px;height:${size}px` : ''}
  style:--icon-stroke={stroke}
  role={label ? 'img' : undefined}
  aria-label={label || undefined}
  aria-hidden={label ? undefined : 'true'}
>
  <use href="/icons.svg#i-{name}" />
</svg>

<style>
  .icon { width: 1.25rem; height: 1.25rem; flex: none; display: block; overflow: visible; fill: none; stroke: currentColor; stroke-width: 1.75; stroke-linecap: round; stroke-linejoin: round; }
  .icon--filled { fill: currentColor; stroke: none; }
</style>
