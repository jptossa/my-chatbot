// Gives (or takes away) access to the internal escalations dashboard.
//
//   node scripts/set-reviewer.js someone@example.com
//   node scripts/set-reviewer.js someone@example.com --revoke
//
// Uses DATABASE_URL if set (the live Supabase database), else the local one.
// The account must already exist (sign up on the chat page first). This is
// deliberately a command-line step, not a web feature.

require("dotenv").config();
const { query, backend } = require("../db");

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = args.find((a) => !a.startsWith("--"));

if (!email) {
  console.error("Usage: node scripts/set-reviewer.js <email> [--revoke]");
  process.exit(1);
}

(async () => {
  const rows = await query(
    "UPDATE users SET is_reviewer = $1 WHERE lower(email) = lower($2) RETURNING id",
    [!revoke, email.trim()]
  );
  if (rows.length === 0) {
    console.error(`No account with the email ${email} in the ${backend} database. Sign up on the chat page first.`);
    process.exit(1);
  }
  console.log(`${email} is ${revoke ? "no longer" : "now"} a reviewer (${backend} database).`);
  process.exit(0);
})().catch((error) => { console.error(error.message); process.exit(1); });
