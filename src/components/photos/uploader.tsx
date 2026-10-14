"use client";

import { ImagePlus, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import type { PhotoItem } from "@/lib/data";

export type UploadTarget = { cityId?: number; tripId?: string; albumId?: string; journalEntryId?: string };

type Item = { key: string; file: File; progress: number; status: "queued" | "uploading" | "done" | "error"; error?: string; filedIn?: string };

// Listing only these types makes iPhones convert HEIC photos to JPEG before uploading.
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
const MAX_MB = 25;

type AutoCity = { id: number; name: string; stateCode: string } | null;

function uploadOne(file: File, target: UploadTarget, onProgress: (p: number) => void): Promise<{ photo: PhotoItem; autoCity: AutoCity }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);
    for (const [k, v] of Object.entries(target)) if (v !== undefined && v !== null) form.append(k, String(v));
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/photos");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => {
      let body: { photo?: PhotoItem; autoCity?: AutoCity; error?: string } = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.photo) resolve({ photo: body.photo, autoCity: body.autoCity ?? null });
      else reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error — check your connection and try again"));
    xhr.send(form);
  });
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
  const router = useRouter();

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
            const { photo, autoCity } = await uploadOne(item.file, target, (p) => update(item.key, { progress: p }));
            update(item.key, { status: "done", progress: 1, filedIn: autoCity ? `${autoCity.name}, ${autoCity.stateCode}` : undefined });
            onUploaded?.(photo);
            ok++;
          } catch (e) {
            update(item.key, { status: "error", error: (e as Error).message });
          }
        }
      };
      await Promise.all([worker(), worker(), worker()]);
      if (ok) {
        router.refresh();
        setTimeout(() => setItems((list) => list.filter((i) => i.status !== "done" || i.filedIn)), 1500);
      }
    },
    [target, onUploaded, router],
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
          {!compact && <span className="block text-xs text-ink-faint mt-1">JPEG, PNG, WebP or GIF (iPhone photos are converted automatically), up to {MAX_MB} MB each. Photos with a location are filed under the nearest city.</span>}
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
          {active > 0 && <li className="text-xs text-ink-soft">Uploading {active} {active === 1 ? "photo" : "photos"}…</li>}
          {items.map((i) => (
            <li key={i.key} className="flex items-center gap-3 text-sm">
              <span className="truncate flex-1 min-w-0">{i.file.name}</span>
              {i.status === "error" ? (
                <span className="text-danger text-xs shrink-0 max-w-[60%] text-right">{i.error}</span>
              ) : i.status === "done" ? (
                <span className="text-pine text-xs shrink-0">{i.filedIn ? `Filed in ${i.filedIn}` : "Uploaded"}</span>
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
