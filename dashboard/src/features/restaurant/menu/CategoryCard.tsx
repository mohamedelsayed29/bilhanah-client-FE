import { useState } from 'react';
import { EyeIcon, EyeSlashIcon, PencilSimpleIcon, PlusIcon, TrashIcon } from '@phosphor-icons/react';
import type { OwnerMenuCategory, OwnerMenuItem } from '@bilhanah/contracts';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { useLanguage } from '../../../lib/language';
import { ItemRow } from './ItemRow';
import { useMenuMutations } from './menu-mutations';
import { DragHandle, SortableList, useSortableRow } from './Sortable';

type Props = { category: OwnerMenuCategory; position: number; onRename: () => void; onAddItem: () => void; onEditItem: (item: OwnerMenuItem) => void };

export function CategoryCard({ category, position, onRename, onAddItem, onEditItem }: Props) {
  const { text, count, language, number } = useLanguage();
  const { setNodeRef, style, isDragging, handle } = useSortableRow(category.id);
  const { reorderItems, setCategoryVisibility, deleteCategory } = useMenuMutations();
  const [confirming, setConfirming] = useState(false);
  const primary = language === 'en' && category.nameEn ? category.nameEn : category.nameAr;
  const secondary = language === 'en' ? (category.nameEn ? category.nameAr : null) : category.nameEn;
  const itemName = (item: OwnerMenuItem) => (language === 'en' && item.nameEn ? item.nameEn : item.nameAr);
  const headingId = `category-${category.id}`;
  return <li ref={setNodeRef} style={style} className={`category card ${isDragging ? 'is-dragging' : ''} ${category.isVisible ? '' : 'is-hidden'}`} aria-labelledby={headingId} data-testid="category">
    <header className="category-header">
      <DragHandle handle={handle} label={text(`رتّب قسم ${primary}`, `Reorder category ${primary}`)} />
      <span className="category-number" aria-hidden="true">{number(position)}</span>
      <div className="category-title">
        <h2 id={headingId}><bdi>{primary}</bdi></h2>
        <div className="category-meta">
          {secondary && <span lang={language === 'en' ? 'ar' : 'en'}>{secondary}</span>}
          <span>{count(category.items.length, 'item')}</span>
          {!category.isVisible && <span className="badge badge-muted"><EyeSlashIcon size={13} aria-hidden="true" />{text('مخفي', 'Hidden')}</span>}
        </div>
      </div>
      <div className="category-actions">
        <button type="button" className="icon-button" onClick={() => setCategoryVisibility.mutate({ id: category.id, isVisible: !category.isVisible })}
          aria-label={category.isVisible ? text(`اخفي قسم ${primary}`, `Hide category ${primary}`) : text(`اظهر قسم ${primary}`, `Show category ${primary}`)}
          title={category.isVisible ? text('اخفي', 'Hide') : text('اظهر', 'Show')}>
          {category.isVisible ? <EyeIcon size={20} /> : <EyeSlashIcon size={20} />}
        </button>
        <button type="button" className="icon-button" onClick={onRename} aria-label={text(`غيّر اسم قسم ${primary}`, `Rename category ${primary}`)} title={text('تعديل الاسم', 'Rename')}><PencilSimpleIcon size={20} /></button>
        <button type="button" className="icon-button icon-button-danger" onClick={() => setConfirming(true)} aria-label={text(`امسح قسم ${primary}`, `Delete category ${primary}`)} title={text('امسح', 'Delete')}><TrashIcon size={20} /></button>
      </div>
    </header>
    {category.items.length > 0 && <SortableList items={category.items} nameOf={itemName} onReorder={ids => reorderItems.mutate({ categoryId: category.id, ids })}>
      <ol className="item-list" aria-label={text(`أصناف ${primary}`, `${primary} items`)}>
        {category.items.map(item => <ItemRow key={item.id} item={item} onEdit={() => onEditItem(item)} />)}
      </ol>
    </SortableList>}
    <div className="category-footer">
      <button type="button" className="add-item" onClick={onAddItem}><PlusIcon size={17} weight="bold" aria-hidden="true" />{text(`أضف صنف في ${primary}`, `Add item to ${primary}`)}</button>
    </div>
    <ConfirmDialog open={confirming} title={text('تمسح القسم ده؟', 'Delete this category?')}
      description={category.items.length
        ? text(`قسم "${category.nameAr}" و${count(category.items.length, 'item')} جواه هيتمسحوا نهائيًا. لو عايز توقفه مؤقتًا، اخفيه بدل ما تمسحه.`, `“${primary}” and its ${count(category.items.length, 'item')} will be deleted permanently. To pause it instead, hide it.`)
        : text(`قسم "${category.nameAr}" هيتمسح نهائيًا.`, `“${primary}” will be deleted permanently.`)}
      confirmLabel={text('امسح القسم', 'Delete category')} busy={deleteCategory.isPending}
      onCancel={() => setConfirming(false)}
      onConfirm={() => { setConfirming(false); deleteCategory.mutate(category.id); }} />
  </li>;
}
