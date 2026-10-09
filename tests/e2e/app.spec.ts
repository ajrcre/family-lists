import { createHmac, randomBytes } from "node:crypto";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { E2E_PIN } from "../../playwright.config";

const API_HEADERS = { authorization: `Bearer ${process.env.E2E_API_TOKEN}` };

/** Builds an access-link token the same way lib/auth/link.ts does. */
function linkToken(secret: string, issuedAt = Date.now()) {
  const body = Buffer.from(
    JSON.stringify({ exp: issuedAt + 24 * 60 * 60 * 1000, n: randomBytes(9).toString("base64url") }),
  ).toString("base64url");
  return `${body}.${createHmac("sha256", secret).update(`access-link:${body}`).digest("base64url")}`;
}

async function login(page: Page) {
  await page.goto("/");
  await page.getByLabel("קוד כניסה").fill(E2E_PIN);
  await page.getByRole("button", { name: "כניסה" }).click();
  await page.waitForURL((u) => u.pathname !== "/login");
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

const listIdFromUrl = (page: Page) => new URL(page.url()).pathname.split("/").pop()!;
const openItemNames = async (request: APIRequestContext, listId: string) =>
  ((await (await request.get(`/api/lists/${listId}/items`, { headers: API_HEADERS })).json()).items as {
    name: string;
  }[]).map((i) => i.name);

test.describe.configure({ mode: "serial" });

test("unauthenticated visitors see only the Hebrew PIN screen; wrong PIN is rejected", async ({ page }) => {
  await page.goto("/lists/00000000-0000-4000-8000-000000000000");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(page.getByRole("heading", { name: "הרשימות של המשפחה" })).toBeVisible();
  await noHorizontalScroll(page);

  await page.getByLabel("קוד כניסה").fill("0000");
  await page.getByRole("button", { name: "כניסה" }).click();
  await expect(page.getByText("קוד שגוי")).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test("full list and item flow at 390px", async ({ page, request }) => {
  await login(page);
  await expect(page.getByRole("heading", { name: "אין עדיין רשימות" })).toBeVisible();

  // Create a list.
  await page.getByLabel("שם הרשימה החדשה").fill("קניות");
  await page.getByRole("button", { name: "יצירה" }).click();
  await page.waitForURL(/\/lists\//);
  const groceries = listIdFromUrl(page);
  await expect(page.getByLabel("בחירת רשימה")).toHaveValue(groceries);

  // Add items, one with category and notes.
  await page.getByLabel("שם הפריט").fill("חלב");
  await page.getByLabel("כמות").first().fill("2");
  await page.getByLabel("קטגוריה").fill("מוצרי חלב"); // a brand-new category
  await page.getByRole("button", { name: "+ הערה" }).click();
  await page.getByLabel("הערות").fill("3% שומן");
  await page.getByRole("button", { name: "הוספה" }).click();
  await expect(page.getByRole("region", { name: "מוצרי חלב" })).toContainText("חלב");
  await expect(page.getByText("3% שומן")).toBeVisible();
  const [created0] = (await (await request.get(`/api/lists/${groceries}/items`, { headers: API_HEADERS })).json()).items;
  expect(created0).toMatchObject({ category: "מוצרי חלב", notes: "3% שומן" });

  await page.getByLabel("שם הפריט").fill("לחם");
  await page.getByRole("button", { name: "הוספה" }).click();
  await expect(page.getByRole("region", { name: "כללי" })).toContainText("לחם");
  await noHorizontalScroll(page);

  // Edit: name, quantity, category, clear notes.
  await page.getByRole("button", { name: 'עריכת "חלב"' }).click();
  await page.getByLabel("שם", { exact: true }).fill("חלב סויה");
  await page.getByLabel("כמות").last().fill("חצי ליטר");
  await page.getByLabel("קטגוריה").last().fill("משקאות");
  await page.getByLabel("הערות").last().fill("");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByRole("region", { name: "משקאות" })).toContainText("חלב סויה");
  await expect(page.getByRole("region", { name: "משקאות" })).toContainText("חצי ליטר");
  await expect(page.getByText("3% שומן")).toHaveCount(0);

  // Add notes back from the UI, verify via API.
  await page.getByRole("button", { name: 'עריכת "חלב סויה"' }).click();
  await page.getByLabel("הערות").last().fill("בלי סוכר");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByText("בלי סוכר")).toBeVisible();
  const apiItems = (await (await request.get(`/api/lists/${groceries}/items`, { headers: API_HEADERS })).json()).items;
  expect(apiItems.find((i: { name: string }) => i.name === "חלב סויה")).toMatchObject({
    notes: "בלי סוכר",
    quantity: "חצי ליטר",
    category: "משקאות",
    added_by: "web",
  });

  // Mark bought in the UI → gone from the open list and from the API GET.
  await page.getByRole("button", { name: 'סימון "לחם" כנקנה' }).click();
  await expect(page.getByRole("button", { name: 'עריכת "לחם"' })).toHaveCount(0);
  expect(await openItemNames(request, groceries)).toEqual(["חלב סויה"]);

  // Recently bought → restore (same id).
  const recent = page.locator("details.recent");
  await recent.locator("summary").click();
  await expect(recent).toContainText("לחם");
  await recent.getByRole("button", { name: 'החזרת "לחם" לרשימה' }).click();
  await expect(page.getByRole("button", { name: 'עריכת "לחם"' })).toBeVisible();
  expect((await openItemNames(request, groceries)).sort()).toEqual(["חלב סויה", "לחם"].sort());

  // Changes from the API (Instinct) show up in the UI.
  const created = await request.post(`/api/lists/${groceries}/items`, {
    headers: API_HEADERS,
    data: { name: "ביצים", quantity: "12", category: "ביצים", notes: "מהחופש" },
  });
  expect(created.status()).toBe(201);
  const egg = await created.json();
  await page.reload();
  await expect(page.getByRole("region", { name: "ביצים" })).toContainText("מהחופש");

  const viaApi = await request.patch(`/api/items/${egg.id}`, { headers: API_HEADERS, data: { status: "bought", notes: null } });
  expect((await viaApi.json()).status).toBe("bought");
  await page.reload();
  await expect(page.getByRole("button", { name: 'עריכת "ביצים"' })).toHaveCount(0);
  await page.locator("details.recent summary").click();
  await expect(page.locator("details.recent")).toContainText("ביצים");

  const restored = await request.patch(`/api/items/${egg.id}`, { headers: API_HEADERS, data: { status: "open" } });
  expect(await restored.json()).toMatchObject({ id: egg.id, status: "open", notes: null });
  await page.reload();
  await expect(page.getByRole("button", { name: 'עריכת "ביצים"' })).toBeVisible();

  // Categories: pick an existing one via chip, rename, remove.
  await page.getByLabel("שם הפריט").fill("גבינה");
  await page.locator(".add-form").getByRole("button", { name: "ביצים", exact: true }).click();
  await page.getByRole("button", { name: "הוספה" }).click();
  await expect(page.getByRole("region", { name: "ביצים" })).toContainText("גבינה");

  await page.getByRole("button", { name: 'עריכת הקטגוריה "ביצים"' }).click();
  await page.getByLabel("שם הקטגוריה").fill("ביצים וגבינות");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByRole("region", { name: "ביצים וגבינות" })).toContainText("גבינה");
  await expect(page.getByRole("region", { name: "ביצים וגבינות" })).toContainText("ביצים");
  await expect(page.getByRole("region", { name: "ביצים", exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: 'עריכת הקטגוריה "ביצים וגבינות"' }).click();
  await page.getByRole("button", { name: "הסרת הקטגוריה" }).click();
  await expect(page.getByRole("region", { name: "ביצים וגבינות" })).toHaveCount(0);
  await expect(page.getByRole("region", { name: "כללי" })).toContainText("גבינה");
  const afterRemove = (await (await request.get(`/api/lists/${groceries}/items`, { headers: API_HEADERS })).json()).items;
  expect(afterRemove.find((i: { name: string }) => i.name === "גבינה").category).toBe("כללי");
  await page.getByRole("button", { name: 'עריכת "גבינה"' }).click();
  await page.getByRole("button", { name: "מחיקה" }).click();
  await expect(page.getByRole("button", { name: 'עריכת "גבינה"' })).toHaveCount(0);

  // Delete an item.
  await page.getByRole("button", { name: 'עריכת "ביצים"' }).click();
  await page.getByRole("button", { name: "מחיקה" }).click();
  await expect(page.getByRole("button", { name: 'עריכת "ביצים"' })).toHaveCount(0);

  // Second list, isolation and switching.
  await page.getByRole("button", { name: "רשימה חדשה" }).click();
  await page.getByLabel("שם הרשימה החדשה").fill("ציוד לטיול");
  await page.getByRole("button", { name: "יצירה" }).click();
  await page.waitForURL((u) => !u.pathname.endsWith(groceries));
  const trip = listIdFromUrl(page);
  await expect(page.getByText("הרשימה ריקה")).toBeVisible();
  await page.getByLabel("שם הפריט").fill("אוהל");
  await page.getByRole("button", { name: "הוספה" }).click();
  await expect(page.getByRole("button", { name: 'עריכת "אוהל"' })).toBeVisible();
  await expect(page.getByRole("button", { name: 'עריכת "לחם"' })).toHaveCount(0);

  await page.getByLabel("בחירת רשימה").selectOption(groceries);
  await page.waitForURL(new RegExp(groceries));
  await expect(page.getByRole("button", { name: 'עריכת "לחם"' })).toBeVisible();
  await expect(page.getByRole("button", { name: 'עריכת "אוהל"' })).toHaveCount(0);
  expect(await openItemNames(request, trip)).toEqual(["אוהל"]);

  // Rename.
  await page.getByLabel("בחירת רשימה").selectOption(trip);
  await page.waitForURL(new RegExp(trip));
  await page.getByRole("button", { name: "אפשרויות רשימה" }).click();
  await page.getByRole("button", { name: "שינוי שם הרשימה" }).click();
  await page.getByLabel("שם הרשימה", { exact: true }).fill("ציוד לקמפינג");
  await page.getByRole("button", { name: "שמירה" }).click();
  await expect(page.getByLabel("בחירת רשימה").locator("option:checked")).toHaveText("ציוד לקמפינג");
  const lists = (await (await request.get("/api/lists", { headers: API_HEADERS })).json()).lists;
  expect(lists.find((l: { id: string }) => l.id === trip).name).toBe("ציוד לקמפינג");

  // Delete the list → its items are gone.
  await page.getByRole("button", { name: "אפשרויות רשימה" }).click();
  await page.getByRole("button", { name: "מחיקת הרשימה" }).click();
  await page.getByRole("button", { name: "כן, למחוק" }).click();
  await page.waitForURL(new RegExp(groceries));
  expect((await request.get(`/api/lists/${trip}/items`, { headers: API_HEADERS })).status()).toBe(404);
  await expect(page.getByLabel("בחירת רשימה").locator("option")).toHaveCount(1);
  await noHorizontalScroll(page);
});

test("access link opens the UI without the PIN and leaves a clean URL", async ({ browser, request }) => {
  const res = await request.post("/api/access-link", { headers: API_HEADERS });
  expect(res.status()).toBe(201);
  const { url } = await res.json();

  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(url);
  await expect(page).toHaveURL(/\/lists\/[0-9a-f-]+$/);
  expect(page.url()).not.toContain("key=");
  await expect(page.getByLabel("בחירת רשימה")).toBeVisible();

  // The web session must not grant API access.
  const api = await page.request.get("/api/lists");
  expect(api.status()).toBe(401);
  expect(await api.json()).toEqual({ error: "unauthorized" });
  await context.close();
});

test("expired, wrong and missing link tokens fall back to the PIN screen", async ({ browser }) => {
  const secret = process.env.E2E_LINK_SECRET!;
  for (const key of [
    linkToken(secret, Date.now() - 25 * 60 * 60 * 1000), // expired (generated 25h ago)
    linkToken("some-other-secret-that-is-long-enough-123"), // signed with a different (rotated) secret
    "not-a-real-token",
    "",
  ]) {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`/?key=${encodeURIComponent(key)}`);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByLabel("קוד כניסה")).toBeVisible();
    await context.close();
  }
});

