<script>
  import EmptyState from '../components/EmptyState.svelte';
  import { navigate } from '../lib/router.js';
</script>

<div class="page">
  <EmptyState
    icon="compass"
    title="Diese Seite gibt es nicht"
    text="Vielleicht wurde der Link geändert oder die Datei ist umgezogen."
    action={() => navigate('/')}
    actionLabel="Zur Übersicht"
  />
</div>
