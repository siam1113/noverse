import {
  test,
  expect,
  type APIRequestContext,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
let created: string[] = [];
test.beforeEach(() => {
  created = [];
});
test.afterEach(async ({ request }) => {
  for (const id of created) await request.delete(`/api/documents/${id}`);
});
async function newDocument(request: APIRequestContext) {
  const response = await request.post("/api/documents", {
    data: { title: `Acceptance ${randomUUID()}` },
  });
  expect(response.status()).toBe(201);
  const document = await response.json();
  created.push(document.id);
  return document;
}
async function open(page: Page, id: string) {
  await page.addInitScript(
    (id) => localStorage.setItem("noverse:last-page", id),
    id,
  );
  await page.goto("/");
  await expect(
    page.getByRole("textbox", { name: "Document content", exact: true }),
  ).toBeVisible();
}
async function saved(page: Page) {
  await expect(page.getByRole("status")).toHaveText("Saved");
}
async function insert(page: Page, command: string) {
  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });
  await editor.locator("p").last().click();
  await page.keyboard.type(`/${command}`);
  await expect(
    page.getByRole("listbox", { name: "Insert a block" }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
}
test("timeline edits, manual order, surrounding text and exact JSON survive refresh", async ({
  page,
  request,
}) => {
  const document = await newDocument(request);
  await open(page, document.id);
  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });
  await editor.click();
  await page.keyboard.type("Before the timeline");
  await page.keyboard.press("Enter");
  await page.keyboard.type("/time");
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("timeline-event")).toHaveCount(1);
  for (let i = 1; i <= 3; i++) {
    if (i > 1)
      await page.getByRole("button", { name: "Add milestone" }).click();
    await page
      .getByRole("textbox", { name: `Event ${i} title`, exact: true })
      .fill(`Milestone ${i}`);
    await page
      .getByRole("textbox", { name: `Event ${i} date`, exact: true })
      .fill(i === 3 ? "Later" : `2026-10-0${i}`);
    await page
      .getByRole("textbox", { name: `Event ${i} details`, exact: true })
      .fill(`Details ${i}`);
    await page
      .getByRole("combobox", { name: `Event ${i} status`, exact: true })
      .selectOption(i === 1 ? "done" : "planned");
  }
  await page
    .getByRole("button", { name: "Move event 3 up", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Event 2 title", exact: true }),
  ).toHaveValue("Milestone 3");
  await editor.locator(":scope > p").last().click();
  await page.keyboard.type("After the timeline");
  await saved(page);
  const before = await (
    await request.get(`/api/documents/${document.id}`)
  ).json();
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Event 2 title", exact: true }),
  ).toHaveValue("Milestone 3");
  await expect(editor).toContainText("Before the timeline");
  await expect(editor).toContainText("After the timeline");
  const after = await (
    await request.get(`/api/documents/${document.id}`)
  ).json();
  expect(after.content).toEqual(before.content);
  expect(JSON.stringify(after.content)).not.toContain("/time");
});
test("slash navigation, escape, structural undo and independent component fields", async ({
  page,
  request,
}) => {
  const document = await newDocument(request);
  await open(page, document.id);
  const editor = page.getByRole("textbox", {
    name: "Document content",
    exact: true,
  });
  await editor.click();
  await page.keyboard.type("/timeline");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(editor).toContainText("/timeline");
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.press("Backspace");
  await editor.click();
  await page.keyboard.type("/");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await page
    .getByRole("textbox", { name: "Callout title", exact: true })
    .fill("An idea");
  await page
    .getByRole("textbox", { name: "Callout body", exact: true })
    .fill("/timeline belongs in this field");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await insert(page, "steps");
  await page.getByRole("button", { name: "Add step", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Step 2 title", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Step 2 title", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Redo", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Step 2 title", exact: true }),
  ).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Callout body", exact: true }),
  ).toHaveValue("/timeline belongs in this field");
});
test("save failures keep the draft and retry; conflicts require explicit resolution", async ({
  page,
  request,
}) => {
  const document = await newDocument(request);
  await open(page, document.id);
  await page.route(`**/api/documents/${document.id}`, async (route) => {
    if (route.request().method() === "PATCH")
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Forced network failure" }),
      });
    else await route.continue();
  });
  await page
    .getByRole("textbox", { name: "Document title", exact: true })
    .fill("Unsaved draft");
  await expect(page.getByRole("status")).toHaveText("Save failed");
  await expect(
    page.getByRole("textbox", { name: "Document title", exact: true }),
  ).toHaveValue("Unsaved draft");
  await page.unroute(`**/api/documents/${document.id}`);
  await page.getByRole("button", { name: "Retry save" }).click();
  await saved(page);
  const latest = await (
    await request.get(`/api/documents/${document.id}`)
  ).json();
  expect(
    (
      await request.patch(`/api/documents/${document.id}`, {
        data: { title: "Remote edit", expectedRevision: latest.revision },
      })
    ).status(),
  ).toBe(200);
  await page
    .getByRole("textbox", { name: "Document title", exact: true })
    .fill("My local edit");
  await expect(page.getByRole("status")).toHaveText("Conflict");
  expect(
    (await (await request.get(`/api/documents/${document.id}`)).json()).title,
  ).toBe("Remote edit");
  await page.getByRole("button", { name: "Load latest…" }).click();
  await page
    .getByRole("button", { name: "Load saved version", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Document title", exact: true }),
  ).toHaveValue("Remote edit");
});
test("document creation, rename, search, navigation flush and confirmed deletion", async ({
  page,
  request,
}) => {
  const initial = await newDocument(request);
  await open(page, initial.id);
  await page.getByRole("button", { name: "New page", exact: true }).click();
  const title = `Created in UI ${randomUUID()}`;
  await page
    .getByRole("textbox", { name: "Document title", exact: true })
    .fill(title);
  await page.getByRole("button", { name: initial.title, exact: true }).click();
  const documents = await (await request.get("/api/documents")).json();
  const document = documents.find(
    (item: { title: string }) => item.title === title,
  );
  expect(document).toBeTruthy();
  created.push(document.id);
  await page.getByRole("textbox", { name: "Search documents" }).fill(title);
  await expect(
    page.getByRole("button", { name: initial.title, exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: title, exact: true }).click();
  await page.getByRole("button", { name: "Page actions" }).click();
  await page.getByRole("menuitem", { name: "Delete page" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Delete page", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await request.get(`/api/documents/${document.id}`)).status()).toBe(
    404,
  );
});
test("API rejects invalid content, oversized payloads and stale revisions", async ({
  request,
}) => {
  const document = await newDocument(request);
  expect(
    (
      await request.patch(`/api/documents/${document.id}`, {
        data: {
          content: { type: "doc", content: [{ type: "script" }] },
          expectedRevision: 0,
        },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.patch(`/api/documents/${document.id}`, {
        data: { title: "x".repeat(1_000_001), expectedRevision: 0 },
      })
    ).status(),
  ).toBe(413);
  const responses = await Promise.all(
    ["First writer", "Second writer"].map((title) =>
      request.patch(`/api/documents/${document.id}`, {
        data: { title, expectedRevision: 0 },
      }),
    ),
  );
  expect(responses.map((response) => response.status()).sort()).toEqual([
    200, 409,
  ]);
  expect(
    (
      await request.post("/api/documents", {
        headers: { origin: "https://another-site.example" },
        data: {},
      })
    ).status(),
  ).toBe(403);
});
test("mobile viewport keeps editor and essential controls within the page", async ({
  page,
  request,
}) => {
  const document = await newDocument(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await open(page, document.id);
  await insert(page, "timeline");
  await page
    .getByRole("textbox", { name: "Event 1 title", exact: true })
    .fill("A mobile milestone");
  await saved(page);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Open sidebar" }).click();
  await expect(
    page.getByRole("textbox", { name: "Search documents" }),
  ).toBeInViewport();
  await page.screenshot({
    path: "test-results/mobile-notebook.png",
    fullPage: true,
  });
});
