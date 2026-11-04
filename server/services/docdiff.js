import { diffLines, diffWordsWithSpace } from 'diff';

/**
 * Liefert eine Zeilen-Differenz zwischen zwei Fassungen.
 * Ergebnis: Liste von Blöcken { value, added?, removed? } plus Zähler.
 */
export function docDiff(from, to) {
  const blocks = diffLines(from || '', to || '');
  let added = 0;
  let removed = 0;
  const lines = [];

  for (const block of blocks) {
    const count = block.count ?? block.value.split('\n').length;
    if (block.added) added += count;
    else if (block.removed) removed += count;

    lines.push({
      value: block.value,
      added: !!block.added,
      removed: !!block.removed,
      count,
    });
  }

  return { blocks: lines, added, removed, identical: !added && !removed };
}

/** Wortgenaue Diff für kurze Texte (z. B. Kommentar-Änderungen). */
export function wordDiff(from, to) {
  const parts = diffWordsWithSpace(from || '', to || '');
  return parts.map((part) => ({ value: part.value, added: !!part.added, removed: !!part.removed }));
}

/** Einfacher Review-Report: welche Version wurde wann von wem erstellt. */
export function versionReport(versions, current) {
  return {
    count: versions.length,
    latest: versions[0] || null,
    hasCurrent: typeof current === 'string' && current.length > 0,
  };
}
