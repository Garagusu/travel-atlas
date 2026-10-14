"use client";

import { Link2 } from "lucide-react";
import { useState } from "react";
import { getShareLink } from "@/app/actions/share";
import { useToast } from "@/components/ui/toast";
import { shareUrl } from "@/lib/places-util";

/** Creates (or reuses) a public link to a read-only list and shares it. */
export function ShareLinkButton({ cityId, title, className = "btn btn-ghost btn-sm" }: { cityId: number | null; title: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      aria-label={`Share a link: ${title}`}
      onClick={async () => {
        setBusy(true);
        try {
          const res = await getShareLink(cityId);
          if (!res.ok) return toast(res.error, "error");
          const r = await shareUrl(title, new URL(res.data.path, window.location.origin).href);
          if (r === "copied") toast("Link copied — anyone with it can see this list");
        } catch {
          toast("Couldn't create the link", "error");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Link2 size={14} /> Link
    </button>
  );
}
