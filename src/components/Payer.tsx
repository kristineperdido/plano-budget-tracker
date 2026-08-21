'use client';

import { PAYER_LABEL, PAYER_NOTE, type Payer } from '@/lib/config';
import { personLabel, type Member } from '@/lib/members';

/**
 * Who paid, as a shape plus a name. The shape reads before the word does; the
 * name removes the ambiguity a shape alone would leave. People are deliberately
 * never colour-coded — green, brick and gold each mean exactly one thing here
 * (under, over, uncertain) and lending one to a person would break that.
 */
export type Shape = 'solid' | 'hollow' | 'both';

export function PayerMark({ shape }: { shape: Shape }) {
  if (shape === 'both') {
    return (
      <span className="payer-mark payer-mark--both" aria-hidden>
        <span />
        <span />
      </span>
    );
  }
  return <span className={`payer-mark payer-mark--${shape}`} aria-hidden />;
}

const SHAPE_FOR_PAYER: Record<Payer, Shape> = {
  her: 'solid',
  him: 'hollow',
  split: 'both',
  each: 'both',
};

/** The plan-side payer: who carries a line item. */
export function PayerTag({ payer, fixed = true }: { payer: Payer; fixed?: boolean }) {
  const note = PAYER_NOTE[payer];
  return (
    <span className={`payer ${fixed ? 'payer-fixed' : ''}`}>
      <PayerMark shape={SHAPE_FOR_PAYER[payer]} />
      <span className="payer-name">{PAYER_LABEL[payer]}</span>
      {note && !fixed && <span className="row-meta">{note}</span>}
    </span>
  );
}

/**
 * The entry-side person: who logged a spend. Attribution is an email, so the
 * shape is assigned by position in the roster — stable for as long as the
 * roster is, and the name is always there regardless.
 */
export function shapeForPerson(person: string | null, members: Member[]): Shape {
  if (!person) return 'hollow';
  const i = [...members]
    .sort((a, b) => a.email.localeCompare(b.email))
    .findIndex((m) => m.email.toLowerCase() === person.toLowerCase());
  return i === 1 ? 'hollow' : 'solid';
}

export function PersonTag({
  person,
  me,
  members,
}: {
  person: string | null;
  me: string | undefined;
  members: Member[];
}) {
  const name = personLabel(person, me, members);
  if (!name) return null;
  return (
    <span className="payer">
      <PayerMark shape={shapeForPerson(person, members)} />
      <span className="payer-name">{name}</span>
    </span>
  );
}
