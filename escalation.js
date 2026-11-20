// When a question should go to a human instead of getting a bot answer.
//
// Four triggers. Each has a short name (stored in escalations.trigger_type)
// and the reply the customer sees. The detection helpers are pure functions;
// /api/chat decides the order in which they run.

const { matchKnownGap } = require("./knowledge-gaps");

const TRIGGERS = {
  HUMAN_REQUESTED: "human_requested",
  KNOWN_GAP: "known_gap",
  LOW_CONFIDENCE: "low_confidence_retrieval",
  REPEATED_QUESTION: "repeated_question",
};

// Retrieval scores are cosine similarities between the question and the
// best-matching chunk. Measured on this knowledge base: clear questions it
// answers score about 0.57-0.70 (a vague one like "what's the cheapest
// option?" 0.48); questions it can't answer score about 0.40-0.52 ("pay by
// cryptocurrency" 0.40, "office hours" 0.44, "student discount" 0.52). The two
// ranges overlap, so this catches clearly unrelated questions and some vague
// ones; borderline ones are left to the answering prompt, which says "I don't
// have that information" when the context lacks the answer.
// The line sits at 0.45, the same floor retrieval uses to discard a chunk: only a
// question with NO chunk close enough is escalated. It was 0.50, which escalated
// the perfectly answerable "what's the cheapest option?" (0.48). A weakly matched
// question now reaches the model with its best chunks, and the answering prompt
// declines to guess when they don't contain the answer.
const LOW_CONFIDENCE_SCORE = 0.45;

// A message this similar (cosine of embeddings) to an earlier question in the
// same conversation counts as asking it again. Rewordings of one question
// measured 0.84-0.95; different questions on the same topic 0.52-0.78.
const REPEAT_SIMILARITY = 0.82;

// Plain-English reason for each trigger, for staff (the email and the dashboard).
const TRIGGER_REASONS = {
  [TRIGGERS.HUMAN_REQUESTED]: "The customer asked to talk to a person.",
  [TRIGGERS.KNOWN_GAP]: "The question is about a topic the knowledge base is known not to cover.",
  [TRIGGERS.LOW_CONFIDENCE]: "Nothing in the knowledge base matched the question closely enough to answer it.",
  [TRIGGERS.REPEATED_QUESTION]: "The customer asked the same thing again in this conversation.",
};

// What the customer sees when a message is escalated: a short acknowledgment,
// with no attempt to answer. The same wording for every trigger; to word one
// differently, give that trigger its own entry in REPLIES.
const ESCALATION_ACK =
  "This looks like something a member of our team should help with. " +
  "I've flagged this conversation, and someone will follow up soon.";

const REPLIES = {
  [TRIGGERS.HUMAN_REQUESTED]: ESCALATION_ACK,
  [TRIGGERS.KNOWN_GAP]: ESCALATION_ACK,
  [TRIGGERS.LOW_CONFIDENCE]: ESCALATION_ACK,
  [TRIGGERS.REPEATED_QUESTION]: ESCALATION_ACK,
};

// ---------------------------------------------------------------------------
// Explicit requests for a human.
//
// The message is first normalised: lower-cased, "2" read as "to", "u"/"ur" as
// "you"/"your", and a misspelled key word (only words of 5+ letters, one letter
// off) corrected, so "i wnat to speek to a persn" reads as "...speak to a person".
// Then phrase patterns look for a verb of contact followed by "to/with/through" and
// someone to be contacted, so "what if someone steals my gnome, can I talk about
// it later" doesn't match.
// ---------------------------------------------------------------------------

const KEY_WORDS = [
  "speak", "person", "human", "agent", "manager", "someone", "somebody", "anyone", "supervisor",
  "representative", "operator", "specialist", "advisor", "employee", "customer", "service", "support",
  "transfer", "connect", "escalate",
];

function editDistanceIsOne(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (a.length === b.length) return a.slice(i + 1) === b.slice(i + 1) || (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2));
  const [longer, shorter] = a.length > b.length ? [a, b] : [b, a];
  return longer.slice(i + 1) === shorter.slice(i);
}

