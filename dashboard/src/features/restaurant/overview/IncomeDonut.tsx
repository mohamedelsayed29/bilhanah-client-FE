export type DonutSlice = { key: string; label: string; value: number; color: string; detail: string };

const SIZE = 220;
const STROKE = 20;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Room between slices, and for the round caps. */
const GAP = STROKE + 6;

/** A ring of rounded slices with the total in the middle and a legend under it. */
export function IncomeDonut({ slices, total, label }: { slices: readonly DonutSlice[]; total: string; label: string }) {
  const sum = slices.reduce((value, slice) => value + slice.value, 0);
  const visible = slices.filter(slice => slice.value > 0);
  let offset = 0;
  return <figure className="income-donut" data-testid="income-donut">
    <div className="income-ring">
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`${label}: ${total}. ${visible.map(slice => `${slice.label} ${slice.detail}`).join('، ')}`}>
        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} className="income-track" strokeWidth={STROKE} />
        {sum > 0 && visible.map(slice => {
          const length = (slice.value / sum) * CIRCUMFERENCE;
          const drawn = visible.length > 1 ? Math.max(0.1, length - GAP) : length;
          const dash = `${drawn} ${CIRCUMFERENCE - drawn}`;
          const start = offset + (visible.length > 1 ? GAP / 2 : 0);
          offset += length;
          return <circle key={slice.key} cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={slice.color} strokeWidth={STROKE}
            strokeLinecap={visible.length > 1 ? 'round' : 'butt'} strokeDasharray={dash} strokeDashoffset={-start}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`} />;
        })}
      </svg>
      <strong className="income-total" data-testid="income-total">{total}</strong>
    </div>
    <figcaption>
      <ul className="income-legend">{slices.map(slice => <li key={slice.key}>
        <span className="income-swatch" style={{ background: slice.color }} aria-hidden="true" />
        <span className="income-legend-name"><bdi>{slice.label}</bdi></span>
        <small>{slice.detail}</small>
      </li>)}</ul>
    </figcaption>
  </figure>;
}
