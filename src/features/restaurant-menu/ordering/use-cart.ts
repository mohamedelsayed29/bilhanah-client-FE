import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MenuVariant, PublicMenuCategory, PublicMenuItem } from '@bilhanah/contracts';
import { loadCart, saveCart, type CartLine } from './ordering-storage';

/** ORDER_LIMITS in contracts/orders.ts (copied: that module pulls in zod). */
export const CART_LIMITS = { lines: 30, quantity: 50, note: 200 } as const;

type StoredLine = CartLine & { id: number };
export type ResolvedLine = StoredLine & { item: PublicMenuItem; variant: MenuVariant; lineTotal: number; unavailable: boolean };

let nextId = 1;

/** Keeps the lines that still match an orderable dish on today's menu. */
function validLines(lines: CartLine[], items: Map<string, PublicMenuItem>): StoredLine[] {
  return lines.filter(line => {
    const item = items.get(line.menuItemId);
    return item?.isAvailable && item.variants.some(variant => variant.id === line.variantId);
  }).map(line => ({ ...line, note: line.note.slice(0, CART_LIMITS.note), id: nextId++ }));
}

/**
 * The diner's cart at one branch of a restaurant, persisted on this device and checked against the
 * branch's current menu. A branch change remounts the menu, so `branch` is fixed for the hook's life.
 */
export function useCart(subdomain: string, branch: string | null, categories: PublicMenuCategory[]) {
  const items = useMemo(() => new Map(categories.flatMap(category => category.items).map(item => [item.id, item])), [categories]);
  const [initial] = useState(() => {
    const stored = loadCart(subdomain, branch);
    const lines = validLines(stored, items);
    return { lines, dropped: stored.length - lines.length };
  });
  const [lines, setLines] = useState<StoredLine[]>(initial.lines);
  /** Dishes the API refused at checkout (sold out, hidden or deleted since the menu loaded). */
  const linesRef = useRef(lines);
  linesRef.current = lines;
  const [unavailableIds, setUnavailableIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => { saveCart(subdomain, branch, lines.map(({ id: _id, ...line }) => line)); }, [subdomain, branch, lines]);

  const resolved = useMemo(() => lines.flatMap((line): ResolvedLine[] => {
    const item = items.get(line.menuItemId);
    const variant = item?.variants.find(candidate => candidate.id === line.variantId);
    return item && variant ? [{ ...line, item, variant, lineTotal: variant.pricePiastres * line.quantity, unavailable: unavailableIds.has(item.id) }] : [];
  }), [lines, items, unavailableIds]);

  /** Adds a dish; the same size with the same note joins the existing line. Returns false when the cart is full. */
  const add = useCallback((item: PublicMenuItem, variantId: string, quantity: number, note = ''): boolean => {
    const trimmed = note.trim().slice(0, CART_LIMITS.note);
    const current = linesRef.current;
    const index = current.findIndex(line => line.variantId === variantId && line.note === trimmed);
    if (index < 0 && current.length >= CART_LIMITS.lines) return false;
    setLines(index >= 0
      ? current.map((line, position) => position === index ? { ...line, quantity: Math.min(CART_LIMITS.quantity, line.quantity + quantity) } : line)
      : [...current, { id: nextId++, menuItemId: item.id, variantId, quantity: Math.min(CART_LIMITS.quantity, quantity), note: trimmed }]);
    return true;
  }, []);

  const update = useCallback((id: number, change: Partial<Pick<CartLine, 'quantity' | 'note'>>) => {
    setLines(current => current.map(line => line.id === id ? {
      ...line,
      ...(change.quantity !== undefined && { quantity: Math.max(1, Math.min(CART_LIMITS.quantity, change.quantity)) }),
      ...(change.note !== undefined && { note: change.note.slice(0, CART_LIMITS.note) }),
    } : line));
  }, []);

  const remove = useCallback((id: number) => setLines(current => current.filter(line => line.id !== id)), []);
  // Saved right away: after an order the page moves on before effects would run.
  const clear = useCallback(() => { saveCart(subdomain, branch, []); setLines([]); setUnavailableIds(new Set()); }, [subdomain, branch]);
  const removeUnavailable = useCallback(() => {
    setLines(current => current.filter(line => !unavailableIds.has(line.menuItemId)));
    setUnavailableIds(new Set());
  }, [unavailableIds]);

  const quantityOf = useCallback((itemId: string) => lines.reduce((sum, line) => sum + (line.menuItemId === itemId ? line.quantity : 0), 0), [lines]);

  return {
    lines: resolved,
    count: resolved.reduce((sum, line) => sum + line.quantity, 0),
    subtotal: resolved.reduce((sum, line) => sum + line.lineTotal, 0),
    /** How many stored lines were dropped on load because their dish is gone or sold out. */
    droppedOnLoad: initial.dropped,
    hasUnavailable: resolved.some(line => line.unavailable),
    add, update, remove, clear, removeUnavailable, quantityOf,
    markUnavailable: (ids: string[]) => setUnavailableIds(new Set(ids)),
  };
}

export type Cart = ReturnType<typeof useCart>;
