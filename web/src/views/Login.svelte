<script>
  import { post } from '../lib/api.js';
  import { notify } from '../lib/stores.js';
  import Icon from '../components/Icon.svelte';
  import Button from '../components/Button.svelte';
  import Field from '../components/Field.svelte';
  import { autofocus } from '../lib/focus.js';
  export let onsuccess = () => {};

  let username = '';
  let password = '';
  let error = '';
  let busy = false;

  async function submit(event) {
    event.preventDefault();
    error = '';
    busy = true;
    try {
      const result = await post('/api/v1/auth/login', { username: username.trim(), password });
      notify(`Willkommen zurück, ${result.user.displayName}.`, 'success');
      onsuccess(result.user);
    } catch (err) {
      error = err.message || 'Anmeldung fehlgeschlagen.';
      notify(error, 'error');
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
    <p class="quote">Alle Dateien an einem Ort. <em>In deiner Hand.</em> Kein Fremdanbieter, keine Überraschungen.</p>
    <p class="foot">Ein Container. Eine Datenbank. Du.</p>
  </aside>
  <main class="auth-main">
    <div class="auth-card">
      <div class="auth-brand"><span class="brand-mark" aria-hidden="true">ob</span> Onebox</div>
      <div>
        <h1>Anmelden</h1>
        <p class="lede">Willkommen zurück. Melde dich an, um auf deine Dateien zuzugreifen.</p>
      </div>
      <form class="auth-form" on:submit={submit}>
        <Field label="Benutzername" id="login-user" required>
          <input id="login-user" class="input" bind:value={username} autocomplete="username" required use:autofocus />
        </Field>
        <Field label="Passwort" id="login-pass" required>
          <input id="login-pass" class="input" type="password" bind:value={password} autocomplete="current-password" required />
        </Field>
        {#if error}<p class="form-error" role="alert"><Icon name="circle-alert" size={15} />{error}</p>{/if}
        <Button type="submit" variant="primary" full loading={busy} disabled={!username || !password}>Anmelden</Button>
      </form>
      <p class="auth-note"><Icon name="lock" size={14} /> Deine Daten bleiben auf diesem Server.</p>
    </div>
  </main>
</div>
