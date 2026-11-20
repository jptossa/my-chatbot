// Internal escalations dashboard: pages under /admin and JSON under /api/admin.
//
// Only a logged-in account with users.is_reviewer = 1 gets in. Everyone else
// gets nothing about the dashboard: a visitor who isn't logged in sees a login
// form, a logged-in customer sees "no access", and the API answers 401/403.
// The pages live in ./admin (not ./public), so the static file server can't
// hand them out around the check.
//
// Reviewers log in with the same /api/login as customers, so they share the
// `sid` cookie. Role is checked on every request, so revoking it takes effect
// immediately.

const path = require("node:path");
const express = require("express");
const { db } = require("./db");
const { TRIGGER_REASONS } = require("./escalation");

const PAGES = path.join(__dirname, "admin");
const page = (name) => path.join(PAGES, name);

// --- pages -----------------------------------------------------------------

const pages = express.Router();
pages.use((req, res, next) => {
  res.set("Cache-Control", "no-store"); // never keep conversation data in a shared cache
  next();
});

// The stylesheet and helper script hold nothing sensitive, so the login and
// no-access pages can use them too.
pages.get("/admin.css", (req, res) => res.sendFile(page("admin.css")));
pages.get("/common.js", (req, res) => res.sendFile(page("common.js")));

pages.use((req, res, next) => {
  if (!req.user) return res.status(401).sendFile(page("login.html"));
  if (!req.user.is_reviewer) return res.status(403).sendFile(page("forbidden.html"));
  next();
});
pages.get("/", (req, res) => res.sendFile(page("queue.html")));
pages.get(/^\/escalations\/\d+$/, (req, res) => res.sendFile(page("detail.html")));

// --- API -------------------------------------------------------------------

function requireReviewer(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Please log in." });
  if (!req.user.is_reviewer) return res.status(403).json({ error: "Reviewer access only." });
  res.set("Cache-Control", "no-store");
  next();
}

const api = express.Router();
api.use(requireReviewer);

// The user message that was current when the escalation was recorded: the
// newest user message not later than the escalation row (they are written in
// one transaction, the row last).
const FLAGGED_MESSAGE_ID =
  `(SELECT m.id FROM messages m
    WHERE m.conversation_id = e.conversation_id AND m.role = 'user' AND m.created_at <= e.created_at
    ORDER BY m.id DESC LIMIT 1)`;

const QUEUE_LIMIT = 200;

// Workflow: pending -> in_progress -> resolved. Each target status lists the
// statuses it may be reached from. A reviewer can resolve straight from pending
// (some cases take no work), or hand an in-progress one back to the queue.
// Resolved is final.
const STATUSES = ["pending", "in_progress", "resolved"];
const ALLOWED_FROM = {
  pending: ["in_progress"],
  in_progress: ["pending"],
  resolved: ["pending", "in_progress"],
};
const MAX_NOTE = 500;

// Which escalations the queue shows: "open" (pending + in progress) by default,
// or one status via ?status=.
const FILTERS = {
  open: ["pending", "in_progress"],
  pending: ["pending"],
  in_progress: ["in_progress"],
  resolved: ["resolved"],
};

// The queue, longest-waiting first (resolved ones: most recently resolved first).
api.get("/escalations", (req, res) => {
  const filter = req.query.status === undefined ? "open" : String(req.query.status);
  if (!Object.hasOwn(FILTERS, filter)) {
    return res.status(400).json({ error: `status must be one of: ${Object.keys(FILTERS).join(", ")}.` });
  }
  const statuses = FILTERS[filter];
  const marks = statuses.map(() => "?").join(", ");
  const order = filter === "resolved" ? "e.resolved_at DESC, e.id DESC" : "e.created_at ASC, e.id ASC";

  const rows = db
    .prepare(
      `SELECT e.id, e.trigger_type, e.status, e.created_at, e.resolved_at, e.conversation_id,
              u.email AS user_email,
              (SELECT content FROM messages WHERE id = ${FLAGGED_MESSAGE_ID}) AS flagged_message
       FROM escalations e
       JOIN conversations c ON c.id = e.conversation_id
       LEFT JOIN users u ON u.id = c.user_id
       WHERE e.status IN (${marks})
       ORDER BY ${order}
       LIMIT ?`
    )
    .all(...statuses, QUEUE_LIMIT);
  const counts = Object.fromEntries(
    db.prepare("SELECT status, COUNT(*) AS n FROM escalations GROUP BY status").all().map((r) => [r.status, r.n])
  );
  res.json({
    filter,
    total: statuses.reduce((sum, s) => sum + (counts[s] ?? 0), 0),
    counts: { pending: counts.pending ?? 0, in_progress: counts.in_progress ?? 0, resolved: counts.resolved ?? 0 },
    escalations: rows.map((row) => ({ ...row, reason: TRIGGER_REASONS[row.trigger_type] ?? null })),
  });
});