test("API without a token returns 401", async ({ playwright }) => {
  const anon = await playwright.request.newContext({ baseURL: "http://localhost:3100" });
  for (const [method, path] of [
    ["GET", "/api/lists"],
    ["POST", "/api/lists"],
    ["POST", "/api/access-link"],
  ] as const) {
    const res = await anon.fetch(path, { method, data: method === "POST" ? {} : undefined });
    expect(res.status()).toBe(401);
    expect(await res.json()).toEqual({ error: "unauthorized" });
  }
  await anon.dispose();
});

test("agent signs in with the API token and can read the API in the browser", async ({ page }) => {
  // Without a session the API refuses a browser GET.
  expect((await page.request.get("/api/lists")).status()).toBe(401);

  await page.goto("/agent-login");
  await page.getByLabel("API token").fill("not-the-token");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Invalid token")).toBeVisible();
  await expect(page).toHaveURL(/\/agent-login$/);

  await page.getByLabel("API token").fill(process.env.E2E_API_TOKEN!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname !== "/agent-login");
  await expect(page.getByLabel("בחירת רשימה").or(page.getByRole("heading", { name: "אין עדיין רשימות" }))).toBeVisible();

  const res = await page.goto("/api/lists");
  expect(res!.status()).toBe(200);
  const body = await res!.json();
  expect(Array.isArray(body.lists)).toBe(true);
  if (body.lists.length > 0) {
    const items = await page.goto(`/api/lists/${body.lists[0].id}/items`);
    expect(items!.status()).toBe(200);
    expect(Array.isArray((await items!.json()).items)).toBe(true);
  }

  // The session is read-only for the API: writes still need the bearer token.
  expect((await page.request.post("/api/lists", { data: { name: "x" } })).status()).toBe(401);
});
