<script>
  import { onMount } from 'svelte';
  import { get, post, patch, del } from '../lib/api.js';
  import { user, notify, confirmAction } from '../lib/stores.js';
  import { bytes, dateTime, relative } from '../lib/format.js';
  import Icon from '../components/Icon.svelte';
  import Button from '../components/Button.svelte';
  import IconButton from '../components/IconButton.svelte';
  import Field from '../components/Field.svelte';
  import Switch from '../components/Switch.svelte';
  import Dialog from '../components/Dialog.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import ProgressBar from '../components/ProgressBar.svelte';

  let tab = 'users';
  let users = [];
  let groups = [];
  let selfId = null;
  let loading = true;
  let failed = '';
  let saving = false;

  let userOpen = false;
  let editing = null;
  let form = blankUser();
  let groupOpen = false;
  let groupName = '';

  function blankUser() {
    return { username: '', displayName: '', password: '', role: 'user', quotaGb: 0, disabled: false, groupIds: [] };
  }

  onMount(load);

  async function load() {
    loading = true;
    failed = '';
    try {
      const [u, g] = await Promise.all([get('/api/v1/users'), get('/api/v1/users/groups')]);
      users = u.items;
      selfId = u.selfId;
      groups = g.items;
    } catch (err) { failed = err.message; } finally { loading = false; }
  }

  function openCreate() {
    editing = null;
    form = blankUser();
    userOpen = true;
  }

  function openEdit(account) {
    editing = account;
    form = {
      username: account.username, displayName: account.displayName, password: '', role: account.role,
      quotaGb: account.quotaBytes ? Math.round((account.quotaBytes / 1073741824) * 10) / 10 : 0,
      disabled: account.disabled, groupIds: [...(account.groupIds || [])],
    };
    userOpen = true;
  }

  async function saveUser() {
    saving = true;
    try {
      const quotaBytes = Math.round((Number(form.quotaGb) || 0) * 1073741824);
      if (editing) {
        const body = { displayName: form.displayName, role: form.role, quotaBytes, disabled: form.disabled, groupIds: form.groupIds };
        if (form.password) body.password = form.password;
        await patch(`/api/v1/users/${editing.id}`, body);
        notify('Konto aktualisiert.', 'success');
      } else {
        await post('/api/v1/users', {
          username: form.username, password: form.password, displayName: form.displayName || undefined,
          role: form.role, quotaBytes, groupIds: form.groupIds,
        });
        notify('Konto angelegt.', 'success');
      }
      userOpen = false;
      load();
    } catch (err) { notify(err.message, 'error'); } finally { saving = false; }
  }

  async function deleteUser(account) {
    const ok = await confirmAction({ title: `Konto „${account.username}“ löschen?`, description: 'Alle Dateien, Freigaben und Sitzungen dieses Kontos werden entfernt.', confirmLabel: 'Konto löschen', danger: true });
    if (!ok) return;
    try { await del(`/api/v1/users/${account.id}`); notify('Konto gelöscht.', 'success'); load(); } catch (err) { notify(err.message, 'error'); }
  }

  function toggleGroup(groupId) {
    form.groupIds = form.groupIds.includes(groupId) ? form.groupIds.filter((id) => id !== groupId) : [...form.groupIds, groupId];
  }

  async function createGroup() {
    if (!groupName.trim()) return;
    saving = true;
    try {
      await post('/api/v1/users/groups', { name: groupName.trim() });
      notify('Gruppe angelegt.', 'success');
      groupOpen = false;
      groupName = '';
      load();
    } catch (err) { notify(err.message, 'error'); } finally { saving = false; }
  }

  async function deleteGroup(group) {
    const ok = await confirmAction({ title: `Gruppe „${group.name}“ löschen?`, description: 'Mitglieder bleiben erhalten, verlieren aber die Gruppenzugehörigkeit.', confirmLabel: 'Gruppe löschen', danger: true });
    if (!ok) return;
    try { await del(`/api/v1/users/groups/${group.id}`); notify('Gruppe gelöscht.', 'success'); load(); } catch (err) { notify(err.message, 'error'); }
  }

  function groupNames(account) {
    return groups.filter((group) => account.groupIds?.includes(group.id)).map((group) => group.name);
  }
</script>

