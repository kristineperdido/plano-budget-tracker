'use client';

/**
 * Shared page chrome: a painted tarpaulin header over ruled notebook paper.
 * The tarp carries the screen name on the left and one piece of live meta on
 * the right — a month, a phase count, a save state.
 */
export function Screen({
  title,
  meta,
  children,
}: {
  title: string;
  /** Right-hand tarp label. A string renders in Anton gold; pass a node to override. */
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <main className="paper mx-auto min-h-dvh max-w-md pb-28">
      <header className="tarp">
        <div className="tarp-inner">
          {/* Anton is uppercase-only here; screen readers get the normal-case string. */}
          <h1 className="tarp-title">{title}</h1>
          {typeof meta === 'string' ? <span className="tarp-meta">{meta}</span> : meta}
        </div>
        <div className="tarp-stripe" aria-hidden />
      </header>
      <div className="paper-body pt-5">{children}</div>
    </main>
  );
}

/**
 * A block of content on its own opaque sheet. Everything textual goes in one of
 * these, so the ruled ground shows in the gaps between them rather than through
 * the words.
 */
export function Card({
  title,
  amount,
  tape,
  children,
  className = '',
}: {
  title?: React.ReactNode;
  amount?: React.ReactNode;
  /** A strip of masking tape. Sparingly — one per screen, two at most. */
  tape?: 'left' | 'right';
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel mt-4 ${className}`}>
      {tape === 'left' && <span className="tape" style={{ left: 22 }} aria-hidden />}
      {tape === 'right' && <span className="tape tape-r" style={{ right: 24 }} aria-hidden />}
      {title && (
        <div className="leader mb-1.5">
          <h2 className="sign-label tint-teal">{title}</h2>
          <span className="leader-fill" aria-hidden />
          {amount && <span className="num text-[13px]">{amount}</span>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * The headline figure at the top of a screen. Opaque so the ruling stops above
 * it and picks up again below, but edgeless so it does not read as a card.
 */
export function Hero({ children }: { children: React.ReactNode }) {
  // Full-bleed to the page edges, cancelling the asymmetric gutter that
  // .paper-body uses to clear the margin rule. The band paints over the rule
  // rather than being interrupted by it — the same idea as the tape.
  return (
    <div
      className="slab"
      style={{ marginLeft: -44, marginRight: -16, paddingLeft: 16, paddingRight: 16 }}
    >
      {children}
    </div>
  );
}

/** A handwritten aside. The tilt is authored, never randomised. */
export function Aside({
  children,
  tilt = -2,
  tint,
  className = '',
}: {
  children: React.ReactNode;
  tilt?: number;
  tint?: 'green' | 'brick' | 'gold';
  className?: string;
}) {
  return (
    <p
      className={`aside ${tint ? `tint-${tint}` : ''} ${className}`}
      style={{ ['--tilt' as string]: `${tilt}deg` }}
    >
      {children}
    </p>
  );
}
