import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

let page: Page;
let sharedLink = "";
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ permissions: ["clipboard-read", "clipboard-write"] });
  await page.route("https://nominatim.openstreetmap.org/**", (route) =>
    route.fulfill({
      json: [
        {
          lat: "42.3634156",
          lon: "-71.0559294",
          name: "Neptune Oyster",
          display_name: "Neptune Oyster, 63, Salem Street, Boston, Massachusetts, United States",
          category: "amenity",
          type: "restaurant",
          address: { house_number: "63", road: "Salem Street", city: "Boston", state: "Massachusetts" },
        },
      ],
    }),
  );
  // Search-as-you-type suggestions (Photon) — answered locally too
  await page.route("https://photon.komoot.io/**", (route) =>
    route.fulfill({
      json: {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-71.0559294, 42.3634156] },
            properties: { name: "Neptune Oyster", housenumber: "63", street: "Salem Street", city: "Boston", state: "Massachusetts", countrycode: "US", osm_key: "amenity", osm_value: "restaurant" },
          },
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-71.05, 42.36] },
            properties: { name: "Neptune Bar", city: "Boston", state: "Massachusetts", countrycode: "US", osm_key: "amenity", osm_value: "bar" },
          },
        ],
      },
    }),
  );
  // The street basemap is unreachable here; the app falls back to its own shapes
  await page.route("https://tiles.openfreemap.org/**", (route) => route.abort());
});

const go = (hash: string) => page.goto(`./#${hash}`);
const aside = () => page.locator("aside").first();

