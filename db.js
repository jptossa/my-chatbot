// Database layer: PostgreSQL.
//
//   Production (Vercel): set DATABASE_URL to the Supabase connection string, the
//     TRANSACTION POOLER one (port 6543), which suits short-lived serverless
//     functions. Connections use SSL.
//   Local development and the evaluation runs: leave DATABASE_URL unset and the
//     same SQL runs on PGlite, a real PostgreSQL compiled to run inside Node,
//     with its files in DB_DIR (default ./data/pgdata). No install, no account.
//
// Both backends go through query()/transaction() below, so the rest of the app
// doesn't know which one it is talking to. Everything here is async.

const fs = require("node:fs");
const path = require("node:path");

const USE_PG = Boolean(process.env.DATABASE_URL);

let backend; // { query(text, params) -> { rows }, transaction(fn) }

if (USE_PG) {
  const { Pool, types } = require("pg");
  types.setTypeParser(20, Number); // bigint (e.g. COUNT) as a number, not a string

  const url = new URL(process.env.DATABASE_URL);
  const local = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  // node-postgres reads ?sslmode= itself and treats "require" strictly; we set SSL
  // explicitly instead. The Supabase pooler's certificate chain is not in Node's
  // default trust store, so the connection is encrypted but not verified.
  url.searchParams.delete("sslmode");
  const pool = new Pool({
    connectionString: url.toString(),
    ssl: local ? false : { rejectUnauthorized: false },
    max: Number(process.env.PG_POOL_MAX) || 3, // each serverless instance is small
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
    keepAlive: true,
  });
  pool.on("error", (error) => console.error("Idle database connection error:", error.message));

  // A serverless instance is frozen between requests, so a pooled connection can be dead
  // (closed by Supabase's pooler) by the time it is reused. That surfaces as "Connection
  // terminated". The dead client is discarded, so trying once more gets a fresh one.
  const isDroppedConnection = (error) =>
    /connection terminated|ECONNRESET|EPIPE|timeout exceeded when trying to connect|server closed the connection/i.test(error?.message || "");
  const withRetry = async (fn) => {
    try {
      return await fn();
    } catch (error) {
      if (!isDroppedConnection(error)) throw error;
      console.error("Database connection dropped, retrying once:", error.message);
      return fn();
    }
  };

  backend = {
    kind: "postgres",
    query: (text, params) => withRetry(() => pool.query(text, params)),
    async transaction(fn) {
      const client = await withRetry(async () => {
        const c = await pool.connect();
        try {
          await c.query("SELECT 1"); // fail here, not halfway through the transaction
          return c;
        } catch (error) {
          c.release(error); // destroy the dead client rather than return it to the pool
          throw error;
        }
      });
      try {
        await client.query("BEGIN");
        const result = await fn({ query: (text, params) => client.query(text, params), exec: (text) => client.query(text) });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
      } finally {
        client.release();
      }
    },
  };
} else {
  const { PGlite } = require("@electric-sql/pglite"); // dev dependency: only loaded without DATABASE_URL
  const dir = process.env.DB_DIR || path.join(__dirname, "data", "pgdata");
  fs.mkdirSync(dir, { recursive: true });
  const pglite = new PGlite(dir);
  backend = {
    kind: "pglite",
    query: (text, params) => pglite.query(text, params),
    transaction: (fn) => pglite.transaction((tx) => fn({ query: (text, params) => tx.query(text, params), exec: (text) => tx.exec(text) })),
  };
}

// ---------------------------------------------------------------------------
// Migrations. Each runs once, in order, in one transaction. The version is kept
// in schema_migrations, and an advisory lock stops two cold-starting server
// instances from applying the same migration at the same time.
// ---------------------------------------------------------------------------

const TABLES = [
  "documents", "users", "conversations", "messages", "auth_sessions", "chunks",
  "escalations", "model_usage", "rate_limits",
];

