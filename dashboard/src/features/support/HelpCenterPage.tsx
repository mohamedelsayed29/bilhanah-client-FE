import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  ArrowLeftIcon, CaretLeftIcon, ChatCircleDotsIcon, CheckCircleIcon, EnvelopeSimpleIcon, FileTextIcon, LifebuoyIcon, MagnifyingGlassIcon, ThumbsDownIcon, ThumbsUpIcon, TicketIcon, XIcon,
} from '@phosphor-icons/react';
import type { FaqArticleSummary, FaqCategory } from '@bilhanah/contracts';
import { Button } from '../../components/Button';
import { ErrorPanel } from '../../components/ErrorBoundary';
import { Skeleton } from '../../components/Skeleton';
import { supportApi } from '../../lib/api/endpoints';
import { useLanguage, usePageTitle } from '../../lib/language';
import { useDebounced } from '../../lib/use-debounced';
import { useWorkspace } from '../branches/workspace';
import { categoryIcon } from './labels';
import { RichText } from './RichText';
import { openSupport } from './support-bus';
import { notificationsKey } from './SupportTickets';

const faqKey = (...parts: unknown[]) => ['support', 'faq', ...parts] as const;

/**
 * Help & Support: search the help articles, browse them by topic, read one, and reach the team
 * (the assistant, a new ticket, or the tickets already open) through the support panel.
 * `/help` is the home, `/help?category=slug` a topic, `/help/:articleId` an article.
 */
export function HelpCenterPage() {
  const { articleId } = useParams();
  const [params] = useSearchParams();
  const category = params.get('category');
  usePageTitle('المساعدة والدعم', 'Help & Support');
  return <div className="page help-page">
    {articleId ? <ArticleView id={articleId} /> : category ? <CategoryView slug={category} /> : <HelpHome />}
  </div>;
}

function HelpHome() {
  const { text, language } = useLanguage();
  const [search, setSearch] = useState('');
  const q = useDebounced(search.trim(), 250);
  const results = useQuery({ queryKey: faqKey('search', language, q), queryFn: ({ signal }) => supportApi.search(language, q, signal), enabled: q.length > 0 });
  const categories = useQuery({ queryKey: faqKey('categories', language), queryFn: () => supportApi.categories(language), staleTime: 5 * 60_000 });
  const popular = useQuery({ queryKey: faqKey('search', language, ''), queryFn: ({ signal }) => supportApi.search(language, '', signal), staleTime: 5 * 60_000 });
  const searching = search.trim().length > 0;

  return <>
    <section className="help-hero" aria-labelledby="help-title">
      <span className="help-hero-badge"><LifebuoyIcon size={16} weight="fill" aria-hidden="true" />{text('المساعدة والدعم', 'Help & Support')}</span>
      <h1 id="help-title" tabIndex={-1} data-page-title>{text('محتاج مساعدة في إيه؟', 'How can we help?')}</h1>
      <p>{text('دوّر في مقالات المساعدة، أو كلّم فريق بالهنا في أي وقت.', 'Search our help articles, or reach the Bilhanah team any time.')}</p>
      <form className="help-search" role="search" onSubmit={event => event.preventDefault()}>
        <MagnifyingGlassIcon size={22} aria-hidden="true" />
        <input type="search" value={search} onChange={event => setSearch(event.target.value)} maxLength={100} data-testid="help-search"
          placeholder={text('دوّر على إجابة…', 'Search for answers…')} aria-label={text('دوّر في المساعدة', 'Search help')} />
        {searching && <button type="button" className="help-search-clear" onClick={() => setSearch('')} aria-label={text('امسح البحث', 'Clear search')}><XIcon size={18} /></button>}
      </form>
      <p className="help-hero-status"><span className="support-online" aria-hidden="true" />{text('فريق الدعم متاح ٢٤ ساعة، ٧ أيام', 'Support team available 24/7')}</p>
    </section>

    {searching ? <section className="help-section" aria-live="polite" data-testid="help-results">
      <h2>{text('نتائج البحث', 'Search results')}</h2>
      {results.isPending || q !== search.trim() ? <ListSkeleton /> : results.isError ? <ErrorPanel error={results.error} onRetry={() => void results.refetch()} />
        : results.data.length === 0 ? <NoResults query={q} />
        : <ArticleList items={results.data} />}
    </section> : <>
      <ContactCards />
      <section className="help-section" aria-labelledby="help-topics">
        <h2 id="help-topics">{text('تصفّح حسب الموضوع', 'Browse by topic')}</h2>
        {categories.isPending ? <div className="help-topics">{Array.from({ length: 6 }, (_, index) => <Skeleton key={index} height={92} radius={16} />)}</div>
          : categories.isError ? <ErrorPanel error={categories.error} onRetry={() => void categories.refetch()} />
          : <div className="help-topics">{categories.data.map(item => <TopicCard key={item.id} category={item} />)}</div>}
      </section>
      <section className="help-section" aria-labelledby="help-popular">
        <h2 id="help-popular">{text('أكتر الأسئلة شيوعاً', 'Popular articles')}</h2>
        {popular.isPending ? <ListSkeleton /> : popular.isError ? <ErrorPanel error={popular.error} onRetry={() => void popular.refetch()} />
          : <ArticleList items={popular.data} />}
      </section>
    </>}
  </>;
}

