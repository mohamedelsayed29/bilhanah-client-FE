import { useEffect, useRef, useState } from 'react';
import { ArrowCounterClockwiseIcon, ArrowSquareOutIcon, CheckIcon, EyedropperIcon } from '@phosphor-icons/react';
import { type ImageSet, MENU_THEME_INFO, MENU_THEMES, type MenuTheme } from '@bilhanah/contracts';
import { Alert } from '../../../components/Alert';
import { Button } from '../../../components/Button';
import { ImageUpload } from '../../../components/ImageUpload';
import { Section } from '../../../components/Section';
import { errorMessage } from '../../../lib/api/error-messages';
import { useLanguage, usePageTitle } from '../../../lib/language';
import { useRestaurant } from '../queries';
import { HEX_COLOR } from './color';
import { useSaveRestaurant } from './useSaveRestaurant';

const DEFAULT_COLOR = '#075e54';
const PRESETS = ['#075e54', '#0f5c4c', '#1d4ed8', '#7c2d12', '#b91c1c', '#c2410c', '#a16207', '#6d28d9', '#be185d', '#242b29'];
/** The phone-sized page the preview renders, then scales down to fit its frame. */
const PREVIEW_SIZE = { width: 390, height: 780 };

export function BrandingSettings() {
  const { text, language } = useLanguage();
  usePageTitle('الشكل والألوان', 'Branding');
  const restaurant = useRestaurant();
  const save = useSaveRestaurant();
  const [logo, setLogo] = useState<ImageSet | null>(restaurant.logo);
  const [cover, setCover] = useState<ImageSet | null>(restaurant.cover);
  const [color, setColor] = useState<string | null>(restaurant.brandColor);
  const [theme, setTheme] = useState<MenuTheme>(restaurant.menuTheme);
  // Reloads the live preview after saving, so it shows the saved logo, cover and colour.
  const [previewVersion, setPreviewVersion] = useState(0);
  const [hexInput, setHexInput] = useState(restaurant.brandColor ?? DEFAULT_COLOR);
  const [uploading, setUploading] = useState({ logo: false, cover: false });
  const hexValid = HEX_COLOR.test(hexInput);
  const imagesOrColorChanged = logo?.id !== restaurant.logo?.id || cover?.id !== restaurant.cover?.id || (color ?? null) !== (restaurant.brandColor ?? null);
  const dirty = imagesOrColorChanged || theme !== restaurant.menuTheme;
  const accent = color ?? DEFAULT_COLOR;
  const custom = !PRESETS.includes(accent);
  const previewUrl = `${restaurant.publicUrl}/?preview-theme=${theme}&v=${previewVersion}`;

  const pick = (value: string) => { setColor(value.toLowerCase()); setHexInput(value.toLowerCase()); };
  const discard = () => { setLogo(restaurant.logo); setCover(restaurant.cover); setColor(restaurant.brandColor); setHexInput(restaurant.brandColor ?? DEFAULT_COLOR); setTheme(restaurant.menuTheme); };
  const submit = () => {
    if (!hexValid) return;
    save.mutate({ logoId: logo?.id ?? null, coverId: cover?.id ?? null, brandColor: color, menuTheme: theme }, { onSuccess: () => setPreviewVersion(version => version + 1) });
  };

  return <div className="branding-layout">
    <form className="settings-main branding-form" noValidate onSubmit={event => { event.preventDefault(); submit(); }}>
      {save.isError && <Alert kind="error">{errorMessage(save.error, text)}</Alert>}

      <Section id="theme-title" title={text('شكل المنيو', 'Menu theme')} description={text('الشكل اللي الزبون بيشوف بيه المنيو والطلب ومتابعته.', 'How diners see your menu, their order and its tracking page.')}>
        <div className="theme-options" role="radiogroup" aria-labelledby="theme-title">
          {MENU_THEMES.map(id => <label key={id} className={`theme-option ${theme === id ? 'is-selected' : ''}`}>
            <input type="radio" name="menu-theme" value={id} checked={theme === id} onChange={() => setTheme(id)} />
            <span className={`theme-sample theme-sample-${id}`} aria-hidden="true"><span /><span /><span /></span>
            <span className="theme-option-text"><strong>{MENU_THEME_INFO[id].name[language]}</strong><small>{MENU_THEME_INFO[id].description[language]}</small></span>
            <span className="theme-check" aria-hidden="true"><CheckIcon size={14} weight="bold" /></span>
          </label>)}
        </div>
      </Section>

      <Section id="images-title" title={text('اللوجو وصورة الغلاف', 'Logo and cover photo')} description={text('اللوجو بيظهر جنب اسم المطعم، والغلاف في أول المنيو.', 'Your logo appears next to the restaurant name; the cover sits at the top of the menu.')}>
        <div className="branding-uploads">
          <ImageUpload kind="LOGO" layout="inline" value={logo} onChange={setLogo} aspect="1 / 1" label={text('اللوجو', 'Logo')} hint={text('صورة مربعة، ٤٠٠ بكسل أو أكبر.', 'A square image, 400 px or larger.')}
            onBusyChange={busy => setUploading(current => ({ ...current, logo: busy }))} />
          <ImageUpload kind="COVER" value={cover} onChange={setCover} aspect="16 / 7" label={text('صورة الغلاف', 'Cover photo')} hint={text('صورة عريضة، ١٦٠٠×٧٠٠ بكسل مثالية.', 'A wide image; 1600×700 px is ideal.')}
            onBusyChange={busy => setUploading(current => ({ ...current, cover: busy }))} />
        </div>
      </Section>

      <Section id="color-title" title={text('لون المطعم', 'Brand color')} description={text('بيتلوّن بيه الأزرار والأقسام في المنيو.', 'Used for buttons and highlights on your menu.')}
        actions={color && <Button variant="ghost" small onClick={() => { setColor(null); setHexInput(DEFAULT_COLOR); }} icon={<ArrowCounterClockwiseIcon size={16} aria-hidden="true" />}>{text('اللون الافتراضي', 'Default color')}</Button>}>
        <div className="swatches" role="group" aria-label={text('ألوان مقترحة', 'Suggested colors')}>
          {PRESETS.map(preset => <button type="button" key={preset} className="swatch-button" style={{ background: preset }} aria-label={preset} aria-pressed={accent === preset} onClick={() => pick(preset)}>
            {accent === preset && <CheckIcon size={18} weight="bold" aria-hidden="true" />}
          </button>)}
          <label className={`swatch-button swatch-custom ${custom ? 'is-selected' : ''}`} style={custom ? { background: accent } : undefined} title={text('لون تاني', 'Another colour')}>
            <span className="visually-hidden">{text('اختار لون تاني', 'Pick another colour')}</span>
            {custom ? <CheckIcon size={18} weight="bold" aria-hidden="true" /> : <EyedropperIcon size={18} weight="bold" aria-hidden="true" />}
            <input type="color" value={accent} onChange={event => pick(event.target.value)} />
          </label>
        </div>
        <div className="hex-field">
          <label className="hex-label" htmlFor="brand-hex">{text('كود اللون', 'Hex code')}</label>
          <span className="hex-chip" style={{ background: hexValid ? hexInput : accent }} aria-hidden="true" />
          <input id="brand-hex" className="input hex-input" dir="ltr" maxLength={7} value={hexInput} spellCheck={false} aria-invalid={hexValid ? undefined : true}
            aria-describedby={hexValid ? undefined : 'brand-hex-error'}
            onChange={event => {
              const value = event.target.value.startsWith('#') ? event.target.value : `#${event.target.value}`;
              setHexInput(value);
              if (HEX_COLOR.test(value)) setColor(value.toLowerCase());
            }} />
          {!hexValid && <p className="field-error" id="brand-hex-error">{text('اكتب كود لون زي ‎#0f5c4c.', 'Use a hex colour such as #0f5c4c.')}</p>}
        </div>
      </Section>

      <div className={`save-bar ${dirty ? 'is-dirty' : ''}`} role="region" aria-label={text('حفظ التغييرات', 'Save changes')}>
        <span className="save-bar-status">{dirty ? text('في تغييرات مش محفوظة', 'You have unsaved changes') : text('كل التغييرات محفوظة', 'All changes saved')}</span>
        <Button variant="secondary" disabled={!dirty || save.isPending} onClick={discard}>{text('تراجع', 'Discard')}</Button>
        <Button type="submit" loading={save.isPending} disabled={!dirty || !hexValid || uploading.logo || uploading.cover}>{text('احفظ', 'Save')}</Button>
      </div>
    </form>

    <aside className="preview-panel" aria-labelledby="preview-title">
      <div className="preview-head">
        <h2 id="preview-title">{text('الزبون هيشوف كده', 'What diners see')}</h2>
        <a className="link-action" href={previewUrl} target="_blank" rel="noreferrer"><ArrowSquareOutIcon size={16} aria-hidden="true" />{text('افتح', 'Open')}</a>
      </div>
      <PhonePreview url={previewUrl} title={text('معاينة المنيو', 'Menu preview')} />
      <p className="preview-note">{imagesOrColorChanged
        ? text('احفظ عشان اللوجو والغلاف واللون الجديد يظهروا هنا.', 'Save to see the new logo, cover and colour here.')
        : text('منيوك الحقيقي بالشكل اللي اخترته.', 'Your real menu, in the theme you picked.')}</p>
    </aside>
  </div>;
}

/** The public menu at phone size, scaled to whatever width its frame has. */
function PhonePreview({ url, title }: { url: string; title: string }) {
  const screen = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const element = screen.current;
    if (!element) return;
    const fit = () => setScale(element.clientWidth / PREVIEW_SIZE.width);
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  // A picture of the menu: inert, so keyboard and screen-reader users aren't sent into a second copy of it; the Open link shows it properly.
  return <div className="phone-frame">
    <div ref={screen} className="live-preview" inert>
      {scale > 0 && <iframe key={url} src={url} title={title} loading="lazy"
        style={{ width: PREVIEW_SIZE.width, height: PREVIEW_SIZE.height, transform: `scale(${scale})` }} />}
    </div>
  </div>;
}