const MIGRATIONS = [
  // 1: the whole schema.
  `
  CREATE TABLE documents (
    id       INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    title    TEXT NOT NULL UNIQUE,
    content  TEXT NOT NULL
  );

  -- Accounts. Email is unique ignoring case. is_reviewer is switched on only by
  -- scripts/set-reviewer.js, never through the website.
  CREATE TABLE users (
    id             INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email          TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    display_name   TEXT,
    is_reviewer    BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE UNIQUE INDEX users_email_lower ON users (lower(email));

  -- A conversation belongs to a user when logged in; anonymous visitors are
  -- tracked by session_id. At least one must be set.
  CREATE TABLE conversations (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_id  TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
  );
  CREATE INDEX idx_conversations_user    ON conversations (user_id);
  CREATE INDEX idx_conversations_session ON conversations (session_id);

  CREATE TABLE messages (
    id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    role             TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content          TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  CREATE INDEX idx_messages_conversation ON messages (conversation_id, id);

  -- Login sessions; only a SHA-256 hash of the cookie token is stored.
  CREATE TABLE auth_sessions (
    id          INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    token_hash  TEXT NOT NULL UNIQUE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at  TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX idx_auth_sessions_user ON auth_sessions (user_id);

  -- Pieces of documents for embedding retrieval; the vector is little-endian
  -- float32 bytes (see embeddings.js), with the model that made it.
  CREATE TABLE chunks (
    id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    document_id      INTEGER NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index      INTEGER NOT NULL,
    content          TEXT NOT NULL,
    embedding        BYTEA NOT NULL,
    embedding_model  TEXT NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (document_id, chunk_index)
  );

  -- Conversations handed to a human. Status moves pending -> in_progress -> resolved.
  CREATE TABLE escalations (
    id               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    conversation_id  INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    trigger_type     TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved')),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolution_note  TEXT,
    resolved_at      TIMESTAMPTZ,
    resolved_by      INTEGER REFERENCES users(id) ON DELETE SET NULL
  );
  CREATE INDEX idx_escalations_conversation ON escalations (conversation_id);
  CREATE INDEX idx_escalations_status       ON escalations (status, created_at);
  -- At most one open escalation per conversation and trigger, enforced by the
  -- database so two simultaneous requests can't both create one.
  CREATE UNIQUE INDEX escalations_one_open ON escalations (conversation_id, trigger_type)
    WHERE status IN ('pending', 'in_progress');

  -- How many times each model has answered today (the daily Opus cap).
  CREATE TABLE model_usage (
    day    TEXT NOT NULL,
    model  TEXT NOT NULL,
    uses   INTEGER NOT NULL DEFAULT 0 CHECK (uses >= 0),
    PRIMARY KEY (day, model)
  );

  -- Fixed-window request counters for rate limiting.
  CREATE TABLE rate_limits (
    key           TEXT NOT NULL,
    window_start  TIMESTAMPTZ NOT NULL,
    hits          INTEGER NOT NULL,
    PRIMARY KEY (key, window_start)
  );

  -- Supabase exposes every table in the public schema through its Data API.
  -- With row level security ON and no policies, that API (anon and logged-in
  -- roles) can read nothing. This server connects as the database owner, which
  -- is not affected, so the app works as before.
  ${TABLES.map((t) => `ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY;`).join("\n  ")}
  `,
];

async function migrate() {
  await backend.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())"
  );
  const current = async (q) => (await q.query("SELECT COALESCE(MAX(version), 0)::int AS v FROM schema_migrations")).rows[0].v;
  if ((await current(backend)) >= MIGRATIONS.length) return; // the usual case: one cheap query
  await backend.transaction(async (tx) => {
    if (backend.kind === "postgres") await tx.query("SELECT pg_advisory_xact_lock(727274)");
    for (let v = (await current(tx)) + 1; v <= MIGRATIONS.length; v++) {
      await tx.exec(MIGRATIONS[v - 1]); // several statements: no parameters, so exec
      await tx.query("INSERT INTO schema_migrations (version) VALUES ($1)", [v]);
    }
  });
}