const selectEscalation = db.prepare(
  `SELECT e.id, e.trigger_type, e.status, e.created_at, e.conversation_id,
          e.resolution_note, e.resolved_at, r.email AS resolved_by_email,
          ${FLAGGED_MESSAGE_ID} AS flagged_message_id,
          c.created_at AS conversation_started_at, u.email AS user_email
   FROM escalations e
   JOIN conversations c ON c.id = e.conversation_id
   LEFT JOIN users u ON u.id = c.user_id
   LEFT JOIN users r ON r.id = e.resolved_by
   WHERE e.id = ?`
);

const withReason = (e) => ({ ...e, reason: TRIGGER_REASONS[e.trigger_type] ?? null });

// One escalation with its whole conversation.
api.get("/escalations/:id", (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: "Not found." });
  const id = Number(req.params.id);

  const escalation = selectEscalation.get(id);
  if (!escalation) return res.status(404).json({ error: "Not found." });

  const messages = db
    .prepare("SELECT id, role, content, created_at FROM messages WHERE conversation_id = ? ORDER BY id")
    .all(escalation.conversation_id);
  const others = db
    .prepare(
      `SELECT id, trigger_type, status, created_at FROM escalations
       WHERE conversation_id = ? AND id != ? ORDER BY id`
    )
    .all(escalation.conversation_id, id);

  res.json({ escalation: withReason(escalation), messages, otherEscalations: others });
});

// Change status. Body: { status, note? }. `note` (optional, up to MAX_NOTE
// characters) is only accepted when resolving.
//   400 bad input   404 no such escalation   409 not allowed from its current status
// The UPDATE itself checks the current status, so two reviewers acting at once
// can't both succeed (the second gets a 409, not a silent overwrite).
const updateStatus = db.prepare(
  `UPDATE escalations
   SET status = ?1,
       resolution_note = ?2,
       resolved_at = CASE WHEN ?1 = 'resolved' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') END,
       resolved_by = CASE WHEN ?1 = 'resolved' THEN ?3 END
   WHERE id = ?4 AND status IN (SELECT value FROM json_each(?5))`
);

api.patch("/escalations/:id/status", (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.status(404).json({ error: "Not found." });
  const id = Number(req.params.id);
  if (!req.is("application/json")) return res.status(415).json({ error: "Send JSON." });

  const { status, note } = req.body ?? {};
  if (!STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${STATUSES.join(", ")}.` });
  }
  let resolutionNote = null;
  if (note !== undefined && note !== null) {
    if (typeof note !== "string") return res.status(400).json({ error: "note must be text." });
    if (status !== "resolved" && note.trim()) {
      return res.status(400).json({ error: "A note can only be added when resolving." });
    }
    resolutionNote = note.trim() || null;
    if (resolutionNote && resolutionNote.length > MAX_NOTE) {
      return res.status(400).json({ error: `The note can be at most ${MAX_NOTE} characters.` });
    }
  }

  const current = selectEscalation.get(id);
  if (!current) return res.status(404).json({ error: "Not found." });

  const result = updateStatus.run(status, resolutionNote, req.user.id, id, JSON.stringify(ALLOWED_FROM[status]));
  if (result.changes === 0) {
    const now = selectEscalation.get(id); // re-read: it may have just changed
    return res.status(409).json({
      error: `This escalation is ${now.status}, so it can't be changed to ${status}.`,
      escalation: withReason(now),
    });
  }
  res.json({ escalation: withReason(selectEscalation.get(id)) });
});

module.exports = { adminPages: pages, adminApi: api };
