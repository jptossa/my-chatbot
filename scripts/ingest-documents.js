// Loads every .md file in a folder into the `documents` table.
// Usage: node scripts/ingest-documents.js [folder]
// Uses DATABASE_URL if set (e.g. Supabase), else the local development database.
// Safe to re-run: documents are matched by title and updated, not duplicated.

require("dotenv").config();
const fs = require("node:fs");
const path = require("node:path");
const { query, transaction, backend } = require("../db");

const dir = path.resolve(
  process.argv[2] ||
    path.join(__dirname, "..", "gnomeguard-insurance-starter-kit", "gnomeguard-insurance")
);

// Title = text of the first "# Heading" line, falling back to the file name.
function titleOf(content, fileName) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : path.basename(fileName, path.extname(fileName));
}

async function main() {
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".md")).sort();
  if (files.length === 0) {
    console.error(`No .md files found in ${dir}`);
    process.exit(1);
  }
  console.log(`Database: ${backend}`);
  await transaction(async (tx) => {
    for (const file of files) {
      const content = fs.readFileSync(path.join(dir, file), "utf8");
      const title = titleOf(content, file);
      await tx.query(
        `INSERT INTO documents (title, content) VALUES ($1, $2)
         ON CONFLICT (title) DO UPDATE SET content = EXCLUDED.content`,
        [title, content]
      );
      console.log(`Saved: ${title}  (${file}, ${content.length} chars)`);
    }
  });
  const [{ count }] = await query("SELECT COUNT(*)::int AS count FROM documents");
  console.log(`Done. documents table now has ${count} rows.`);
}

main().then(() => process.exit(0), (error) => { console.error(error.message); process.exit(1); });
