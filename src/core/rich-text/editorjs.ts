// Editor.js JSON (what flux-web's editors save) to HTML, trimmed from
// flux-web's `json-to-html.ts`. Block text fields already hold inline HTML
// (bold, code, mention spans), so they are emitted as they are: the output
// must go through `sanitizeHtml` before it is shown. Only plain-text values
// (code, attributes) are escaped here.

type Block = { type?: string; data?: Data };
// Block data is whatever the editor plugin saved: read defensively.
type Data = Record<string, unknown>;

/** Whether `value` is Editor.js output: a JSON object with a `blocks` array. */
export function isEditorJsJson(value: string | null | undefined): boolean {
  return parseBlocks(value) !== null;
}

/** The blocks as HTML; '' for anything that isn't Editor.js JSON. */
export function editorJsToHtml(value: string | null | undefined): string {
  return (parseBlocks(value) ?? [])
    .filter((block) => !isBlank(block))
    .map(renderBlock)
    .join('\n');
}

function parseBlocks(value: string | null | undefined): Block[] | null {
  const trimmed = value?.trim();
  if (!trimmed?.startsWith('{')) {
    return null;
  }
  try {
    const parsed = JSON.parse(trimmed) as { blocks?: unknown };
    return Array.isArray(parsed.blocks) ? (parsed.blocks as Block[]) : null;
  } catch {
    return null;
  }
}

/** A paragraph or header with no text once tags and spaces are removed. */
function isBlank(block: Block): boolean {
  if (block?.type !== 'paragraph' && block?.type !== 'header') {
    return false;
  }
  return (
    text(block.data?.['text'])
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/gi, ' ')
      .trim() === ''
  );
}

function renderBlock(block: Block): string {
  const data = block?.data ?? {};
  switch (block?.type) {
    case 'paragraph':
      return `<p>${text(data['text'])}</p>`;
    case 'header': {
      const level = [1, 2, 3].includes(Number(data['level']))
        ? Number(data['level'])
        : 3;
      return `<h${level}>${text(data['text'])}</h${level}>`;
    }
    case 'list':
      return renderList(
        array(data['items']),
        data['style'] === 'ordered' ? 'ol' : 'ul'
      );
    case 'checklist':
      return renderChecklist(array(data['items']));
    case 'quote': {
      const caption = text(data['caption']);
      return `<blockquote>${text(data['text'])}${caption ? `<cite>${caption}</cite>` : ''}</blockquote>`;
    }
    case 'code':
      return renderCode(text(data['code']));
    case 'delimiter':
      return '<hr>';
    case 'callout':
      return `<aside class="callout" data-variant="${escapeAttr(text(data['variant']) || 'default')}">${text(data['text'])}</aside>`;
    case 'accordion':
      return `<details open><summary>${text(data['title'])}</summary>${text(data['content'])}</details>`;
    case 'steps':
      return renderSteps(array(data['items']));
    case 'tabs':
      // Read-only, so every tab is shown in order under its label.
      return array(data['tabs'])
        .map(
          (tab) =>
            `<section><h3>${escape(text(field(tab, 'label')))}</h3>${text(field(tab, 'content'))}</section>`
        )
        .join('');
    case 'codeGroup':
      return array(data['tabs'])
        .map((tab) => renderCode(text(field(tab, 'code'))))
        .join('');
    case 'table':
      return renderTable(array(data['content']), data['withHeadings'] === true);
    case 'image':
      return renderImage(data);
    case 'embed': {
      const url = text(data['embed']) || text(data['source']);
      return url
        ? `<p><a href="${escapeAttr(url)}">${escape(url)}</a></p>`
        : '';
    }
    default:
      return '';
  }
}

/** Plain list items are strings; nested-list items are `{content, items}`. */
function renderList(items: unknown[], tag: 'ol' | 'ul'): string {
  const inner = items
    .map((item) => {
      if (typeof item === 'string') {
        return `<li>${item}</li>`;
      }
      const nested = array(field(item, 'items'));
      return `<li>${text(field(item, 'content'))}${nested.length ? renderList(nested, tag) : ''}</li>`;
    })
    .join('');
  return `<${tag}>${inner}</${tag}>`;
}

function renderChecklist(items: unknown[]): string {
  const inner = items
    .map((item) => {
      const checked = field(item, 'checked') === true;
      return `<li class="${checked ? 'checked' : ''}" data-checked="${checked}">${text(field(item, 'text'))}</li>`;
    })
    .join('');
  return `<ul class="checklist">${inner}</ul>`;
}

function renderCode(code: string): string {
  return `<pre><code>${escape(code)}</code></pre>`;
}

function renderSteps(items: unknown[]): string {
  const inner = items
    .map((item) => `<li>${text(field(item, 'text'))}</li>`)
    .join('');
  return `<details open><summary>Steps to reproduce</summary><ol>${inner}</ol></details>`;
}

function renderTable(rows: unknown[], withHeadings: boolean): string {
  if (!rows.length) {
    return '';
  }
  const html = rows.map((row, i) => {
    const tag = withHeadings && i === 0 ? 'th' : 'td';
    const cells = array(row).map((cell) => `<${tag}>${text(cell)}</${tag}>`);
    return `<tr>${cells.join('')}</tr>`;
  });
  return withHeadings
    ? `<table><thead>${html[0]}</thead><tbody>${html.slice(1).join('')}</tbody></table>`
    : `<table><tbody>${html.join('')}</tbody></table>`;
}

/**
 * Only a legacy image with a plain `url` is shown. A managed upload's stored
 * url is a presigned link that expired a day after saving; showing it needs
 * a fresh signed URL (attachments, FM-36), so it's a placeholder until then.
 */
function renderImage(data: Data): string {
  const file = data['file'];
  const url = text(field(file, 'url'));
  const uploadId = text(field(file, 'uploadId'));
  const caption = text(data['caption']);
  if (uploadId || !url) {
    return uploadId
      ? `<p class="image-placeholder">${caption || 'Image'} (open on the web to view)</p>`
      : '';
  }
  return `<figure><img src="${escapeAttr(url)}" alt="${escapeAttr(caption)}" loading="lazy">${caption ? `<figcaption>${caption}</figcaption>` : ''}</figure>`;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function field(value: unknown, key: string): unknown {
  return typeof value === 'object' && value !== null
    ? (value as Data)[key]
    : undefined;
}

function escape(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(input: string): string {
  return escape(input).replace(/"/g, '&quot;');
}