/** The three ways to reach the team, each opening the support panel on its screen. */
function ContactCards() {
  const { text, number } = useLanguage();
  const notifications = useQuery({ queryKey: notificationsKey, queryFn: supportApi.notifications, staleTime: 30_000 });
  const unread = notifications.data?.unread ?? 0;
  return <section className="help-contact" aria-label={text('كلّم الدعم', 'Contact support')}>
    <button type="button" className="help-contact-card" onClick={() => openSupport({ tab: 'assistant' })} data-testid="help-chat">
      <span className="help-contact-icon is-coral"><ChatCircleDotsIcon size={24} weight="fill" aria-hidden="true" /></span>
      <strong>{text('اتكلم معانا', 'Chat with us')}</strong>
      <span>{text('إجابات فورية من مساعد بالهنا، ولو محتاج حد من الفريق هيحوّلك على طول.', 'Instant answers from the Bilhanah assistant, and a person from our team when you need one.')}</span>
      <em>{text('ابدأ محادثة', 'Start a chat')}<ArrowLeftIcon size={16} className="directional" aria-hidden="true" /></em>
    </button>
    <button type="button" className="help-contact-card" onClick={() => openSupport({ tab: 'new' })} data-testid="help-new-ticket">
      <span className="help-contact-icon is-mango"><EnvelopeSimpleIcon size={24} weight="fill" aria-hidden="true" /></span>
      <strong>{text('افتح تذكرة دعم', 'Open a support ticket')}</strong>
      <span>{text('اوصف المشكلة وابعت صورة لو حابب، والرد هيوصلك هنا في لوحة التحكم.', 'Describe the problem and attach a screenshot; the reply arrives right here in your dashboard.')}</span>
      <em>{text('تذكرة جديدة', 'New ticket')}<ArrowLeftIcon size={16} className="directional" aria-hidden="true" /></em>
    </button>
    <button type="button" className="help-contact-card" onClick={() => openSupport({ tab: 'tickets' })} data-testid="help-tickets">
      <span className="help-contact-icon is-plum"><TicketIcon size={24} weight="fill" aria-hidden="true" /></span>
      <strong>{text('تذاكري', 'My tickets')}{unread > 0 && <span className="badge" data-testid="help-unread">{text(`${number(unread)} جديد`, `${unread} new`)}</span>}</strong>
      <span>{text('تابع حالة طلباتك للدعم والردود عليها.', 'Follow your support requests and their replies.')}</span>
      <em>{text('شوف التذاكر', 'View tickets')}<ArrowLeftIcon size={16} className="directional" aria-hidden="true" /></em>
    </button>
  </section>;
}

