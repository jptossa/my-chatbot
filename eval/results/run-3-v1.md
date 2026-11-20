# Evaluation run: run-3-v1

Set: eval-set.json (version 1). 68 cases, 1 run(s) each, each run in a fresh conversation, against a copy of the database with emails disabled.

**Overall: 64 pass, 0 flaky, 4 fail (of 68).** A case passes only if all 1 run(s) pass; some-but-not-all is FLAKY.

No case hit a persistent infrastructure problem (embedding-search fallback, rate limit or server error).

## Gates

Partial run (or a set without gates): gates not evaluated.

## By category

| Category | Pass | Flaky | Fail | Cases |
|---|---|---|---|---|
| answerable | 27 | 0 | 3 | 30 |
| follow_up | 3 | 0 | 0 | 3 |
| off_topic | 13 | 0 | 0 | 13 |
| chat | 2 | 0 | 0 | 2 |
| escalation_human_requested | 4 | 0 | 1 | 5 |
| escalation_known_gap | 6 | 0 | 0 | 6 |
| escalation_repeated_question | 2 | 0 | 0 | 2 |
| in_scope_unanswerable | 5 | 0 | 0 | 5 |
| negative_control | 2 | 0 | 0 | 2 |

## Response time (recorded, not gated)

All scored messages: p50 3008 ms, p95 6181 ms, n=68.

## Failing and flaky cases (4)

### ans-12 - FAIL (0/1 runs passed)

*A gnome temporarily off the Garden Location is not covered during that time.*

Run 1: **FAIL** - reply missing any of: Garden Location; no sources returned

> **Customer:** I took my gnome to a friend's garden show and it got damaged there. Am I covered?
> **Bot:** I don't have information in the GnomeGuard Insurance documents about whether damage is covered when a gnome is away from your own garden, such as at a friend's garden show. A few related points may still help: ⏎ - **Damage on the way there or back:** According to the Exclusions & Definitions document, loss or damage while a gnome is being transported isn't covered unless you bought separate shipping insurance for that trip. If the damage happened in transit rather than at the show itself, it would likely fall under this exclusion. ⏎ - **Accidental breakage:** The same document indicates that accidental breakage is covered under the Plus and Premier tiers, though it doesn't say whether this a
>

### ans-23 - FAIL (0/1 runs passed)

*About GnomeGuard, so in scope; GnomeGuard insures garden gnomes only.*

Run 1: **FAIL** - treated as out of scope instead of answering

> **Customer:** Can I insure my car with GnomeGuard?
> **Bot:** Sorry, that one's outside what I can help with! I'm here for GnomeGuard Insurance, so I'd be glad to help with what your policy covers, how the Basic, Plus and Premier plans compare, or how to file a claim. What would you like to know? [out-of-scope redirect]
>

### ans-27 - FAIL (0/1 runs passed)

*Basic at $7.99/month is the cheapest tier.*

Flagged in advance: Vague wording; its retrieval similarity sits close to the low-confidence escalation threshold, so it may be escalated wrongly.

Run 1: **FAIL** - escalated (low_confidence_retrieval) instead of answering; created 1 escalation row(s), expected 0

> **Customer:** What's the cheapest option?
> **Bot:** This looks like something a member of our team should help with. I've flagged this conversation, and someone will follow up soon. [escalated: low_confidence_retrieval]
>

### esc-human-05 - FAIL (0/1 runs passed)

*Clearly asks to be handed to staff.*

Flagged in advance: No person-word ('person', 'agent', ...) appears, so the phrase patterns may not match it.

Run 1: **FAIL** - expected an escalation but response.escalated is not true; expected 1 new escalation row(s), found 0

> **Customer:** Transfer me to customer service.
> **Bot:** I don't have information about transferring to customer service in the GnomeGuard Insurance documents, and I can't make a transfer myself. ⏎ If your issue is about a claim, the Claims FAQ says you can file through the GnomeGuard claims portal or by calling the claims line. I don't have the number in the documents I can see. ⏎ I'm happy to help with questions about your policy, coverage, premiums and tiers, or the claims process. What can I help you with?
>

## All cases

