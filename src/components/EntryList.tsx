'use client';

import { php2 } from '@/lib/model';
import { type Member } from '@/lib/members';
import { PersonTag } from '@/components/Payer';
import { categoryLabel, type CategoryDef } from '@/lib/config';
import type { FoodEntry } from '@/lib/types';

export function EntryList({
  entries,
  categories,
  onDelete,
  pendingDelete,
  me,
  members,
}: {
  entries: FoodEntry[];
  categories: CategoryDef[];
  onDelete: (id: string) => void;
  pendingDelete: string | null;
  me?: string;
  members: Member[];
}) {
  if (entries.length === 0) {
    return <p className="empty py-5 text-center">nothing here yet</p>;
  }

  return (
    <ul>
      {entries.map((e) => {
        const label = categoryLabel(e.category, categories);
        return (
          <li key={e.id} className="row">
            <PersonTag person={e.person} me={me} members={members} />
            <span className="row-label">
              {label}
              {e.note && <span className="row-meta block">{e.note}</span>}
            </span>
            {/* Logged money is exact, so it keeps its centavos. */}
            <span className="num text-[14.5px]">{php2(e.amount)}</span>
            <button
              type="button"
              onClick={() => onDelete(e.id)}
              disabled={pendingDelete === e.id}
              aria-label={`Delete ${label} ${php2(e.amount)}`}
              className="tint-muted -my-2 px-2 py-3 text-[15px] leading-none disabled:opacity-40"
            >
              ×
            </button>
          </li>
        );
      })}
    </ul>
  );
}
