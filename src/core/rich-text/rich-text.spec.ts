import { editorJsToHtml, isEditorJsJson } from './editorjs';
import { renderRichText, sanitizeHtml } from './rich-text';

const editorJs = (...blocks: object[]) => JSON.stringify({ blocks });

/** The rendered HTML as a DOM, to assert on structure, not exact markup. */
function dom(html: string): HTMLElement {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div;
}

describe('isEditorJsJson', () => {
  it('detects a JSON object with a blocks array', () => {
    expect(isEditorJsJson(editorJs())).toBe(true);
    expect(isEditorJsJson('  {"blocks":[{"type":"paragraph"}]}')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isEditorJsJson(undefined)).toBe(false);
    expect(isEditorJsJson('')).toBe(false);
    expect(isEditorJsJson('# Title')).toBe(false);
    expect(isEditorJsJson('{"time":1}')).toBe(false);
    expect(isEditorJsJson('{not json')).toBe(false);
  });
});

describe('editorJsToHtml', () => {
  it('renders text blocks, keeping their inline markup', () => {
    const html = editorJsToHtml(
      editorJs(
        { type: 'header', data: { text: 'Title', level: 2 } },
        { type: 'paragraph', data: { text: 'Some <b>bold</b> text' } },
        { type: 'paragraph', data: { text: '&nbsp; <br>' } },
        { type: 'quote', data: { text: 'Quoted', caption: 'Ada' } }
      )
    );
    expect(html).toContain('<h2>Title</h2>');
    expect(html).toContain('<p>Some <b>bold</b> text</p>');
    expect(html).toContain('<blockquote>Quoted<cite>Ada</cite></blockquote>');
    // The blank paragraph is dropped.
    expect(html.match(/<p>/g)).toHaveLength(1);
  });

  it('renders flat and nested lists', () => {
    const html = editorJsToHtml(
      editorJs(
        { type: 'list', data: { style: 'ordered', items: ['one', 'two'] } },
        {
          type: 'list',
          data: {
            style: 'unordered',
            items: [{ content: 'parent', items: [{ content: 'child' }] }],
          },
        }
      )
    );
    expect(html).toContain('<ol><li>one</li><li>two</li></ol>');
    expect(html).toContain('<ul><li>parent<ul><li>child</li></ul></li></ul>');
  });

  it('escapes code and renders checklists and tables', () => {
    const el = dom(
      editorJsToHtml(
        editorJs(
          { type: 'code', data: { code: '<b>if (a < b)</b>' } },
          {
            type: 'checklist',
            data: {
              items: [
                { text: 'done', checked: true },
                { text: 'todo', checked: false },
              ],
            },
          },
          {
            type: 'table',
            data: { withHeadings: true, content: [['H'], ['cell']] },
          }
        )
      )
    );
    expect(el.querySelector('pre code')?.textContent).toBe('<b>if (a < b)</b>');
    expect(
      [...el.querySelectorAll('.checklist li')].map((li) => li.className)
    ).toEqual(['checked', '']);
    expect(el.querySelector('thead th')?.textContent).toBe('H');
    expect(el.querySelector('tbody td')?.textContent).toBe('cell');
  });

  it('shows legacy images, and a placeholder for uploads', () => {
    const html = editorJsToHtml(
      editorJs(
        { type: 'image', data: { file: { url: 'https://x.test/a.png' } } },
        {
          type: 'image',
          data: { file: { uploadId: 'u1', url: 'https://x.test/old' } },
        }
      )
    );
    expect(html).toContain('<img src="https://x.test/a.png"');
    expect(html).not.toContain('https://x.test/old');
    expect(html).toContain('Image (open on the web to view)');
  });

  it('shows every tab in order and drops unknown blocks', () => {
    const html = editorJsToHtml(
      editorJs(
        {
          type: 'tabs',
          data: {
            tabs: [
              { label: 'One', content: 'first' },
              { label: 'Two', content: 'second' },
            ],
          },
        },
        { type: 'mystery', data: { text: 'hidden' } }
      )
    );
    expect(html).toContain('<h3>One</h3>first');
    expect(html).toContain('<h3>Two</h3>second');
    expect(html).not.toContain('hidden');
  });
});

describe('renderRichText', () => {
  it('renders Markdown, wrapping @mentions', () => {
    const el = dom(
      renderRichText('Hi **there** @Ada Rahman\n\n- one', 'MARKDOWN')
    );
    expect(el.querySelector('strong')?.textContent).toBe('there');
    expect(el.querySelector('span.mention')?.textContent).toBe('@Ada Rahman');
    expect(el.querySelector('ul li')?.textContent).toBe('one');
  });

  it('treats a missing format as Markdown', () => {
    expect(renderRichText('*hi*', undefined)).toContain('<em>hi</em>');
  });

  it('detects Editor.js JSON stored as MARKDOWN', () => {
    const body = editorJs({ type: 'paragraph', data: { text: 'from js' } });
    expect(renderRichText(body, 'MARKDOWN')).toBe('<p>from js</p>');
  });

  it('keeps Editor.js mention spans with their account id', () => {
    const body = editorJs({
      type: 'paragraph',
      data: {
        text: '<span class="editorjs-mention" data-account-id="a2">@Ben</span> hi',
      },
    });
    const mention = dom(renderRichText(body, 'EDITORJS')).querySelector(
      'span.editorjs-mention'
    );
    expect(mention?.getAttribute('data-account-id')).toBe('a2');
  });

  it('renders HTML as HTML', () => {
    expect(renderRichText('<p>Hello <em>you</em></p>', 'HTML')).toBe(
      '<p>Hello <em>you</em></p>'
    );
  });

  it('returns nothing for an empty body', () => {
    expect(renderRichText(undefined, 'MARKDOWN')).toBe('');
    expect(renderRichText('   ', 'HTML')).toBe('');
  });

  it('opens links outside the app', () => {
    const link = dom(
      renderRichText('[docs](https://flux.test/docs)', 'MARKDOWN')
    ).querySelector('a');
    expect(link?.getAttribute('target')).toBe('_blank');
    expect(link?.getAttribute('rel')).toBe('noopener noreferrer');
  });

  describe('sanitizing', () => {
    const cases: [string, string, string][] = [
      ['HTML', '<p>ok</p><script>alert(1)</script>', 'script'],
      ['HTML', '<img src="x" onerror="alert(1)">', 'onerror'],
      ['HTML', '<a href="javascript:alert(1)">x</a>', 'javascript:'],
      ['HTML', '<iframe src="https://evil.test"></iframe>', 'iframe'],
      ['HTML', '<p style="color:red">x</p><style>p{}</style>', 'style'],
      ['MARKDOWN', '[x](javascript:alert(1))', 'javascript:'],
      ['MARKDOWN', 'hi <img src=x onerror=alert(1)>', 'onerror'],
      [
        'EDITORJS',
        editorJs({
          type: 'paragraph',
          data: { text: '<img src=x onerror="alert(1)"><script>1</script>' },
        }),
        'onerror',
      ],
    ];

    for (const [format, body, banned] of cases) {
      it(`strips ${banned} from ${format}`, () => {
        const html = renderRichText(body, format as 'HTML');
        expect(html.toLowerCase()).not.toContain(banned);
      });
    }

    it('keeps the allowed tags', () => {
      expect(
        sanitizeHtml('<details><summary>s</summary><aside>a</aside></details>')
      ).toBe('<details><summary>s</summary><aside>a</aside></details>');
    });
  });
});