function normaliseForMatching(message) {
  return message
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/\b2\b/g, "to")
    .replace(/\bur\b/g, "your")
    .replace(/\bu\b/g, "you")
    .replace(/[a-z]+/g, (word) => {
      if (word.length < 5 || KEY_WORDS.includes(word)) return word;
      const fix = KEY_WORDS.find((k) => k.length >= 5 && editDistanceIsOne(word, k));
      return fix ?? word;
    });
}

// Who or what the customer wants to reach.
const PERSON = "(?:person|human|people|agent|representative|rep|operator|supervisor|manager|advisor|specialist|someone|somebody|anyone|staff|employee)";
const REACH = "(?:" + PERSON.slice(3, -1) + "|(?:member|one) of (?:your|the|our) (?:team|staff)|(?:customer )?(?:service|support|care)(?: team| department| desk)?|billing|sales|(?:claims )?(?:team|department|office|adjuster)|claims)";
const CONTACT_VERB = "(?:talk|speak|chat|connect(?:ed)?|transfer(?:red)?|put|get|pass|forward|hand)(?:ing)?";
const HUMAN_REQUEST_PATTERNS = [
  // "talk to a person", "transfer me to customer service", "put me through to billing",
  // "connected with a member of your staff"
  new RegExp(
    String.raw`\b${CONTACT_VERB}\s+(?:me\s+)?(?:over\s+)?(?:to|with|through(?: to)?)\s+(?:a|an|the|your|some|any|one of)?\s*(?:real|live|actual|human|friendly)?\s*${REACH}\b`,
    "i"
  ),
  /\b(?:real|live|actual)\s+(?:person|human|people|agent)\b/i,
  /\bhuman\s+(?:agent|being|help|support|representative|operator)\b/i,
  /\bcustomer\s+(?:service|support)\s+(?:agent|rep|representative)\b/i,
  new RegExp(
    String.raw`\b(?:want|need|get me|give me|would like|wanna)\s+(?:to\s+(?:talk|speak)\s+to\s+)?(?:a|an)\s+${PERSON}\b`,
    "i"
  ),
  // "is there someone in claims I can talk to?"
  /\b(?:someone|somebody|anyone|anybody)\b[^.?!]{0,40}\b(?:talk|speak|chat)\s+(?:to|with)\b/i,
  // "who can I speak to?"
  /\bwho\s+(?:can|could|do|should|may)\s+(?:i|we)\s+(?:talk|speak|chat)\b/i,
  // "I'd rather not discuss this with a bot", "I'd prefer a human"
  /\b(?:rather|prefer)\b[^.?!]{0,30}\b(?:human|person|someone|people)\b/i,
  /\b(?:not|n't)\s+(?:want|wanna|like)\b[^.?!]{0,30}\b(?:with|to)\s+(?:a\s+|an\s+|the\s+)?(?:bot|robot|chatbot|ai|machine|computer)\b/i,
  /\b(?:rather\s+not|don't\s+want\s+to)\b[^.?!]{0,30}\bwith\s+(?:a\s+|an\s+|the\s+)?(?:bot|robot|chatbot|ai|machine)\b/i,
  /\bescalate\b/i,
];

/** True if the message asks for a human, e.g. "can I talk to a person?". */
function isHumanRequest(message) {
  const text = normaliseForMatching(message);
  return HUMAN_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * Retrieval-based triggers, from the result of searchKnowledgeBase().
 * Returns a trigger name, or null if the answer looks trustworthy.
 */
function retrievalTrigger({ bestScore, aloneScore, repeatSimilarity }, isFollowUp = false) {
  if (repeatSimilarity >= REPEAT_SIMILARITY) return TRIGGERS.REPEATED_QUESTION;
  // A follow-up ("and per year?") only makes sense with the earlier questions, so
  // its confidence is the score of the combined search. A self-contained question
  // is judged on its own words.
  const confidence = isFollowUp ? bestScore : aloneScore;
  if (confidence < LOW_CONFIDENCE_SCORE) return TRIGGERS.LOW_CONFIDENCE;
  return null;
}

module.exports = {
  TRIGGERS, TRIGGER_REASONS, REPLIES, LOW_CONFIDENCE_SCORE, REPEAT_SIMILARITY,
  isHumanRequest, matchKnownGap, retrievalTrigger,
};
