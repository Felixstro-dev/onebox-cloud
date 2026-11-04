<script>
  import { post } from '../lib/api.js';
  import { notify } from '../lib/stores.js';
  import Dialog from './Dialog.svelte';
  import Button from './Button.svelte';
  import Field from './Field.svelte';
  import Icon from './Icon.svelte';
  import Switch from './Switch.svelte';

  export let open = false;
  export let node = null;
  export let onclose = () => {};

  let kind = 'link';
  let password = '';
  let expiresDays = 0;
  let maxDownloads = null;
  let result = null;
  let busy = false;
  let error = '';
  let copied = false;

  $: isFolder = node?.kind === 'folder';
  $: kind = isFolder ? kind : 'link';

  function reset() {
    result = null;
    error = '';
    password = '';
    expiresDays = 0;
    maxDownloads = null;
    copied = false;
    kind = 'link';
  }

  function close() {
    onclose();
    setTimeout(reset, 250);
  }

  async function create() {
    error = '';
    busy = true;
    try {
      const data = await post('/api/v1/shares', {
        nodeId: node.id,
        kind,
        password: password || null,
        expiresAt: expiresDays ? Date.now() + expiresDays * 86400000 : null,
        maxDownloads: !isFolder && Number(maxDownloads) > 0 ? Number(maxDownloads) : null,
      });
      result = { ...data, absolute: `${window.location.origin}${data.url}` };
      notify('Freigabe ist bereit.', 'success');
    } catch (err) {
      error = err.message;
    } finally {
      busy = false;
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(result.absolute);
      copied = true;
      setTimeout(() => (copied = false), 1800);
    } catch {}
  }
</script>

<Dialog {open} title={result ? 'Freigabe erstellt' : 'Teilen'} description={node ? (kind === 'upload' ? `Sammle Dateien in „${node.name}“.` : `Erstelle einen Link zu „${node.name}“.`) : ''} onclose={close}>
  {#if result}
    <div class="token-reveal">
      <strong>Link</strong>
      <code>{result.absolute}</code>
      <div class="page-actions">
        <Button variant="primary" size="sm" icon={copied ? 'check' : 'copy'} onclick={copy}>{copied ? 'Kopiert' : 'Link kopieren'}</Button>
        <Button variant="quiet" size="sm" href={result.url}>Öffnen</Button>
      </div>
    </div>
    {#if password}<p class="field__hint"><Icon name="lock" size={13} /> Passwortgeschützt. Teile das Passwort getrennt vom Link.</p>{/if}
    {#if expiresDays}<p class="field__hint">Läuft in {expiresDays} Tagen ab.</p>{/if}
    {#if Number(maxDownloads) > 0}<p class="field__hint">Höchstens {Number(maxDownloads)} Downloads.</p>{/if}
    <p class="field__hint">Du kannst die Freigabe jederzeit unter „Freigaben“ widerrufen.</p>
  {:else}
    {#if isFolder}
      <div class="segmented" role="group" aria-label="Art der Freigabe">
        <button type="button" aria-pressed={kind === 'link'} on:click={() => (kind = 'link')}>Link zum Ansehen</button>
        <button type="button" aria-pressed={kind === 'upload'} on:click={() => (kind = 'upload')}>Upload-Anfrage</button>
      </div>
      <p class="field__hint">{kind === 'upload' ? 'Andere können Dateien in diesen Ordner hochladen, ohne ein Konto zu haben.' : 'Andere können den Ordner ansehen und Dateien herunterladen.'}</p>
    {/if}
    <Field label="Passwort" id="share-pass" hint="Optional. Mindestens vier Zeichen.">
      <input id="share-pass" class="input" type="password" bind:value={password} autocomplete="new-password" placeholder="Kein Passwort" />
    </Field>
    <Field label="Ablauf" id="share-expiry" hint="Danach ist der Link automatisch ungültig.">
      <select id="share-expiry" class="select" bind:value={expiresDays}>
        <option value={0}>Kein Ablauf</option>
        <option value={1}>In 24 Stunden</option>
        <option value={7}>In 7 Tagen</option>
        <option value={30}>In 30 Tagen</option>
      </select>
    </Field>
    {#if !isFolder}
      <Field label="Download-Limit" id="share-limit" hint="Leer lassen für unbegrenzt.">
        <input id="share-limit" class="input" type="number" min="1" step="1" inputmode="numeric" bind:value={maxDownloads} placeholder="Unbegrenzt" />
      </Field>
    {/if}
    {#if error}<p class="form-error" role="alert"><Icon name="circle-alert" size={15} />{error}</p>{/if}
  {/if}
  <svelte:fragment slot="footer">
    {#if result}
      <Button variant="primary" onclick={close}>Fertig</Button>
    {:else}
      <Button variant="quiet" onclick={close}>Abbrechen</Button>
      <Button variant="primary" loading={busy} onclick={create} icon="link">Freigabe erstellen</Button>
    {/if}
  </svelte:fragment>
</Dialog>
