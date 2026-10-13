import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });

let page: Page;
test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
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
  await page.getByLabel("Name", { exact: true }).fill("Neptune Oyster");
  await page.getByRole("button", { name: "Save place" }).click();
  await expect(page.getByText("Neptune Oyster saved")).toBeVisible();

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

test("dashboard reflects saved records", async () => {
  await go("/dashboard");
  await expect(page.getByRole("progressbar", { name: "Share of states visited" })).toHaveAttribute("aria-valuenow", "2");
  await expect(page.getByRole("link", { name: /Burlington/ })).toBeVisible();
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
