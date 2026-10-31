import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { QrCodeIcon } from '@phosphor-icons/react';
import { useLanguage } from '../../lib/language';
import { printColors, type StandConfig } from './catalog';
import { createStickerArtwork } from './stand-artwork';

export type StickerView = 'table' | 'flat';

/** The sticker drawn from the customer's own print data: lying on a table, or flat and full size. */
export function StickerStage({ config, view, qrElement }: { config: StandConfig; view: StickerView; qrElement: RefObject<HTMLDivElement | null> }) {
  const { language, text } = useLanguage();
  const [artwork, setArtwork] = useState('');
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const qr = qrElement.current?.querySelector('svg');
    const markup = qr ? new XMLSerializer().serializeToString(qr) : '';
    void createStickerArtwork(config, language, markup).then(canvas => {
      if (!cancelled) { setArtwork(canvas.toDataURL('image/png')); setFailed(false); }
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [config.shape, config.customColors, config.nfc, config.brand, config.caption, config.design, config.logo, config.numbered, config.startNumber, config.purpose, config.url, language, qrElement]);

  const alt = text(`معاينة الستيكر ${config.shape === 'circle' ? 'الدايري' : 'المربع'} بتصميمك`, `Your ${config.shape === 'circle' ? 'round' : 'square'} sticker design`);
  return <div className={`sticker-stage sticker-stage-${view}`} data-shape={config.shape} data-ready={artwork ? 'true' : 'false'}>
    {failed ? <StickerThumb config={config} size="large" /> : artwork ? <img className={`sticker-artwork sticker-artwork-${config.shape}`} src={artwork} width="1000" height="1000" alt={alt} /> : <div className="stand-3d-message" role="status">{text('بنجهّز تصميم الستيكر…', 'Preparing your sticker…')}</div>}
  </div>;
}

/** A small drawn sticker for lists (bag, checkout, order page) and the product picker. */
export function StickerThumb({ config, size = 'small' }: { config: Pick<StandConfig, 'shape' | 'design' | 'customColors'>; size?: 'small' | 'large' }) {
  const colors = printColors(config);
  return <span className={`sticker-thumb sticker-thumb-${size} sticker-thumb-${config.shape}`} style={{ background: colors.background, color: colors.ink }} aria-hidden="true">
    <i style={{ background: colors.accent }} />
    <QrCodeIcon weight="bold" />
  </span>;
}
