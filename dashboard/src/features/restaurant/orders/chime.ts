/**
 * The new-order sound, synthesized with the Web Audio API (no audio file).
 * Browsers only let a page play sound after the visitor interacted with it, so the
 * AudioContext is created and resumed from a user gesture (`unlockAudio`).
 */
export type AudioState = 'locked' | 'ready' | 'unsupported';

let context: AudioContext | null = null;
const listeners = new Set<() => void>();
const notify = () => { for (const listener of listeners) listener(); };

const supported = () => typeof window !== 'undefined' && typeof window.AudioContext === 'function';

export function getAudioState(): AudioState {
  if (!supported()) return 'unsupported';
  return context?.state === 'running' ? 'ready' : 'locked';
}

export function subscribeAudio(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Call from a click or key press. Resolves true once sound can play. */
export async function unlockAudio(): Promise<boolean> {
  if (!supported()) return false;
  try {
    if (!context) {
      context = new AudioContext();
      context.onstatechange = notify;
    }
    if (context.state !== 'running') await context.resume();
  } catch {
    // Still locked; the prompt stays.
  }
  notify();
  return context?.state === 'running';
}

/** The new-order sounds a screen can choose (kitchen display settings). */
export type ChimeTone = 'chime' | 'bell' | 'alert';
export const CHIME_TONES: ChimeTone[] = ['chime', 'bell', 'alert'];

/** [frequency, start offset, length, waveform] per note. */
const TONES: Record<ChimeTone, [number, number, number, OscillatorType][]> = {
  // Two short rising notes (the default).
  chime: [[880, 0, 0.45, 'sine'], [1318.5, 0.17, 0.45, 'sine'], [1760, 0.34, 0.45, 'sine']],
  // A counter bell: one bright strike with an overtone, ringing out.
  bell: [[1046.5, 0, 1.2, 'triangle'], [2093, 0, 0.8, 'sine'], [1046.5, 0.5, 1.2, 'triangle']],
  // Three insistent beeps that carry over a loud kitchen.
  alert: [[1400, 0, 0.14, 'square'], [1400, 0.2, 0.14, 'square'], [1400, 0.4, 0.14, 'square']],
};

const STYLE_KEY = 'bilhanah:chime-style:v1';
/** `repeat`: ring again every 30 s while new orders are not looked at. */
type ChimeStyle = { tone: ChimeTone; volume: number; repeat: boolean };

function readStyle(): ChimeStyle {
  try {
    const stored = JSON.parse(localStorage.getItem(STYLE_KEY) ?? 'null') as Partial<ChimeStyle> | null;
    return {
      tone: stored?.tone && CHIME_TONES.includes(stored.tone) ? stored.tone : 'chime',
      volume: typeof stored?.volume === 'number' ? Math.min(1, Math.max(0.05, stored.volume)) : 0.7,
      repeat: stored?.repeat !== false,
    };
  } catch {
    return { tone: 'chime', volume: 0.7, repeat: true };
  }
}

let style: ChimeStyle = typeof window === 'undefined' ? { tone: 'chime', volume: 0.7, repeat: true } : readStyle();

export function getChimeStyle(): ChimeStyle {
  return style;
}

/** Remembers this device's tone and volume (0.05..1). */
export function setChimeStyle(next: Partial<ChimeStyle>): ChimeStyle {
  style = { ...style, ...next };
  try { localStorage.setItem(STYLE_KEY, JSON.stringify(style)); } catch { /* Storage is optional. */ }
  notify();
  return style;
}

/** Plays this device's new-order sound (or `tone`). Returns false when sound is still locked. */
export function playChime(tone: ChimeTone = style.tone): boolean {
  if (!context || context.state !== 'running') return false;
  const start = context.currentTime + 0.02;
  const peak = 0.4 * style.volume;
  for (const [frequency, offset, length, wave] of TONES[tone]) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = wave;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(0.0001, start + offset);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, wave === 'square' ? peak * 0.35 : peak), start + offset + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + length);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(start + offset);
    oscillator.stop(start + offset + length + 0.05);
  }
  return true;
}
