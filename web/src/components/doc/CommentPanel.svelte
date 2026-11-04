<script>
  import { createEventDispatcher } from 'svelte';
  import Icon from '../Icon.svelte';
  import IconButton from '../IconButton.svelte';
  import Button from '../Button.svelte';

  export let comments = [];
  export let activeCommentId = null;
  export let authorName = '';

  const dispatch = createEventDispatcher();

  let draft = '';
  let replyTo = null;          // Thread-ID, auf das gerade geantwortet wird
  let replyText = '';
  let editingId = null;        // Kommentar, dessen Text gerade bearbeitet wird
  let editText = '';

  $: threads = buildThreads(comments);

  function buildThreads(list) {
    const roots = list.filter((c) => !c.parentId).sort((a, b) => b.createdAt - a.createdAt);
    return roots.map((root) => ({
      ...root,
      replies: list.filter((c) => c.parentId === root.id).sort((a, b) => a.createdAt - b.createdAt),
    }));
  }

  function submit() {
    const body = draft.trim();
    if (!body) return;
    dispatch('add', { body });
    draft = '';
  }

  function submitReply(thread) {
    const body = replyText.trim();
    if (!body) return;
    dispatch('add', { body, parentId: thread.id });
    replyTo = null;
    replyText = '';
  }

  function saveEdit(id) {
    const body = editText.trim();
    if (!body) return;
    dispatch('update', { id, body });
    editingId = null;
    editText = '';
  }

  function stamp(at) {
    const diff = Date.now() - at;
    if (diff < 60000) return 'gerade eben';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} Min.`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)} Std.`;
    return new Date(at).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }
</script>

<header class="doc-panel__head">
  <Icon name="message-square" size={16} />
  <h2>Kommentare{comments.length ? ` · ${comments.length}` : ''}</h2>
  <span class="spacer"></span>
  <IconButton name="x" label="Schließen" onclick={() => dispatch('close')} />
</header>

<div class="doc-panel__body">
  <form class="comment-compose" on:submit|preventDefault={submit}>
    <textarea
      class="textarea"
      bind:value={draft}
      placeholder="Kommentar schreiben …"
      rows="3"
      aria-label="Neuer Kommentar"
      on:keydown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') submit(); }}
    ></textarea>
    <div class="comment-compose__actions">
      <span class="hint">Strg + Enter</span>
      <Button size="sm" variant="primary" type="submit" disabled={!draft.trim()}>Kommentieren</Button>
    </div>
  </form>

  {#if !threads.length}
    <p class="empty-hint">Noch keine Kommentare. Markiere im Text eine Stelle, um sie zu kommentieren.</p>
  {/if}

  {#each threads as thread (thread.id)}
    <article
      class="comment"
      class:is-active={activeCommentId === thread.id}
      class:is-resolved={thread.resolved}
      on:mouseenter={() => dispatch('focus', thread.id)}
      on:focusin={() => dispatch('focus', thread.id)}
      tabindex="-1"
    >
      <div class="comment__head">
        <span class="comment__author">{thread.authorName || 'Unbekannt'}</span>
        <span class="comment__time">{stamp(thread.createdAt)}</span>
        {#if thread.resolved}<span class="comment__flag">gelöst</span>{/if}
      </div>

      {#if thread.anchor?.quote}
        <blockquote class="comment__quote">„{thread.anchor.quote}“</blockquote>
      {/if}

      {#if editingId === thread.id}
        <div class="comment-compose">
          <textarea class="textarea" bind:value={editText} rows="3" aria-label="Kommentar bearbeiten"></textarea>
          <div class="comment-compose__actions">
            <Button size="sm" variant="ghost" onclick={() => (editingId = null)}>Abbrechen</Button>
            <Button size="sm" variant="primary" onclick={() => saveEdit(thread.id)}>Speichern</Button>
          </div>
        </div>
      {:else}
        <p class="comment__body">{thread.body}</p>
      {/if}

      <div class="comment__actions">
        <button on:click={() => { replyTo = thread.id; replyText = ''; }}>Antworten</button>
        <button on:click={() => { editingId = thread.id; editText = thread.body; }}>Bearbeiten</button>
        <button on:click={() => dispatch('resolve', { id: thread.id, resolved: !thread.resolved })}>
          {thread.resolved ? 'Wieder öffnen' : 'Gelöst'}
        </button>
        <button on:click={() => dispatch('remove', { id: thread.id })}>Löschen</button>
      </div>

      {#if replyTo === thread.id}
        <div class="comment-compose">
          <textarea class="textarea" bind:value={replyText} rows="2" placeholder="Antworten …" aria-label="Antwort"></textarea>
          <div class="comment-compose__actions">
            <Button size="sm" variant="ghost" onclick={() => (replyTo = null)}>Abbrechen</Button>
            <Button size="sm" variant="primary" disabled={!replyText.trim()} onclick={() => submitReply(thread)}>Antworten</Button>
          </div>
        </div>
      {/if}

      {#if thread.replies.length}
        <div class="comment__replies">
          {#each thread.replies as reply (reply.id)}
            <article class="comment" class:is-resolved={reply.resolved}>
              <div class="comment__head">
                <span class="comment__author">{reply.authorName || 'Unbekannt'}</span>
                <span class="comment__time">{stamp(reply.createdAt)}</span>
                {#if reply.resolved}<span class="comment__flag">gelöst</span>{/if}
              </div>
              <p class="comment__body">{reply.body}</p>
              <div class="comment__actions">
                <button on:click={() => dispatch('resolve', { id: reply.id, resolved: !reply.resolved })}>
                  {reply.resolved ? 'Öffnen' : 'Gelöst'}
                </button>
                <button on:click={() => dispatch('remove', { id: reply.id })}>Löschen</button>
              </div>
            </article>
          {/each}
        </div>
      {/if}
    </article>
  {/each}
</div>

<style>
  .empty-hint { font-size: var(--text-sm); color: var(--color-text-secondary); line-height: 1.6; padding: var(--space-2) 0; }
  .comment-compose__actions { display: flex; align-items: center; justify-content: flex-end; gap: var(--space-2); }
  .hint { font-size: var(--text-xs); color: var(--color-text-secondary); margin-right: auto; }
  .comment__time { color: var(--color-text-secondary); font-size: var(--text-xs); }
  .comment__flag { color: var(--color-success); font-size: var(--text-xs); }
</style>
