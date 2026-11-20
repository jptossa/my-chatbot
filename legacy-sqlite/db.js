const path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

// Resolve relative to this file so every script uses the same database,
// no matter which folder it is run from.
const db = new DatabaseSync(
  process.env.DB_PATH || path.join(__dirname, "chat.db")
);

// SQLite ignores foreign keys unless this is switched on for each connection.
db.exec("PRAGMA foreign_keys = ON");

// Knowledge-base documents used for retrieval (unchanged by the schema redesign).
db.exec(`
  CREATE TABLE IF NOT EXISTS documents (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    title    TEXT NOT NULL UNIQUE,
    content  TEXT NOT NULL
  );
`);

// ---------------------------------------------------------------------------
// Migrations, tracked with SQLite's built-in PRAGMA user_version.
// ---------------------------------------------------------------------------

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ', 'now')";

function migrateToV1() {
  db.exec(`
    -- Authenticated accounts.
    CREATE TABLE users (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      email          TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash  TEXT NOT NULL,
      display_name   TEXT,
      created_at     TEXT NOT NULL DEFAULT (${NOW})
    );

    -- A conversation belongs to a user when logged in. Anonymous visitors are
    -- tracked by session_id. Both can be set (e.g. a guest who later signs in
    -- keeps their session_id), but at least one must be.
    CREATE TABLE conversations (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
      session_id  TEXT,
      created_at  TEXT NOT NULL DEFAULT (${NOW}),
      updated_at  TEXT NOT NULL DEFAULT (${NOW}),
      CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
    );
    CREATE INDEX idx_conversations_user    ON conversations(user_id);
    CREATE INDEX idx_conversations_session ON conversations(session_id);

    -- One row per message; replaces chat_log's one-row-per-exchange layout.
    CREATE TABLE messages (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
      content          TEXT NOT NULL,
      created_at       TEXT NOT NULL DEFAULT (${NOW})
    );
    CREATE INDEX idx_messages_conversation ON messages(conversation_id, id);
  `);

  // Carry over the old chat_log: each old row becomes its own conversation
  // (the old log recorded no session, so they can't be grouped) holding a
  // user message and an assistant message with the original timestamp.
  const hasLegacy = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'chat_log'")
    .get();
  if (!hasLegacy) return;

  const rows = db.prepare("SELECT * FROM chat_log ORDER BY id").all();
  const addConversation = db.prepare(
    "INSERT INTO conversations (session_id, created_at, updated_at) VALUES (?, ?, ?)"
  );
  const addMessage = db.prepare(
    "INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)"
  );
  for (const row of rows) {
    const { lastInsertRowid: conversationId } = addConversation.run(
      `legacy-${row.id}`, row.created_at, row.created_at
    );
    addMessage.run(conversationId, "user", row.user_message, row.created_at);
    addMessage.run(conversationId, "assistant", row.claude_reply, row.created_at);
  }

  const migrated = db.prepare("SELECT COUNT(*) AS n FROM messages").get().n;
  if (migrated !== rows.length * 2) {
    throw new Error(`Migration check failed: expected ${rows.length * 2} messages, found ${migrated}`);
  }

  // Keep the old table (renamed) instead of dropping it, so nothing is lost.
  db.exec("ALTER TABLE chat_log RENAME TO chat_log_legacy");
}

// Login sessions for authenticated users. Named auth_sessions to keep it
// distinct from conversations.session_id, which tracks anonymous visitors.
// Only a SHA-256 hash of the cookie token is stored, so a leaked database
// can't be used to hijack live logins.
function migrateToV2() {
  db.exec(`
    CREATE TABLE auth_sessions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash  TEXT NOT NULL UNIQUE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at  TEXT NOT NULL DEFAULT (${NOW}),
      expires_at  TEXT NOT NULL
    );
    CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
  `);
}

// Pieces of documents for embedding-based retrieval. The vector is stored as a
// BLOB of little-endian float32 values (see embeddings.js); embedding_model
// records which model made it, since vectors from different models can't be
// compared with each other.
function migrateToV3() {
  db.exec(`
    CREATE TABLE chunks (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id      INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
      chunk_index      INTEGER NOT NULL,           -- position within the document, from 0
      content          TEXT NOT NULL,
      embedding        BLOB NOT NULL,
      embedding_model  TEXT NOT NULL,
      created_at       TEXT NOT NULL DEFAULT (${NOW}),
      UNIQUE (document_id, chunk_index)
    );
  `);
}

