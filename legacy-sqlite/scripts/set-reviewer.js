// Gives (or takes away) access to the internal escalations dashboard.
//
//   node --no-warnings scripts/set-reviewer.js someone@example.com
//   node --no-warnings scripts/set-reviewer.js someone@example.com --revoke
//
// The account must already exist (sign up on the chat page first). This is
// deliberately a command-line step, not a web feature.

const { db } = require("../db");

const args = process.argv.slice(2);
const revoke = args.includes("--revoke");
const email = args.find((a) => !a.startsWith("--"));

if (!email) {
  console.error("Usage: node --no-warnings scripts/set-reviewer.js <email> [--revoke]");
  process.exit(1);
}

const result = db
  .prepare("UPDATE users SET is_reviewer = ? WHERE email = ?")
  .run(revoke ? 0 : 1, email.trim());

if (result.changes === 0) {
  console.error(`No account with the email ${email}. Sign up on the chat page first.`);
  process.exit(1);
}
console.log(`${email} is ${revoke ? "no longer" : "now"} a reviewer.`);
