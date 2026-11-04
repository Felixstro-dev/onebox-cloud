import MarkdownIt from 'markdown-it';
import TurndownService from 'turndown';
import DOMPurify from 'dompurify';

/**
 * Markdown-Rundlauf: .md -> HTML -> Editor -> HTML -> .md
 *
 * GitHub-Dialekt: Tabellen, Aufgabenlisten, Durchstreichen, Fußnoten,
 * Links automatisch erkennen. Alles Eingehende wird bereinigt —
 * kein rohes HTML, keine Skripte, keine javascript:-Links.
 */

const md = new MarkdownIt({
  html: false,          // rohes HTML nie übernehmen
  linkify: true,
  typographer: false,
  breaks: false,
  highlight: null,
});

// Aufgabenlisten (GitHub-Syntax "- [ ]" / "- [x]")
md.core.ruler.after('inline', 'tasklist', (state) => {
  const tokens = state.tokens;
  for (let i = 0; i < tokens.length; i += 1) {
    if (tokens[i].type !== 'inline') continue;
    const content = tokens[i].content;
    if (!/^\[[ xX]\]\s+/.test(content)) continue;
    const checked = /^\[[xX]\]/.test(content);
    // Nur wenn der Vorgänger ein Listenitem ist.
    const prev = tokens[i - 1];
    const prevPrev = tokens[i - 2];
    if (!prev || prev.type !== 'list_item_open') continue;
    if (prevPrev && prevPrev.type === 'paragraph_open') prevPrev.hidden = true;
    prev.attrSet('class', 'task-item');
    prev.attrSet('data-checked', checked ? 'true' : 'false');
    tokens[i].content = content.replace(/^\[[ xX]\]\s+/, '');
    // Ersetze den flachen Text durch Checkbox + Text.
    const children = tokens[i].children || [];
    if (children.length && children[0].type === 'text') {
      children[0].content = children[0].content.replace(/^\[[ xX]\]\s+/, '');
    }
    tokens[i].children = children;
  }
});

// Tabellen-Unterstützung aktivieren.
md.enable(['table']);

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  fence: '```',
  emDelimiter: '*',
  strongDelimiter: '**',
});

turndown.remove(['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button']);
turndown.addRule('taskListItem', {
  filter: (node) => node.nodeName === 'LI' && node.classList?.contains('task-item'),
  replacement: (content, node) => {
    const checked = node.getAttribute('data-checked') === 'true';
    return `- [${checked ? 'x' : ' '}] ${content.trim()}\n`;
  },
});
turndown.addRule('imageEmbed', {
  filter: 'img',
  replacement: (content, node) => {
    const src = node.getAttribute('src') || '';
    const alt = node.getAttribute('alt') || '';
    return `![${alt}](${src})`;
  },
});

/** HTML bereinigen: keine Skripte, keine Ereignis-Attribute, keine javascript:-Links. */
export function sanitize(html) {
  if (typeof window === 'undefined') return '';
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['script', 'style', 'iframe', 'object', 'embed', 'form', 'input', 'button', 'link', 'meta'],
    FORBID_ATTR: ['style', 'onerror', 'onclick', 'onload', 'onmouseover', 'srcdoc'],
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel|blob|data):|[^a-z]|[a-z+.-]+(?:[^a-z+.:-]|$))/i,
    addTags: ['input'],
    allowUnknownTags: false,
  });
}

/** Markdown -> bereinigtes HTML (für die Vorschau / den Export). */
export function markdownToHtml(source) {
  const raw = md.render(String(source || ''));
  return sanitize(raw);
}

/** Editor-HTML -> Markdown. */
export function htmlToMarkdown(html) {
  return turndown.turndown(String(html || '')).replace(/\n{3,}/g, '\n\n').trim() + '\n';
}

/** Prüft, ob ein String nach dem Rundlauf stabil ist (für die Tests). */
export function roundtrip(markdown) {
  return htmlToMarkdown(markdownToHtml(markdown));
}

/**
 * Bereinigt eingehenden HTML-Text (Einfügen aus Zwischenablage,
 * Import aus .html) und wandelt ihn in Markdown um.
 */
export function cleanHtmlToMarkdown(html) {
  return htmlToMarkdown(sanitize(html));
}

/** Nur-Text-Export. */
export function markdownToText(source) {
  return String(source || '')
    .replace(/```[\s\S]*?```/g, (block) => block.replace(/```\w*\n?/g, '').replace(/```$/, ''))
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .replace(/^\s*\d+\.\s+/gm, '• ')
    .replace(/^\s*>\s+/gm, '')
    .replace(/^\s*\|.*\|\s*$/gm, (line) => line.replace(/\|/g, '  ').replace(/\s{2,}/g, '  '))
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Erkennt Onebox-Dateiverweise im Markdown: [Name](onebox://file/<id>) */
export function extractFileRefs(source) {
  const refs = new Set();
  const re = /\]\((?:onebox:\/\/file\/|\/api\/v1\/files\/)([a-z0-9-]+)(?:\/[^)]*)?\)/gi;
  let match = re.exec(String(source || ''));
  while (match) {
    refs.add(match[1]);
    match = re.exec(String(source || ''));
  }
  return [...refs];
}

export { md as markdownParser, turndown as turndownService };
