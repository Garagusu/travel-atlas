import { Link2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { shareUrl } from "@/lib/places-util";
import { buildShared, shareLinkFor } from "@/lib/sharelink";

/** Shares a link that contains the list itself (no server needed). */
export function ShareLinkButton({ cityId, title, className = "btn btn-ghost btn-sm" }: { cityId: number | null; title: string; className?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className={className}
      aria-label={`Share a link: ${title}`}
      onClick={async () => {
        try {
          const r = await shareUrl(title, shareLinkFor(buildShared(cityId, title)));
          if (r === "copied") toast("Link copied — anyone with it can see this list");
        } catch {
          toast("Couldn't share or copy on this device", "error");
        }
      }}
    >
      <Link2 size={14} /> Link
    </button>
  );
}
