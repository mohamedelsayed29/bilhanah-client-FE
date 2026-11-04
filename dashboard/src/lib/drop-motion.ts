/**
 * The dashboard's water-drop motion. A dialog opened from a button pulls away from it like a drop
 * and wobbles into shape like jelly; closing shrinks it back into the button, which takes it like a
 * water surface (a bounce and spreading rings). A new order falls onto Orders the same way.
 */

export const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Rings spreading from (x, y), in viewport pixels: inside `surface` (clipped to it, like water) or over the page. */
function ripples(x: number, y: number, surface: HTMLElement | null, size = 36) {
  // `surface` null draws the rings over the page (fixed); the sidebar passes its panel.
  const layer = document.createElement('span');
  layer.className = surface ? 'drop-ripples' : 'drop-ripples drop-ripples-page';
  (surface ?? document.body).append(layer);
  const box = surface?.getBoundingClientRect();
  const rings = [0, 140, 280].map((delay, index) => {
    const ring = document.createElement('span');
    ring.className = `drop-ripple ${index === 0 ? 'drop-ripple-first' : ''}`;
    ring.style.left = `${box ? x - box.left : x}px`;
    ring.style.top = `${box ? y - box.top : y}px`;
    // Rings start as big as what they land on, so a wide button gets wide rings.
    ring.style.width = ring.style.height = `${size}px`;
    ring.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
    layer.append(ring);
    return ring.animate([{ transform: 'scale(0.2)', opacity: 0.9 }, { transform: `scale(${surface ? 4.5 : 1.6})`, opacity: 0 }],
      { duration: 900, delay, easing: 'cubic-bezier(0.2, 0.6, 0.3, 1)', fill: 'both' }).finished;
  });
  void Promise.all(rings).finally(() => layer.remove());
}

/**
 * The drop lands back where it came from. A button on the page takes it like jelly: it squashes
 * under the drop, stretches back up and settles, with no rings. In the sidebar, the button bounces,
 * the panel wobbles like a water surface from the point of impact and rings spread across it.
 */
