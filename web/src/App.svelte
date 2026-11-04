<script>
  import { onMount, tick } from 'svelte';
  import { route, navigate, startRouter } from './lib/router.js';
  import { user, toasts, uploadsOpen } from './lib/stores.js';
  import { get, post, patch } from './lib/api.js';
  import { bytes } from './lib/format.js';
  import Icon from './components/Icon.svelte';
  import IconButton from './components/IconButton.svelte';
  import BottomLayer from './components/BottomLayer.svelte';
  import ConfirmHost from './components/ConfirmHost.svelte';
  import Login from './views/Login.svelte';
  import Setup from './views/Setup.svelte';
  import Dashboard from './views/Dashboard.svelte';
  import Files from './views/Files.svelte';
  import Document from './views/Document.svelte';
  import Trash from './views/Trash.svelte';
  import Shared from './views/Shared.svelte';
  import Photos from './views/Photos.svelte';
  import Backups from './views/Backups.svelte';
  import Storage from './views/Storage.svelte';
  import Users from './views/Users.svelte';
  import Settings from './views/Settings.svelte';
  import PublicShare from './views/PublicShare.svelte';
  import UploadRequest from './views/UploadRequest.svelte';
  import NotFound from './views/NotFound.svelte';

  let boot = 'loading';
  let navOpen = false;
  let accountOpen = false;
  let searchQuery = '';
  let searchResults = [];
  let searchBusy = false;
  let searchTimer = null;
  let theme = document.documentElement.dataset.theme || 'dark';
  let logoClicks = 0;

  const nav = [
    { label: 'Übersicht', icon: 'layout-dashboard', href: '/' },
    { label: 'Dateien', icon: 'folder', href: '/files' },
    { label: 'Fotos', icon: 'image', href: '/photos' },
    { label: 'Freigaben', icon: 'link', href: '/shared' },
    { label: 'Chat', icon: 'message-circle', href: '/chat' },
  ];

  const adminNav = [
    { label: 'Backups', icon: 'database-backup', href: '/backups' },
    { label: 'Speicher', icon: 'hard-drive', href: '/storage' },
    { label: 'Benutzer', icon: 'users', href: '/users' },
    { label: 'Einstellungen', icon: 'settings', href: '/settings' },
  ];

  const publicRoute = ['public-share', 'upload-request'];

  $: isPublic = publicRoute.includes($route.name);
  $: active = $route.name;

  onMount(() => {
    startRouter();
    bootstrap();
    const unauthorized = () => {
      user.set(null);
      boot = 'guest';
      if (!$route.name.startsWith('public')) navigate('/login', { replace: true });
    };
    window.addEventListener('onebox:unauthorized', unauthorized);
    const onKey = (event) => {
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName) || event.target?.isContentEditable;
      if (event.key === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        document.querySelector('#global-search')?.focus();
      } else if (event.key === '/' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) {
        event.preventDefault();
        document.querySelector('#global-search')?.focus();
      }
      if (event.key === 'Escape') {
        searchResults = [];
        accountOpen = false;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('onebox:unauthorized', unauthorized);
      window.removeEventListener('keydown', onKey);
    };
  });

  async function bootstrap() {
    try {
      const setup = await get('/api/v1/system/setup');
      if (setup.needsSetup) {
        boot = 'setup';
        return;
      }
      const me = await get('/api/v1/auth/me');
      user.set(me.user);
      applyTheme(me.settings?.theme || theme);
      boot = 'ready';
      if (['login', 'setup'].includes($route.name)) navigate('/', { replace: true });
    } catch {
      boot = 'guest';
    }
  }

  function applyTheme(next) {
    theme = next === 'light' ? 'light' : 'dark';
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    try { localStorage.setItem('onebox-theme', theme); } catch {}
  }

  async function toggleTheme() {
    applyTheme(theme === 'dark' ? 'light' : 'dark');
    if (boot === 'ready') {
      try { await patch('/api/v1/settings', { theme }); } catch {}
    }
  }

  function signedIn(account) {
    user.set(account);
    boot = 'ready';
    navigate('/', { replace: true });
  }

  async function logout() {
    try { await post('/api/v1/auth/logout', {}); } catch {}
    user.set(null);
    accountOpen = false;
    boot = 'guest';
    navigate('/login', { replace: true });
  }

  function onSearchInput() {
    clearTimeout(searchTimer);
    const query = searchQuery.trim();
    if (!query) { searchResults = []; return; }
    searchBusy = true;
    searchTimer = setTimeout(async () => {
      try {
        const data = await get(`/api/v1/files/search?q=${encodeURIComponent(query)}`);
        searchResults = data.items;
      } catch { searchResults = []; } finally { searchBusy = false; }
    }, 220);
  }

  function openResult(item) {
    searchResults = [];
    searchQuery = '';
    if (item.kind === 'folder') navigate(`/files/${item.id}`);
    else navigate(item.parentId ? `/files/${item.parentId}?preview=${item.id}` : `/files?preview=${item.id}`);
  }

  function secretLogo() {
    logoClicks += 1;
    if (logoClicks >= 5) {
      logoClicks = 0;
      document.documentElement.classList.toggle('is-xray');
    }
    setTimeout(() => { logoClicks = 0; }, 1500);
  }

  $: if (boot === 'ready' && ['login', 'setup'].includes($route.name)) navigate('/', { replace: true });
