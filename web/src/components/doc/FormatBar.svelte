<script>
  import { onMount, createEventDispatcher } from 'svelte';
  import IconButton from '../IconButton.svelte';

  export let editor = null;
  export let x = 0;
  export let y = 0;

  const dispatch = createEventDispatcher();

  let tick = 0;

  // Der Editor informiert uns über jede Transaktion — dann neu rendern.
  onMount(() => {
    if (!editor) return;
    const update = () => { tick += 1; };
    editor.on('transaction', update);
    return () => editor.off('transaction', update);
  });

  function run(name, attrs) {
    if (!editor) return;
    const chain = editor.chain().focus();
    if (attrs !== undefined) chain[name](attrs);
    else chain[name]();
    chain.run();
    tick += 1;
  }

  function setLink() {
    const previous = editor.getAttributes('link').href || 'https://';
    const href = window.prompt('Link-Adresse:', previous);
    if (href === null) return;
    if (href === '') { run('unsetLink'); return; }
    if (!/^(https?:|mailto:|tel:|#|\/)/i.test(href)) {
      window.alert('Nur http, https, mailto, tel, Anker und interne Pfade sind erlaubt.');
      return;
    }
    run('setLink', { href });
  }
</script>

<div class="format-bar" style="left:{x}px;top:{y}px" role="toolbar" aria-label="Formatierung" data-tick={tick}>
  <IconButton name="bold" label="Fett" active={editor?.isActive('bold')} onclick={() => run('toggleBold')} />
  <IconButton name="italic" label="Kursiv" active={editor?.isActive('italic')} onclick={() => run('toggleItalic')} />
  <IconButton name="underline" label="Unterstrichen" active={editor?.isActive('underline')} onclick={() => run('toggleUnderline')} />
  <IconButton name="strikethrough" label="Durchgestrichen" active={editor?.isActive('strike')} onclick={() => run('toggleStrike')} />
  <span class="format-bar__sep" role="separator"></span>
  <IconButton name="heading-1" label="Überschrift 1" active={editor?.isActive('heading', { level: 1 })} onclick={() => run('toggleHeading', { level: 1 })} />
  <IconButton name="heading-2" label="Überschrift 2" active={editor?.isActive('heading', { level: 2 })} onclick={() => run('toggleHeading', { level: 2 })} />
  <IconButton name="code" label="Code" active={editor?.isActive('code')} onclick={() => run('toggleCode')} />
  <IconButton name="link" label="Link" active={editor?.isActive('link')} onclick={setLink} />
  <span class="format-bar__sep" role="separator"></span>
  <IconButton name="list" label="Liste" active={editor?.isActive('bulletList')} onclick={() => run('toggleBulletList')} />
  <IconButton name="list-ordered" label="Nummerierte Liste" active={editor?.isActive('orderedList')} onclick={() => run('toggleOrderedList')} />
  <IconButton name="quote" label="Zitat" active={editor?.isActive('blockquote')} onclick={() => run('toggleBlockquote')} />
  <span class="format-bar__sep" role="separator"></span>
  <IconButton name="message-square" label="Auswahl kommentieren" onclick={() => dispatch('comment')} />
</div>
