import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowLeftIcon, BellRingingIcon, FilePdfIcon, FileXlsIcon, StarIcon, WebhooksLogoIcon } from '@phosphor-icons/react';
import { useLanguage } from '../../../lib/language';
import './integrations.css';

const LOGOS = '/media/integrations';
type Tile = { id: string; name: string; colour: string; logo: ReactNode; light?: boolean; soon?: boolean };

/**
 * What Bilhanah connects to, as two rows of brand tiles drifting in opposite directions.
 * Live: webhooks, WhatsApp, Google, Paymob, Web Push, Excel/PDF exports. Foodics, Oracle MICROS and Odoo
 * are on the roadmap (docs/POS.md) and marked "coming soon". Logos: Simple Icons (CC0), the companies'
 * own sites, Wikimedia.
 */
export function Integrations() {
  const { text } = useLanguage();
  const soon = text('قريبًا', 'Soon');
  const mark = (file: string, className = 'ig-logo-img') => <img className={className} src={`${LOGOS}/${file}`} alt="" />;
  const glyph = (icon: ReactNode, label: string) => <span className="ig-glyph-logo">{icon}<b>{label}</b></span>;
  const top: Tile[] = [
    { id: 'whatsapp', name: 'WhatsApp', colour: '#25D366', logo: <span className="ig-glyph-logo">{mark('whatsapp.svg', 'ig-icon-img')}<b>WhatsApp</b></span> },
    { id: 'paymob', name: 'Paymob', colour: '#0F3BD8', logo: mark('paymob.svg') },
    { id: 'foodics', name: 'Foodics', colour: '#5B2BD8', logo: mark('foodics.svg'), soon: true },
    { id: 'google', name: 'Google', colour: '#ffffff', light: true, logo: <span className="ig-glyph-logo is-dark"><img className="ig-icon-img is-color" src={`${LOGOS}/google.svg`} alt="" /><b>Google</b></span> },
    { id: 'oracle', name: 'Oracle MICROS', colour: '#C74634', logo: <span className="ig-stack">{mark('oracle.svg')}<small>MICROS</small></span>, soon: true },
    { id: 'webhooks', name: 'Webhooks', colour: '#C73A63', logo: glyph(<WebhooksLogoIcon weight="bold" />, 'Webhooks') },
  ];
  const bottom: Tile[] = [
    { id: 'odoo', name: 'Odoo', colour: '#714B67', logo: mark('odoo.svg', 'ig-icon-img is-wide'), soon: true },
    { id: 'excel', name: 'Excel', colour: '#1D6F42', logo: glyph(<FileXlsIcon weight="fill" />, 'Excel') },
    { id: 'push', name: 'Web Push', colour: '#F2A93B', logo: glyph(<BellRingingIcon weight="fill" />, 'Web Push') },
    { id: 'reviews', name: 'Google Reviews', colour: '#ffffff', light: true, logo: <span className="ig-glyph-logo is-dark"><StarIcon weight="fill" className="is-star" /><b>Google Reviews</b></span> },
    { id: 'pdf', name: 'PDF', colour: '#E5252A', logo: glyph(<FilePdfIcon weight="fill" />, 'PDF') },
  ];
  const row = (tiles: Tile[], direction: 'left' | 'right') => <div className={`ig-row is-${direction}`}>
    {/* Four copies: half the strip is always wider than the screen, so it loops without a seam. Only the first is read out. */}
    <ul className="ig-track">{[...tiles, ...tiles, ...tiles, ...tiles].map((tile, index) => <li key={`${tile.id}-${index}`} aria-hidden={index >= tiles.length || undefined} className={`ig-tile ${tile.light ? 'is-light' : ''}`} style={{ background: tile.colour }}>
      {tile.logo}
      <span className="visually-hidden">{tile.name}{tile.soon ? ` (${soon})` : ''}</span>
      {tile.soon && <em className="ig-soon">{soon}</em>}
    </li>)}</ul>
  </div>;
  return <section className="ig" aria-labelledby="ig-title">
    <div className="page-container ig-head">
      <h2 id="ig-title">{text('بيشتغل مع الأدوات اللي عندك', 'Already works with your tools')}</h2>
      <p>{text('بالهنا بيربط الكاشير والدفع والتواصل والتقارير، عشان تشوف شغلك كله في مكان واحد.', 'Bilhanah connects your POS, payments, messaging and reports, so you see your whole business in one place.')}</p>
    </div>
    <div className="ig-marquee" dir="ltr">
      {row(top, 'left')}
      {row(bottom, 'right')}
    </div>
    <div className="page-container ig-foot">
      <Link className="ig-button" to="/contact">{text('محتاج ربط معيّن؟ كلّمنا', 'Need an integration? Talk to us')}<ArrowLeftIcon className="directional-arrow" size={16} /></Link>
      <p>{text('أي كاشير بيدعم webhooks تقدر تربطه النهارده. Foodics وOracle MICROS وOdoo قريبًا.', 'Any POS with webhooks connects today. Foodics, Oracle MICROS and Odoo are coming soon.')}</p>
    </div>
  </section>;
}
