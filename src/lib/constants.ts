export const TAGS = [
  "Food",
  "Nature",
  "Hiking",
  "Architecture",
  "History",
  "Shopping",
  "Road Trip",
  "Beach",
  "Museums",
  "Nightlife",
  "Family",
  "Music",
] as const;

export const STATUS_LABEL = {
  not_visited: "Not visited",
  want_to_visit: "Want to visit",
  visited: "Visited",
} as const;

export const PLACE_CATEGORY_LABEL = {
  restaurant: "Restaurant",
  cafe: "Café",
  bar: "Bar",
  museum: "Museum",
  attraction: "Attraction",
  activity: "Activity",
  park: "Park or trail",
  shop: "Shop",
  hotel: "Stay",
  other: "Other",
} as const;

export const photoUrl = (id: string, variant: "thumb" | "display" | "original" = "thumb") =>
  `/api/photos/${id}/${variant}`;
