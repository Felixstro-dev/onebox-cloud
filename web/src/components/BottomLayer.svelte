<script>
  import { onMount } from 'svelte';
  import SelectionBar from './SelectionBar.svelte';
  import UploadPanel from './UploadPanel.svelte';
  import { startJobsPolling, stopJobsPolling } from '../lib/jobs.js';

  let inner = null;
  let observer = null;

  onMount(() => {
    startJobsPolling();
    const root = document.documentElement;
    observer = new ResizeObserver(([entry]) => {
      const height = Math.ceil(entry.borderBoxSize?.[0]?.blockSize ?? entry.contentRect.height);
      root.style.setProperty('--bottom-stack-height', `${height}px`);
    });
    if (inner) observer.observe(inner);
    return () => {
      stopJobsPolling();
      observer?.disconnect();
      root.style.removeProperty('--bottom-stack-height');
    };
  });

  $: if (inner && observer) observer.observe(inner);
</script>

<!-- Ein einziger Stapel über der unteren Navigation. Die Kinder sind normale
     Flex-Elemente und schieben sich gegenseitig, statt sich zu überlappen. -->
<div class="bottom-layer">
  <div class="bottom-stack" bind:this={inner}>
    <SelectionBar />
    <UploadPanel />
  </div>
</div>