| ID | Layer | Verdict | Runs passed |
|---|---|---|---|
| ans-01 | answerable | PASS | 1/1 |
| ans-02 | answerable | PASS | 1/1 |
| ans-03 | answerable | PASS | 1/1 |
| ans-04 | answerable | PASS | 1/1 |
| ans-05 | answerable | PASS | 1/1 |
| ans-06 | answerable | PASS | 1/1 |
| ans-07 | answerable | PASS | 1/1 |
| ans-08 | answerable | PASS | 1/1 |
| ans-09 | answerable | PASS | 1/1 |
| ans-10 | answerable | PASS | 1/1 |
| ans-11 | answerable | PASS | 1/1 |
| ans-12 | answerable | FAIL | 0/1 |
| ans-13 | answerable | PASS | 1/1 |
| ans-14 | answerable | PASS | 1/1 |
| ans-15 | answerable | PASS | 1/1 |
| ans-16 | answerable | PASS | 1/1 |
| ans-17 | answerable | PASS | 1/1 |
| ans-18 | answerable | PASS | 1/1 |
| ans-19 | answerable | PASS | 1/1 |
| ans-20 | answerable | PASS | 1/1 |
| ans-21 | answerable | PASS | 1/1 |
| ans-22 | answerable | PASS | 1/1 |
| ans-23 | answerable | FAIL | 0/1 |
| ans-24 | answerable | PASS | 1/1 |
| ans-25 | answerable | PASS | 1/1 |
| ans-26 | answerable | PASS | 1/1 |
| ans-27 | answerable | FAIL | 0/1 |
| ans-28 | answerable | PASS | 1/1 |
| ans-29 | answerable | PASS | 1/1 |
| ans-30 | answerable | PASS | 1/1 |
| fu-01 | follow_up | PASS | 1/1 |
| fu-02 | follow_up | PASS | 1/1 |
| fu-03 | follow_up | PASS | 1/1 |
| oos-01 | off_topic | PASS | 1/1 |
| oos-02 | off_topic | PASS | 1/1 |
| oos-03 | off_topic | PASS | 1/1 |
| oos-04 | off_topic | PASS | 1/1 |
| oos-05 | off_topic | PASS | 1/1 |
| oos-06 | off_topic | PASS | 1/1 |
| oos-07 | off_topic | PASS | 1/1 |
| oos-08 | off_topic | PASS | 1/1 |
| oos-09 | off_topic | PASS | 1/1 |
| oos-10 | off_topic | PASS | 1/1 |
| oos-11 | off_topic | PASS | 1/1 |
| oos-12 | off_topic | PASS | 1/1 |
| oos-13 | off_topic | PASS | 1/1 |
| chat-01 | chat | PASS | 1/1 |
| chat-02 | chat | PASS | 1/1 |
| esc-human-01 | escalation_human_requested | PASS | 1/1 |
| esc-human-02 | escalation_human_requested | PASS | 1/1 |
| esc-human-03 | escalation_human_requested | PASS | 1/1 |
| esc-human-04 | escalation_human_requested | PASS | 1/1 |
| esc-human-05 | escalation_human_requested | FAIL | 0/1 |
| esc-gap-01 | escalation_known_gap | PASS | 1/1 |
| esc-gap-02 | escalation_known_gap | PASS | 1/1 |
| esc-gap-03 | escalation_known_gap | PASS | 1/1 |
| esc-gap-04 | escalation_known_gap | PASS | 1/1 |
| esc-gap-05 | escalation_known_gap | PASS | 1/1 |
| esc-gap-06 | escalation_known_gap | PASS | 1/1 |
| esc-rep-01 | escalation_repeated_question | PASS | 1/1 |
| esc-rep-02 | escalation_repeated_question | PASS | 1/1 |
| gap-01 | in_scope_unanswerable | PASS | 1/1 |
| gap-02 | in_scope_unanswerable | PASS | 1/1 |
| gap-03 | in_scope_unanswerable | PASS | 1/1 |
| gap-04 | in_scope_unanswerable | PASS | 1/1 |
| gap-05 | in_scope_unanswerable | PASS | 1/1 |
| ctl-01 | negative_control | PASS | 1/1 |
| ctl-02 | negative_control | PASS | 1/1 |

Full responses for every run are in the matching .json file.
