'use client';

import { php2 } from '@/lib/model';
import { personLabel, type Member } from '@/lib/members';
import { CATEGORY_LABEL, type FoodEntry } from '@/lib/types';

export function EntryList({
  entries,
  onDelete,
  pendingDelete,
  me,
  members,
}: {
  entries: FoodEntry[];
  onDelete: (id: string) => void;
  pendingDelete: string | null;
  me?: string;
  members: Member[];
}) {
  if (entries.length === 0) {
    return (
      <p className="tint-muted serif px-1 py-4 text-center text-[0.85rem] italic">
        Nothing logged yet today.
      </p>
    );
  }

  return (
    <ul>
      {entries.map((e) => (
        <li key={e.id} className="leader group py-1.5">
          <span className="text-[0.9rem]">
            {CATEGORY_LABEL[e.category]}
            {e.note && <span className="tint-muted"> · {e.note}</span>}
            {personLabel(e.person, me, members) && (
              <span className="tint-muted text-[0.72rem]">
                {' '}
                ({personLabel(e.person, me, members)})
              </span>
            )}
          </span>
          <span className="leader-fill" aria-hidden />
          <span className="num text-[0.9rem]">{php2(e.amount)}</span>
          <button
            type="button"
            onClick={() => onDelete(e.id)}
            disabled={pendingDelete === e.id}
            aria-label={`Delete ${CATEGORY_LABEL[e.category]} ${php2(e.amount)}`}
            className="tint-muted -my-2 px-2 py-2 text-[0.95rem] leading-none disabled:opacity-40"
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}
