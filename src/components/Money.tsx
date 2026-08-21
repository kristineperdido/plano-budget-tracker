import { php } from '@/lib/model';

/** A signed figure, green for surplus and brick for deficit. */
export function Signed({ value, size = '15px' }: { value: number; size?: string }) {
  const negative = value < 0;
  return (
    <span
      className={`num ${negative ? 'tint-brick' : 'tint-green'}`}
      style={{ fontSize: size }}
    >
      {negative ? '−' : '+'}
      {php(Math.abs(value))}
    </span>
  );
}

/**
 * The receipt row used across every screen: an optional payer mark, a label,
 * and the amount in mono on the right.
 */
export function Row({
  mark,
  label,
  sub,
  amount,
  tint,
  trailing,
}: {
  mark?: React.ReactNode;
  label: React.ReactNode;
  sub?: React.ReactNode;
  amount: React.ReactNode;
  tint?: 'green' | 'brick' | 'gold' | 'muted';
  trailing?: React.ReactNode;
}) {
  return (
    <div className="row">
      {mark}
      <span className="row-label">
        {label}
        {sub && <span className="row-meta block">{sub}</span>}
      </span>
      {trailing}
      <span className={`num num-row ${tint ? `tint-${tint}` : ''}`}>{amount}</span>
    </div>
  );
}
