"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { revokeShareLink } from "@/app/actions/share";
import { useToast } from "@/components/ui/toast";

export function ShareLinkList({ links }: { links: { id: string; title: string; created: string }[] }) {
  const [pending, start] = useTransition();
  const toast = useToast();
  const router = useRouter();
  if (!links.length) return <p className="text-sm text-ink-soft">You haven&apos;t shared any links yet. Use “Link” on a city&apos;s places or on the Places page.</p>;
  return (
    <ul className="divide-y divide-line">
      {links.map((l) => (
        <li key={l.id} className="py-2.5 flex items-center gap-3">
          <div className="flex-1 min-w-0">
            <a href={`/s/${l.id}`} target="_blank" rel="noreferrer" className="font-medium hover:text-pine">{l.title}</a>
            <p className="text-xs text-ink-faint">Shared {l.created}</p>
          </div>
          <button
            className="btn btn-danger btn-sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const r = await revokeShareLink(l.id);
                if (!r.ok) return toast(r.error, "error");
                toast("Link turned off");
                router.refresh();
              })
            }
          >
            Turn off
          </button>
        </li>
      ))}
    </ul>
  );
}
