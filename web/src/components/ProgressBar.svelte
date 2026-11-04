<script>
  export let value = 0;
  export let max = 100;
  export let label = '';
  export let tone = 'default';
  export let size = 'md';
  const percent = Math.max(0, Math.min(100, max ? (value / max) * 100 : 0));
</script>

<div
  class="progress progress--{size} progress--{tone}"
  role="progressbar"
  aria-valuemin="0"
  aria-valuemax={max}
  aria-valuenow={value}
  aria-label={label || undefined}
>
  <span style:transform="scaleX({percent / 100})"></span>
</div>
