<script>
  import { onMount } from 'svelte';
  import { get, post } from '../lib/api.js';
  import { user } from '../lib/stores.js';
  import Icon from './Icon.svelte';
  import Button from './Button.svelte';

  let status = null;
  let checking = false;
  let updating = false;
  let error = '';
  let dismissedFor = '';
  let started = false;
  let timer = null;

  $: visible = Boolean(
    status?.updateAvailable
      && dismissedFor !== status.latest
      && !updating
  );

  $: if ($user?.role === 'admin' && !started) {
    started = true;
    check({ quiet: true });
    timer = setInterval(() => check({ quiet: true }), 6 * 60 * 60 * 1000);
  }

  onMount(() => () => clearInterval(timer));

  async function check({ quiet = false } = {}) {
    if (!quiet) checking = true;
    error = '';
    try {
      status = await get('/api/v1/system/update/status');
      try {
        if (sessionStorage.getItem(`onebox-update-dismissed:${status.latest}`) === '1') {
          dismissedFor = status.latest;
        }
      } catch {}
    } catch (err) {
      if (!quiet) error = err.message;
    } finally {
      checking = false;
    }
  }

  function dismiss() {
    dismissedFor = status?.latest || '';
    try { sessionStorage.setItem(`onebox-update-dismissed:${status?.latest}`, '1'); } catch {}
  }

  async function startUpdate() {
    updating = true;
    error = '';
    try {
      await post('/api/v1/system/update', {});
      // Die Instanz schaltet kurz darauf auf die Wartungsseite um.
      setTimeout(() => window.location.assign('/maintenance'), 1200);
    } catch (err) {
      error = err.message;
      updating = false;
    }
  }
</script>

{#if visible}
  <aside class="update-notice" role="status" aria-live="polite" aria-labelledby="update-notice-title">
    <span class="update-notice__icon" aria-hidden="true"><Icon name="sparkles" size={18} /></span>
    <div class="update-notice__body">
      <h2 id="update-notice-title">Update verfügbar</h2>
      <p>
        Onebox <strong>{status.latest}</strong> ist verfügbar
        (installiert: {status.current}).
      </p>
      {#if error}<p class="update-notice__error">{error}</p>{/if}
      <div class="update-notice__actions">
        <Button variant="primary" size="sm" icon="refresh-cw" loading={updating} onclick={startUpdate}>Jetzt aktualisieren</Button>
        <Button variant="quiet" size="sm" onclick={dismiss}>Später</Button>
      </div>
      {#if updating}
        <p class="update-notice__hint">Wartungsmodus startet in wenigen Sekunden. Die Seite ist danach kurz nicht erreichbar.</p>
      {/if}
    </div>
    <button type="button" class="update-notice__close" aria-label="Update-Hinweis ausblenden" on:click={dismiss}>
      <Icon name="x" size={16} />
    </button>
  </aside>
{/if}

<style>
  .update-notice {
    position: fixed;
    left: var(--space-4);
    bottom: calc(var(--bottom-nav-height) + var(--safe-bottom) + var(--space-4));
    z-index: 66;
    width: min(23rem, calc(100vw - 2rem));
    display: flex;
    gap: var(--space-3);
    align-items: flex-start;
    padding: var(--space-4);
    border: 1px solid var(--color-border-default);
    border-radius: var(--radius-lg);
    background: var(--color-bg-panel);
    box-shadow: var(--shadow-menu);
    animation: update-notice-in var(--duration-base) var(--ease-out);
  }
  .update-notice__icon {
    display: grid;
    place-items: center;
    flex: none;
    width: 2rem;
    height: 2rem;
    border-radius: var(--radius-md);
    background: color-mix(in srgb, var(--color-accent-brand) 18%, transparent);
    color: var(--color-accent-brand);
  }
  .update-notice__body { display: grid; gap: var(--space-1); min-width: 0; }
  .update-notice__body h2 { font-size: var(--text-sm); margin: 0; }
  .update-notice__body p { margin: 0; font-size: var(--text-sm); color: var(--color-text-secondary); }
  .update-notice__actions { display: flex; gap: var(--space-2); margin-top: var(--space-2); flex-wrap: wrap; }
  .update-notice__error { color: var(--color-error) !important; }
  .update-notice__hint { font-size: var(--text-xs); }
  .update-notice__close {
    margin-left: auto;
    flex: none;
    display: grid;
    place-items: center;
    padding: var(--space-1);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--color-text-secondary);
  }
  .update-notice__close:hover { background: var(--color-bg-active); color: var(--color-text-primary); }
  @keyframes update-notice-in {
    from { opacity: 0; transform: translateY(8px); }
    to { opacity: 1; transform: none; }
  }
  @media (prefers-reduced-motion: reduce) {
    .update-notice { animation: none; }
  }
</style>
