import { pool, columns } from "@/lib/db";
import { body, handle, HttpError, protectMutation, validId } from "@/lib/http";
import { updateSchema } from "@/lib/schema";
type Context = { params: Promise<{ id: string }> };
export const dynamic = "force-dynamic";
export async function GET(_request: Request, context: Context) {
  return handle(async () => {
    const id = validId((await context.params).id);
    const result = await pool.query(
      `SELECT ${columns}, content FROM documents WHERE id = $1`,
      [id],
    );
    if (!result.rowCount) throw new HttpError(404, "Document not found");
    return Response.json(result.rows[0]);
  });
}
export async function PATCH(request: Request, context: Context) {
  return handle(async () => {
    const id = validId((await context.params).id);
    const value = await body(request, updateSchema);
    const result = await pool.query(
      `UPDATE documents SET title = COALESCE($2, title), content = COALESCE($3::jsonb, content), revision = revision + 1, updated_at = now() WHERE id = $1 AND revision = $4 RETURNING ${columns}, content`,
      [
        id,
        value.title,
        value.content === undefined ? null : JSON.stringify(value.content),
        value.expectedRevision,
      ],
    );
    if (!result.rowCount) {
      const exists = await pool.query(
        "SELECT id FROM documents WHERE id = $1",
        [id],
      );
      throw new HttpError(
        exists.rowCount ? 409 : 404,
        exists.rowCount
          ? "This document changed in another tab. Download your draft, or load the latest version."
          : "This document has been deleted. Download your draft to keep your work.",
      );
    }
    return Response.json(result.rows[0]);
  });
}
export async function DELETE(request: Request, context: Context) {
  return handle(async () => {
    protectMutation(request);
    const id = validId((await context.params).id);
    const result = await pool.query(
      "DELETE FROM documents WHERE id = $1 RETURNING id",
      [id],
    );
    if (!result.rowCount) throw new HttpError(404, "Document not found");
    return new Response(null, { status: 204 });
  });
}
