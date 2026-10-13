"use client";

import Link from "next/link";
import { useTransition } from "react";
import { deleteJournalEntry } from "@/app/actions/journal";
import { useConfirm } from "@/components/ui/dialog";

export function EntryActions({ id, title }: { id: string; title: string }) {
  const confirm = useConfirm();
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <Link href={`/journal/${id}/edit`} className="btn btn-secondary btn-sm">Edit entry</Link>
      <button
        className="btn btn-danger btn-sm"
        disabled={pending}
        onClick={async () => {
          const ok = await confirm({ title: `Delete “${title}”?`, message: "The entry is deleted. Its photos stay in your library.", confirmLabel: "Delete entry", danger: true });
          if (ok) start(async () => void (await deleteJournalEntry(id)));
        }}
      >
        Delete
      </button>
    </div>
  );
}