<div class="page page--wide">
  <header class="page-head">
    <div>
      <h1>Benutzer</h1>
      <p class="lede">Konten, Rollen, Kontingente und Gruppen für diese Instanz.</p>
    </div>
    <div class="page-actions">
      <Button variant="secondary" icon="users" onclick={() => { groupOpen = true; groupName = ''; }}>Neue Gruppe</Button>
      <Button variant="primary" icon="user-plus" onclick={openCreate}>Konto anlegen</Button>
    </div>
  </header>

  <div class="files-toolbar">
    <div class="segmented" role="group" aria-label="Ansicht">
      <button type="button" aria-pressed={tab === 'users'} on:click={() => (tab = 'users')}>Konten <span class="tag">{users.length}</span></button>
      <button type="button" aria-pressed={tab === 'groups'} on:click={() => (tab = 'groups')}>Gruppen <span class="tag">{groups.length}</span></button>
    </div>
  </div>

  {#if failed}
    <EmptyState icon="cloud-off" title="Benutzer konnten nicht geladen werden" text={failed} action={load} actionLabel="Erneut versuchen" />
  {:else if loading}
    <div class="table-wrap loading-block"><span class="skeleton"></span><span class="skeleton"></span><span class="skeleton"></span></div>
  {:else if tab === 'users'}
    <div class="table-wrap">
      <table class="table">
        <thead><tr><th>Konto</th><th>Rolle</th><th>Gruppen</th><th>Belegung</th><th>Zuletzt aktiv</th><th></th></tr></thead>
        <tbody>
          {#each users as account}
            <tr>
              <td>
                <div style="display:flex;align-items:center;gap:var(--space-3)">
                  <span class="avatar" aria-hidden="true">{(account.displayName || account.username).slice(0, 1).toUpperCase()}</span>
                  <div><strong style="font-weight:var(--weight-medium)">{account.displayName || account.username}</strong>{#if account.disabled}<span class="tag tag--warning" style="margin-left:var(--space-2)">Deaktiviert</span>{/if}<br /><span class="stat-foot">{account.username}{#if account.id === selfId} · du{/if}</span></div>
                </div>
              </td>
              <td><span class="tag">{account.role === 'admin' ? 'Administrator' : 'Mitglied'}</span></td>
              <td>{groupNames(account).join(', ') || '—'}</td>
              <td>
                <div class="quota-cell">
                  <span>{bytes(account.usedBytes)}{#if account.quotaBytes} von {bytes(account.quotaBytes)}{/if}</span>
                  {#if account.quotaBytes}
                    <ProgressBar value={account.usedBytes} max={account.quotaBytes} size="sm" tone={account.usedBytes / account.quotaBytes > 0.9 ? 'over' : 'brand'} label="Belegung" />
                  {/if}
                </div>
              </td>
              <td>{account.lastLoginAt ? relative(account.lastLoginAt) : 'nie'}</td>
              <td class="actions-cell">
                <IconButton name="pencil" label={`${account.username} bearbeiten`} onclick={() => openEdit(account)} />
                {#if account.id !== selfId}<IconButton name="trash-2" label={`${account.username} löschen`} onclick={() => deleteUser(account)} />{/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {:else}
    {#if !groups.length}
      <EmptyState icon="users" title="Noch keine Gruppen" text="Gruppen bündeln Konten – zum Beispiel für Teams oder Familien." action={() => { groupOpen = true; groupName = ''; }} actionLabel="Gruppe anlegen" />
    {:else}
      <div class="list-stack">
        {#each groups as group}
          <article class="row-card">
            <span class="file-icon file-icon--folder" aria-hidden="true"><Icon name="users" size={18} /></span>
            <div class="row-card__main">
              <h3>{group.name}</h3>
              <p>{group.members.length} {group.members.length === 1 ? 'Mitglied' : 'Mitglieder'} · {group.members.map((id) => users.find((account) => account.id === id)?.displayName || '—').join(', ') || 'niemand'}</p>
            </div>
            <Button variant="secondary" size="sm" icon="user-plus" onclick={() => { tab = 'users'; notify('Öffne ein Konto und wähle die Gruppe aus.', 'info'); }}>Zuweisen</Button>
            <IconButton name="trash-2" label={`Gruppe ${group.name} löschen`} onclick={() => deleteGroup(group)} />
          </article>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<Dialog open={userOpen} title={editing ? 'Konto bearbeiten' : 'Konto anlegen'} description={editing ? editing.username : 'Neue Personen erhalten eigene Dateien und ein eigenes Kontingent.'} onclose={() => (userOpen = false)}>
  {#if !editing}
    <Field label="Benutzername" id="user-username" required hint="Buchstaben, Zahlen, Punkt, Bindestrich, Unterstrich.">
      <input id="user-username" class="input" bind:value={form.username} autocomplete="off" />
    </Field>
  {/if}
  <Field label="Anzeigename" id="user-display">
    <input id="user-display" class="input" bind:value={form.displayName} autocomplete="off" />
  </Field>
  <Field label={editing ? 'Neues Passwort' : 'Passwort'} id="user-password" required={!editing} hint={editing ? 'Leer lassen, um das Passwort unverändert zu lassen.' : 'Mindestens 10 Zeichen.'}>
    <input id="user-password" class="input" type="password" bind:value={form.password} autocomplete="new-password" />
  </Field>
  <div class="field">
    <span class="field__label">Rolle</span>
    <select class="select" bind:value={form.role} aria-label="Rolle">
      <option value="user">Mitglied</option>
      <option value="admin">Administrator</option>
    </select>
  </div>
  <Field label="Kontingent" id="user-quota" hint="In Gigabyte. 0 bedeutet unbegrenzt.">
    <input id="user-quota" class="input" type="number" min="0" step="0.5" bind:value={form.quotaGb} />
  </Field>
  {#if groups.length}
    <div class="field">
      <span class="field__label">Gruppen</span>
      <div class="chip-row">
        {#each groups as group}
          <button type="button" class="chip" aria-pressed={form.groupIds.includes(group.id)} on:click={() => toggleGroup(group.id)}>{group.name}</button>
        {/each}
      </div>
    </div>
  {/if}
  {#if editing}
    <Switch bind:checked={form.disabled} label="Konto deaktivieren" description="Deaktivierte Konten können sich nicht anmelden." />
  {/if}
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (userOpen = false)}>Abbrechen</Button>
    <Button variant="primary" loading={saving} disabled={!editing && (!form.username.trim() || form.password.length < 10)} onclick={saveUser}>{editing ? 'Speichern' : 'Konto anlegen'}</Button>
  </svelte:fragment>
</Dialog>

<Dialog open={groupOpen} title="Neue Gruppe" size="sm" onclose={() => (groupOpen = false)}>
  <Field label="Name" id="group-name" required>
    <input id="group-name" class="input" bind:value={groupName} on:keydown={(event) => event.key === 'Enter' && createGroup()} />
  </Field>
  <svelte:fragment slot="footer">
    <Button variant="quiet" onclick={() => (groupOpen = false)}>Abbrechen</Button>
    <Button variant="primary" loading={saving} disabled={!groupName.trim()} onclick={createGroup}>Gruppe anlegen</Button>
  </svelte:fragment>
</Dialog>
