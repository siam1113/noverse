import { z } from "zod";
import { MAX_BODY_BYTES } from "./schema";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function protectMutation(request: Request) {
  const origin = request.headers.get("origin");
  const requestUrl = new URL(request.url);
  // Next.js can normalize request.url to localhost even when the browser uses
  // 127.0.0.1. Compare against the actual HTTP host, retaining protocol and port.
  // Forwarded headers are not trusted by this directly served local application.
  const host = request.headers.get("host");
  if (host) requestUrl.host = host;
  if (origin && origin !== requestUrl.origin)
    throw new HttpError(403, "Cross-origin requests are not allowed");
  if (request.headers.get("sec-fetch-site") === "cross-site")
    throw new HttpError(403, "Cross-site requests are not allowed");
}
export async function body<T>(
  request: Request,
  schema: z.ZodType<T>,
): Promise<T> {
  protectMutation(request);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new HttpError(415, "Expected application/json");
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400, "Missing request body");
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new HttpError(413, "Document exceeds the 1 MB limit");
    }
    chunks.push(value);
  }
  let value: unknown;
  try {
    value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
  const result = schema.safeParse(value);
  if (!result.success)
    throw new HttpError(
      400,
      result.error.issues[0]?.message ?? "Invalid document",
    );
  return result.data;
}
export function validId(id: string) {
  if (!z.uuid().safeParse(id).success)
    throw new HttpError(400, "Invalid document ID");
  return id;
}
export async function handle(action: () => Promise<Response>) {
  try {
    return await action();
  } catch (error) {
    if (error instanceof HttpError)
      return Response.json({ error: error.message }, { status: error.status });
    console.error("Document API failed", error);
    return Response.json(
      {
        error:
          "The database is unavailable. Check the connection and try again.",
      },
      { status: 503 },
    );
  }
}
