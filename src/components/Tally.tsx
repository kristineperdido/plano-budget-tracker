/**
 * Hand tally strokes, five to a gate. Always a decorative duplicate of a number
 * printed right beside it, so it is hidden from screen readers entirely.
 */
export function Tally({
  count,
  tint,
  max = 14,
}: {
  count: number;
  tint?: 'green' | 'gold' | 'brick';
  max?: number;
}) {
  const n = Math.max(0, Math.min(Math.round(count), max));
  return (
    <span className={`tally ${tint ? `tally--${tint}` : ''}`} aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        // Every fifth stroke crosses the preceding four.
        <span key={i} className={`tally-mark ${(i + 1) % 5 === 0 ? 'tally-mark--slash' : ''}`} />
      ))}
    </span>
  );
}
