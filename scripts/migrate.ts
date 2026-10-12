import "dotenv/config";
import { readFile } from "node:fs/promises";
import { pool } from "../src/lib/db";
async function main() {
  await pool.query(
    await readFile(
      new URL("../migrations/001_documents.sql", import.meta.url),
      "utf8",
    ),
  );
  console.log("Database migration complete.");
}
main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
