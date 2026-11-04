import type { CSSProperties, ReactNode } from 'react';
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { Announcements, DragEndEvent, UniqueIdentifier } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { DotsSixVerticalIcon } from '@phosphor-icons/react';
import { useLanguage } from '../../../lib/language';

type Props<T extends { id: string }> = {
  items: T[];
  /** Called with the complete new order after a drop. */
  onReorder: (ids: string[]) => void;
  /** Spoken name of an entry, for screen-reader announcements. */
  nameOf: (item: T) => string;
  children: ReactNode;
};

/**
 * Vertical drag-and-drop list (mouse, touch and keyboard). Each list is its own
 * DndContext, so items can only move within their category.
 */
export function SortableList<T extends { id: string }>({ items, onReorder, nameOf, children }: Props<T>) {
  const { text, number } = useLanguage();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(item => item.id);
  const name = (id: UniqueIdentifier) => { const item = items.find(entry => entry.id === id); return item ? nameOf(item) : ''; };
  const position = (id: UniqueIdentifier | undefined) => number(ids.indexOf(String(id)) + 1);
  const total = number(ids.length);
  const announcements: Announcements = {
    onDragStart: ({ active }) => text(`مسكت ${name(active.id)}. مكانه ${position(active.id)} من ${total}.`, `Picked up ${name(active.id)}. Position ${position(active.id)} of ${total}.`),
    onDragOver: ({ active, over }) => over ? text(`${name(active.id)} اتنقل للمكان ${position(over.id)} من ${total}.`, `${name(active.id)} moved to position ${position(over.id)} of ${total}.`) : undefined,
    onDragEnd: ({ active, over }) => over ? text(`${name(active.id)} اتحط في المكان ${position(over.id)} من ${total}.`, `${name(active.id)} dropped at position ${position(over.id)} of ${total}.`) : undefined,
    onDragCancel: ({ active }) => text(`اتلغى الترتيب. ${name(active.id)} رجع مكانه.`, `Reordering cancelled. ${name(active.id)} returned to its place.`),
  };
  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    onReorder(arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id))));
  };
  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}
    accessibility={{
      announcements,
      screenReaderInstructions: { draggable: text('عشان تغيّر الترتيب: دوس مسافة أو Enter، حرّك بالأسهم، ودوس مسافة أو Enter تاني عشان تثبّت، أو Escape للإلغاء.', 'To reorder, press Space or Enter, move with the arrow keys, then press Space or Enter again to drop, or Escape to cancel.') },
    }}>
    <SortableContext items={ids} strategy={verticalListSortingStrategy}>{children}</SortableContext>
  </DndContext>;
}

/** Row wiring for a sortable entry: the node ref and transform, plus props for its drag handle. */
export function useSortableRow(id: string) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style: CSSProperties = { transform: CSS.Translate.toString(transform), transition, zIndex: isDragging ? 5 : undefined, position: 'relative' };
  return { setNodeRef, style, isDragging, handle: { ref: setActivatorNodeRef, ...attributes, ...listeners } };
}

export function DragHandle({ label, handle }: { label: string; handle: ReturnType<typeof useSortableRow>['handle'] }) {
  return <button type="button" className="drag-handle" {...handle} aria-label={label}>
    <DotsSixVerticalIcon size={22} weight="bold" aria-hidden="true" />
  </button>;
}