test("the map loads from a sub-path, search finds a city and marking it visited updates progress", async () => {
  await go("/");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect(page.getByText("Your America")).toBeVisible();
  const search = aside().getByRole("combobox");
  await search.fill("Boston");
  await page.getByRole("option", { name: /^Boston, Massachusetts/ }).click();
  const popup = page.locator(".maplibregl-popup");
  await expect(popup.getByText("Boston", { exact: true })).toBeVisible();
  await popup.getByRole("radio", { name: "Visited", exact: true }).click();
  await expect(page.getByText("Boston marked as visited")).toBeVisible();
  await expect(aside().getByRole("button", { name: /Massachusetts: 1 city visited/ })).toBeVisible();

  await search.fill("Burlington");
  await page.getByRole("option", { name: /^Burlington, Vermont/ }).click();
  await popup.getByRole("radio", { name: "Want to visit" }).click();
  await expect(aside().getByRole("button", { name: /Vermont: on your wishlist/ })).toBeVisible();

  await aside().getByRole("button", { name: /Massachusetts: 1 city visited/ }).click();
  await aside().getByLabel("Massachusetts summary").getByRole("link", { name: "Open state page" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Massachusetts" })).toBeVisible();
});

test("state page: quick status and notes persist across a reload", async () => {
  await go("/states/MA");
  await page.getByRole("group", { name: "Status for Cambridge" }).getByRole("button", { name: "Visited" }).click();
  await page.getByLabel("State notes").fill("Fall foliage everywhere.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Notes saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("State notes")).toHaveValue("Fall foliage everywhere.");
  await expect(page.getByText("2 cities visited")).toBeVisible();
});

test("city page: notes, validation, photos, viewer and cover", async () => {
  await go("/states/MA");
  await page.getByRole("link", { name: "Boston" }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: "Boston" })).toBeVisible();
  await page.getByLabel("First day there").fill("2024-10-04");
  await page.getByLabel("Last day there").fill("2024-10-01");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("The last day can't be before the first day")).toBeVisible();
  await page.getByLabel("Last day there").fill("2024-10-06");
  await page.getByRole("radio", { name: /4 stars/ }).click();
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await page.getByLabel("Your notes").fill("Walked the Freedom Trail.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.getByLabel("Add photos").setInputFiles(["tests/landscape.jpg", "tests/portrait.jpg", "tests/not-image.jpg"]);
  await expect(page.getByText(/isn't a readable image/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("2 photos")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("main ul li img").first()).toHaveAttribute("src", /^blob:/);

  await page.getByRole("button", { name: "Open photo" }).nth(1).click();
  const viewer = page.getByRole("dialog");
  await viewer.getByRole("button", { name: "Edit details" }).click();
  await viewer.getByLabel("Caption").fill("Harbor at dusk");
  await viewer.getByRole("button", { name: "Save details" }).click();
  await expect(viewer.getByText("Harbor at dusk")).toBeVisible();
  await viewer.getByRole("button", { name: "Set as cover" }).click();
  await expect(page.getByText("Cover photo updated")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  await expect(page.getByLabel("First day there")).toHaveValue("2024-10-04");
  await expect(page.getByAltText("Boston cover photo")).toHaveAttribute("src", /^blob:/);
  await expect(page.getByText("Harbor at dusk").first()).toBeVisible();
});

test("places, albums, trips and journal", async () => {
  await page.getByRole("button", { name: "Add a place" }).click();
  await page.getByRole("combobox", { name: "Name" }).pressSequentially("Neptune");
  const suggestions = page.getByRole("listbox", { name: "Suggestions" });
  await expect(suggestions.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(suggestions).toHaveCount(0);
  await expect(page.getByLabel("Address")).toHaveValue("63 Salem Street, Boston, Massachusetts");
  await page.getByLabel("Notes", { exact: true }).fill("Hot lobster roll.");
  await page.getByRole("button", { name: "Save place" }).click();
  await expect(page.getByText("Neptune Oyster saved")).toBeVisible();

  await page.getByRole("button", { name: "Add a place" }).click();
  await page.getByLabel("Google Maps link (optional)").fill("https://www.google.com/maps/place/Museum+of+Fine+Arts/@42.33,-71.09,17z/data=!3d42.3393849!4d-71.0940447");
  await page.getByLabel("Kind").selectOption("museum");
  await page.getByRole("button", { name: "Save place" }).click();
  await expect(page.getByText("Museum of Fine Arts saved")).toBeVisible();

  await page.getByRole("button", { name: "Share my picks in Boston" }).click();
  await expect(page.getByText("Copied — paste it into a message")).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("• Museum of Fine Arts (Museum)");

  // a link that carries the list itself opens anywhere, even with no journal on that device
  await page.getByRole("button", { name: "Share a link: My picks in Boston" }).click();
  await expect(page.getByText("Link copied — anyone with it can see this list")).toBeVisible();
  sharedLink = await page.evaluate(() => navigator.clipboard.readText());
  expect(sharedLink).toMatch(/\/travel-atlas\/#\/s\/[A-Za-z0-9_-]+$/);

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: "Select all" }).click();
  await page.getByRole("button", { name: "Add to album" }).click();
  await page.getByLabel("New album title").fill("Boston Trip");
  await page.getByRole("button", { name: "Create album" }).click();
  await expect(page.getByText("Added to Boston Trip")).toBeVisible();

  await go("/trips");
  await page.getByRole("button", { name: "New trip" }).first().click();
  await page.getByLabel("Trip name").fill("New England Fall Road Trip");
  await page.getByLabel("Start date").fill("2024-10-03");
  await page.getByLabel("End date").fill("2024-10-09");
  await page.getByRole("button", { name: "Create trip" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "New England Fall Road Trip" })).toBeVisible();
  for (const [q, label] of [["Boston", /^Boston, Massachusetts/], ["Portland", /^Portland, Maine/]] as const) {
    await page.getByPlaceholder("Search for a city").fill(q);
    await page.getByRole("option", { name: label }).click();
    await page.getByRole("button", { name: "Add to route" }).click();
    await expect(page.getByText(new RegExp(`${q} added to the route`))).toBeVisible();
  }
  await page.getByRole("button", { name: "Move Portland earlier" }).click();
  await expect(page.getByText("Route updated")).toBeVisible();
  await expect(page.locator("ol > li").first()).toContainText("Portland");

  await go("/journal/new");
  await page.getByLabel("Title").fill("Harbor walk");
  await page.getByLabel("Date").fill("2024-10-05");
  await page.getByPlaceholder("Search a city").fill("Boston");
  await page.getByRole("option", { name: /^Boston, Massachusetts/ }).click();
  await page.getByLabel("The story").fill("Morning fog over the water.\n\nLunch in the North End.");
  await page.getByRole("button", { name: "Choose from library" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Harbor at dusk" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Attach \(1\)/ }).click();
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Harbor walk" })).toBeVisible();
  await expect(page.getByText("1 photo")).toBeVisible();

  await go("/journal");
  await page.getByLabel("Search journal").fill("north end");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByRole("link", { name: /Harbor walk/ })).toBeVisible();
});

test("places page and map pins", async () => {
  await go("/places");
  await expect(page.getByText("Hot lobster roll.")).toBeVisible();
  await page.getByRole("button", { name: /Museum/ }).first().click();
  await expect(page.getByText("Neptune Oyster")).toHaveCount(0);
  await page.getByRole("link", { name: "On my map" }).first().click();
  await expect(page.locator(".maplibregl-popup").getByText("Museum of Fine Arts")).toBeVisible();
});

test("dashboard reflects saved records", async () => {
  await go("/dashboard");
  await expect(page.getByRole("progressbar", { name: "Share of states visited" })).toHaveAttribute("aria-valuenow", "2");
  await expect(page.getByRole("link", { name: /Burlington/ })).toBeVisible();
});

test("a shared link opens the list in a fresh browser", async ({ browser }) => {
  const ctx = await browser.newContext();
  const anon = await ctx.newPage();
  await anon.route("https://tiles.openfreemap.org/**", (route) => route.abort());
  await anon.goto(sharedLink);
  await expect(anon.getByRole("heading", { level: 1, name: "Boston, Massachusetts" })).toBeVisible();
  await expect(anon.getByText("Neptune Oyster")).toBeVisible();
  await expect(anon.getByText("Hot lobster roll.")).toBeVisible();
  await expect(anon.getByRole("link", { name: "Open in Maps" }).first()).toHaveAttribute("href", /google\.com\/maps/);
  await anon.goto(sharedLink.replace(/#\/s\/.*/, "#/s/broken"));
  await expect(anon.getByRole("heading", { name: "This link can't be opened" })).toBeVisible();
  await ctx.close();
});

test("photos with a location are filed under the nearest city", async () => {
  await go("/albums");
  await page.getByLabel("Add photos").setInputFiles(["tests/with-gps.jpg"]);
  await expect(page.getByText("Filed in San Francisco, CA")).toBeVisible({ timeout: 20_000 });
  await go("/cities/5391959"); // San Francisco's GeoNames id
  await expect(page.getByText("1 photo")).toBeVisible();
});

test("the photo library filters by year and city together", async () => {
  // give one Boston photo a 2023 date; the others keep this year's date
  await go("/cities/4930956");
  await page.getByRole("button", { name: "Open photo" }).first().click();
  const viewer = page.getByRole("dialog");
  await viewer.getByRole("button", { name: "Edit details" }).click();
  await viewer.getByLabel("Date taken").fill("2023-06-14");
  await viewer.getByRole("button", { name: "Save details" }).click();
  await page.keyboard.press("Escape");

  await go("/albums");
  const year = page.getByLabel("Year", { exact: true });
  const city = page.getByLabel("City", { exact: true });
  const tiles = page.locator("#all-h + p + div ul > li");
  await expect(tiles).toHaveCount(3);

  await year.selectOption("2023");
  await expect(tiles).toHaveCount(1);
  await expect(page.getByText("1 photo in 2023")).toBeVisible();
  // only cities with 2023 photos are offered
  await expect(city.locator("option")).toHaveText(["All cities", "Boston, MA (1)"]);

  await city.selectOption({ label: "Boston, MA (1)" });
  await expect(page.getByText("1 photo from Boston in 2023")).toBeVisible();
  await expect(tiles).toHaveCount(1);

  await year.selectOption("");
  await expect(page.getByText("2 photos from Boston")).toBeVisible();
  await expect(tiles).toHaveCount(2);

  await page.getByRole("button", { name: "Clear filters" }).click();
  await expect(tiles).toHaveCount(3);
});

test("the site can be added to the home screen", async () => {
  const m = await (await page.request.get("manifest.webmanifest")).json();
  expect(m.display).toBe("standalone");
  expect(m.start_url).toBe("./");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});

test("backup downloads, and restoring it brings everything back after erasing", async () => {
  await go("/settings");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: "Download ZIP" }).click()]);
  const path = await download.path();
  expect(download.suggestedFilename()).toMatch(/^travel-atlas-backup-.*\.zip$/);

  await page.getByRole("button", { name: "Erase this journal" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Erase everything" }).click();
  await expect(page.getByText("Journal erased")).toBeVisible();
  await go("/dashboard");
  await expect(page.getByRole("progressbar", { name: "Share of states visited" })).toHaveAttribute("aria-valuenow", "0");

  await go("/settings");
  await page.getByLabel("Backup file").setInputFiles(path!);
  await page.getByRole("dialog").getByRole("button", { name: "Replace and restore" }).click();
  await expect(page.getByText("Backup restored")).toBeVisible({ timeout: 20_000 });
  await go("/cities/4930956"); // Boston's GeoNames id
  await expect(page.getByRole("heading", { level: 1, name: "Boston" })).toBeVisible();
  await expect(page.getByAltText("Boston cover photo")).toHaveAttribute("src", /^blob:/);
  await expect(page.getByText("Harbor at dusk").first()).toBeVisible();
});
