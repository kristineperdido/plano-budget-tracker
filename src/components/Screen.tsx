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

/** A section heading: LABEL ————————— subtotal. */
export function SectionLabel({
  children,
  amount,
}: {
  children: React.ReactNode;
  amount?: React.ReactNode;
}) {
  return (
    <div className="leader mt-7 mb-1">
      <h2 className="sign-label tint-teal">{children}</h2>
      <span className="leader-fill" aria-hidden />
      {amount && <span className="num text-[13px]">{amount}</span>}
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
