// Email + password accounts with cookie-based login sessions.
//
// - Passwords are hashed with scrypt (built into Node) and a random salt.
// - Logging in creates a random token, sent to the browser in an HttpOnly
//   cookie; the database stores only its SHA-256 hash.
// - attachUser() reads that cookie on every request and sets req.user, which
//   is how the rest of the server knows who is making a request.

const crypto = require("node:crypto");
const { promisify } = require("node:util");
const express = require("express");
const { query, queryOne, claimVisitorConversation } = require("./db");

const scrypt = promisify(crypto.scrypt);

const SESSION_COOKIE = "sid";
const SESSION_DAYS = 7;
const SESSION_MS = SESSION_DAYS * 24 * 60 * 60 * 1000;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;
const MAX_PASSWORD = 128; // bounds the work an attacker can force per request

// --- passwords -------------------------------------------------------------

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scrypt(password, Buffer.from(saltHex, "hex"), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Compared against when the email is unknown, so a login attempt takes about
// as long whether or not the account exists.
const DUMMY_HASH = hashPassword("not-a-real-password");

// --- login sessions --------------------------------------------------------

const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");

const deleteExpired = () => query("DELETE FROM auth_sessions WHERE expires_at <= now()");

function readCookie(req, name) {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      try {
        return decodeURIComponent(part.slice(i + 1).trim());
      } catch {
        return null;
      }
    }
  }
  return null;
}

// A fresh token is issued on every login, so a token can't be planted
// on someone before they sign in.
async function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString("base64url");
  await query(
    "INSERT INTO auth_sessions (token_hash, user_id, expires_at) VALUES ($1, $2, $3)",
    [sha256(token), userId, new Date(Date.now() + SESSION_MS)]
  );
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true, // not readable from page JavaScript
    sameSite: "lax", // not sent on cross-site POSTs
    secure: process.env.NODE_ENV === "production", // HTTPS-only when deployed
    maxAge: SESSION_MS,
    path: "/",
  });
}

async function endSession(req, res) {
  const token = readCookie(req, SESSION_COOKIE);
  if (token) await query("DELETE FROM auth_sessions WHERE token_hash = $1", [sha256(token)]);
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  // Also forget the visitor session, so whoever uses this browser next starts
  // a brand-new conversation instead of continuing this person's.
  res.clearCookie(VISITOR_COOKIE, { path: "/" });
}

// --- visitor sessions (no account needed) ----------------------------------
//
// Every browser that chats gets a random, server-issued token in an HttpOnly
// cookie. conversations.session_id stores its SHA-256 hash, so the same
// visitor's messages land in the same conversation, and nobody can join
// another visitor's conversation by guessing or supplying an id.

const VISITOR_COOKIE = "gid";
const VISITOR_MS = 30 * 24 * 60 * 60 * 1000;
const VISITOR_TOKEN = /^[A-Za-z0-9_-]{43}$/; // 32 random bytes, base64url

// On sign-up (not login), the conversation this browser has had as a guest
// becomes the new user's.
async function adoptVisitorConversation(req, userId) {
  const token = readCookie(req, VISITOR_COOKIE);
  if (token && VISITOR_TOKEN.test(token)) await claimVisitorConversation(sha256(token), userId);
}

/**
 * Returns the id to record this visitor's conversation under, issuing a new
 * visitor cookie if they don't have a valid one. The cookie is re-sent on every
 * call, so a visitor who keeps chatting never expires.
 */
function visitorSessionId(req, res) {
  let token = readCookie(req, VISITOR_COOKIE);
  if (!token || !VISITOR_TOKEN.test(token)) {
    token = crypto.randomBytes(32).toString("base64url");
  }
  res.cookie(VISITOR_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: VISITOR_MS,
    path: "/",
  });
  return sha256(token);
}

/** Middleware: sets req.user to { id, email, display_name, is_reviewer }, or null if not logged in. */
async function attachUser(req, res, next) {
  const token = readCookie(req, SESSION_COOKIE);
  req.user = token
    ? (await queryOne(
        `SELECT u.id, u.email, u.display_name, u.is_reviewer
         FROM auth_sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > now()`,
        [sha256(token)]
      )) ?? null
    : null;
  next();
}

// --- routes ----------------------------------------------------------------

const publicUser = (user) => ({ id: user.id, email: user.email, isReviewer: user.is_reviewer === true });

function readCredentials(body) {
  const { email, password } = body ?? {};
  if (typeof email !== "string" || typeof password !== "string") return null;
  return { email: email.trim().toLowerCase(), password };
}

/** Builds the /api/signup, /api/login, /api/logout and /api/me routes. `limits` are rate-limit middleware. */
function createAuthRouter({ signupLimit = (q, s, n) => n(), loginLimit = (q, s, n) => n() } = {}) {
  const router = express.Router();

  router.post("/signup", signupLimit, async (req, res) => {
    const credentials = readCredentials(req.body);
    if (!credentials || !EMAIL_PATTERN.test(credentials.email) || credentials.email.length > 254) {
      return res.status(400).json({ error: "Please enter a valid email address." });
    }
    const { email, password } = credentials;
    if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
      return res.status(400).json({
        error: `Password must be between ${MIN_PASSWORD} and ${MAX_PASSWORD} characters.`,
      });
    }

    try {
      const { id: userId } = await queryOne(
        "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
        [email, await hashPassword(password)]
      );
      await adoptVisitorConversation(req, userId);
      await startSession(res, userId);
      res.status(201).json({ user: { id: userId, email } });
    } catch (error) {
      if (error.code === "23505" || /duplicate key|unique constraint/i.test(String(error.message))) {
        return res.status(409).json({ error: "An account with that email already exists." });
      }
      console.error("Signup failed:", error);
      res.status(500).json({ error: "Could not create the account." });
    }
  });

  router.post("/login", loginLimit, async (req, res) => {
    const credentials = readCredentials(req.body);
    const invalid = () => res.status(401).json({ error: "Invalid email or password." });
    if (!credentials) return invalid();

    try {
      const user = await queryOne(
        "SELECT id, email, display_name, is_reviewer, password_hash FROM users WHERE lower(email) = lower($1)",
        [credentials.email]
      );
      const stored = user ? user.password_hash : await DUMMY_HASH;
      const passwordOk = await verifyPassword(credentials.password, stored);
      if (!user || !passwordOk) return invalid();

      await deleteExpired();
      // Deliberately no adoptVisitorConversation here: logging in must not take
      // over the guest chat this browser had (it stays unowned). Only sign-up does.
      await startSession(res, user.id);
      res.json({ user: publicUser(user) });
    } catch (error) {
      console.error("Login failed:", error);
      res.status(500).json({ error: "Could not log in." });
    }
  });

  router.post("/logout", async (req, res) => {
    try {
      await endSession(req, res);
      res.json({ ok: true });
    } catch (error) {
      console.error("Logout failed:", error);
      res.status(500).json({ error: "Could not log out." });
    }
  });

  router.get("/me", (req, res) => {
    if (!req.user) return res.status(401).json({ error: "Not logged in." });
    res.json({ user: publicUser(req.user) });
  });

  return router;
}

module.exports = { attachUser, createAuthRouter, visitorSessionId };