// Conversations handed off for a human to look at. One conversation can be
// escalated more than once (e.g. again after being resolved), so this is not
// unique per conversation. trigger_type records what caused it (free text, so
// new kinds of trigger need no schema change).
function migrateToV4() {
  db.exec(`
    CREATE TABLE escalations (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
      trigger_type     TEXT NOT NULL,
      status           TEXT NOT NULL DEFAULT 'pending',
      created_at       TEXT NOT NULL DEFAULT (${NOW})
    );
    CREATE INDEX idx_escalations_conversation ON escalations(conversation_id);
    CREATE INDEX idx_escalations_status       ON escalations(status, created_at);
  `);
}

// Which accounts may use the internal escalations dashboard. Ordinary customers
// are 0; it is switched on only by scripts/set-reviewer.js, never through the
// website, so no chatbot user can grant it to themselves.
function migrateToV5() {
  db.exec(`
    ALTER TABLE users ADD COLUMN is_reviewer INTEGER NOT NULL DEFAULT 0 CHECK (is_reviewer IN (0, 1));
  `);
}

// Review workflow: status moves pending -> in_progress -> resolved (the rules
// live in admin.js). When resolved, who did it, when, and an optional note on
// what was done.
function migrateToV6() {
  db.exec(`
    ALTER TABLE escalations ADD COLUMN resolution_note TEXT;
    ALTER TABLE escalations ADD COLUMN resolved_at TEXT;
    ALTER TABLE escalations ADD COLUMN resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL;
  `);
}

// How many times each model has answered today, so a daily cap survives restarts.
// `day` is a local-date string like 2026-11-20.
function migrateToV7() {
  db.exec(`
    CREATE TABLE model_usage (
      day    TEXT NOT NULL,
      model  TEXT NOT NULL,
      uses   INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
      PRIMARY KEY (day, model)
    );
  `);
}

const MIGRATIONS = [migrateToV1, migrateToV2, migrateToV3, migrateToV4, migrateToV5, migrateToV6, migrateToV7];

