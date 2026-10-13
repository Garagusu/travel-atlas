import { JournalEditor } from "@/components/forms/journal-editor";
import { Container } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { cityLabel, listTripOptions } from "@/lib/data";

export const metadata = { title: "New journal entry" };

export default async function NewEntryPage({ searchParams }: PageProps<"/journal/new">) {
  const user = await requireUser();
  const sp = await searchParams;
  const cityId = Number(sp.city);
  const [city, trips] = await Promise.all([cityId ? cityLabel(cityId) : null, listTripOptions(user.id)]);
  const tripId = typeof sp.trip === "string" && trips.some((t) => t.id === sp.trip) ? sp.trip : null;
  return (
    <Container className="max-w-3xl">
      <JournalEditor
        trips={trips}
        initial={{
          title: "",
          entryDate: "",
          city: city ? { id: city.id, name: city.name, state: city.stateCode } : null,
          tripId,
          body: "",
          highlights: "",
          placesVisited: [],
          tags: [],
          photos: [],
        }}
      />
    </Container>
  );
}
