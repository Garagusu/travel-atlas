import { Container, PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getStats } from "@/lib/data";
import { storage } from "@/lib/storage";

export const metadata = { title: "Settings and backup" };

export default async function SettingsPage() {
  const user = await requireUser();
  const stats = await getStats(user.id);
  let storageName = "not configured";
  try {
    storageName = storage().name === "s3" ? "S3-compatible bucket" : "local disk";
  } catch (e) {
    storageName = `misconfigured: ${(e as Error).message}`;
  }
  return (
    <Container className="max-w-3xl">
      <PageHeader title="Settings and backup" subtitle={`Signed in as ${user.email}.`} />
      <section className="card p-6 space-y-4" aria-labelledby="backup-h">
        <h2 id="backup-h" className="text-2xl">Back up your journal</h2>
        <p className="text-ink-soft">
          You have {stats.citiesVisited} visited cities, {stats.trips} trips, {stats.journalEntries} journal entries and {stats.photos} photos.
        </p>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-xl border border-line p-4">
            <p className="font-semibold">Full backup (ZIP)</p>
            <p className="text-sm text-ink-soft mt-1 mb-3">All your data as JSON plus every original photo. Can be large.</p>
            <a href="/api/export/archive" className="btn btn-primary btn-sm" download>Download ZIP</a>
          </div>
          <div className="rounded-xl border border-line p-4">
            <p className="font-semibold">Data only (JSON)</p>
            <p className="text-sm text-ink-soft mt-1 mb-3">Cities, notes, places, trips, albums, journal and photo details, without image files.</p>
            <a href="/api/export" className="btn btn-secondary btn-sm" download>Download JSON</a>
          </div>
        </div>
        <p className="text-sm text-ink-soft">
          For server-level backups, use <code className="text-[13px] bg-fog rounded px-1">pg_dump</code> for the database and copy the photo storage. The README explains both.
        </p>
      </section>
      <section className="mt-8 card p-6" aria-labelledby="sys-h">
        <h2 id="sys-h" className="text-2xl mb-3">Where your data lives</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-ink-soft">Database</dt>
          <dd>PostgreSQL</dd>
          <dt className="text-ink-soft">Photo storage</dt>
          <dd>{storageName}</dd>
          <dt className="text-ink-soft">Map data</dt>
          <dd>State boundaries from the US Census Bureau (via us-atlas); city locations from GeoNames, CC BY 4.0.</dd>
        </dl>
      </section>
    </Container>
  );
}
