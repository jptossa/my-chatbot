// Small helpers shared by the dashboard pages. All text from the server goes in
// through textContent, never innerHTML, so message content can't inject markup.

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

const TRIGGER_LABELS = {
  human_requested: "Asked for a person",
  known_gap: "Known gap",
  low_confidence_retrieval: "Low-confidence match",
  repeated_question: "Repeated question",
};
const triggerLabel = (type) => TRIGGER_LABELS[type] ?? type;

const STATUS_LABELS = { pending: "Pending", in_progress: "In progress", resolved: "Resolved" };
const statusLabel = (status) => STATUS_LABELS[status] ?? status;

// Timestamps are stored as UTC ISO strings; show them in the reviewer's time zone.
function formatTime(iso) {
  return new Date(iso).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

function waiting(iso) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours} h`;
  return `${Math.round(hours / 24)} days`;
}

// GET a JSON API path. A lost session or revoked role reloads the page, which
// then shows the login or no-access screen.
async function getJson(url) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (response.status === 401 || response.status === 403) {
    location.reload();
    return new Promise(() => {});
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `Request failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.json();
}

async function logout() {
  await fetch("/api/logout", { method: "POST" });
  location.href = "/admin";
}

// Top bar with the logout button.
function topBar() {
  const out = el("button", { type: "button", text: "Log out" });
  out.addEventListener("click", logout);
  return el("header", { class: "top" }, el("h1", { text: "GnomeGuard · Escalations" }), out);
}
