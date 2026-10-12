import { randomUUID } from "node:crypto";
import { pool, columns } from "@/lib/db";
import { body, handle } from "@/lib/http";
import { createSchema, emptyContent } from "@/lib/schema";
export const dynamic = "force-dynamic";
export async function GET() {
  return handle(async () =>
    Response.json(
      (
        await pool.query(
          `SELECT ${columns} FROM documents ORDER BY updated_at DESC`,
        )
      ).rows,
    ),
  );
}
export async function POST(request: Request) {
  return handle(async () => {
    const value = await body(request, createSchema);
    const result = await pool.query(
      `INSERT INTO documents (id, title, content) VALUES ($1, $2, $3) RETURNING ${columns}, content`,
      [
        randomUUID(),
        value.title ?? "Untitled",
        JSON.stringify(value.content ?? emptyContent),
      ],
    );
    return Response.json(result.rows[0], { status: 201 });
  });
}
