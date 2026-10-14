import { expect, test, type Page } from "@playwright/test";
import bcrypt from "bcryptjs";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Client } from "pg";

const OWNER = { name: "Ada Lovelace", email: "ada@example.com", password: "analytical-engine-1843" };
const DB = process.env.TEST_DATABASE_URL ?? "postgres://postgres:postgres@localhost:5432/travel_journal_test";

test.describe.configure({ mode: "serial" });

let page: Page;
let sharedLink = "";
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ permissions: ["clipboard-read", "clipboard-write"] });
  // OpenStreetMap place search, answered locally so tests don't depend on the network
  await page.route("https://nominatim.openstreetmap.org/**", (route) =>
    route.fulfill({
      json: [
        {
          lat: "42.3634156",
          lon: "-71.0559294",
          name: "Neptune Oyster",
          display_name: "Neptune Oyster, 63, Salem Street, North End, Boston, Massachusetts, 02113, United States",
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

async function login(p: Page, who = OWNER) {
  await p.goto("/login");
  await p.getByLabel("Email").fill(who.email);
  await p.getByLabel("Password").fill(who.password);
  await p.getByRole("button", { name: "Sign in" }).click();
  await expect(p).toHaveURL("/");
}

test("first visit leads to sign-up, and the owner account is created", async () => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/signup/);
  await page.getByRole("button", { name: "Create journal" }).click();
  await expect(page.getByText("Enter your name")).toBeVisible();
  await page.getByLabel("Your name").fill(OWNER.name);
  await page.getByLabel("Email").fill(OWNER.email);
  await page.getByLabel("Password").fill(OWNER.password);
  await page.getByRole("button", { name: "Create journal" }).click();
  await expect(page).toHaveURL("/");
  await expect(page.getByText("Ada's America")).toBeVisible();
});

test("sign-up closes after the owner exists and APIs require a session", async ({ browser }) => {
  const anon = await browser.newPage();
  await anon.goto("/signup");
  await expect(anon.getByRole("heading", { name: "Sign-up is closed" })).toBeVisible();
  const res = await anon.request.get("/api/map/status");
  expect(res.status()).toBe(401);
  await anon.goto("/login");
  await anon.getByLabel("Email").fill(OWNER.email);
  await anon.getByLabel("Password").fill("wrong-password");
  await anon.getByRole("button", { name: "Sign in" }).click();
  await expect(anon.getByText("That email and password don't match.")).toBeVisible();
  await anon.close();
});

test("the map loads, search finds a city and marking it visited updates progress", async () => {
  await page.goto("/");
  await expect(page.locator("canvas.maplibregl-canvas")).toBeVisible();
  await expect(page.locator("aside").getByText("0", { exact: true }).first()).toBeVisible();

  const search = page.locator("aside").getByRole("combobox");
  await search.fill("Boston");
  await page.getByRole("option", { name: /Boston, Massachusetts/ }).click();
  const popup = page.locator(".maplibregl-popup");
  await expect(popup.getByText("Boston", { exact: true })).toBeVisible();
  await popup.getByRole("radio", { name: "Visited", exact: true }).click();
  await expect(page.getByText("Boston marked as visited")).toBeVisible();
  await expect(page.locator("aside").getByText("1", { exact: true }).first()).toBeVisible();
  await expect(page.locator("aside").getByRole("button", { name: /Massachusetts: 1 city visited/ })).toBeVisible();

  // wishlist a second city from search
  await search.fill("Burlington");
  await page.getByRole("option", { name: /Burlington, Vermont/ }).click();
  await popup.getByRole("radio", { name: "Want to visit" }).click();
  await expect(page.getByText("Burlington added to your wishlist")).toBeVisible();
  await expect(page.locator("aside").getByRole("button", { name: /Vermont: on your wishlist/ })).toBeVisible();

  // filters toggle
  const visitedFilter = page.locator("aside").getByRole("button", { name: "Visited", exact: true });
  await visitedFilter.click();
  await expect(visitedFilter).toHaveAttribute("aria-pressed", "false");
  await visitedFilter.click();

  // selecting a state through the tile grid shows its summary
  await page.locator("aside").getByRole("button", { name: /Massachusetts: 1 city visited/ }).click();
  const card = page.locator("aside").getByLabel("Massachusetts summary");
  await expect(card.getByText("1 city visited")).toBeVisible();
  await card.getByRole("link", { name: "Open state page" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Massachusetts" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Boston/ }).first()).toBeVisible();
});

test("state page: quick status, notes", async () => {
  await page.goto("/states/MA");
  await page.getByRole("group", { name: "Status for Cambridge" }).getByRole("button", { name: "Visited" }).click();
  await expect(page.getByRole("group", { name: "Status for Cambridge" }).getByRole("button", { name: "Visited" })).toHaveAttribute("aria-pressed", "true");
  await page.getByLabel("State notes").fill("Fall foliage everywhere.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Notes saved")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("State notes")).toHaveValue("Fall foliage everywhere.");
  await expect(page.getByText("2 cities visited")).toBeVisible();
});

test("city page: notes, rating, tags and dates persist", async () => {
  await page.goto("/");
  await page.locator("aside").getByRole("combobox").fill("Boston");
  await page.getByRole("option", { name: /Boston, Massachusetts/ }).click();
  await page.locator(".maplibregl-popup").getByRole("link", { name: "Open city page" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Boston" })).toBeVisible();

  await page.getByLabel("First day there").fill("2024-10-04");
  await page.getByLabel("Last day there").fill("2024-10-01");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("The last day can't be before the first day")).toBeVisible();

  await page.getByLabel("Last day there").fill("2024-10-06");
  await page.getByRole("radio", { name: /4 stars/ }).click();
  await page.getByLabel("Impression in a sentence").fill("Brick, harbor wind and good chowder.");
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await page.getByRole("button", { name: "History", exact: true }).click();
  await page.getByLabel("Add a custom tag").fill("Fall colors");
  await page.getByLabel("Add a custom tag").press("Enter");
  await page.getByLabel("Your notes").fill("Walked the Freedom Trail.\n\nOysters at the North End.");
  await page.getByRole("button", { name: "Save notes" }).click();
  await expect(page.getByText("Saved", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByLabel("First day there")).toHaveValue("2024-10-04");
  await expect(page.getByLabel("Your notes")).toHaveValue(/Freedom Trail/);
  await expect(page.getByRole("button", { name: "Fall colors" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Brick, harbor wind and good chowder.").first()).toBeVisible();
  await expect(page.getByText("Oct 4 – Oct 6, 2024")).toBeVisible();
});

test("city page: upload photos, reject bad files, caption and cover", async () => {
  await page.getByLabel("Add photos").setInputFiles(["tests/fixtures/landscape.jpg", "tests/fixtures/portrait.jpg", "tests/fixtures/not-image.jpg"]);
  await expect(page.getByText(/isn't a readable image/)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("2 photos")).toBeVisible({ timeout: 20_000 });

  // thumbnails are served through the authenticated photo route
  const src = await page.locator("ul li img").first().getAttribute("src");
  expect(src).toMatch(/^\/api\/photos\/[0-9a-f-]+\/thumb$/);
  const img = await page.request.get(src!);
  expect(img.status()).toBe(200);
  expect(img.headers()["content-type"]).toBe("image/webp");

  await page.getByRole("button", { name: "Open photo" }).nth(1).click();
  const viewer = page.getByRole("dialog");
  await expect(viewer.getByText("2 of 2")).toBeVisible();
  await viewer.getByRole("button", { name: "Edit details" }).click();
  await viewer.getByLabel("Caption").fill("Harbor at dusk");
  await viewer.getByLabel("Description").fill("From the Long Wharf.");
  await viewer.getByRole("button", { name: "Save details" }).click();
  await expect(viewer.getByText("Harbor at dusk")).toBeVisible();
  await viewer.getByRole("button", { name: "Set as cover" }).click();
  await expect(page.getByText("Cover photo updated")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(page.getByAltText("Boston cover photo")).toBeVisible();
  await expect(page.getByText("Harbor at dusk").first()).toBeVisible();
});

test("city page: find a place by name, paste a map link, edit and delete", async () => {
  await page.getByRole("button", { name: "Add a place" }).click();
  await page.getByRole("button", { name: "Save place" }).click();
  await expect(page.getByText("Give the place a name")).toBeVisible();

  await page.getByRole("combobox", { name: "Name" }).pressSequentially("Neptune");
  const suggestions = page.getByRole("listbox", { name: "Suggestions" });
  await expect(suggestions.getByRole("option")).toHaveCount(2);
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(suggestions).toHaveCount(0);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Neptune Oyster");
  await expect(page.getByLabel("Address")).toHaveValue("63 Salem Street, Boston, Massachusetts");
  await expect(page.getByLabel("Kind")).toHaveValue("restaurant");
  await expect(page.getByText(/Location set \(42\.3634, -71\.0559\)/)).toBeVisible();
  await page.getByRole("checkbox", { name: "A favorite" }).check();
  await page.getByLabel("Notes", { exact: true }).fill("Hot lobster roll.");
  await page.getByRole("button", { name: "Save place" }).click();
  await expect(page.getByText("Neptune Oyster saved")).toBeVisible();
  await expect(page.getByRole("link", { name: "Open in Maps" }).first()).toHaveAttribute("href", /google\.com\/maps\/search\/\?api=1&query=Neptune%20Oyster/);

  // second place from a pasted Google Maps link
  await page.getByRole("button", { name: "Add a place" }).click();
  await page.getByLabel("Google Maps link (optional)").fill(
    "https://www.google.com/maps/place/Museum+of+Fine+Arts,+Boston/@42.33,-71.09,17z/data=!3d42.3393849!4d-71.0940447",
  );
  await expect(page.getByText("Location taken from the link.")).toBeVisible();
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Museum of Fine Arts, Boston");
  await page.getByLabel("Kind").selectOption("museum");
  await page.getByRole("button", { name: "Save place" }).click();
  await expect(page.getByText("Museum of Fine Arts, Boston saved")).toBeVisible();

  // sharing the city's picks copies a readable list (no share sheet in headless Chrome)
  await page.getByRole("button", { name: "Share my picks in Boston" }).click();
  await expect(page.getByText("Copied — paste it into a message")).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toContain("My picks in Boston");
  expect(copied).toContain("★ Neptune Oyster (Restaurant)");
  expect(copied).toContain("Museum of Fine Arts, Boston (Museum)");

  // a public link to the same list opens without signing in
  await page.getByRole("button", { name: "Share a link: My picks in Boston" }).click();
  await expect(page.getByText("Link copied — anyone with it can see this list")).toBeVisible();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toMatch(/\/s\/[A-Za-z0-9_-]{16}$/);
  sharedLink = new URL(link).pathname;

  await page.getByRole("button", { name: "Edit Neptune Oyster" }).click();
  await page.getByLabel("Notes", { exact: true }).fill("Hot lobster roll, go at opening.");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Hot lobster roll, go at opening.")).toBeVisible();

  await page.getByRole("button", { name: "Delete Museum of Fine Arts, Boston" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("Museum of Fine Arts, Boston deleted")).toBeVisible();
});

test("places page lists, filters and links saved places to the map", async () => {
  await page.goto("/places");
  await expect(page.getByRole("heading", { level: 1, name: "Places" })).toBeVisible();
  await expect(page.getByText("Hot lobster roll, go at opening.")).toBeVisible();
  await page.getByRole("link", { name: /Restaurant/ }).first().click();
  await expect(page).toHaveURL(/category=restaurant/);
  await expect(page.getByText("Neptune Oyster")).toBeVisible();
  await page.getByLabel("Search places").fill("nothing like this");
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page.getByText("Nothing matches")).toBeVisible();
  await page.goto("/places");
  await page.getByRole("link", { name: "On my map" }).first().click();
  const popup = page.locator(".maplibregl-popup");
  await expect(popup.getByText("Neptune Oyster")).toBeVisible();
  await expect(popup.getByRole("link", { name: "Open in Maps" })).toHaveAttribute("href", /google\.com\/maps/);
});

test("albums: create from a selection, reorder, and delete without losing photos", async () => {
  await page.goto("/places");
  await page.getByRole("link", { name: "Boston", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Boston" })).toBeVisible();
  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("button", { name: "Select all" }).click();
  await page.getByRole("button", { name: "Add to album" }).click();
  await page.getByLabel("New album title").fill("Boston Trip");
  await page.getByRole("button", { name: "Create album" }).click();
  await expect(page.getByText("Added to Boston Trip")).toBeVisible();

  await page.goto("/albums");
  await page.getByRole("link", { name: /Boston Trip/ }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Boston Trip" })).toBeVisible();
  await expect(page.getByText("2 photos").first()).toBeVisible();

  await page.getByRole("button", { name: "Arrange" }).click();
  await page.getByRole("button", { name: "Save order" }).click();
  await expect(page.getByText("New order saved")).toBeVisible();

  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete album" }).click();
  await expect(page).toHaveURL("/albums");
  await expect(page.getByText("No albums yet")).toBeVisible();
  await expect(page.getByText("2 photos", { exact: false }).first()).toBeVisible();
});

test("trips: create, add stops that share city records, reorder", async () => {
  await page.goto("/trips");
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
  const stops = page.locator("ol > li");
  await expect(stops).toHaveCount(2);
  await expect(stops.first()).toContainText("Boston");
  await page.getByRole("button", { name: "Move Portland earlier" }).click();
  await expect(page.getByText("Route updated")).toBeVisible();
  await expect(stops.first()).toContainText("Portland");
  await page.reload();
  await expect(page.locator("ol > li").first()).toContainText("Portland");

  // Boston's city page lists the trip, and still has its own photos
  await page.getByRole("link", { name: "Boston", exact: true }).click();
  await expect(page.getByRole("link", { name: /New England Fall Road Trip/ })).toBeVisible();
  await expect(page.getByText("2 photos")).toBeVisible();
});

test("journal: write, search, edit and delete an entry with photos", async () => {
  await page.goto("/journal/new");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByText("Give the entry a title")).toBeVisible();
  await page.getByLabel("Title").fill("Harbor walk");
  await page.getByLabel("Date").fill("2024-10-05");
  await page.getByPlaceholder("Search a city").fill("Boston");
  await page.getByRole("option", { name: /Boston, Massachusetts/ }).click();
  await page.getByLabel("Trip").selectOption({ label: "New England Fall Road Trip" });
  await page.getByLabel("The story").fill("Morning fog over the water.\n\nLunch in the North End.");
  await page.getByLabel("Places visited").fill("Long Wharf");
  await page.getByLabel("Places visited").press("Enter");
  await page.getByRole("button", { name: "Food", exact: true }).click();
  await page.getByRole("button", { name: "Choose from library" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Harbor at dusk" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /Attach \(1\)/ }).click();
  await page.getByRole("button", { name: "Save entry" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "Harbor walk" })).toBeVisible();
  await expect(page.getByText("Morning fog over the water.")).toBeVisible();
  await expect(page.getByText("Long Wharf")).toBeVisible();
  await expect(page.getByText("1 photo")).toBeVisible();

  await page.goto("/journal?q=north%20end");
  await expect(page.getByRole("link", { name: /Harbor walk/ })).toBeVisible();
  await page.goto("/journal?q=nothing-matches-this");
  await expect(page.getByText("No entries match")).toBeVisible();

  await page.goto("/journal");
  await page.getByRole("link", { name: /Harbor walk/ }).click();
  await page.getByRole("link", { name: "Edit entry" }).click();
  await page.getByLabel("Title").fill("Harbor walk at dawn");
  await page.getByRole("button", { name: "Save entry" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Harbor walk at dawn" })).toBeVisible();

  // the trip page shows the entry alongside its route
  await page.getByRole("link", { name: "New England Fall Road Trip" }).click();
  await expect(page.getByRole("link", { name: /Harbor walk at dawn/ })).toBeVisible();

  await page.getByRole("link", { name: /Harbor walk at dawn/ }).click();
  await page.getByRole("button", { name: "Delete" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete entry" }).click();
  await expect(page).toHaveURL("/journal");
  await expect(page.getByText("Your journal is waiting")).toBeVisible();
});

test("dashboard, wishlist and export reflect saved records", async () => {
  await page.goto("/dashboard");
  await expect(page.getByText("of 50 states")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Share of states visited" })).toHaveAttribute("aria-valuenow", "2");
  await expect(page.getByRole("link", { name: /Burlington/ })).toBeVisible();

  await page.goto("/wishlist");
  await expect(page.getByRole("heading", { name: "Vermont" })).toBeVisible();

  const res = await page.request.get("/api/export");
  expect(res.status()).toBe(200);
  const data = await res.json();
  expect(data.cityLogs.length).toBe(3);
  expect(data.trips[0].name).toBe("New England Fall Road Trip");
  expect(data.photos).toHaveLength(2);
  expect(data.stateLogs[0].notes).toBe("Fall foliage everywhere.");

  const zip = await page.request.get("/api/export/archive");
  expect(zip.status()).toBe(200);
  expect(zip.headers()["content-type"]).toBe("application/zip");
  const body = await zip.body();
  expect(body.subarray(0, 2).toString()).toBe("PK");
  expect(body.includes("data.json")).toBe(true);
  for (const p of data.photos) expect(body.includes(`photos/${p.id}/original.jpg`)).toBe(true);
});

test("another account can't see this journal's photos or records", async ({ browser }) => {
  const db = new Client({ connectionString: DB });
  await db.connect();
  const other = { name: "Mallory", email: "mallory@example.com", password: "a-different-password" };
  await db.query("insert into users (email, name, password_hash) values ($1, $2, $3)", [other.email, other.name, await bcrypt.hash(other.password, 4)]);
  const { rows } = await db.query("select p.id, p.city_id from photos p join users u on u.id = p.user_id where u.email = $1 limit 1", [OWNER.email]);
  const { rows: trip } = await db.query("select t.id from trips t join users u on u.id = t.user_id where u.email = $1", [OWNER.email]);
  await db.end();

  const p2 = await browser.newPage();
  await login(p2, other);
  await expect(p2.getByText("Mallory's America")).toBeVisible();
  expect((await p2.request.get(`/api/photos/${rows[0].id}/thumb`)).status()).toBe(404);
  expect((await p2.request.get(`/api/photos/${rows[0].id}/original`)).status()).toBe(404);
  const status = await (await p2.request.get("/api/map/status")).json();
  expect(status.stats.citiesVisited).toBe(0);
  await p2.goto(`/trips/${trip[0].id}`);
  await expect(p2.getByRole("heading", { name: "Nothing on the map here" })).toBeVisible();
  // the shared city page exists for everyone, but shows none of the owner's notes or photos
  await p2.goto(`/cities/${rows[0].city_id}`);
  await expect(p2.getByText("Freedom Trail")).toHaveCount(0);
  await expect(p2.getByRole("img", { name: /Harbor at dusk/ })).toHaveCount(0);
  await p2.close();
});

test("data survives signing out and back in", async () => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL("/login");
  await login(page);
  await page.goto("/cities?status=visited");
  await expect(page.getByRole("link", { name: /Boston/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Cambridge/ })).toBeVisible();
});

test("a shared link shows the list to anyone, until it's turned off", async ({ browser }) => {
  const anon = await browser.newPage();
  await anon.goto(sharedLink);
  await expect(anon.getByRole("heading", { level: 1, name: "Boston, Massachusetts" })).toBeVisible();
  await expect(anon.getByText("Neptune Oyster")).toBeVisible();
  await expect(anon.getByText("Hot lobster roll, go at opening.")).toBeVisible();
  await expect(anon.getByRole("link", { name: "Open in Maps" }).first()).toHaveAttribute("href", /google\.com\/maps/);
  // nothing else from the journal is reachable
  await expect(anon.getByRole("link", { name: "Dashboard" })).toHaveCount(0);

  await page.goto("/settings");
  const links = page.getByRole("region", { name: "Shared links" });
  await expect(links.getByText(/Boston/)).toBeVisible();
  await links.getByRole("button", { name: /Turn off/ }).first().click();
  await expect(links.getByText(/Boston/)).toHaveCount(0);
  await anon.reload();
  await expect(anon.getByRole("heading", { name: "This list isn't shared anymore" })).toBeVisible();
  await anon.close();
});

test("photos with a location are filed under the nearest city", async () => {
  await page.goto("/albums");
  await page.getByLabel("Add photos").setInputFiles(["tests/fixtures/with-gps.jpg"]);
  await expect(page.getByText("Filed in San Francisco, CA")).toBeVisible({ timeout: 20_000 });
  const db = new Client({ connectionString: DB });
  await db.connect();
  const { rows } = await db.query(
    "select c.name from photos p join cities c on c.id = p.city_id join users u on u.id = p.user_id where u.email = $1 and p.original_name = 'with-gps.jpg'",
    [OWNER.email],
  );
  await db.end();
  expect(rows).toEqual([{ name: "San Francisco" }]);
});

test("restoring a backup brings the journal back as it was", async () => {
  const zip = await page.request.get("/api/export/archive");
  const file = path.join(os.tmpdir(), `tj-backup-${Date.now()}.zip`);
  fs.writeFileSync(file, await zip.body());
  const before = await (await page.request.get("/api/export")).json();

  await page.goto("/settings");
  await page.getByLabel("Backup file").setInputFiles(file);
  await page.getByRole("dialog").getByRole("button", { name: "Replace and restore" }).click();
  await expect(page.getByRole("status").filter({ hasText: /^Restored \d+ cities/ })).toBeVisible({ timeout: 60_000 });
  const after = await (await page.request.get("/api/export")).json();
  expect(after.cityLogs.length).toBe(before.cityLogs.length);
  expect(after.places.map((p: { name: string }) => p.name).sort()).toEqual(before.places.map((p: { name: string }) => p.name).sort());
  expect(after.trips.map((t: { name: string }) => t.name)).toEqual(before.trips.map((t: { name: string }) => t.name));
  expect(after.photos.length).toBe(before.photos.length);
  expect(after.journalEntries.length).toBe(before.journalEntries.length);
  await page.goto("/cities?status=visited");
  await expect(page.getByRole("link", { name: /Boston/ })).toBeVisible();
  fs.rmSync(file);
});

test("changing the password signs other devices out", async ({ browser }) => {
  const other = await browser.newPage();
  await login(other);
  await page.goto("/settings");
  const pw = page.getByRole("region", { name: "Password" });
  await pw.getByLabel("Current password").fill("not-my-password");
  await pw.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
  await pw.getByLabel("New password again").fill("a-brand-new-password");
  await pw.getByRole("button", { name: "Change password" }).click();
  await expect(pw.getByText("That isn't your current password")).toBeVisible();

  await pw.getByLabel("Current password").fill(OWNER.password);
  await pw.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
  await pw.getByLabel("New password again").fill("a-brand-new-password");
  await pw.getByRole("button", { name: "Change password" }).click();
  await expect(pw.getByText("Password changed. Other devices have been signed out.")).toBeVisible();

  // this device stays signed in; the other one is signed out
  await page.goto("/dashboard");
  await expect(page).toHaveURL("/dashboard");
  await other.goto("/dashboard");
  await expect(other).toHaveURL(/\/login/);
  await login(other, { ...OWNER, password: "a-brand-new-password" });
  await other.close();
});

test("the app can be added to the home screen", async () => {
  const res = await page.request.get("/manifest.webmanifest");
  expect(res.status()).toBe(200);
  const m = await res.json();
  expect(m.display).toBe("standalone");
  expect(m.icons.map((i: { sizes: string }) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
  expect((await page.request.get("/icon-512.png")).status()).toBe(200);
  await page.goto("/");
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
});
