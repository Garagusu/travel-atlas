import { useEffect, useRef, useState } from "react";
import { useConfirm } from "@/components/ui/dialog";
import { Container, PageHeader } from "@/components/ui/page-header";
import { useToast } from "@/components/ui/toast";
import { eraseEverything, exportBackup, importBackup, storageEstimate } from "@/lib/backup";
import { useTitle } from "@/lib/nav";
import { getStats, useStore } from "@/lib/store";

const mb = (n: number) => (n / 1048576 < 1024 ? `${(n / 1048576).toFixed(1)} MB` : `${(n / 1073741824).toFixed(1)} GB`);

export function SettingsPage() {
  useTitle("Backup and settings");
  const stats = useStore(getStats);
  const [busy, setBusy] = useState<string | null>(null);
  const [est, setEst] = useState<Awaited<ReturnType<typeof storageEstimate>>>(null);
  const file = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const confirm = useConfirm();

  useEffect(() => {
    storageEstimate().then(setEst);
  }, [stats.photos]);

  const download = async () => {
    setBusy("Preparing backup…");
    try {
      const blob = await exportBackup(setBusy);
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `travel-atlas-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
      toast("Backup downloaded");
    } catch (e) {
      toast(`Backup failed: ${(e as Error).message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  const restore = async (f: File) => {
    const ok = await confirm({
      title: "Restore this backup?",
      message: "Everything currently saved in this browser is replaced by the contents of the backup.",
      confirmLabel: "Replace and restore",
      danger: true,
    });
    if (!ok) return;
    setBusy("Restoring…");
    try {
      await importBackup(f, setBusy);
      toast("Backup restored");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Container className="max-w-3xl">
      <PageHeader title="Backup and settings" subtitle="Your journal is stored in this browser, on this device." />

      <section className="card p-6 space-y-4" aria-labelledby="backup-h">
        <h2 id="backup-h" className="text-2xl">Back up your journal</h2>
        <p className="text-ink-soft">
          You have {stats.citiesVisited} visited cities, {stats.trips} trips, {stats.journalEntries} journal entries and {stats.photos} photos.
          Nothing is uploaded anywhere, so download a backup now and then. Use it to move the journal to another device or browser.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-line p-4">
            <p className="font-semibold">Download backup</p>
            <p className="text-sm text-ink-soft mt-1 mb-3">One ZIP with all your notes, trips, albums, journal and every photo.</p>
            <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={download}>Download ZIP</button>
          </div>
          <div className="rounded-xl border border-line p-4">
            <p className="font-semibold">Restore from backup</p>
            <p className="text-sm text-ink-soft mt-1 mb-3">Replaces what&apos;s in this browser with a backup ZIP.</p>
            <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={() => file.current?.click()}>Choose backup file</button>
            <input
              ref={file}
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
          </div>
        </div>
        {busy && <p className="text-sm text-ink-soft" role="status">{busy}</p>}
      </section>

      <section className="mt-8 card p-6" aria-labelledby="sys-h">
        <h2 id="sys-h" className="text-2xl mb-3">Where your data lives</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-soft">Storage</dt>
          <dd>
            This browser&apos;s private storage (IndexedDB)
            {est && `, ${mb(est.usage)} used of about ${mb(est.quota)} available`}
            {est && (est.persisted ? ". Protected from automatic cleanup." : ". The browser may clear it if the device runs low on space — keep backups.")}
          </dd>
          <dt className="text-ink-soft">Privacy</dt>
          <dd>Anyone opening this site sees their own empty journal. Your records and photos never leave this device unless you download a backup.</dd>
          <dt className="text-ink-soft">Map data</dt>
          <dd>State boundaries from the US Census Bureau (via us-atlas); city locations from GeoNames, CC BY 4.0.</dd>
        </dl>
      </section>

      <section className="mt-8 card p-6" aria-labelledby="erase-h">
        <h2 id="erase-h" className="text-2xl mb-2">Start over</h2>
        <p className="text-sm text-ink-soft mb-3">Deletes every record and photo saved in this browser.</p>
        <button
          className="btn btn-danger btn-sm"
          disabled={!!busy}
          onClick={async () => {
            const ok = await confirm({ title: "Erase everything?", message: "All cities, trips, albums, journal entries and photos in this browser are deleted. Download a backup first if you want to keep them.", confirmLabel: "Erase everything", danger: true });
            if (!ok) return;
            await eraseEverything();
            toast("Journal erased");
          }}
        >
          Erase this journal
        </button>
      </section>
    </Container>
  );
}
