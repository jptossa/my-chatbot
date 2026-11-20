// Creates or updates the database tables. Safe to re-run.
//   node scripts/migrate.js        (uses DATABASE_URL if set, else the local database)
require("dotenv").config();
const { query, backend } = require("../db");

(async () => {
  const [{ v }] = await query("SELECT COALESCE(MAX(version), 0)::int AS v FROM schema_migrations");
  const tables = await query("SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'");
  console.log(`Database: ${backend}. Schema version ${v}; ${tables[0].n} tables in the public schema.`);
  process.exit(0);
})().catch((error) => { console.error("Migration failed:", error.message); process.exit(1); });
