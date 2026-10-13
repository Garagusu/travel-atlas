import { notFound } from "next/navigation";
import { JournalEditor } from "@/components/forms/journal-editor";
import { Container } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getJournalEntry, listTripOptions } from "@/lib/data";

export const metadata = { title: "Edit entry" };

export default async function EditEntryPage({ params }: PageProps<"/journal/[id]/edit">) {
  const user = await requireUser();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const [e, trips] = await Promise.all([getJournalEntry(user.id, id), listTripOptions(user.id)]);
  if (!e) notFound();
  return (
    <Container className="max-w-3xl">
      <JournalEditor
        trips={trips}
        initial={{
          id: e.id,
          title: e.title,
          entryDate: e.entryDate,
          city: e.cityId && e.cityName && e.stateCode ? { id: e.cityId, name: e.cityName, state: e.stateCode } : null,
          tripId: e.tripId,
          body: e.body,
          highlights: e.highlights ?? "",
          placesVisited: e.placesVisited,
          tags: e.tags,
          photos: e.photos,
        }}
      />
    </Container>
  );
}
