// Loads every .md file in a folder into the `documents` table.
// Usage: node scripts/ingest-documents.js [folder]
// Safe to re-run: documents are matched by title and updated, not duplicated.

const fs = require("node:fs");
const path = require("node:path");
const { db } = require("../db");

const dir = path.resolve(
  process.argv[2] ||
    path.join(__dirname, "..", "gnomeguard-insurance-starter-kit", "gnomeguard-insurance")
);

// Title = text of the first "# Heading" line, falling back to the file name.
function titleOf(content, fileName) {
  const match = content.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : path.basename(fileName, path.extname(fileName));
}

const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".md")).sort();
if (files.length === 0) {
  console.error(`No .md files found in ${dir}`);
  process.exit(1);
}

const upsert = db.prepare(`
  INSERT INTO documents (title, content) VALUES (?, ?)
  ON CONFLICT(title) DO UPDATE SET content = excluded.content
`);

db.exec("BEGIN");
try {
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), "utf8");
    const title = titleOf(content, file);
    upsert.run(title, content);
    console.log(`Saved: ${title}  (${file}, ${content.length} chars)`);
  }
  db.exec("COMMIT");
} catch (error) {
  db.exec("ROLLBACK");
  throw error;
}

const { count } = db.prepare("SELECT COUNT(*) AS count FROM documents").get();
console.log(`Done. documents table now has ${count} rows.`);
