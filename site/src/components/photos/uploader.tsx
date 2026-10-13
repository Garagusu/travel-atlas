import { ImagePlus, X } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { uploadPhoto, type UploadTarget } from "@/lib/actions";
import { withCity } from "@/lib/store";
import type { PhotoItem } from "@/lib/types";

export type { UploadTarget };

type Item = { key: string; file: File; progress: number; status: "queued" | "uploading" | "done" | "error"; error?: string };

const ACCEPT = "image/*";
const MAX_MB = 25;

async function uploadOne(file: File, target: UploadTarget, onProgress: (p: number) => void): Promise<PhotoItem> {
  onProgress(0.3);
  const res = await uploadPhoto(file, target);
  if (!res.ok) throw new Error(res.error);
  onProgress(1);
  return withCity(res.data.photo);
}

/** Drag-and-drop / file-picker uploader with per-file progress and errors. */
export function Uploader({
  target,
  onUploaded,
  compact,
  label = "Add photos",
}: {
  target: UploadTarget;
  onUploaded?: (p: PhotoItem) => void;
  compact?: boolean;
  label?: string;
}) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const update = (key: string, patch: Partial<Item>) => setItems((list) => list.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const start = useCallback(
    async (files: File[]) => {
      const fresh: Item[] = files.map((file) => {
        const tooBig = file.size > MAX_MB * 1024 * 1024;
        const notImage = file.type && !file.type.startsWith("image/");
        return {
          key: `${file.name}-${file.size}-${Math.random()}`,
          file,
          progress: 0,
          status: tooBig || notImage ? "error" : "queued",
          error: tooBig ? `Larger than ${MAX_MB} MB` : notImage ? "Not an image file" : undefined,
        };
      });
      setItems((list) => [...list.filter((i) => i.status !== "done"), ...fresh]);
      const queue = fresh.filter((i) => i.status === "queued");
      let ok = 0;
      const worker = async () => {
        for (let it = queue.shift(); it; it = queue.shift()) {
          const item = it;
          update(item.key, { status: "uploading" });
          try {
            const photo = await uploadOne(item.file, target, (p) => update(item.key, { progress: p }));
            update(item.key, { status: "done", progress: 1 });
            onUploaded?.(photo);
            ok++;
          } catch (e) {
            update(item.key, { status: "error", error: (e as Error).message });
          }
        }
      };
      await Promise.all([worker(), worker()]);
      if (ok) {
        setTimeout(() => setItems((list) => list.filter((i) => i.status !== "done")), 1500);
      }
    },
    [target, onUploaded],
  );

  const active = items.filter((i) => i.status === "uploading" || i.status === "queued").length;

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const files = [...e.dataTransfer.files];
          if (files.length) start(files);
        }}
        className={`rounded-[var(--radius-card)] border border-dashed transition-colors ${
          dragging ? "border-pine bg-pine-soft/40" : "border-line-strong bg-card/60"
        } ${compact ? "p-3" : "p-6"} flex ${compact ? "flex-row" : "flex-col"} items-center justify-center gap-3 text-center`}
      >
        <ImagePlus size={compact ? 18 : 26} className="text-ink-faint" aria-hidden />
        <p className="text-sm text-ink-soft">
          {compact ? "Drop photos here or" : "Drop photos here, or"}{" "}
          <button type="button" className="text-pine font-semibold underline underline-offset-2" onClick={() => input.current?.click()}>
            {compact ? "browse" : "choose from your computer"}
          </button>
          {!compact && <span className="block text-xs text-ink-faint mt-1">JPEG, PNG, WebP or GIF, up to {MAX_MB} MB each. Saved on this device.</span>}
        </p>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          className="sr-only"
          aria-label={label}
          onChange={(e) => {
            const files = [...(e.target.files ?? [])];
            e.target.value = "";
            if (files.length) start(files);
          }}
        />
      </div>
      {items.length > 0 && (
        <ul className="mt-3 space-y-1.5" aria-live="polite">
          {active > 0 && <li className="text-xs text-ink-soft">Adding {active} {active === 1 ? "photo" : "photos"}…</li>}
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-3 text-sm">
              <span className="truncate flex-1 min-w-0">{i.file.name}</span>
              {i.status === "error" ? (
                <span className="text-danger text-xs shrink-0 max-w-[60%] text-right">{i.error}</span>
              ) : i.status === "done" ? (
                <span className="text-pine text-xs shrink-0">Uploaded</span>
              ) : (
                <span className="w-28 h-1.5 rounded-full bg-fog overflow-hidden shrink-0" role="progressbar" aria-valuenow={Math.round(i.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                  <span className="block h-full bg-pine transition-[width]" style={{ width: `${Math.max(4, i.progress * 100)}%` }} />
                </span>
              )}
              {i.status === "error" && (
                <button type="button" className="text-ink-faint hover:text-ink" aria-label={`Dismiss ${i.file.name}`} onClick={() => setItems((l) => l.filter((x) => x.key !== i.key))}>
                  <X size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
