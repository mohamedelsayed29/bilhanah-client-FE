import { GOOGLE_REVIEW_DOMAINS, STAND_LIMITS, STAND_PRICES, type StandDesign, type StandPurpose, type StandShape } from '@bilhanah/contracts';

/** Prices in pounds for the design screens; the contracts (and so the API) set them in piastres. */
export const UNIT_PRICE = STAND_PRICES.unitPiastres / 100;
export const NFC_SURCHARGE = STAND_PRICES.nfcPiastres / 100;
export const MAX_QUANTITY = STAND_LIMITS.quantity;
/** Designs in one order. */
export const MAX_DESIGNS = STAND_LIMITS.linesPerOrder;
export type StandPrices = { unitPiastres: number; nfcPiastres: number };
export const shapes = [
  { id: 'classic', name: { ar: 'كلاسيك', en: 'Classic' }, description: { ar: 'خطوط بسيطة، حضور أنيق.', en: 'Clean lines. An effortless classic.' }, image: '/media/nfc-acrylic-detail-v1.jpg' },
  { id: 'arch', name: { ar: 'قوس', en: 'Arch' }, description: { ar: 'انحناءة ناعمة، وشخصية مختلفة.', en: 'A soft curve with its own character.' }, image: '/media/nfc-arch-v1.jpg' },
  { id: 'tilt', name: { ar: 'مائل', en: 'Tilt' }, description: { ar: 'ميلة خفيفة للكاونتر والترابيزة.', en: 'A subtle lean for tables and counters.' }, image: '/media/nfc-tilt-v1.jpg' },
] as const;
export const designs = [
  { id: 'signature', name: { ar: 'بصمة', en: 'Signature' }, background: '#fff8ef', ink: '#075e54', accent: '#ff7868' },
  { id: 'forest', name: { ar: 'أخضر عميق', en: 'Deep green' }, background: '#075e54', ink: '#fff8ef', accent: '#ffb49e' },
  { id: 'clay', name: { ar: 'طين دافي', en: 'Warm clay' }, background: '#f1d6c1', ink: '#4b352b', accent: '#a54b32' },
  { id: 'mono', name: { ar: 'مينيمال', en: 'Minimal' }, background: '#f7f6f1', ink: '#252b29', accent: '#252b29' },
] as const;
export const purposes = [
  { id: 'menu', name: { ar: 'عرض المنيو', en: 'Show your menu' }, hint: { ar: 'منيو بالهنا أو أي منيو عندك.', en: 'Bilhanah or your existing menu.' }, caption: { ar: 'المنيو في إيدك', en: 'Your menu, right here' } },
  { id: 'reviews', name: { ar: 'تقييمات Google', en: 'Google reviews' }, hint: { ar: 'رابط تقييم نشاطك على Google.', en: 'Your business’s Google review link.' }, caption: { ar: 'رأيك يهمّنا', en: 'We’d love your review' } },
  { id: 'custom', name: { ar: 'رابط على مزاجك', en: 'Your own link' }, hint: { ar: 'موقعك، واتساب، أو أي صفحة تختارها.', en: 'Your website, WhatsApp or any page.' }, caption: { ar: 'اكتشف أكتر', en: 'Discover more' } },
] as const;
export type ShapeId = typeof shapes[number]['id'];
export type DesignId = typeof designs[number]['id'];
export type PurposeId = typeof purposes[number]['id'];
// The catalog and the API's enums must list the same options.
type Same<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;
const catalogMatchesContracts: [Same<ShapeId, StandShape>, Same<DesignId, StandDesign>, Same<PurposeId, StandPurpose>] = [true, true, true];
void catalogMatchesContracts;
export type PrintColors = { background: string; ink: string };
export type StandConfig = { shape: ShapeId; nfc: boolean; design: DesignId; customColors: PrintColors | null; purpose: PurposeId; brand: string; caption: string; url: string; logo: string; numbered: boolean; startNumber: number; quantity: number; notes: string };
export type CartItem = { id: string; config: StandConfig };
export type Delivery = { name: string; phone: string; email: string; city: string; address: string; notes: string; payment: 'cash' | 'card' };
export function unitPrice(config: Pick<StandConfig, 'nfc'>) { return UNIT_PRICE + (config.nfc ? NFC_SURCHARGE : 0); }
export function lineTotal(config: Pick<StandConfig, 'nfc' | 'quantity'>) { return unitPrice(config) * config.quantity; }
/** In piastres, with the prices the API reported (the checkout's numbers). */
export function unitPiastres(config: Pick<StandConfig, 'nfc'>, prices: StandPrices = STAND_PRICES) { return prices.unitPiastres + (config.nfc ? prices.nfcPiastres : 0); }
export function linePiastres(config: Pick<StandConfig, 'nfc' | 'quantity'>, prices: StandPrices = STAND_PRICES) { return unitPiastres(config, prices) * config.quantity; }
export function normalizeHex(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const hex = value.trim().replace(/^#/, '');
  if (/^[\da-f]{6}$/i.test(hex)) return `#${hex.toUpperCase()}`;
  if (/^[\da-f]{3}$/i.test(hex)) return `#${[...hex].map(char => char + char).join('').toUpperCase()}`;
  return null;
}
export function printColors(config: Pick<StandConfig, 'design' | 'customColors'>) {
  const preset = designs.find(design => design.id === config.design)!;
  return { background: config.customColors?.background ?? preset.background, ink: config.customColors?.ink ?? preset.ink, accent: preset.accent };
}
function luminance(hex: string) {
  const channels = [1, 3, 5].map(index => parseInt(hex.slice(index, index + 2), 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
  return channels[0] * .2126 + channels[1] * .7152 + channels[2] * .0722;
}
export function colorContrast(first: string, second: string) {
  const a = luminance(first), b = luminance(second);
  return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
}
export function readableInk(background: string) {
  if (colorContrast(background, '#172B25') >= 4.5) return '#172B25';
  return colorContrast(background, '#FFFFFF') >= 4.5 ? '#FFFFFF' : '#000000';
}

export function defaultConfig(): StandConfig {
  return { shape: 'classic', nfc: false, design: 'signature', customColors: null, purpose: 'menu', brand: '', caption: '', url: `${window.location.origin}/?demo=1`, logo: '', numbered: false, startNumber: 1, quantity: 1, notes: '' };
}
export function safeUrl(value: string): string | null {
  try { const url = new URL(value.trim()); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}
export function destinationError(config: StandConfig, english: boolean): string {
  const normalized = safeUrl(config.url);
  if (!normalized) return english ? 'Enter a complete link starting with https:// or http://.' : 'اكتب لينك كامل يبدأ بـ https:// أو http://.';
  if (config.purpose === 'reviews') {
    const host = new URL(normalized).hostname;
    if (!GOOGLE_REVIEW_DOMAINS.some(domain => host === domain || host.endsWith(`.${domain}`))) return english ? 'Use your Google Maps or Google review link.' : 'استخدم لينك خرائط Google أو رابط التقييم الخاص بنشاطك.';
  }
  return '';
}
/** Validates a stored design field by field; returns null when it cannot be used. */
function parseConfig(draft: unknown): StandConfig | null {
  const fallback = defaultConfig();
  if (!draft || typeof draft !== 'object') return null;
  const value = draft as Record<string, unknown>;
  const colors = value.customColors as Partial<PrintColors> | null;
  const background = normalizeHex(colors?.background), ink = normalizeHex(colors?.ink);
  if (!shapes.some(item => item.id === value.shape) || !designs.some(item => item.id === value.design) || !purposes.some(item => item.id === value.purpose)) return null;
  return { ...fallback, shape: value.shape as ShapeId, nfc: value.nfc === true, design: value.design as DesignId, customColors: background && ink ? { background, ink } : null, purpose: value.purpose as PurposeId,
    brand: typeof value.brand === 'string' ? value.brand.slice(0, STAND_LIMITS.brand) : '', caption: typeof value.caption === 'string' ? value.caption.slice(0, STAND_LIMITS.caption) : '', url: typeof value.url === 'string' ? value.url.slice(0, 2048) : fallback.url,
    logo: typeof value.logo === 'string' && /^data:image\/(png|jpeg|webp);base64,/.test(value.logo) && value.logo.length < 3_000_000 ? value.logo : '',
    numbered: value.numbered === true, startNumber: typeof value.startNumber === 'number' && Number.isInteger(value.startNumber) ? Math.min(9999, Math.max(1, value.startNumber)) : 1,
    quantity: typeof value.quantity === 'number' && Number.isInteger(value.quantity) ? Math.min(MAX_QUANTITY, Math.max(1, value.quantity)) : 1, notes: typeof value.notes === 'string' ? value.notes.slice(0, STAND_LIMITS.notes) : '' };
}
export function loadDraft(): StandConfig {
  try { return parseConfig(JSON.parse(localStorage.getItem('bilhanah:stand-draft:v1') ?? 'null')) ?? defaultConfig(); } catch { return defaultConfig(); }
}
const BAG_KEY = 'bilhanah:stand-bag:v1';
/** The bag survives reloads. Delivery details are deliberately not stored. */
export function loadBag(): CartItem[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(BAG_KEY) ?? '[]');
    if (!Array.isArray(stored)) return [];
    return stored.slice(0, 50).flatMap(entry => {
      const config = parseConfig((entry as { config?: unknown } | null)?.config);
      const id = (entry as { id?: unknown } | null)?.id;
      return config && typeof id === 'string' ? [{ id: id.slice(0, 64), config }] : [];
    });
  } catch { return []; }
}
/** False when storage is unavailable or full (logos are stored inline). */
export function saveBag(bag: CartItem[]): boolean {
  try { if (bag.length) localStorage.setItem(BAG_KEY, JSON.stringify(bag)); else localStorage.removeItem(BAG_KEY); return true; } catch { return false; }
}
/** The print style's name, or "custom colors" when the preset's colors were replaced. */
export function designLabel(config: Pick<StandConfig, 'design' | 'customColors'>, language: 'ar' | 'en'): string {
  if (config.customColors) return language === 'ar' ? 'ألوان مخصصة' : 'Custom colors';
  return designs.find(design => design.id === config.design)!.name[language];
}
export function downloadFile(content: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a'); link.href = url; link.download = filename; link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
