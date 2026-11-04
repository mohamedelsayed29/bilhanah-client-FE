import { CameraIcon, EyeSlashIcon } from '@phosphor-icons/react';
import type { OwnerMenuItem } from '@bilhanah/contracts';
import { formatPrice } from '../../../lib/format';
import { useLanguage } from '../../../lib/language';
import { useMenuMutations } from './menu-mutations';
import { DragHandle, useSortableRow } from './Sortable';

export function ItemRow({ item, onEdit }: { item: OwnerMenuItem; onEdit: () => void }) {
  const { text, language, count } = useLanguage();
  const { setNodeRef, style, isDragging, handle } = useSortableRow(item.id);
  const { setAvailability } = useMenuMutations();
  const name = language === 'en' && item.nameEn ? item.nameEn : item.nameAr;
  const description = language === 'en' && item.descriptionEn ? item.descriptionEn : item.descriptionAr;
  const prices = item.variants.map(variant => variant.pricePiastres);
  const price = prices.length > 1
    ? text(`من ${formatPrice(Math.min(...prices), language)}`, `From ${formatPrice(Math.min(...prices), language)}`)
    : formatPrice(prices[0] ?? 0, language);
  const thumb = item.image?.sources[0];
  return <li ref={setNodeRef} style={style} className={`item-row ${isDragging ? 'is-dragging' : ''} ${item.isAvailable ? '' : 'is-sold-out'} ${item.isVisible ? '' : 'is-hidden'}`} data-testid="item-row">
    <DragHandle handle={handle} label={text(`رتّب ${name}`, `Reorder ${name}`)} />
    <button type="button" className="item-main" onClick={onEdit}>
      <span className="visually-hidden">{text('عدّل', 'Edit')} </span>
      <span className="item-thumb" aria-hidden="true">
        {thumb ? <img src={thumb.url} srcSet={item.image!.sources.map(source => `${source.url} ${source.width}w`).join(', ')} sizes="64px" alt="" loading="lazy" /> : <CameraIcon size={22} />}
      </span>
      <span className="item-text">
        <strong><bdi>{name}</bdi></strong>
        {description && <small><bdi>{description}</bdi></small>}
        <span className="item-tags">
          <span className="item-price">{price}</span>
          {prices.length > 1 && <span>{count(prices.length, 'size')}</span>}
          {!item.isVisible && <span className="badge badge-muted"><EyeSlashIcon size={13} aria-hidden="true" />{text('مخفي', 'Hidden')}</span>}
        </span>
      </span>
    </button>
    <button type="button" role="switch" aria-checked={item.isAvailable} className={`availability ${item.isAvailable ? 'is-on' : 'is-off'}`}
      onClick={() => setAvailability.mutate({ item, isAvailable: !item.isAvailable })}
      aria-label={text(`${name} متاح`, `${name} available`)}>
      <span className="availability-dot" aria-hidden="true" />
      <span aria-hidden="true">{item.isAvailable ? text('متاح', 'Available') : text('خلصان', 'Sold out')}</span>
    </button>
  </li>;
}
