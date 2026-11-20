// Emails the team when a new escalation is recorded, through Resend
// (https://resend.com): one HTTPS call, no SDK, authenticated by an API key in
// .env, the same pattern as ANTHROPIC_API_KEY.
//
//   RESEND_API_KEY         required to send; without it emails are skipped (logged)
//   ESCALATION_EMAIL_TO    recipient (default below)
//   ESCALATION_EMAIL_FROM  sender. Resend's test sender below can only deliver to
//                          the email address that owns the Resend account; to
//                          send elsewhere, verify a domain and use an address on it.
//   APP_BASE_URL           used to build the conversation link (default http://localhost:PORT)

const API_URL = process.env.RESEND_API_URL || "https://api.resend.com/emails";
const DEFAULT_TO = "zjptossa@gmail.com";
const DEFAULT_FROM = "GnomeGuard Chatbot <onboarding@resend.dev>";

const { TRIGGER_REASONS: REASONS } = require("./escalation");

/**
 * Sends the escalation email. Never throws and is meant to be called without
 * `await`: a failure is logged and nothing else, so it can't affect the chat
 * response.
 */
async function notifyEscalation({ escalationId, conversationId, trigger, detail }) {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      console.error(`Escalation #${escalationId} email skipped: RESEND_API_KEY is not set (see .env.example).`);
      return;
    }
    const base = (process.env.APP_BASE_URL || `http://localhost:${process.env.PORT || 3000}`).replace(/\/+$/, "");
    const link = `${base}/admin/escalations/${escalationId}`;
    const text = [
      `A conversation was escalated and needs a follow-up.`,
      ``,
      `Trigger: ${trigger}`,
      `Reason: ${REASONS[trigger] ?? "Escalated by the chatbot."}`,
      detail ? `Details: ${detail}` : null,
      ``,
      `Review it (reviewer login required): ${link}`,
      `(Escalation #${escalationId}, conversation #${conversationId})`,
    ].filter((line) => line !== null).join("\n");

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: process.env.ESCALATION_EMAIL_FROM || DEFAULT_FROM,
        to: [process.env.ESCALATION_EMAIL_TO || DEFAULT_TO],
        subject: `[GnomeGuard] Escalation: ${trigger} (conversation #${conversationId})`,
        text,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) {
      throw new Error(`Resend responded ${response.status}: ${(await response.text()).slice(0, 300)}`);
    }
    console.log(`Escalation #${escalationId} email sent.`);
  } catch (error) {
    console.error(`Escalation #${escalationId} email failed:`, error.message);
  }
}

module.exports = { notifyEscalation };