export function splash(button: HTMLElement | null, { rings = true }: { rings?: boolean } = {}) {
  if (!button || !button.isConnected || reducedMotion()) return;
  const target = button.querySelector<HTMLElement>('.sidebar-icon') ?? button;
  const panel = button.closest<HTMLElement>('.sidebar-nav');
  if (!panel) {
    // Squash from the bottom, as a drop landing on top would.
    target.style.transformOrigin = '50% 100%';
    void target.animate([
      { transform: 'scale(1, 1)' },
      { transform: 'scale(1.1, 0.84)', offset: 0.18 },
      { transform: 'scale(0.94, 1.1)', offset: 0.4 },
      { transform: 'scale(1.04, 0.96)', offset: 0.6 },
      { transform: 'scale(0.99, 1.02)', offset: 0.8 },
      { transform: 'scale(1, 1)' },
    ], { duration: 640, easing: 'ease-out' }).finished.finally(() => { target.style.transformOrigin = ''; });
    return;
  }
  const hit = target.getBoundingClientRect();
  const x = hit.left + hit.width / 2;
  const y = hit.top + hit.height / 2;
  target.animate([{ transform: 'scale(0.7)' }, { transform: 'scale(1.18)' }, { transform: 'scale(0.94)' }, { transform: 'scale(1)' }],
    { duration: 560, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' });
  if (rings) ripples(x, y, panel);
  // The panel hangs from the window edge, so it wobbles from that edge at the height of the impact.
  const box = panel.getBoundingClientRect();
  const edge = document.documentElement.dir === 'rtl' ? '100%' : '0%';
  panel.style.transformOrigin = `${edge} ${y - box.top}px`;
  void panel.animate([
    { transform: 'scale(1, 1)' },
    { transform: 'scale(1.09, 0.97)', offset: 0.18 },
    { transform: 'scale(0.95, 1.02)', offset: 0.42 },
    { transform: 'scale(1.03, 0.99)', offset: 0.66 },
    { transform: 'scale(0.99, 1.005)', offset: 0.84 },
    { transform: 'scale(1, 1)' },
  ], { duration: 820, easing: 'ease-out' }).finished.finally(() => { panel.style.transformOrigin = ''; });
}

/** A drop falls onto `button` from above, then splashes there (a new order arriving on Orders). */
export function fallInto(button: HTMLElement | null) {
  if (!button || !button.isConnected || reducedMotion() || document.hidden) return;
  const target = button.querySelector<HTMLElement>('.sidebar-icon, .tabbar-icon') ?? button;
  const hit = target.getBoundingClientRect();
  if (hit.width === 0) return;
  const drop = document.createElement('span');
  drop.className = 'drop-fall';
  drop.style.left = `${hit.left + hit.width / 2}px`;
  drop.style.top = `${hit.top + hit.height / 2}px`;
  document.body.append(drop);
  void drop.animate([
    { transform: 'translate(-50%, -50%) translateY(-140px) scale(0.6, 1.3)', opacity: 0 },
    { transform: 'translate(-50%, -50%) translateY(-90px) scale(0.85, 1.25)', opacity: 1, offset: 0.25 },
    { transform: 'translate(-50%, -50%) translateY(0) scale(1.25, 0.7)', opacity: 1, offset: 0.9 },
    { transform: 'translate(-50%, -50%) translateY(0) scale(1.6, 0.2)', opacity: 0 },
  ], { duration: 560, easing: 'cubic-bezier(0.5, 0, 0.9, 0.6)' }).finished.finally(() => {
    drop.remove();
    splash(button);
  });
}

/** The control a dialog opens from: the one pressed just before (pointer), else the focused one (keyboard). */
let lastPress: { element: HTMLElement; at: number } | null = null;
if (typeof document !== 'undefined') {
  // Capture phase, so it is recorded before the click handler opens the dialog. Safari does not
  // focus buttons on click, so focus alone cannot tell which button was pressed.
  document.addEventListener('pointerdown', event => {
    const element = event.target instanceof Element ? event.target.closest<HTMLElement>('button, a, [role="button"]') : null;
    lastPress = element ? { element, at: performance.now() } : null;
  }, true);
}

export function dialogOrigin(): HTMLElement | null {
  if (lastPress && performance.now() - lastPress.at < 1500 && lastPress.element.isConnected) return lastPress.element;
  const focused = document.activeElement;
  return focused instanceof HTMLElement && focused.matches('button, a, [role="button"]') ? focused : null;
}

/** The part of a button the drop leaves from and lands on: a sidebar link's icon tile, or the button itself. */
const anchorOf = (button: HTMLElement) => button.querySelector<HTMLElement>('.sidebar-icon') ?? button;

/** The button squeezes, as if the drop were pulling away from it. */
export function squeeze(button: HTMLElement | null) {
  if (!button || reducedMotion()) return;
  anchorOf(button).animate([{ transform: 'scale(1)' }, { transform: 'scale(0.82)' }, { transform: 'scale(1.08)' }, { transform: 'scale(1)' }], { duration: 420, easing: 'ease-out' });
}

/** Where the drop starts or ends for `button`, or null without one. */
export const originRect = (button: HTMLElement | null) => (button?.isConnected ? anchorOf(button).getBoundingClientRect() : null);

const DROP_MS = 760;

/** How far, and how much smaller, the button is than the open dialog (for the drop to start and end there). */
function dropGeometry(dialog: HTMLElement, from: DOMRect) {
  const box = dialog.getBoundingClientRect();
  return {
    dx: from.left + from.width / 2 - (box.left + box.width / 2),
    dy: from.top + from.height / 2 - (box.top + box.height / 2),
    scale: Math.max(from.width, from.height) / Math.max(box.width, box.height),
  };
}

/**
 * The dialog pulls away from the button like a drop: a small round blob stretches as it travels,
 * then wobbles into shape like jelly (squash, stretch, settle), and only then shows its content.
 */
export function dropIn(dialog: HTMLDialogElement, from: DOMRect | null) {
  dialog.style.animation = 'none';
  if (!from || reducedMotion()) {
    dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'ease-out' });
    return;
  }
  const { dx, dy, scale } = dropGeometry(dialog, from);
  dialog.animate([
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, borderRadius: '50%' },
    { transform: `translate(${dx * 0.55}px, ${dy * 0.55}px) scale(${scale * 2.2}, ${scale * 3})`, borderRadius: '50%', offset: 0.24 },
    { transform: 'translate(0, 0) scale(1.08, 0.92)', borderRadius: '42% 58% 55% 45% / 48% 44% 56% 52%', offset: 0.5 },
    { transform: 'scale(0.95, 1.05)', borderRadius: '38% 62% 46% 54% / 56% 42% 58% 44%', offset: 0.64 },
    { transform: 'scale(1.03, 0.97)', borderRadius: '30px', offset: 0.78 },
    { transform: 'scale(0.99, 1.01)', borderRadius: '22px', offset: 0.9 },
    { transform: 'none', borderRadius: '20px' },
  ], { duration: DROP_MS, easing: 'cubic-bezier(0.3, 0.7, 0.2, 1)' });
  for (const part of dialog.querySelectorAll('.dialog-header, .dialog-body, .dialog-footer')) {
    part.animate([{ opacity: 0 }, { opacity: 0, offset: 0.5 }, { opacity: 1 }], { duration: DROP_MS, easing: 'ease-out' });
  }
  try {
    dialog.animate([{ opacity: 0 }, { opacity: 1 }], { duration: DROP_MS / 2, pseudoElement: '::backdrop' });
  } catch {
    // Older browsers cannot animate ::backdrop; it simply appears.
  }
}

