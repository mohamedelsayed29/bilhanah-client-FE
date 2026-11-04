import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { GearSixIcon, MoonIcon, PlayIcon, SunIcon } from '@phosphor-icons/react';
import { CHIME_TONES, type ChimeTone, getChimeStyle, playChime, setChimeStyle, subscribeAudio, unlockAudio } from '../../restaurant/orders/chime';
import { useOrdersLive } from '../../restaurant/orders/live';
import { useLanguage } from '../../../lib/language';
import type { KdsTheme } from './display';

const TONE_TEXT: Record<ChimeTone, [string, string]> = { chime: ['نغمة هادية', 'Chime'], bell: ['جرس', 'Bell'], alert: ['تنبيه عالي', 'Loud alert'] };

/**
 * This screen's own settings: the new-order sound (on, tone, volume, repeat until seen) and light
 * or dark colours. Saved on the device, so each station's tablet keeps its own.
 */
export function DisplaySettings({ theme, onTheme }: { theme: KdsTheme; onTheme: (theme: KdsTheme) => void }) {
  const { text } = useLanguage();
  const live = useOrdersLive();
  const style = useSyncExternalStore(subscribeAudio, getChimeStyle, getChimeStyle);
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const test = (tone: ChimeTone) => void unlockAudio().then(ready => { if (ready) playChime(tone); });

  return <div className="kds-settings" ref={root}>
    <button type="button" className="kds-icon-button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}
      aria-label={text('إعدادات الشاشة', 'Display settings')} title={text('إعدادات الشاشة', 'Display settings')} data-testid="kds-settings">
      <GearSixIcon size={22} weight="bold" aria-hidden="true" />
    </button>
    {open && <div id={panelId} className="kds-settings-panel" role="dialog" aria-label={text('إعدادات الشاشة', 'Display settings')}>
      <section>
        <h2>{text('صوت الطلبات الجديدة', 'New-order sound')}</h2>
        <label className="kds-switch">
          <input type="checkbox" checked={live.sound.on} onChange={event => live.sound.setOn(event.target.checked)} data-testid="kds-sound-on" />
          <span>{live.sound.on ? text('شغّال', 'On') : text('مقفول', 'Off')}</span>
        </label>
        {live.sound.on && live.sound.audio === 'locked' && <p className="kds-settings-hint">{text('المتصفح مستني لمسة على الشاشة عشان يشغّل الصوت.', 'The browser needs one tap on the screen before it can play sound.')}</p>}
        <fieldset className="kds-tones" disabled={!live.sound.on}>
          <legend>{text('النغمة', 'Tone')}</legend>
          {CHIME_TONES.map(tone => <div key={tone} className="kds-tone">
            <label>
              <input type="radio" name={`${panelId}-tone`} checked={style.tone === tone} onChange={() => { setChimeStyle({ tone }); test(tone); }} />
              <span>{text(...TONE_TEXT[tone])}</span>
            </label>
            <button type="button" className="kds-icon-button is-small" onClick={() => test(tone)} aria-label={text(`جرّب ${TONE_TEXT[tone][0]}`, `Play ${TONE_TEXT[tone][1]}`)}>
              <PlayIcon size={16} weight="fill" aria-hidden="true" />
            </button>
          </div>)}
        </fieldset>
        <label className="kds-range">
          <span>{text('مستوى الصوت', 'Volume')}</span>
          <input type="range" min={5} max={100} step={5} value={Math.round(style.volume * 100)} disabled={!live.sound.on}
            onChange={event => setChimeStyle({ volume: Number(event.target.value) / 100 })} onPointerUp={() => test(style.tone)} />
        </label>
        <label className="kds-check">
          <input type="checkbox" checked={style.repeat} disabled={!live.sound.on} onChange={event => setChimeStyle({ repeat: event.target.checked })} />
          <span>{text('كرّر الصوت كل ٣٠ ثانية لحد ما حد يلمس الشاشة', 'Repeat every 30 seconds until someone touches the screen')}</span>
        </label>
      </section>
      <section>
        <h2>{text('الألوان', 'Colours')}</h2>
        <div className="kds-segmented" role="group" aria-label={text('الألوان', 'Colours')}>
          <button type="button" aria-pressed={theme === 'dark'} onClick={() => onTheme('dark')}><MoonIcon size={18} weight="bold" aria-hidden="true" />{text('غامق', 'Dark')}</button>
          <button type="button" aria-pressed={theme === 'light'} onClick={() => onTheme('light')}><SunIcon size={18} weight="bold" aria-hidden="true" />{text('فاتح', 'Light')}</button>
        </div>
      </section>
    </div>}
  </div>;
}