function TopicCard({ category }: { category: FaqCategory }) {
  const { count } = useLanguage();
  const { to } = useWorkspace();
  const Icon = categoryIcon(category.icon);
  return <Link className="help-topic" to={`${to('/help')}?category=${encodeURIComponent(category.slug)}`}>
    <span className="help-topic-icon"><Icon size={22} aria-hidden="true" /></span>
    <span><strong>{category.name}</strong><small>{count(category.articleCount, [{ one: 'مقالة واحدة', two: 'مقالتين', few: '{n} مقالات', many: '{n} مقالة' }, { one: '{n} article', other: '{n} articles' }])}</small></span>
  </Link>;
}

function ArticleList({ items }: { items: FaqArticleSummary[] }) {
  const { to } = useWorkspace();
  return <ul className="help-articles">
    {items.map(item => <li key={item.id}><Link to={to(`/help/${item.id}`)}>
      <FileTextIcon size={20} aria-hidden="true" /><span>{item.question}</span><CaretLeftIcon size={16} className="directional" aria-hidden="true" />
    </Link></li>)}
  </ul>;
}

function NoResults({ query }: { query: string }) {
  const { text } = useLanguage();
  return <div className="help-empty">
    <p><strong>{text(`مفيش نتايج لـ "${query}"`, `No results for “${query}”`)}</strong></p>
    <p>{text('جرّب كلمات تانية، أو اسأل فريق الدعم مباشرة.', 'Try other words, or ask the support team directly.')}</p>
    <Button variant="secondary" icon={<ChatCircleDotsIcon size={18} />} onClick={() => openSupport({ tab: 'new', handoff: { question: query } })}>{text('اسأل الدعم', 'Ask support')}</Button>
  </div>;
}

function Crumbs({ items }: { items: { label: string; href?: string }[] }) {
  const { text } = useLanguage();
  return <nav className="help-crumbs" aria-label={text('مكانك', 'Breadcrumb')}>
    <ol>{items.map((item, index) => <li key={index}>
      {item.href ? <Link to={item.href}>{item.label}</Link> : <span aria-current="page">{item.label}</span>}
      {index < items.length - 1 && <CaretLeftIcon size={12} className="directional" aria-hidden="true" />}
    </li>)}</ol>
  </nav>;
}

function CategoryView({ slug }: { slug: string }) {
  const { text, language } = useLanguage();
  const { to } = useWorkspace();
  const categories = useQuery({ queryKey: faqKey('categories', language), queryFn: () => supportApi.categories(language), staleTime: 5 * 60_000 });
  const articles = useQuery({ queryKey: faqKey('category', language, slug), queryFn: ({ signal }) => supportApi.search(language, '', signal, slug) });
  const category = categories.data?.find(item => item.slug === slug);
  const Icon = categoryIcon(category?.icon ?? '');
  return <>
    <Crumbs items={[{ label: text('المساعدة والدعم', 'Help & Support'), href: to('/help') }, { label: category?.name ?? '…' }]} />
    <header className="help-topic-head">
      <span className="help-topic-icon is-large"><Icon size={28} aria-hidden="true" /></span>
      <h1 tabIndex={-1} data-page-title>{category?.name ?? (categories.isPending ? <Skeleton width={220} height={28} /> : text('موضوع المساعدة', 'Help topic'))}</h1>
    </header>
    <section className="help-section">
      {articles.isPending ? <ListSkeleton /> : articles.isError ? <ErrorPanel error={articles.error} onRetry={() => void articles.refetch()} />
        : articles.data.length === 0 ? <div className="help-empty"><p>{text('مفيش مقالات في الموضوع ده لسه.', 'There are no articles in this topic yet.')}</p></div>
        : <ArticleList items={articles.data} />}
    </section>
    <StillNeedHelp />
  </>;
}