/** The reverse: the dialog shrinks back into the button as a drop. Resolves when done. */
export function dropOut(dialog: HTMLElement, to: DOMRect | null): Promise<unknown> {
  if (!to || reducedMotion()) return dialog.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 120, fill: 'forwards' }).finished;
  const { dx, dy, scale } = dropGeometry(dialog, to);
  return dialog.animate([
    { transform: 'none', borderRadius: '20px', opacity: 1 },
    { transform: `translate(${dx * 0.5}px, ${dy * 0.5}px) scale(${scale * 2.4}, ${scale * 2})`, borderRadius: '50%', opacity: 1, offset: 0.6 },
    { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, borderRadius: '50%', opacity: 0 },
  ], { duration: 300, easing: 'cubic-bezier(0.5, 0, 0.75, 0)', fill: 'forwards' }).finished;
}

/**
 * A closing dialog drops back into the button that opened it. The real <dialog> is about to close
 * (or unmount), so a static copy takes its place over a fading backdrop, shrinks into the button,
 * and the button takes the drop (see splash).
 */
export type DialogSnapshot = { html: string; className: string; box: DOMRect };

/** What the dialog looks like now, for dropBack once it is gone. */
export const snapshotDialog = (dialog: HTMLDialogElement): DialogSnapshot => ({ html: dialog.innerHTML, className: dialog.className, box: dialog.getBoundingClientRect() });

export function dropBack(dialog: DialogSnapshot, button: HTMLElement | null) {
  const to = originRect(button);
  const { box } = dialog;
  if (!to || reducedMotion() || box.width === 0) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'dialog-ghost-backdrop';
  const ghost = document.createElement('div');
  ghost.className = `${dialog.className} dialog-ghost`;
  ghost.setAttribute('aria-hidden', 'true');
  ghost.inert = true;
  ghost.innerHTML = dialog.html;
  // A picture only: no duplicate ids, test ids or form names while the real page carries on.
  for (const element of ghost.querySelectorAll('[id], [data-testid], [name], [for]')) {
    element.removeAttribute('id');
    element.removeAttribute('data-testid');
    element.removeAttribute('name');
    element.removeAttribute('for');
  }
  Object.assign(ghost.style, { left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px` });
  document.body.append(backdrop, ghost);
  backdrop.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: 'ease-in', fill: 'forwards' });
  const land = () => { ghost.remove(); backdrop.remove(); splash(button); };
  void dropOut(ghost, to).then(land, land);
}
