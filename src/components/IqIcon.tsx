import { useId } from 'react';

/** Coral and mango petals turning around one point (the brand's leaves, "thinking"). */
const PETAL = 'M0 -1.5C7.6 -4 9.8 -12.4 1.2 -19.5C-2.8 -12.6 -2.6 -5.6 0 -1.5Z';

/**
 * The Bilhanah IQ mark: the brand's coral and mango petals, turning on an aubergine tile.
 * The same drawing is in public/brand/bilhanah-iq.svg for use outside the app.
 */
export function IqIcon({ size = 40, className, animated = false }: { size?: number; className?: string; /** The petals turn a quarter at a time, as if thinking. */ animated?: boolean }) {
  const id = useId().replace(/:/g, '');
  return <svg className={className} width={size} height={size} viewBox="0 0 64 64" fill="none" aria-hidden="true" focusable="false">
    <defs>
      <linearGradient id={`${id}-bg`} x1="8" y1="4" x2="56" y2="60" gradientUnits="userSpaceOnUse"><stop stopColor="#4E1F45" /><stop offset="1" stopColor="#2A1024" /></linearGradient>
      <radialGradient id={`${id}-sheen`} cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(18 10) rotate(55) scale(46)"><stop stopColor="#fff" stopOpacity=".16" /><stop offset=".55" stopColor="#fff" stopOpacity="0" /></radialGradient>
    </defs>
    <rect width="64" height="64" rx="18" fill={`url(#${id}-bg)`} />
    <rect width="64" height="64" rx="18" fill={`url(#${id}-sheen)`} />
    <rect x=".5" y=".5" width="63" height="63" rx="17.5" stroke="#fff" strokeOpacity=".08" />
    <g className={animated ? 'iq-icon-turn' : undefined}>
      <g transform="translate(32 32)">
        {(['#F45164', '#FFC857', '#F45164', '#FFC857'] as const).map((fill, index) => <path key={index} d={PETAL} fill={fill} transform={`rotate(${index * 90})`} />)}
      </g>
    </g>
  </svg>;
}
