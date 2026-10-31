import { shapeImage, type StandConfig } from './catalog';
import { StickerThumb } from './StickerPreview';

/** A design's picture in lists: the stand's photo, or a drawn sticker in its colors. */
export function LineThumb({ config, width }: { config: Pick<StandConfig, 'product' | 'shape' | 'design' | 'customColors'>; width: number }) {
  const image = shapeImage(config.shape);
  if (config.product === 'sticker' || !image) return <span className="shop-line-thumb" style={{ width, height: Math.round(width * 1.25) }}><StickerThumb config={config} /></span>;
  return <img src={image} alt="" width={width} height={Math.round(width * 1.25)} />;
}
