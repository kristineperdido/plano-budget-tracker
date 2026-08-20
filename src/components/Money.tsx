import { php } from '@/lib/model';

/** A signed figure, green for surplus and brick for deficit. */
export function Signed({ value, size = '1rem' }: { value: number; size?: string }) {
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

/** Label ......... amount, the receipt row used across every screen. */
export function Row({
  label,
  sub,
  amount,
  tint,
  strong,
}: {
  label: React.ReactNode;
  sub?: React.ReactNode;
  amount: React.ReactNode;
  tint?: 'green' | 'brick' | 'gold' | 'muted';
  strong?: boolean;
}) {
  return (
    <div className="py-1.5">
      <div className="leader">
        <span className={`text-[0.88rem] ${strong ? 'serif' : ''}`}>{label}</span>
        <span className="leader-fill" aria-hidden />
        <span className={`num text-[0.88rem] ${tint ? `tint-${tint}` : ''}`}>{amount}</span>
      </div>
      {sub && <p className="tint-muted mt-0.5 text-[0.72rem]">{sub}</p>}
    </div>
  );
}
