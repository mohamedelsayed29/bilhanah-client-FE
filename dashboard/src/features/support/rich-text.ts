/**
 * The FAQ answers' Markdown subset, parsed into plain data (never HTML): paragraphs, "- " and "1. "
 * lists, **bold**, and [links](/path or https://...). Anything else stays text.
 */

export type Inline = { type: 'text'; text: string } | { type: 'bold'; text: string } | { type: 'link'; text: string; href: string; internal: boolean };
export type RichBlock = { type: 'paragraph'; content: Inline[] } | { type: 'list'; ordered: boolean; items: Inline[][] };

const INLINE = /\*\*([^*]+)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

/** Only dashboard paths and https links become links; anything else (javascript:, data:, ...) stays text. */
export function safeHref(href: string): { href: string; internal: boolean } | null {
  if (/^\/(?!\/)[\w\-/?=&#.%]*$/.test(href)) return { href, internal: true };
  if (/^https:\/\/[^\s]+$/i.test(href)) return { href, internal: false };
  return null;
}

export function parseInline(source: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const match of source.matchAll(INLINE)) {
    if (match.index > last) out.push({ type: 'text', text: source.slice(last, match.index) });
    if (match[1] !== undefined) out.push({ type: 'bold', text: match[1] });
    else {
      const link = safeHref(match[3]!);
      out.push(link ? { type: 'link', text: match[2]!, ...link } : { type: 'text', text: match[2]! });
    }
    last = match.index + match[0].length;
  }
  if (last < source.length) out.push({ type: 'text', text: source.slice(last) });
  return out;
}

export function parseRichText(source: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  for (const chunk of source.replace(/\r\n/g, '\n').split(/\n{2,}/)) {
    const lines = chunk.split('\n').map(line => line.trim()).filter(Boolean);
    if (!lines.length) continue;
    const ordered = lines.every(line => /^\d+[.)]\s+/.test(line));
    const bulleted = lines.every(line => /^[-*•]\s+/.test(line));
    if (ordered || bulleted) {
      blocks.push({ type: 'list', ordered, items: lines.map(line => parseInline(line.replace(/^(\d+[.)]|[-*•])\s+/, ''))) });
    } else {
      blocks.push({ type: 'paragraph', content: parseInline(lines.join(' ')) });
    }
  }
  return blocks;
}
