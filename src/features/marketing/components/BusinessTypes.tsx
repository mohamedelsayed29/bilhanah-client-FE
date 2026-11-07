import { useRef, useState } from 'react';
import { Link } from 'react-router';
import { useLanguage } from '../../../lib/language';
import './business-types.css';

type Kind = { id: string; ar: string; en: string; photo: string };

const KINDS: Kind[] = [
  { id: 'full', ar: 'مطاعم خدمة كاملة', en: 'Full service', photo: 'business/full.jpg' },
  { id: 'cafe', ar: 'كافيهات', en: 'Cafés', photo: 'business/cafe.jpg' },
  { id: 'fine', ar: 'فاين داينينج', en: 'Fine dining', photo: 'business/fine.jpg' },
  { id: 'burger', ar: 'برجر ووجبات سريعة', en: 'Burgers & quick service', photo: 'business/burger.jpg' },
  { id: 'italian', ar: 'بيتزا وإيطالي', en: 'Pizza & Italian', photo: 'business/italian.jpg' },
  { id: 'healthy', ar: 'أكل صحي', en: 'Healthy food', photo: 'business/healthy.jpg' },
  { id: 'truck', ar: 'فود ترك', en: 'Food trucks', photo: 'business/truck.jpg' },
  { id: 'takeaway', ar: 'تيك أواي وأكشاك', en: 'Takeaway & kiosks', photo: 'business/takeaway.jpg' },
  { id: 'chains', ar: 'سلاسل وفروع', en: 'Chains & branches', photo: 'business/chains.jpg' },
  { id: 'grills', ar: 'مشويات وأكل شرقي', en: 'Grills & oriental', photo: 'business/grills.jpg' },
  { id: 'lounge', ar: 'صالات وكافيهات سهر', en: 'Lounges & late-night cafés', photo: 'business/lounge.jpg' },
];

/**
 * "Who works with us": large chips for every kind of food business; hovering (or focusing) one floats a
 * tilted photo above it, like a card pulled from a deck.
 */
export function BusinessTypes() {
  const { text, language } = useLanguage();
  const stage = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<{ index: number; x: number; y: number } | null>(null);

  const show = (index: number, element: HTMLElement) => {
    const box = stage.current?.getBoundingClientRect();
    if (!box) return;
    const rect = element.getBoundingClientRect();
    setActive({ index, x: rect.left - box.left + rect.width / 2, y: rect.top - box.top });
  };
  const kind = active ? KINDS[active.index] : null;
  const tilt = active ? (active.index % 2 ? 5 : -5) : 0;

  return <section className="bt section-space" aria-labelledby="bt-title">
    <div className="page-container bt-head">
      <h2 id="bt-title">{text('بنساعد كل أنواع المطاعم تكبر', 'We help every kind of food business grow')}</h2>
      <p>{text('أيًا كانت طريقة الأكل والخدمة عندك، فيه في بالهنا اللي يناسبها.', 'However you cook and serve, Bilhanah has what fits.')}</p>
    </div>
    <div className="page-container bt-stage" ref={stage} onMouseLeave={() => setActive(null)}>
      {/* Preloads every photo so the first hover is instant. */}
      <div className="bt-preload" aria-hidden="true">{KINDS.map(item => <img key={item.id} src={`/media/${item.photo}`} alt="" loading="lazy" />)}</div>
      <ul className="bt-chips">{KINDS.map((item, index) => <li key={item.id}>
        <Link to="/solutions" className={`bt-chip ${active?.index === index ? 'is-active' : ''}`}
          onMouseEnter={event => show(index, event.currentTarget)} onFocus={event => show(index, event.currentTarget)} onBlur={() => setActive(null)}>
          {language === 'ar' ? item.ar : item.en}
        </Link>
      </li>)}</ul>
      {kind && active && <figure key={kind.id} className="bt-photo" aria-hidden="true" style={{ left: active.x, top: active.y, ['--tilt' as string]: `${tilt}deg` }}>
        <img src={`/media/${kind.photo}`} alt="" />
      </figure>}
    </div>
  </section>;
}