// A failed attempt is forgotten, so the next query tries again instead of every request
// on a warm instance failing with the first error until the instance is recycled.
let readyPromise = null;
function ensureReady() {
  if (!readyPromise) {
    readyPromise = migrate().catch((error) => {
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}
const ready = ensureReady();
ready.catch(() => {}); // the real error surfaces on the first query that awaits it

/** Runs a query; resolves to the array of rows. */
async function query(text, params = []) {
  await ensureReady();
  return (await backend.query(text, params)).rows;
}
/** Like query(), but resolves to the first row (or undefined). */
async function queryOne(text, params = []) {
  return (await query(text, params))[0];
}
/** Runs fn({ query, queryOne }) in a transaction; commits if it resolves, rolls back if it throws. */
async function transaction(fn) {
  await ensureReady();
  return backend.transaction(async (tx) => {
    const q = async (text, params = []) => (await tx.query(text, params)).rows;
    return fn({ query: q, queryOne: async (text, params = []) => (await q(text, params))[0] });
  });
}

// ---------------------------------------------------------------------------
// Conversations and chat logging
// ---------------------------------------------------------------------------

/**
 * Called on sign-up: the anonymous conversation this browser has been having
 * (if any) becomes the new user's, so it follows them to other browsers.
 */
async function claimVisitorConversation(sessionId, userId) {
  await query(
    `UPDATE conversations SET user_id = $1
     WHERE id = (SELECT id FROM conversations WHERE session_id = $2 AND user_id IS NULL ORDER BY id DESC LIMIT 1)`,
    [userId, sessionId]
  );
}

// How many past messages are sent to Claude with each new one (10 exchanges).
const MAX_HISTORY_MESSAGES = 20;

/**
 * Finds the conversation a request belongs to, or null if it's the start of a
 * new one.
 *   Guest: the unowned conversation tied to this browser's visitor session.
 *   Logged-in user: a conversation they own that is tied to this browser's
 *     session, else their most recent conversation (so they can continue it
 *     from another browser). Unowned guest conversations are never matched.
 * A conversation owned by someone else is never returned.
 */
async function findCurrentConversation({ sessionId, userId = null }) {
  if (!userId) {
    const guest = await queryOne(
      "SELECT id FROM conversations WHERE session_id = $1 AND user_id IS NULL ORDER BY id DESC LIMIT 1",
      [sessionId]
    );
    return guest?.id ?? null;
  }
  const own = await queryOne(
    "SELECT id FROM conversations WHERE session_id = $1 AND user_id = $2 ORDER BY id DESC LIMIT 1",
    [sessionId, userId]
  );
  if (own) return own.id;
  const latest = await queryOne(
    "SELECT id FROM conversations WHERE user_id = $1 ORDER BY updated_at DESC, id DESC LIMIT 1",
    [userId]
  );
  return latest?.id ?? null;
}

/**
 * The conversation's most recent messages as [{ role, content }], oldest
 * first, in the shape the Claude API expects. Always starts with a user message.
 */
async function getHistory(conversationId, limit = MAX_HISTORY_MESSAGES) {
  const rows = await query(
    `SELECT role, content FROM (
       SELECT id, role, content FROM messages WHERE conversation_id = $1 ORDER BY id DESC LIMIT $2
     ) recent ORDER BY id`,
    [conversationId, limit]
  );
  while (rows.length && rows[0].role !== "user") rows.shift();
  return rows.map(({ role, content }) => ({ role, content }));
}

/**
 * Records one user message and Claude's reply. Pass the `conversationId` from
 * findCurrentConversation (null starts a new conversation under `sessionId`).
 * If `userId` is set and the conversation is still anonymous, it becomes that
 * user's. If `escalationTrigger` is set, an escalation for it is recorded too,
 * unless one for the same trigger is already open (the database enforces this).
 * Returns { conversationId, escalationId }; escalationId is null when no new
 * escalation row was created.
 */
async function logExchange({
  conversationId = null, sessionId, userId = null, userMessage, claudeReply,
  escalationTrigger = null,
}) {
  return transaction(async (tx) => {
    if (conversationId === null) {
      conversationId = (await tx.queryOne(
        "INSERT INTO conversations (user_id, session_id) VALUES ($1, $2) RETURNING id", [userId, sessionId]
      )).id;
    } else if (userId) {
      await tx.query("UPDATE conversations SET user_id = $1 WHERE id = $2 AND user_id IS NULL", [userId, conversationId]);
    }
    await tx.query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'user', $2)", [conversationId, userMessage]);
    await tx.query("INSERT INTO messages (conversation_id, role, content) VALUES ($1, 'assistant', $2)", [conversationId, claudeReply]);
    await tx.query("UPDATE conversations SET updated_at = now() WHERE id = $1", [conversationId]);
    // Saved in the same transaction as the messages, so an escalation never
    // exists without its conversation turn (or the other way round).
    let escalationId = null;
    if (escalationTrigger) {
      const row = await tx.queryOne(
        "INSERT INTO escalations (conversation_id, trigger_type) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id",
        [conversationId, escalationTrigger]
      );
      escalationId = row?.id ?? null;
    }
    return { conversationId, escalationId };
  });
}

// ---------------------------------------------------------------------------
// Daily model cap and rate limiting
// ---------------------------------------------------------------------------

/**
 * Counts one use of `model` for `day` unless that would exceed `limit`. The
 * check and the increment are one statement, so two requests at the same moment
 * can't both take the last slot. True if a use was reserved.
 */
async function reserveModelUse(model, day, limit) {
  if (!(limit > 0)) return false;
  const row = await queryOne(
    `INSERT INTO model_usage (day, model, uses) VALUES ($1, $2, 1)
     ON CONFLICT (day, model) DO UPDATE SET uses = model_usage.uses + 1 WHERE model_usage.uses < $3
     RETURNING uses`,
    [day, model, limit]
  );
  return row !== undefined;
}

/** Undo a reservation, e.g. when the call it was for failed. */
async function releaseModelUse(model, day) {
  await query("UPDATE model_usage SET uses = uses - 1 WHERE day = $1 AND model = $2 AND uses > 0", [day, model]);
}

/**
 * Fixed-window counter: counts one hit for `key` and returns how many hits it
 * has had in the current window of `windowSeconds`.
 */
async function countHit(key, windowSeconds) {
  const row = await queryOne(
    `INSERT INTO rate_limits (key, window_start, hits)
     VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2::int) * $2::int), 1)
     ON CONFLICT (key, window_start) DO UPDATE SET hits = rate_limits.hits + 1
     RETURNING hits`,
    [key, windowSeconds]
  );
  if (Math.random() < 0.02) {
    query("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'").catch(() => {});
  }
  return row.hits;
}

module.exports = {
  backend: backend.kind, ready, query, queryOne, transaction,
  claimVisitorConversation, findCurrentConversation, getHistory, logExchange,
  reserveModelUse, releaseModelUse, countHit,
};