</script>

{#if isPublic}
  {#if $route.name === 'public-share'}
    <PublicShare token={$route.token} />
  {:else}
    <UploadRequest token={$route.token} />
  {/if}
{:else if boot === 'loading'}
  <div class="boot-screen" aria-busy="true" aria-label="Onebox wird geladen">
    <span class="brand-mark">ob</span>
    <span class="boot-name">Onebox</span>
  </div>
{:else if boot === 'setup'}
  <Setup ondone={signedIn} />
{:else if boot === 'guest'}
  <Login onsuccess={signedIn} />
{:else}
  <div class="app" data-nav={navOpen ? 'open' : 'closed'}>
    <a class="skip-link" href="#main">Zum Inhalt springen</a>

    <aside class="sidebar-app" aria-label="Hauptnavigation">
      <div class="brand-row">
        <button type="button" class="brand-mark" aria-label="Onebox" on:click={secretLogo}>ob</button>
        <div>
          <span class="brand-name">Onebox</span>
          <span class="brand-sub">Deine Cloud</span>
        </div>
      </div>
      <nav class="side-nav" aria-label="Bereiche">
        <p class="side-label">Arbeitsbereich</p>
        {#each nav as item}
          <a class="side-link" href={item.href} data-route aria-current={active === (item.href === '/' ? 'dashboard' : item.href.slice(1)) ? 'page' : undefined} on:click={() => (navOpen = false)}>
            <Icon name={item.icon} size={20} /><span>{item.label}</span>
          </a>
        {/each}
        <a class="side-link" href="/files/trash" data-route aria-current={active === 'trash' ? 'page' : undefined} on:click={() => (navOpen = false)}>
          <Icon name="trash-2" size={20} /><span>Papierkorb</span>
        </a>
        <p class="side-label">Verwaltung</p>
        {#each adminNav as item}
          {#if item.href !== '/users' || $user?.role === 'admin'}
            <a class="side-link" href={item.href} data-route aria-current={active === item.href.slice(1) ? 'page' : undefined} on:click={() => (navOpen = false)}>
              <Icon name={item.icon} size={20} /><span>{item.label}</span>
            </a>
          {/if}
        {/each}
      </nav>
      <div class="side-foot">
        <button type="button" class="user-button" aria-expanded={accountOpen} aria-haspopup="menu" on:click={() => (accountOpen = !accountOpen)}>
          <span class="avatar" aria-hidden="true">{($user?.displayName || $user?.username || '?').slice(0, 1).toUpperCase()}</span>
          <span class="user-meta">
            <strong>{$user?.displayName || $user?.username}</strong>
            <small>{$user?.role === 'admin' ? 'Administrator' : 'Mitglied'}</small>
          </span>
          <Icon name="chevrons-up-down" size={15} />
        </button>
        {#if accountOpen}
          <div class="menu-pop" role="menu" style="left:var(--space-3);right:var(--space-3);bottom:4.5rem;position:fixed;">
            <a class="menu-item" role="menuitem" href="/settings" data-route on:click={() => (accountOpen = false)}><Icon name="user" size={16} />Profil & Einstellungen</a>
            <button class="menu-item" role="menuitem" on:click={toggleTheme}><Icon name={theme === 'dark' ? 'sun' : 'moon'} size={16} />{theme === 'dark' ? 'Helles Design' : 'Dunkles Design'}</button>
            <div class="menu-sep"></div>
            <button class="menu-item menu-item--danger" role="menuitem" on:click={logout}><Icon name="log-out" size={16} />Abmelden</button>
          </div>
        {/if}
      </div>
    </aside>

    <div class="main-app">
      <header class="topbar-app">
        <span class="menu-mobile"><IconButton name="menu" label="Navigation öffnen" onclick={() => (navOpen = !navOpen)} /></span>
        <div class="top-search">
          <Icon name="search" size={16} />
          <label class="sr-only" for="global-search">Dateien durchsuchen</label>
          <input id="global-search" class="input" type="search" placeholder="Suchen …" bind:value={searchQuery} on:input={onSearchInput} autocomplete="off" />
          {#if searchQuery}
            <div class="menu-pop search-pop" role="listbox" aria-label="Suchergebnisse">
              {#if searchBusy}
                <p class="menu-note">Suche läuft …</p>
              {:else if !searchResults.length}
                <p class="menu-note">Keine Treffer für „{searchQuery}“.</p>
              {:else}
                {#each searchResults as item}
                  <button class="menu-item" role="option" aria-selected="false" on:click={() => openResult(item)}>
                    <Icon name={item.kind === 'folder' ? 'folder' : 'file'} size={16} />
                    <span class="grow-ellipsis">{item.name}</span>
                    <small>{item.kind === 'folder' ? 'Ordner' : bytes(item.size)}</small>
                  </button>
                {/each}
              {/if}
            </div>
          {/if}
        </div>
        <span class="spacer"></span>
        <button class="btn btn--secondary btn--sm" type="button" on:click={() => ($uploadsOpen = true)}>
          <Icon name="upload" size={16} /> <span class="label-wide">Hochladen</span>
        </button>
        <IconButton name={theme === 'dark' ? 'sun' : 'moon'} label={theme === 'dark' ? 'Helles Design einschalten' : 'Dunkles Design einschalten'} onclick={toggleTheme} />
      </header>

      <main class="app-view" id="main">
        {#if active === 'dashboard'}
          <Dashboard />
        {:else if active === 'files'}
          <Files folderId={$route.folderId} />
        {:else if active === 'doc'}
          <Document docId={$route.docId} />
        {:else if active === 'trash'}
          <Trash />
        {:else if active === 'shared'}
          <Shared />
        {:else if active === 'photos'}
          <Photos />
        {:else if active === 'backups'}
          <Backups />
        {:else if active === 'storage'}
          <Storage />
        {:else if active === 'users'}
          <Users />
        {:else if active === 'settings'}
          <Settings />
        {:else}
          <NotFound />
        {/if}
      </main>

      <nav class="bottom-nav" aria-label="Schnellzugriff">
        <a href="/" data-route aria-current={active === 'dashboard' ? 'page' : undefined}><Icon name="layout-dashboard" size={18} /><span>Start</span></a>
        <a href="/files" data-route aria-current={active === 'files' ? 'page' : undefined}><Icon name="folder" size={18} /><span>Dateien</span></a>
        <a href="/photos" data-route aria-current={active === 'photos' ? 'page' : undefined}><Icon name="image" size={18} /><span>Fotos</span></a>
        <a href="/shared" data-route aria-current={active === 'shared' ? 'page' : undefined}><Icon name="link" size={18} /><span>Links</span></a>
        <button type="button" on:click={() => ($uploadsOpen = true)}><Icon name="upload" size={18} /><span>Upload</span></button>
      </nav>
    </div>
  </div>
  <BottomLayer />
{/if}

<ConfirmHost />
