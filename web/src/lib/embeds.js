import { Node, mergeAttributes } from '@tiptap/core';

/**
 * Einbettungen für Onebox-Dokumente (Phase 8e).
 *
 * Alle Nodes speichern nur eine Kennung (ID), nie einen Namen oder eine
 * Größe — das rendert der Server bei jedem Aufruf neu. So kann niemand
 * über ein Dokument erfahren, was ihm nicht gehört, und Umbenennen oder
 * Verschieben bricht keine Verweise.
 */

/** Eine Onebox-Datei als Karte. */
export const FileCard = Node.create({
  name: 'oneboxFile',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      // Nur IDs und neutrale Anzeige-Attribute — kein Name, keine Größe.
      id: { default: null },
      mime: { default: '' },
      // Angezeigter Name ist der zuletzt vom Server freigegebene.
      label: { default: '' },
      // true, wenn der Server beim letzten Rendern "nicht verfügbar" meldete.
      unavailable: { default: 'false' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-onebox-file]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const unavailable = HTMLAttributes.unavailable === 'true';
    const label = unavailable ? 'Datei nicht verfügbar' : (HTMLAttributes.label || 'Datei');
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-onebox-file': HTMLAttributes.id || '',
      class: `onebox-embed onebox-embed--file${unavailable ? ' is-unavailable' : ''}`,
      'data-unavailable': unavailable ? 'true' : 'false',
    }), [
      ['span', { class: 'onebox-embed__icon', 'aria-hidden': 'true' }, unavailable ? '×' : '⌁'],
      ['span', { class: 'onebox-embed__body' }, [
        ['span', { class: 'onebox-embed__title' }, label],
        ['span', { class: 'onebox-embed__meta' }, unavailable ? 'Kein Zugriff' : 'Onebox-Datei'],
      ]],
    ]];
  },

  addNodeView() {
    return ({ node, editor }) => {
      const dom = document.createElement('div');
      const render = () => {
        const unavailable = node.attrs.unavailable === 'true';
        dom.className = `onebox-embed onebox-embed--file${unavailable ? ' is-unavailable' : ''}`;
        dom.setAttribute('data-onebox-file', node.attrs.id || '');
        dom.setAttribute('data-unavailable', unavailable ? 'true' : 'false');
        dom.setAttribute('contenteditable', 'false');
        dom.innerHTML = '';
        const icon = document.createElement('span');
        icon.className = 'onebox-embed__icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = unavailable ? '×' : '⌁';
        const body = document.createElement('span');
        body.className = 'onebox-embed__body';
        const title = document.createElement('span');
        title.className = 'onebox-embed__title';
        // Ohne Berechtigung weder Name noch Größe zeigen.
        title.textContent = unavailable ? 'Datei nicht verfügbar' : (node.attrs.label || 'Datei');
        const meta = document.createElement('span');
        meta.className = 'onebox-embed__meta';
        meta.textContent = unavailable ? 'Kein Zugriff' : 'Onebox-Datei';
        body.append(title, meta);
        dom.append(icon, body);
        dom.onclick = () => {
          if (unavailable || !node.attrs.id || editor.isEditable === false) return;
          window.dispatchEvent(new CustomEvent('onebox:open-file', { detail: { id: node.attrs.id } }));
        };
      };
      render();
      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) return false;
          node = updatedNode;
          render();
          return true;
        },
      };
    };
  },
});

/** Externes Video: erst nach Klick laden (keine vorherige Verbindung). */
export const VideoEmbed = Node.create({
  name: 'oneboxVideo',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      src: { default: '' },
      provider: { default: '' },
      poster: { default: '' },
      allowed: { default: 'true' },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-onebox-video]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, {
      'data-onebox-video': HTMLAttributes.src || '',
      class: 'onebox-embed onebox-embed--video',
    }), ['span', { class: 'onebox-embed__title' }, `Video: ${HTMLAttributes.provider || 'Extern'}`]];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      let loaded = false;

      const allowed = () => node.attrs.allowed !== 'false';

      const render = () => {
        dom.className = 'onebox-embed onebox-embed--video';
        dom.setAttribute('data-onebox-video', node.attrs.src || '');
        dom.setAttribute('contenteditable', 'false');
        dom.innerHTML = '';

        if (!allowed()) {
          dom.classList.add('is-unavailable');
          dom.innerHTML = '<span class="onebox-embed__title">Anbieter nicht erlaubt</span>';
          return;
        }

        if (loaded) {
          // Erst jetzt baut der Browser die Verbindung auf.
          const frame = document.createElement('iframe');
          frame.src = node.attrs.src;
          frame.title = 'Eingebettetes Video';
          frame.loading = 'lazy';
          frame.referrerPolicy = 'no-referrer';
          frame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-presentation');
          frame.setAttribute('allow', 'fullscreen; encrypted-media');
          frame.className = 'onebox-embed__frame';
          dom.append(frame);
          return;
        }

        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'onebox-embed__play';
        button.innerHTML = '<span aria-hidden="true">▶</span> Zum Abspielen laden';
        button.title = 'Verbindung erst jetzt herstellen';
        button.onclick = () => { loaded = true; render(); };
        dom.append(button);

        const label = document.createElement('span');
        label.className = 'onebox-embed__title';
        label.textContent = node.attrs.provider ? `Video von ${node.attrs.provider}` : 'Externes Video';
        dom.append(label);
      };

      render();
      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type !== node.type) return false;
          node = updatedNode;
          render();
          return true;
        },
      };
    };
  },
});

/** Hinweisbox: Info, Warnung, Tipp. */
export const HintBox = Node.create({
  name: 'oneboxHint',
  group: 'block',
  content: 'block+',
  defining: true,

  addAttributes() {
    return { kind: { default: 'info' } };
  },

  parseHTML() {
    return [{ tag: 'aside[data-onebox-hint]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['aside', mergeAttributes(HTMLAttributes, {
      'data-onebox-hint': HTMLAttributes.kind || 'info',
      class: `onebox-hint onebox-hint--${HTMLAttributes.kind || 'info'}`,
    }), 0];
  },
});

/** Seiten-Link mit Anker für Rückverweise. */
export const PageLink = Node.create({
  name: 'oneboxPageLink',
  inline: true,
  group: 'inline',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      id: { default: null },
      label: { default: '' },
      unavailable: { default: 'false' },
    };
  },

  parseHTML() {
    return [{ tag: 'a[data-onebox-page]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const label = HTMLAttributes.unavailable === 'true' ? 'nicht verfügbar' : (HTMLAttributes.label || 'Seite');
    return ['a', mergeAttributes(HTMLAttributes, {
      'data-onebox-page': HTMLAttributes.id || '',
      class: 'onebox-pagelink',
      href: HTMLAttributes.id ? `/doc/${HTMLAttributes.id}` : '#',
      'data-route': '',
    }), label];
  },
});

export const OneboxEmbeds = [FileCard, VideoEmbed, HintBox, PageLink];

/**
 * Prüft eingehenden HTML-Import: keine Skripte, keine Ereignis-Attribute,
 * keine javascript:-Links. Wird vom Import und vom Paste-Handler genutzt.
 */
export function assertSafeHtml(html) {
  const forbidden = /<\s*(script|style|iframe|object|embed|form|link|meta)\b|on[a-z]+\s*=|javascript\s*:/i;
  return !forbidden.test(String(html || ''));
}
