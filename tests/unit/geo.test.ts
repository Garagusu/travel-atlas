import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { STATES, STATE_BY_FIPS, TOTAL_STATES } from "@/lib/geo/states-meta";
import { formatRange, nightsBetween } from "@/components/ui/format";

describe("state reference data", () => {
  it("has 50 states plus DC with unique codes, FIPS and tile positions", () => {
    expect(STATES.filter((s) => s.isState)).toHaveLength(TOTAL_STATES);
    expect(STATES).toHaveLength(51);
    expect(new Set(STATES.map((s) => s.code)).size).toBe(51);
    expect(new Set(STATES.map((s) => s.fips)).size).toBe(51);
    expect(new Set(STATES.map((s) => s.tile.join(","))).size).toBe(51);
  });

  it("matches every boundary in the generated GeoJSON", () => {
    const geo = JSON.parse(readFileSync("public/geo/states.json", "utf8"));
    expect(geo.features).toHaveLength(51);
    for (const f of geo.features) {
      const meta = STATE_BY_FIPS.get(f.properties.fips);
      expect(meta?.code).toBe(f.properties.code);
      expect(f.id).toBe(Number(f.properties.fips));
      expect(typeof f.properties.labelLon).toBe("number");
    }
  });
});

describe("date formatting", () => {
  it("formats ranges without timezone drift", () => {
    expect(formatRange("2024-10-04", "2024-10-06")).toBe("Oct 4 – Oct 6, 2024");
    expect(formatRange("2024-12-30", "2025-01-02")).toBe("Dec 30, 2024 – Jan 2, 2025");
    expect(formatRange("2024-01-01", null)).toBe("Jan 1, 2024");
    expect(nightsBetween("2024-10-04", "2024-10-06")).toBe(2);
  });
});
