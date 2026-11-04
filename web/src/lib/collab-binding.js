import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { ySyncPlugin, yCursorPlugin, yUndoPlugin, ySyncPluginKey, absolutePositionToRelativePosition } from 'y-prosemirror';

/**
 * Bindet den TipTap-Editor an ein Yjs-Dokument.
 *
 * - ySyncPlugin: gemeinsames Datenmodell (CRDT, keine Konflikte)
 * - yCursorPlugin: farbige Cursor und Auswahlmarkierung anderer Personen
 * - yUndoPlugin: Undo/Redo über den geteilten Verlauf hinweg
 * - EditableLock: letzte Instanz für „darf dieser Nutzer schreiben?“
 *   (ySyncPlugin stellt ebenfalls eine editable-Regel bereit; diese hier
 *   steht in der Plugin-Reihenfolge danach und gewinnt.)
 */
export const CollabBinding = Extension.create({
  name: 'oneboxCollab',

  addOptions() {
    return {
      fragment: null,
      awareness: null,
      writable: true,
    };
  },

  addProseMirrorPlugins() {
    const { fragment, awareness, writable } = this.options;
    if (!fragment) return [];

    const editor = this.editor;
    const plugins = [ySyncPlugin(fragment)];

    if (awareness) {
      plugins.push(yCursorPlugin(awareness));
    }

    plugins.push(yUndoPlugin());

    plugins.push(new Plugin({
      key: new PluginKey('oneboxEditableLock'),
      props: {
        // Zusammen von Berechtigung (statisch) und Lesemodus (dynamisch).
        editable: () => writable && editor.options.editable,
      },
    }));

    return plugins;
  },
});

/**
 * Aktualisiert die eigene Cursor-Position im Awareness-Block.
 * Yjs arbeitet mit relativen Positionen, damit der Cursor mitwandert,
 * wenn andere Personen darüber schreiben.
 */
export function publishCursor(editor, awareness, from, to) {
  if (!editor || !awareness) return;
  const sync = ySyncPluginKey.getState(editor.state);
  if (!sync || !sync.binding || sync.binding.mapping.size === 0) return;
  try {
    const anchor = absolutePositionToRelativePosition(from, sync.type, sync.binding.mapping);
    const head = absolutePositionToRelativePosition(to, sync.type, sync.binding.mapping);
    awareness.setLocalStateField('cursor', { anchor, head });
  } catch {
    // Position außerhalb des Mappings: lieber gar keinen Cursor als einen falschen.
  }
}

/** Setzt den Awareness-Cursor zurück (kein Text ausgewählt). */
export function clearCursor(awareness) {
  if (!awareness) return;
  awareness.setLocalStateField('cursor', null);
}
