<script>
  import { onMount } from 'svelte';
  import { get, post } from '../lib/api.js';
  import { user, notify } from '../lib/stores.js';
  import Icon from '../components/Icon.svelte';
  import Button from '../components/Button.svelte';
  import { rememberChatMessage, requestChatNotifications, subscribeChat } from '../lib/chat-realtime.js';

  let messages = [];
  let draft = '';
  let loading = true;
  let sending = false;
  let failed = '';

  let notificationPermission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  onMount(() => {
    loadMessages();
    return subscribeChat((message) => {
      if (messages.some((entry) => entry.id === message.id)) return;
      messages = [message, ...messages];
    });
  });

  async function loadMessages() {
    loading = true;
    failed = '';
    try {
      const data = await get('/api/v1/chat/messages');
      messages = data.messages || [];
    } catch (error) {
      failed = error.message;
    } finally {
      loading = false;
    }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || sending) return;
    sending = true;
    try {
      const data = await post('/api/v1/chat/messages', { text });
      rememberChatMessage(data.message);
      messages = [data.message, ...messages];
      draft = '';
    } catch (error) {
      notify(error.message, 'error');
    } finally {
      sending = false;
    }
  }

  function isOwn(message) {
    return message.user === $user?.id || message.user === 'me';
  }

  async function enableNotifications() {
    notificationPermission = await requestChatNotifications();
    if (notificationPermission === 'granted') notify('Chat-Benachrichtigungen sind aktiviert.', 'success');
    else if (notificationPermission === 'denied') notify('Benachrichtigungen wurden blockiert. Erlaube sie in den Browsereinstellungen.', 'error');
  }

  function displayName(message) {
    return isOwn(message) ? ($user?.displayName || $user?.username || 'Du') : (message.displayName || 'Unbekannt');
  }
</script>

<div class="page chat-page">
  <header class="page-head">
    <div>
      <h1>Chat</h1>
      <p class="lede">Kurze Nachrichten in deiner Onebox.</p>
    </div>
    <div class="chat-actions">
      {#if notificationPermission !== 'granted' && notificationPermission !== 'unsupported'}
        <Button variant="quiet" size="sm" icon="bell" onclick={enableNotifications}>Benachrichtigungen</Button>
      {/if}
      <Button variant="quiet" size="sm" icon="refresh-cw" loading={loading} onclick={loadMessages}>Aktualisieren</Button>
    </div>
  </header>

  <section class="chat-shell" aria-label="Onebox Chat">
    <div class="chat-list" aria-live="polite" aria-busy={loading}>
      {#if loading}
        <div class="chat-empty"><span class="spinner" aria-hidden="true"></span><span>Nachrichten werden geladen …</span></div>
      {:else if failed}
        <div class="chat-empty"><Icon name="message-circle-off" size={24} /><strong>Chat konnte nicht geladen werden</strong><span>{failed}</span><Button variant="secondary" size="sm" onclick={loadMessages}>Erneut versuchen</Button></div>
      {:else if !messages.length}
        <div class="chat-empty"><Icon name="message-circle" size={28} /><strong>Noch keine Nachrichten</strong><span>Schreib die erste Nachricht.</span></div>
      {:else}
        {#each [...messages].reverse() as message (message.id)}
          <article class="chat-message" class:chat-message--own={isOwn(message)}>
            <div class="chat-message__body">
              <span class="chat-message__author">{displayName(message)}</span>
              <p>{message.text}</p>
              <time datetime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</time>
            </div>
          </article>
        {/each}
      {/if}
    </div>

    <form class="chat-composer" on:submit|preventDefault={sendMessage}>
      <label class="sr-only" for="chat-message">Nachricht</label>
      <textarea id="chat-message" class="input" rows="2" maxlength="2000" bind:value={draft} placeholder="Nachricht schreiben …" disabled={sending}></textarea>
      <Button variant="primary" icon="send" type="submit" loading={sending} disabled={!draft.trim()}>Senden</Button>
    </form>
  </section>
</div>

<style>
  .chat-page { max-width: 62rem; }
  .chat-shell { display: grid; min-height: min(68vh, 42rem); grid-template-rows: 1fr auto; overflow: hidden; border: 1px solid var(--color-border-subtle); border-radius: var(--radius-xl); background: var(--color-bg-sidebar); }
  .chat-list { display: grid; align-content: start; gap: var(--space-3); min-height: 20rem; overflow: auto; padding: var(--space-6); }
  .chat-empty { display: grid; place-items: center; gap: var(--space-2); min-height: 18rem; color: var(--color-text-secondary); text-align: center; }
  .chat-empty strong { color: var(--color-text-primary); }
  .chat-empty .btn { margin-top: var(--space-2); }
  .chat-message { display: flex; justify-content: flex-start; }
  .chat-message--own { justify-content: flex-end; }
  .chat-message__body { max-width: min(36rem, 80%); padding: var(--space-3) var(--space-4); border-radius: var(--radius-lg) var(--radius-lg) var(--radius-lg) var(--space-2); background: var(--color-bg-elevated); }
  .chat-message--own .chat-message__body { border-radius: var(--radius-lg) var(--radius-lg) var(--space-2) var(--radius-lg); background: var(--color-bg-active); }
  .chat-message p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
  .chat-message__author { display: block; margin-bottom: var(--space-1); color: var(--color-text-secondary); font-size: var(--text-xs); font-weight: 600; }
  .chat-actions { display: flex; gap: var(--space-2); flex-wrap: wrap; justify-content: flex-end; }
  .chat-message time { display: block; margin-top: var(--space-2); color: var(--color-text-tertiary); font-size: var(--text-xs); }
  .chat-composer { display: flex; gap: var(--space-3); align-items: end; padding: var(--space-4); border-top: 1px solid var(--color-border-subtle); background: var(--color-bg-base); }
  .chat-composer textarea { min-height: 3rem; resize: vertical; }
  @media (max-width: 640px) {
    .chat-shell { min-height: calc(100vh - 12rem); }
    .chat-list { padding: var(--space-4); }
    .chat-message__body { max-width: 88%; }
  }
</style>
