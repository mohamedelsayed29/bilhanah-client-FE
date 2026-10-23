import type { PublicOrder } from '@bilhanah/contracts';

/**
 * Called once when a tracked order turns READY while its page is open.
 * Phase 5 hook point: notification sound settings, push notifications and wake-ups go here.
 */
export function announceOrderReady(_order: PublicOrder) {
  if (document.visibilityState !== 'visible') return;
  try { navigator.vibrate?.([180, 90, 180]); } catch { /* Not supported or not allowed. */ }
  playChime();
}

/** A soft two-note chime, synthesized so no audio file ships with the page. Browsers may block it without a tap. */
function playChime() {
  const AudioContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const context = new AudioContextClass();
    const start = context.currentTime + 0.05;
    [659.25, 987.77].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const at = start + index * 0.18;
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.12, at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.6);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.65);
    });
    window.setTimeout(() => void context.close(), 1200);
  } catch { /* Audio is a nicety. */ }
}
