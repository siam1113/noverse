import { test } from "node:test";
import assert from "node:assert/strict";
import {
  body,
  handle,
  HttpError,
  protectMutation,
  validId,
} from "../src/lib/http";
import { createSchema } from "../src/lib/schema";
function request(value: unknown, headers: Record<string, string> = {}) {
  return new Request("http://127.0.0.1:3000/api/documents", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(value),
  });
}
test("same-origin mutations use the incoming host when Next.js normalizes the URL", () => {
  const normalizedRequest = (
    origin: string,
    extra: Record<string, string> = {},
  ) =>
    new Request("http://localhost:3000/api/documents", {
      method: "POST",
      headers: { host: "127.0.0.1:3000", origin, ...extra },
    });
  assert.doesNotThrow(() =>
    protectMutation(normalizedRequest("http://127.0.0.1:3000")),
  );
  for (const origin of [
    "http://localhost:3000",
    "http://127.0.0.1:3001",
    "https://external.example",
    "null",
  ]) {
    assert.throws(
      () => protectMutation(normalizedRequest(origin)),
      (error) => error instanceof HttpError && error.status === 403,
    );
  }
  assert.throws(
    () =>
      protectMutation(
        normalizedRequest("https://external.example", {
          "x-forwarded-host": "external.example",
          "x-forwarded-proto": "https",
        }),
      ),
    (error) => error instanceof HttpError && error.status === 403,
  );
});
test("request validation accepts same-origin JSON and rejects invalid input", async () => {
  assert.deepEqual(
    await body(
      request({ title: "My note" }, { origin: "http://127.0.0.1:3000" }),
      createSchema,
    ),
    { title: "My note" },
  );
  await assert.rejects(
    body(request({ admin: true }), createSchema),
    (error) => error instanceof HttpError && error.status === 400,
  );
  await assert.rejects(
    body(request({}, { "content-type": "text/plain" }), createSchema),
    (error) => error instanceof HttpError && error.status === 415,
  );
});
test("request streaming limit rejects oversized bodies without trusting content-length", async () => {
  await assert.rejects(
    body(request({ title: "x".repeat(1_000_001) }), createSchema),
    (error) => error instanceof HttpError && error.status === 413,
  );
});
test("mutations reject cross-origin browser requests and malformed IDs", () => {
  assert.throws(
    () => protectMutation(request({}, { origin: "https://external.example" })),
    (error) => error instanceof HttpError && error.status === 403,
  );
  assert.throws(
    () => protectMutation(request({}, { "sec-fetch-site": "cross-site" })),
    (error) => error instanceof HttpError && error.status === 403,
  );
  assert.throws(
    () => validId("not-a-uuid"),
    (error) => error instanceof HttpError && error.status === 400,
  );
});
test("API errors retain their explicit status and safe explanation", async () => {
  const response = await handle(async () => {
    throw new HttpError(409, "Revision conflict");
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: "Revision conflict" });
});
