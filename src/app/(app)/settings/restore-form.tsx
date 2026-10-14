"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { useConfirm } from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";

type Summary = { format: "full" | "pages"; cities: number; places: number; trips: number; albums: number; journalEntries: number; photos: number; photosSkipped: number };

export function RestoreForm() {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const toast = useToast();
  const router = useRouter();

  const restore = async (file: File) => {
    const ok = await confirm({
      title: "Restore this backup?",
      message: "Everything currently in your journal is replaced by the backup's contents. Download a backup of the current journal first if you might want it back.",
      confirmLabel: "Replace and restore",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/import", { method: "POST", body: file, headers: { "Content-Type": "application/zip" } });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `Restore failed (${res.status})`);
      setResult(body.summary);
      toast("Backup restored");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => input.current?.click()}>
        {busy ? "Restoring… (large backups take a few minutes)" : "Choose backup file"}
      </button>
      <input
        ref={input}
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        aria-label="Backup file"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void restore(f);
        }}
      />
      {error && <p className="field-error mt-2" role="alert">{error}</p>}
      {result && (
        <p className="text-sm text-pine mt-2" role="status">
          Restored {result.cities} cities, {result.places} places, {result.trips} trips, {result.albums} albums, {result.journalEntries} journal entries and {result.photos} photos
          {result.format === "pages" ? " from the GitHub Pages edition" : ""}.
          {result.photosSkipped > 0 && ` ${result.photosSkipped} photos couldn't be restored.`}
        </p>
      )}
    </div>
  );
}
