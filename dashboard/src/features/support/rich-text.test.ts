import { describe, expect, it } from 'vitest';
import { parseInline, parseRichText, safeHref } from './rich-text';

describe('FAQ answer text', () => {
  it('parses paragraphs, numbered and bulleted lists, bold and links', () => {
    const blocks = parseRichText('From [Menu](/menu):\n\n1. Pick a **category**.\n2. Press Add.\n\n- One\n- Two\n\nDone.');
    expect(blocks.map(block => block.type)).toEqual(['paragraph', 'list', 'list', 'paragraph']);
    expect(blocks[0]).toEqual({ type: 'paragraph', content: [{ type: 'text', text: 'From ' }, { type: 'link', text: 'Menu', href: '/menu', internal: true }, { type: 'text', text: ':' }] });
    expect(blocks[1]).toMatchObject({ ordered: true, items: [[{ type: 'text', text: 'Pick a ' }, { type: 'bold', text: 'category' }, { type: 'text', text: '.' }], [{ type: 'text', text: 'Press Add.' }]] });
    expect(blocks[2]).toMatchObject({ ordered: false });
  });

  it('only links dashboard paths and https addresses', () => {
    expect(safeHref('/tables/print')).toEqual({ href: '/tables/print', internal: true });
    expect(safeHref('https://bilhanah.com/help')).toEqual({ href: 'https://bilhanah.com/help', internal: false });
    for (const unsafe of ['javascript:alert(1)', '//evil.com', 'http://x.com', 'data:text/html,hi']) expect(safeHref(unsafe)).toBeNull();
    expect(parseInline('[click](javascript:alert(1))')).toEqual([{ type: 'text', text: 'click' }, { type: 'text', text: ')' }]);
  });
});
