<script>
  import { post } from '../lib/api.js';
  import { notify } from '../lib/stores.js';
  import Icon from '../components/Icon.svelte';
  import Button from '../components/Button.svelte';
  import Field from '../components/Field.svelte';
  import { autofocus } from '../lib/focus.js';
  export let ondone = () => {};

  let username = '';
  let displayName = '';
  let password = '';
  let repeat = '';
  let setupToken = '';
  let error = '';
  let success = '';
  let busy = false;

  $: mismatch = repeat.length > 0 && password !== repeat;

  async function submit(event) {
    event.preventDefault();
    if (busy) return;
    error = '';
    success = '';
    const normalizedUsername = username.trim();
    if (!/^[a-zA-Z0-9._-]+$/.test(normalizedUsername)) {
      error = 'Der Benutzername darf nur Buchstaben, Zahlen, Punkte, Bindestriche und Unterstriche enthalten.';
      return;
    }
    if (password.length < 10) { error = 'Das Passwort muss mindestens 10 Zeichen lang sein.'; return; }
    if (!repeat || password !== repeat) { error = 'Die Passwörter stimmen nicht überein.'; return; }
    busy = true;
    try {
      const result = await post('/api/v1/system/setup', {
        username: normalizedUsername, password, displayName: displayName.trim() || undefined,
        setupToken: setupToken || undefined,
      });
      success = 'Instanz erfolgreich eingerichtet. Weiterleitung …';
      notify('Onebox ist eingerichtet. Willkommen!', 'success');
      await new Promise((resolve) => setTimeout(resolve, 500));
      ondone(result.user);
    } catch (err) {
      error = err.message || 'Einrichtung fehlgeschlagen.';
    } finally {
      busy = false;
    }
  }
</script>

<div class="auth-page">
  <aside class="auth-aside" aria-hidden="true">
    <div class="brand-row">
      <span class="brand-mark">ob</span>
      <div><span class="brand-name">Onebox</span><span class="brand-sub">Deine Cloud</span></div>
    </div>
    <p class="quote">Drei Minuten Einrichtung. Danach gehört der Speicher <em>dir</em>.</p>
    <p class="foot">Läuft in einem Container, direkt auf deiner Hardware.</p>
  </aside>
  <main class="auth-main">
    <div class="auth-card">
      <div class="auth-brand"><span class="brand-mark" aria-hidden="true">ob</span> Onebox</div>
      <div>
        <h1>Willkommen</h1>
        <p class="lede">Lege das Administratorkonto für diese Instanz an. Das ist der einzige Schritt, bevor es losgeht.</p>
      </div>
      <form class="auth-form" novalidate on:submit={submit}>
        <Field label="Benutzername" id="setup-user" hint="Buchstaben, Zahlen, Punkt, Bindestrich, Unterstrich." required>
          <input id="setup-user" class="input" bind:value={username} autocomplete="username" required use:autofocus />
        </Field>
        <Field label="Anzeigename" id="setup-name" hint="Optional – so erscheinst du in der Oberfläche.">
          <input id="setup-name" class="input" bind:value={displayName} autocomplete="name" />
        </Field>
        <Field label="Passwort" id="setup-pass" hint="Mindestens 10 Zeichen. Ein Satz ist besser als ein Wort." required>
          <input id="setup-pass" class="input" type="password" bind:value={password} autocomplete="new-password" minlength="10" required />
        </Field>
        <Field label="Passwort wiederholen" id="setup-repeat" error={mismatch ? 'Die Passwörter stimmen nicht überein.' : ''} required>
          <input id="setup-repeat" class="input" type="password" bind:value={repeat} autocomplete="new-password" required />
        </Field>
        <Field label="Setup-Token" id="setup-token" hint="Nur nötig, wenn die Instanz mit ONEB…-Token gestartet wurde.">
          <input id="setup-token" class="input" bind:value={setupToken} autocomplete="off" />
        </Field>
        {#if error}<p class="form-error" role="alert"><Icon name="circle-alert" size={15} />{error}</p>{/if}
        {#if success}<p class="form-success" role="status" aria-live="polite"><Icon name="circle-check" size={15} />{success}</p>{/if}
        <Button type="submit" variant="primary" full loading={busy} disabled={busy}>
          {busy ? 'Instanz wird eingerichtet …' : 'Instanz einrichten'}
        </Button>
      </form>
      <p class="auth-note"><Icon name="shield-check" size={14} /> Passwörter werden mit Argon2id gespeichert.</p>
    </div>
  </main>
</div>
