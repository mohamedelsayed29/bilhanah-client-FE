import { Fragment, useMemo } from 'react';
import { Link } from 'react-router';
import { useWorkspace } from '../branches/workspace';
import { type Inline, parseRichText } from './rich-text';

/** An FAQ answer (or a reply), rendered from its Markdown subset without any raw HTML. */
export function RichText({ source, onNavigate }: { source: string; onNavigate?: () => void }) {
  const blocks = useMemo(() => parseRichText(source), [source]);
  return <div className="rich-text">
    {blocks.map((block, index) => block.type === 'paragraph'
      ? <p key={index}><Inlines content={block.content} onNavigate={onNavigate} /></p>
      : block.ordered
        ? <ol key={index}>{block.items.map((item, at) => <li key={at}><Inlines content={item} onNavigate={onNavigate} /></li>)}</ol>
        : <ul key={index}>{block.items.map((item, at) => <li key={at}><Inlines content={item} onNavigate={onNavigate} /></li>)}</ul>)}
  </div>;
}

function Inlines({ content, onNavigate }: { content: Inline[]; onNavigate?: () => void }) {
  const { to } = useWorkspace();
  return <>{content.map((part, index) => {
    if (part.type === 'bold') return <strong key={index}>{part.text}</strong>;
    if (part.type === 'link') {
      return part.internal
        ? <Link key={index} to={to(part.href)} onClick={onNavigate}>{part.text}</Link>
        : <a key={index} href={part.href} target="_blank" rel="noreferrer noopener">{part.text}</a>;
    }
    return <Fragment key={index}>{part.text}</Fragment>;
  })}</>;
}
