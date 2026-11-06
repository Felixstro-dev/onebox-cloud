<script>
  import { onMount } from 'svelte';
  import { get, post } from '../lib/api.js';
  import { user, notify } from '../lib/stores.js';
  import Icon from '../components/Icon.svelte';
  import Button from '../components/Button.svelte';
  import { rememberChatMessage, requestChatNotifications, subscribeChat } from '../lib/chat-realtime.js';

  let messages = [];
  let contacts = [];
  let groups = [];
  let scope = 'global';
  let scopeId = 'global';
  let selectedUserId = '';
  let newGroupName = '';
  let newGroupMemberId = '';
  let draft = '';
  let loading = true;
  let sending = false;
  let failed = '';

  let notificationPermission = typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
  onMount(() => {
    loadConversations();
    loadMessages();
    return subscribeChat((message) => {
      if ((message.scope || 'global') !== scope || (message.scopeId || 'global') !== scopeId) return;
      if (messages.some((entry) => entry.id === message.id)) return;
      messages = [message, ...messages];
    });
  });

  async function loadConversations() {
    try {
      const data = await get('/api/v1/chat/conversations');
      contacts = data.users || [];
      groups = data.groups || [];
    } catch (error) { notify(error.message, 'error'); }
  }

  async function loadMessages() {
    loading = true;
    failed = '';
    try {
      const params = new URLSearchParams({ scope, scopeId });
      const data = await get(`/api/v1/chat/messages?${params}`);
      messages = data.messages || [];
    } catch (error) {
      failed = error.message;
    } finally {
      loading = false;
    }
  }

  function chooseConversation(nextScope, nextScopeId) {
    scope = nextScope;
    scopeId = nextScopeId;
    loadMessages();
  }

  function privateId(userId) {
    return [$user?.id, userId].sort().join(':');
  }

  async function createGroup() {
    if (!newGroupName.trim() || !newGroupMemberId) return;
    try {
      const data = await post('/api/v1/chat/groups', { name: newGroupName.trim(), memberIds: [newGroupMemberId] });
      groups = [...groups, data.group];
      newGroupName = '';
      newGroupMemberId = '';
      chooseConversation('group', data.group.id);
    } catch (error) { notify(error.message, 'error'); }
  }

  async function sendMessage() {
    const text = draft.trim();
    if (!text || sending) return;
    sending = true;
    try {
      const data = await post('/api/v1/chat/messages', { text, scope, scopeId });
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

  $: activeTitle = scope === 'global'
    ? 'Allgemeiner Chat'
    : scope === 'group'
      ? (groups.find((group) => group.id === scopeId)?.name || 'Gruppe')
      : (contacts.find((contact) => contact.id === scopeId.split(':').find((id) => id !== $user?.id))?.displayName || 'Privater Chat');
</script>

<div class="page chat-page">
  <header class="page-head">
    <div>
      <h1>{activeTitle}</h1>
      <p class="lede">Kurze Nachrichten in deiner Onebox.</p>
    </div>
    <div class="chat-actions">
      {#if notificationPermission !== 'granted' && notificationPermission !== 'unsupported'}
        <Button variant="quiet" size="sm" icon="bell" onclick={enableNotifications}>Benachrichtigungen</Button>
      {/if}
      <Button variant="quiet" size="sm" icon="refresh-cw" loading={loading} onclick={loadMessages}>Aktualisieren</Button>
    </div>
  </header>

  <div class="chat-switcher">
    <label>
      <span class="sr-only">Chat auswählen</span>
      <select class="select" value={`${scope}:${scopeId}`} on:change={(event) => {
        const [nextScope, ...rest] = event.target.value.split(':');
        chooseConversation(nextScope, rest.join(':'));
      }}>
        <option value="global:global">Allgemeiner Chat</option>
        {#each groups as group}<option value={`group:${group.id}`}>Gruppe: {group.name}</option>{/each}
        {#each contacts as contact}<option value={`private:${privateId(contact.id)}`}>Privat: {contact.displayName || contact.username}</option>{/each}
      </select>
    </label>
    <select class="select" bind:value={selectedUserId} aria-label="Kontakt für privaten Chat">
      <option value="">Privaten Chat starten …</option>
      {#each contacts as contact}<option value={contact.id}>{contact.displayName || contact.username}</option>{/each}
    </select>
    <Button variant="secondary" size="sm" disabled={!selectedUserId} onclick={() => chooseConversation('private', privateId(selectedUserId))}>Privat</Button>
    <input class="input chat-group-name" bind:value={newGroupName} placeholder="Neue Gruppe …" aria-label="Name der neuen Gruppe" />
    <select class="select" bind:value={newGroupMemberId} aria-label="Gruppenmitglied">
      <option value="">Mitglied auswählen …</option>
      {#each contacts as contact}<option value={contact.id}>{contact.displayName || contact.username}</option>{/each}
    </select>
    <Button variant="secondary" size="sm" disabled={!newGroupName.trim() || !newGroupMemberId} onclick={createGroup}>Gruppe</Button>
  </div>

  <section class="chat-shell" aria-label="Onebox Chat">
    <div class="chat-list" aria-live="polite" aria-busy={loading && !sending}>
      {#if loading && !sending}
        <div class="chat-empty"><span class="spinner" aria-hidden="true"></span><span>Nachrichten werden geladen …</span></div>
      {:else if loading}
        <div class="chat-empty"><span>Nachrichten werden geladen …</span></div>
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
  .chat-switcher { display: flex; gap: var(--space-2); flex-wrap: wrap; margin-bottom: var(--space-4); }
  .chat-switcher .select, .chat-switcher .input { min-height: 2.5rem; width: auto; max-width: 14rem; }
  .chat-group-name { min-width: 10rem; }
  .chat-message time { display: block; margin-top: var(--space-2); color: var(--color-text-tertiary); font-size: var(--text-xs); }
  .chat-composer { display: flex; gap: var(--space-3); align-items: end; padding: var(--space-4); border-top: 1px solid var(--color-border-subtle); background: var(--color-bg-base); }
  .chat-composer textarea { min-height: 3rem; resize: vertical; }
  @media (max-width: 640px) {
    .chat-shell { min-height: calc(100vh - 12rem); }
    .chat-list { padding: var(--space-4); }
    .chat-message__body { max-width: 88%; }
  }
</style>
