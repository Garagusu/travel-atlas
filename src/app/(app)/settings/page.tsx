import { Container, PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { formatDate } from "@/components/ui/format";
import { getStats, listShareLinks } from "@/lib/data";
import { PasswordForm } from "./password-form";
import { RestoreForm } from "./restore-form";
import { ShareLinkList } from "./share-links";
import { storage } from "@/lib/storage";

export const metadata = { title: "Settings and backup" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [stats, links] = await Promise.all([getStats(user.id), listShareLinks(user.id)]);
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
        <div className="rounded-xl border border-line p-4">
          <p className="font-semibold">Restore from a backup</p>
          <p className="text-sm text-ink-soft mt-1 mb-3">
            Replaces your journal with a backup ZIP. Works with backups from this app and from the GitHub Pages edition, so you can move a journal you started there.
          </p>
          <RestoreForm />
        </div>
        <p className="text-sm text-ink-soft">
          For server-level backups, use <code className="text-[13px] bg-fog rounded px-1">pg_dump</code> for the database and copy the photo storage. The README explains both.
        </p>
      </section>
      <section className="mt-8 card p-6" aria-labelledby="links-h">
        <h2 id="links-h" className="text-2xl mb-1">Shared links</h2>
        <p className="text-sm text-ink-soft mb-3">Anyone with one of these links can see that list of places and notes, without signing in. Nothing else in your journal is visible.</p>
        <ShareLinkList
          links={links.map((l) => ({
            id: l.id,
            title: l.cityName ? `My picks in ${l.cityName}, ${l.stateCode}` : "All my favorite places",
            created: formatDate(l.createdAt.toISOString().slice(0, 10)),
          }))}
        />
      </section>

      <section className="mt-8 card p-6" aria-labelledby="pw-h">
        <h2 id="pw-h" className="text-2xl mb-3">Password</h2>
        <PasswordForm />
        <p className="text-xs text-ink-faint mt-4">Forgot it? Whoever runs the server can set a new one with <code className="bg-fog rounded px-1">npm run reset-password</code> (see the README).</p>
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
