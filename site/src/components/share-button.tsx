import { Share2 } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { recommendationText, shareText } from "@/lib/places-util";

type P = Parameters<typeof recommendationText>[1][number];

/** Shares a list of places as text (share sheet on phones, clipboard elsewhere). */
export function ShareButton({ title, places, label = "Share", className = "btn btn-ghost btn-sm" }: { title: string; places: P[]; label?: string; className?: string }) {
  const toast = useToast();
  return (
    <button
      type="button"
      className={className}
      aria-label={`${label}: ${title}`}
      onClick={async () => {
        try {
          const r = await shareText(title, recommendationText(title, places));
          if (r === "copied") toast("Copied — paste it into a message");
        } catch {
          toast("Couldn't share or copy on this device", "error");
        }
      }}
    >
      <Share2 size={14} /> {label}
    </button>
  );
}
