// Topics customers ask about that the knowledge base is known NOT to answer.
// A question matching one of these is escalated to a human straight away,
// instead of letting the bot guess or give a vague non-answer.
//
// Edit this list as gaps are found (the escalations table shows which
// questions people are escalating) and as documents are added: when a gap is
// filled by a new document, delete its entry here.
//
// The patterns are deliberately narrow, so ordinary questions that the
// documents DO answer (e.g. "will my policy be cancelled if...") don't match.

const KNOWN_GAPS = [
  {
    id: "contact_details",
    description: "Phone numbers, email addresses and other contact details (the documents mention a claims line but give no number)",
    pattern: /\b(phone|telephone|hotline|fax)\b|\bcontact (details|info|information|number)\b|\b(claims?|support|customer service)\s+(email|number|address)\b|\bemail address\b/i,
  },
  {
    id: "office_hours",
    description: "When support or the claims line is open",
    pattern: /\b(office|business|opening|support|call)\s+hours\b|\bwhen are you open\b|\bwhat time\b.*\b(open|close)\b/i,
  },
  {
    id: "claim_disputes",
    description: "Disputing, appealing or complaining about a decision",
    pattern: /\b(dispute|appeal|overturn|complain|complaint)\w*\b/i,
  },
  {
    id: "cancel_policy",
    description: "Cancelling a policy yourself (the documents only cover cancellation by GnomeGuard)",
    pattern: /\b(cancel|terminate|end)\s+(my|our|the)\s+(policy|coverage|plan|subscription)\b/i,
  },
  {
    id: "payment_methods",
    description: "How and by what method premiums can be paid",
    pattern: /\bhow (do|can|should) i pay\b|\b(pay|payment)\s+(by|with|using|via|methods?|options?)\b|\b(credit|debit)\s+card\b|\bcrypto\w*\b|\bpaypal\b|\binstal+ments?\b/i,
  },
];

/** Returns the first known gap the message matches, or null. */
function matchKnownGap(message) {
  return KNOWN_GAPS.find((gap) => gap.pattern.test(message)) ?? null;
}

module.exports = { KNOWN_GAPS, matchKnownGap };
