export type VisitStatus = "not_visited" | "want_to_visit" | "visited";

export type CityRef = {
  id: number;
  name: string;
  state: string;
  lat: number;
  lon: number;
  pop: number;
  custom?: boolean;
};

export type CityLog = {
  cityId: number;
  status: VisitStatus;
  visitedOn: string | null;
  visitedUntil: string | null;
  rating: number | null;
  impression: string | null;
  notes: string | null;
  tags: string[];
  coverPhotoId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type StateLog = { code: string; notes: string | null; coverPhotoId: string | null; updatedAt: string };

export type PlaceCategory = "restaurant" | "museum" | "attraction" | "activity" | "cafe" | "bar" | "hotel" | "park" | "shop" | "other";

export type Place = {
  id: string;
  cityId: number;
  name: string;
  category: PlaceCategory;
  address?: string | null;
  notes: string | null;
  url: string | null;
  lat: number | null;
  lon: number | null;
  favorite: boolean;
  createdAt: string;
};

export type Trip = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  summary: string | null;
  notes: string | null;
  coverPhotoId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TripStop = {
  id: string;
  tripId: string;
  cityId: number;
  position: number;
  arriveOn: string | null;
  departOn: string | null;
  notes: string | null;
};

export type Photo = {
  id: string;
  cityId: number | null;
  tripId: string | null;
  originalName: string | null;
  mimeType: string;
  sizeBytes: number;
  width: number;
  height: number;
  dominantColor: string | null;
  takenOn: string | null;
  /** where it was taken; missing on photos saved before locations were kept */
  lat?: number | null;
  lon?: number | null;
  /** false/missing: the original hasn't been read for GPS yet */
  gpsChecked?: boolean;
  caption: string | null;
  description: string | null;
  position: number;
  createdAt: string;
};

export type Album = {
  id: string;
  title: string;
  description: string | null;
  tripId: string | null;
  coverPhotoId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AlbumPhoto = { albumId: string; photoId: string; position: number; addedAt: string };

export type JournalEntry = {
  id: string;
  title: string;
  entryDate: string;
  cityId: number | null;
  tripId: string | null;
  body: string;
  highlights: string | null;
  placesVisited: string[];
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type JournalPhoto = { entryId: string; photoId: string; position: number };

/** Photo plus display context, the shape the gallery components use. */
export type PhotoItem = Photo & { cityName?: string | null; stateCode?: string | null };

export type PhotoVariant = "thumb" | "display" | "original";