function ArticleView({ id }: { id: string }) {
  const { text, locale } = useLanguage();
  const { to } = useWorkspace();
  const article = useQuery({ queryKey: faqKey('article', id), queryFn: () => supportApi.article(id) });
  const [vote, setVote] = useState<boolean | null>(null);
  const feedback = useMutation({ mutationFn: (helpful: boolean) => supportApi.feedback(id, helpful), onSuccess: (_, helpful) => setVote(helpful) });
  if (article.isPending) return <div className="help-article-card"><Skeleton width="60%" height={30} /><Skeleton height={14} /><Skeleton width="85%" height={14} /><Skeleton width="70%" height={14} /></div>;
  if (article.isError) return <ErrorPanel error={article.error} onRetry={() => void article.refetch()} />;
  const data = article.data;
  const updated = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(data.updatedAt));
  return <>
    <Crumbs items={[
      { label: text('المساعدة والدعم', 'Help & Support'), href: to('/help') },
      { label: data.categoryName, href: `${to('/help')}?category=${encodeURIComponent(data.categorySlug)}` },
      { label: data.question },
    ]} />
    <div className="help-article-layout">
      <article className="help-article-card">
        <h1 tabIndex={-1} data-page-title>{data.question}</h1>
        <p className="help-article-meta">{text(`آخر تحديث ${updated}`, `Updated ${updated}`)}</p>
        <RichText source={data.answer} />
        <div className="help-feedback" aria-live="polite">
          {vote === null ? <>
            <span>{text('المقالة دي فادتك؟', 'Was this article helpful?')}</span>
            <Button small variant="secondary" icon={<ThumbsUpIcon size={16} />} loading={feedback.isPending && feedback.variables} onClick={() => feedback.mutate(true)} data-testid="help-helpful">{text('أيوه', 'Yes')}</Button>
            <Button small variant="secondary" icon={<ThumbsDownIcon size={16} />} loading={feedback.isPending && !feedback.variables} onClick={() => feedback.mutate(false)}>{text('لأ', 'No')}</Button>
          </> : vote ? <span className="help-feedback-done"><CheckCircleIcon size={18} weight="fill" aria-hidden="true" />{text('شكراً على رأيك!', 'Thanks for your feedback!')}</span>
            : <>
              <span>{text('آسفين إنها مفادتكش. فريق الدعم يقدر يساعدك.', 'Sorry it didn’t help. Our support team can.')}</span>
              <Button small icon={<ChatCircleDotsIcon size={16} />} onClick={() => openSupport({ tab: 'new', handoff: { faqArticleId: data.id, question: data.question } })}>{text('كلّم الدعم', 'Contact support')}</Button>
            </>}
        </div>
      </article>
      <aside className="help-article-side">
        {data.related.length > 0 && <section className="help-side-card">
          <h2>{text('مقالات ليها علاقة', 'Related articles')}</h2>
          <ArticleList items={data.related} />
        </section>}
        <StillNeedHelp compact handoff={{ faqArticleId: data.id, question: data.question }} />
      </aside>
    </div>
  </>;
}

function StillNeedHelp({ compact, handoff }: { compact?: boolean; handoff?: { faqArticleId?: string; question?: string } }) {
  const { text } = useLanguage();
  return <section className={`help-cta${compact ? ' is-compact' : ''}`}>
    <span className="help-cta-icon"><LifebuoyIcon size={24} weight="fill" aria-hidden="true" /></span>
    <div>
      <h2>{text('لسه محتاج مساعدة؟', 'Still need help?')}</h2>
      <p>{text('فريق بالهنا موجود ٢٤ ساعة يرد عليك.', 'The Bilhanah team is here around the clock.')}</p>
    </div>
    <div className="help-cta-actions">
      <Button icon={<ChatCircleDotsIcon size={18} />} onClick={() => openSupport({ tab: 'assistant' })}>{text('اتكلم معانا', 'Chat with us')}</Button>
      <Button variant="secondary" icon={<EnvelopeSimpleIcon size={18} />} onClick={() => openSupport({ tab: 'new', handoff })}>{text('افتح تذكرة', 'Open a ticket')}</Button>
    </div>
  </section>;
}

function ListSkeleton() {
  return <div className="help-articles is-loading">{Array.from({ length: 4 }, (_, index) => <Skeleton key={index} height={52} radius={12} />)}</div>;
}
