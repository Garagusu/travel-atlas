import { useParams, useSearchParams } from "react-router";
import { JournalEditor } from "@/components/forms/journal-editor";
import { Container } from "@/components/ui/page-header";
import { useTitle } from "@/lib/nav";
import { cityById, getJournalEntry, listTripOptions, R, useStore } from "@/lib/store";
import { NotFound } from "../not-found";

export function NewEntryPage() {
  useTitle("New journal entry");
  const [sp] = useSearchParams();
  const trips = useStore(listTripOptions);
  const city = cityById(Number(sp.get("city")));
  const tripParam = sp.get("trip");
  const tripId = tripParam && R.trips.has(tripParam) ? tripParam : null;
  return (
    <Container className="max-w-3xl">
      <JournalEditor
        trips={trips}
        initial={{
          title: "",
          entryDate: "",
          city: city ? { id: city.id, name: city.name, state: city.state } : null,
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

export function EditEntryPage() {
  useTitle("Edit entry");
  const id = useParams().id ?? "";
  // read once: the editor owns the form state after that
  const e = useStore(() => getJournalEntry(id), [id]);
  const trips = useStore(listTripOptions);
  if (!e) return <NotFound />;
  return (
    <Container className="max-w-3xl">
      <JournalEditor
        key={e.id}
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
