import DOMPurify, { type Config } from 'dompurify';
import { Marked } from 'marked';
import type { Task } from '../api';
import { editorJsToHtml, isEditorJsJson } from './editorjs';

/** How a description or comment body is stored. */
export type RichTextFormat = NonNullable<Task['descriptionFormat']>;

/**
 * flux-web's renderer policy (`sanitizer-policy.ts`), which mirrors the
 * backend's sanitizer: the Editor.js output's tags and attributes, no
 * scripts, frames, forms or inline styles, and only web, mail and phone
 * links.
 */
const POLICY: Config = {
  ADD_ATTR: [
    'checked',
    'disabled',
    'rel',
    'data-upload-id',
    'data-account-id',
    'data-checked',
    'data-variant',
    'class',
    'colspan',
    'rowspan',
  ],
  ADD_TAGS: [
    'figure',
    'figcaption',
    'cite',
    'aside',
    'details',
    'summary',
    'section',
  ],
  ALLOWED_URI_REGEXP:
    /^(?:(?:https?|mailto|tel|callto|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i,
  FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
  FORBID_ATTR: ['style'],
};

const markdown = new Marked({ gfm: true, breaks: true });

/**
 * Lazily made, so importing this module needs no DOM. Its own instance, so
 * the link hook below never leaks into another DOMPurify user.
 */
let purifier: ReturnType<typeof DOMPurify> | undefined;

function purify(): ReturnType<typeof DOMPurify> {
  if (!purifier) {
    purifier = DOMPurify(window);
    // A link must leave the app for the system browser, never replace the
    // WebView's page.
    purifier.addHook('afterSanitizeAttributes', (node) => {
      if (node.tagName === 'A' && node.hasAttribute('href')) {
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener noreferrer');
      }
    });
  }
  return purifier;
}

/** Safe HTML for showing with `innerHTML`: the only output to bind. */
export function sanitizeHtml(html: string): string {
  return purify().sanitize(html, POLICY);
}

/**
 * Markdown as HTML, with flux-web's `@First Last` mentions wrapped in
 * `span.mention`. Markdown bodies carry no account ids, so that is all a
 * mention can be.
 */
export function markdownToHtml(source: string): string {
  const html = markdown.parse(source, { async: false });
  return html.replace(
    /@([A-Z][a-z]+(?:\s[A-Z][a-z]+)+)/g,
    '<span class="mention">@$1</span>'
  );
}

/**
 * A stored description or comment body as sanitized HTML, as flux-web shows
 * it: Editor.js JSON (detected by content too, since older rows say
 * MARKDOWN), HTML, or Markdown.
 */
export function renderRichText(
  body: string | null | undefined,
  format: RichTextFormat | undefined
): string {
  if (!body?.trim()) {
    return '';
  }
  let html: string;
  if (isEditorJsJson(body)) {
    html = editorJsToHtml(body);
  } else if (format === 'HTML' || format === 'EDITORJS') {
    html = body;
  } else {
    html = markdownToHtml(body);
  }
  return sanitizeHtml(html);
}
