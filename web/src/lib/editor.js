import { Editor } from '@tiptap/core';
import { StarterKit } from '@tiptap/starter-kit';
import { Placeholder } from '@tiptap/extension-placeholder';
import { Table, TableRow, TableCell, TableHeader } from '@tiptap/extension-table';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { Highlight } from '@tiptap/extension-highlight';
import { CharacterCount } from '@tiptap/extension-character-count';
import { CodeBlockLowlight } from '@tiptap/extension-code-block-lowlight';
import { common, createLowlight } from 'lowlight';
import { Markdown } from 'tiptap-markdown';
import { OneboxEmbeds } from './embeds.js';

const lowlight = createLowlight(common);

/**
 * Erzeugt den TipTap-Editor für ein Onebox-Dokument.
 *
 * Markdown-Rundlauf über tiptap-markdown (GitHub-Dialekt), Schrägstrich-Menü
 * und Formatierungsleiste steuert die aufrufende Komponente über die
 * mitgelieferten Helfer.
 */
export function createDocumentEditor({ element, content = '', onChange, onSelection, readOnly = false, extensions = [] }) {
  const editor = new Editor({
    element,
    editable: !readOnly,
    content,
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        link: {
          openOnClick: false,
          autolink: true,
          protocols: ['http', 'https', 'mailto'],
          HTMLAttributes: { rel: 'noopener noreferrer nofollow', target: '_blank' },
        },
        codeBlock: false, // wird durch die farbige Variante ersetzt
      }),
      CodeBlockLowlight.configure({ lowlight, defaultLanguage: null }),
      Table.configure({ resizable: true, allowTableNodeSelection: true }),
      TableRow,
      TableHeader,
      TableCell,
      TaskList,
      TaskItem.configure({ nested: true }),
      Highlight.configure({ multicolor: false }),
      CharacterCount,
      Placeholder.configure({
        placeholder: ({ node }) => {
          if (node.type.name === 'heading') return 'Überschrift …';
          return 'Loslegen — mit „/“ für ein Menü, „#“ für eine Überschrift …';
        },
      }),
      Markdown.configure({
        html: false,        // rohes HTML nie übernehmen
        linkify: true,
        breaks: false,
        tightLists: true,
        transformPastedText: true,
        transformCopiedText: false,
      }),
      OneboxEmbeds,
      // Kollaboration zuletzt: ProseMirror-Plugins werden nur bei der
      // Erstellung des Editors aufgebaut — setOptions reicht nicht.
      ...extensions,
    ],
    editorProps: {
      attributes: {
        class: 'doc-prose',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Dokumenttext',
        spellcheck: 'true',
      },
      handlePaste(view, event) {
        // Bilder aus der Zwischenablage direkt einfügen (handled vom Aufrufer
        // über das Custom-Event; hier nur Text/HTML normal weiterreichen).
        const files = [...(event.clipboardData?.files || [])].filter((f) => f.type.startsWith('image/'));
        if (files.length) {
          event.preventDefault();
          window.dispatchEvent(new CustomEvent('onebox:paste-images', { detail: { files } }));
          return true;
        }
        return false;
      },
    },
    onUpdate({ editor: e }) {
      onChange?.(e);
    },
    onSelectionUpdate({ editor: e }) {
      onSelection?.(e);
    },
  });

  return editor;
}

/** Markdown-Quelltext in den Editor setzen (Umschalter). */
export function setMarkdown(editor, markdown) {
  editor.commands.setContent(markdown, { emitUpdate: false });
}

/** Aktuellen Inhalt als Markdown lesen. */
export function getMarkdown(editor) {
  return editor?.storage?.markdown?.getMarkdown?.() ?? '';
}