function migrate() {
  let version = db.prepare("PRAGMA user_version").get().user_version;
  while (version < MIGRATIONS.length) {
    db.exec("BEGIN");
    try {
      MIGRATIONS[version]();
      version += 1;
      db.exec(`PRAGMA user_version = ${version}`);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}

migrate();

// ---------------------------------------------------------------------------
// Chat logging
// ---------------------------------------------------------------------------

// A guest (no user) only matches unowned conversations of their visitor
// session. A logged-in user only matches conversations they own; unowned guest
// conversations are never picked up by logging in. Either way, a conversation
// owned by someone else is never returned.
const findGuestConversation = db.prepare(
  `SELECT id FROM conversations
   WHERE session_id = ? AND user_id IS NULL
   ORDER BY id DESC LIMIT 1`
);
const findUsersSessionConversation = db.prepare(
  `SELECT id FROM conversations
   WHERE session_id = ? AND user_id = ?
   ORDER BY id DESC LIMIT 1`
);
const createConversation = db.prepare(
  "INSERT INTO conversations (user_id, session_id) VALUES (?, ?)"
);
// Only ever attaches an *unowned* conversation, never takes one from a user.
const claimConversation = db.prepare(
  "UPDATE conversations SET user_id = ? WHERE id = ? AND user_id IS NULL"
);
const claimLatestAnonymousConversation = db.prepare(
  `UPDATE conversations SET user_id = ?
   WHERE id = (SELECT id FROM conversations
               WHERE session_id = ? AND user_id IS NULL
               ORDER BY id DESC LIMIT 1)`
);
// A logged-in user's most recent conversation, used to pick up where they
// left off when this browser has no conversation of its own yet.
const findUsersLatestConversation = db.prepare(
  "SELECT id, user_id FROM conversations WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT 1"
);
// The newest `limit` messages of a conversation, returned oldest first.
const selectRecentMessages = db.prepare(
  `SELECT role, content FROM (
     SELECT id, role, content FROM messages
     WHERE conversation_id = ? ORDER BY id DESC LIMIT ?
   ) ORDER BY id`
);
// Skips the insert if this conversation already has an open (pending or being
// worked on) escalation for the same trigger, so a user who keeps hitting it
// doesn't create a pile of tickets. Once one is resolved, a new one can be raised.
const insertEscalation = db.prepare(
  `INSERT INTO escalations (conversation_id, trigger_type)
   SELECT ?, ?
   WHERE NOT EXISTS (
     SELECT 1 FROM escalations
     WHERE conversation_id = ? AND trigger_type = ? AND status IN ('pending', 'in_progress')
   )`
);
const touchConversation = db.prepare(
  `UPDATE conversations SET updated_at = ${NOW} WHERE id = ?`
);
const insertMessage = db.prepare(
  "INSERT INTO messages (conversation_id, role, content) VALUES (?, ?, ?)"
);

/**
 * Called when someone signs up or logs in: the anonymous conversation this
 * browser has been having (if any) becomes theirs, so it follows them to
 * other browsers and no longer shows up for a logged-out visitor.
 */
function claimVisitorConversation(sessionId, userId) {
  claimLatestAnonymousConversation.run(userId, sessionId);
}

// How many past messages are sent to Claude with each new one (10 exchanges).
// Keeps cost and latency bounded no matter how long a conversation runs.
const MAX_HISTORY_MESSAGES = 20;

/**
 * Finds the conversation a request belongs to, or null if it's the start of a
 * new one.
 *   Guest: the unowned conversation tied to this browser's visitor session.
 *   Logged-in user: a conversation they own that is tied to this browser's
 *     session, else their most recent conversation (so they can continue it
 *     from another browser or after logging back in). Unowned guest
 *     conversations are never matched.
 * A conversation owned by someone else is never returned.
 */
function findCurrentConversation({ sessionId, userId = null }) {
  if (!userId) return findGuestConversation.get(sessionId)?.id ?? null;
  const own = findUsersSessionConversation.get(sessionId, userId);
  if (own) return own.id;
  return findUsersLatestConversation.get(userId)?.id ?? null;
}

/**
 * The conversation's most recent messages as [{ role, content }], oldest
 * first, in the shape the Claude API expects. Always starts with a user
 * message, as the API requires.
 */
function getHistory(conversationId, limit = MAX_HISTORY_MESSAGES) {
  const rows = selectRecentMessages.all(conversationId, limit);
  while (rows.length && rows[0].role !== "user") rows.shift();
  return rows.map(({ role, content }) => ({ role, content }));
}

/**
 * Records one user message and Claude's reply. Pass the `conversationId` from
 * findCurrentConversation (null starts a new conversation under `sessionId`).
 * If `userId` is set and the conversation is still anonymous, it becomes that
 * user's. If `escalationTrigger` is set, a pending escalation for that trigger
 * is recorded too (unless one is already open). Returns
 * { conversationId, escalationId }; escalationId is null when no new escalation
 * row was created.
 */
function logExchange({
  conversationId = null, sessionId, userId = null, userMessage, claudeReply,
  escalationTrigger = null,
}) {
  db.exec("BEGIN");
  try {
    if (conversationId === null) {
      conversationId = createConversation.run(userId, sessionId).lastInsertRowid;
    } else if (userId) {
      claimConversation.run(userId, conversationId);
    }
    insertMessage.run(conversationId, "user", userMessage);
    insertMessage.run(conversationId, "assistant", claudeReply);
    touchConversation.run(conversationId);
    // Saved in the same transaction as the messages, so an escalation never
    // exists without its conversation turn (or the other way round).
    let escalationId = null; // stays null if none was asked for or one was already pending
    if (escalationTrigger) {
      const result = insertEscalation.run(conversationId, escalationTrigger, conversationId, escalationTrigger);
      if (result.changes > 0) escalationId = Number(result.lastInsertRowid);
    }
    db.exec("COMMIT");
    return { conversationId: Number(conversationId), escalationId };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

// Counts one use of `model` for `day` unless that would exceed `limit`. The check
// and the increment are one statement, so two requests at the same moment can't
// both take the last slot.
const takeModelUse = db.prepare(
  `INSERT INTO model_usage (day, model, uses) VALUES (?1, ?2, 1)
   ON CONFLICT (day, model) DO UPDATE SET uses = uses + 1 WHERE uses < ?3
   RETURNING uses`
);
const giveBackModelUse = db.prepare(
  "UPDATE model_usage SET uses = uses - 1 WHERE day = ? AND model = ? AND uses > 0"
);

/** True if a use was reserved (and counted); false if today's limit is reached. */
function reserveModelUse(model, day, limit) {
  if (!(limit > 0)) return false;
  return takeModelUse.get(day, model, limit) !== undefined;
}

/** Undo a reservation, e.g. when the call it was for failed. */
function releaseModelUse(model, day) {
  giveBackModelUse.run(day, model);
}

module.exports = {
  db, claimVisitorConversation, findCurrentConversation, getHistory, logExchange,
  reserveModelUse, releaseModelUse,
};
