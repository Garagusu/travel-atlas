import { describe, expect, it } from "vitest";
import { guessCategory, isShortMapsLink, mapsUrl, parseMapsLink, recommendationText } from "@/lib/places-util";

describe("map link parsing", () => {
  it("prefers the exact place pin in Google place links", () => {
    const url =
      "https://www.google.com/maps/place/Neptune+Oyster/@42.3633,-71.0567,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d42.3634156!4d-71.0559294!16s";
    expect(parseMapsLink(url)).toEqual({ lat: 42.3634156, lon: -71.0559294, name: "Neptune Oyster" });
  });

  it("reads map views, query links, Apple Maps and plain coordinates", () => {
    expect(parseMapsLink("https://www.google.com/maps/@40.7794,-73.9632,15z")).toEqual({ lat: 40.7794, lon: -73.9632 });
    expect(parseMapsLink("https://www.google.com/maps/search/?api=1&query=37.8024,-122.4058")).toEqual({ lat: 37.8024, lon: -122.4058 });
    expect(parseMapsLink("https://maps.google.com/?q=34.0522%2C-118.2437")).toEqual({ lat: 34.0522, lon: -118.2437 });
    expect(parseMapsLink("https://maps.apple.com/?ll=41.8789,-87.6359&q=Willis%20Tower")).toEqual({ lat: 41.8789, lon: -87.6359 });
    expect(parseMapsLink("42.3601, -71.0589")).toEqual({ lat: 42.3601, lon: -71.0589 });
  });

  it("rejects text without coordinates and flags short links", () => {
    expect(parseMapsLink("great oysters")).toBeNull();
    expect(parseMapsLink("https://maps.app.goo.gl/abc123")).toBeNull();
    expect(isShortMapsLink("https://maps.app.goo.gl/abc123")).toBe(true);
  });
});

describe("categories, links and sharing", () => {
  it("maps OpenStreetMap types to categories", () => {
    expect(guessCategory("amenity", "restaurant")).toBe("restaurant");
    expect(guessCategory("tourism", "museum")).toBe("museum");
    expect(guessCategory("amenity", "pub")).toBe("bar");
    expect(guessCategory("leisure", "park")).toBe("park");
    expect(guessCategory("shop", "books")).toBe("shop");
    expect(guessCategory("tourism", "viewpoint")).toBe("attraction");
    expect(guessCategory("building", "yes")).toBe("other");
  });

  it("builds Google Maps links from the address or the pin", () => {
    expect(mapsUrl({ name: "Neptune Oyster", address: "63 Salem Street, Boston, Massachusetts" })).toBe(
      "https://www.google.com/maps/search/?api=1&query=Neptune%20Oyster%2C%2063%20Salem%20Street%2C%20Boston%2C%20Massachusetts",
    );
    expect(mapsUrl({ name: "Somewhere", lat: 42.1, lon: -71.2 })).toBe("https://www.google.com/maps/search/?api=1&query=42.1,-71.2");
    expect(mapsUrl({ name: "Fenway Park", cityName: "Boston", stateCode: "MA" })).toContain("Fenway%20Park%2C%20Boston%2C%20MA");
  });

  it("writes a readable recommendation list", () => {
    const text = recommendationText("My picks in Boston", [
      { name: "Neptune Oyster", category: "restaurant", categoryLabel: "Restaurant", notes: "Hot lobster roll", favorite: true, lat: 42.3634, lon: -71.0559 },
      { name: "Isabella Stewart Gardner Museum", category: "museum", categoryLabel: "Museum", address: "25 Evans Way, Boston" },
    ]);
    expect(text).toContain("My picks in Boston");
    expect(text).toContain("★ Neptune Oyster (Restaurant)");
    expect(text).toContain("  Hot lobster roll");
    expect(text).toContain("• Isabella Stewart Gardner Museum (Museum)");
    expect(text).toContain("https://www.google.com/maps/search/?api=1&query=42.3634,-71.0559");
  });
});
