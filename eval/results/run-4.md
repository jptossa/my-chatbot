# Evaluation run: run-4

Set: eval-set-v2.json (version 2). 83 cases, 1 run(s) each, each run in a fresh conversation, against a copy of the database with emails disabled.

**Overall: 82 pass, 0 flaky, 1 fail (of 83).** A case passes only if all 1 run(s) pass; some-but-not-all is FLAKY.

No case hit a persistent infrastructure problem (embedding-search fallback, rate limit or server error).

## Gates

Partial run (or a set without gates): gates not evaluated.

## By layer

| Layer | Pass | Flaky | Fail | Cases |
|---|---|---|---|---|
| baseline | 63 | 0 | 0 | 63 |
| bug | 19 | 0 | 1 | 20 |

## By category

| Category | Pass | Flaky | Fail | Cases |
|---|---|---|---|---|
| answerable | 30 | 0 | 0 | 30 |
| follow_up | 3 | 0 | 0 | 3 |
| off_topic | 13 | 0 | 0 | 13 |
| chat | 2 | 0 | 0 | 2 |
| escalation_human_requested | 5 | 0 | 0 | 5 |
| escalation_known_gap | 6 | 0 | 0 | 6 |
| escalation_repeated_question | 2 | 0 | 0 | 2 |
| in_scope_unanswerable | 5 | 0 | 0 | 5 |
| negative_control | 2 | 0 | 0 | 2 |
| regression_bug | 14 | 0 | 1 | 15 |

## By intent

| Intent | Pass | Flaky | Fail | Cases |
|---|---|---|---|---|
| tier_price | 2 | 0 | 0 | 2 |
| tier_restricted_coverage | 2 | 0 | 0 | 2 |
| claim_requirements | 3 | 0 | 0 | 3 |
| report_deadline | 1 | 0 | 0 | 1 |
| claims_turnaround | 1 | 0 | 0 | 1 |
| payout | 3 | 0 | 0 | 3 |
| eligibility_non_gnome | 2 | 0 | 0 | 2 |
| move_house | 1 | 0 | 0 | 1 |
| premium_impact | 1 | 0 | 0 | 1 |
| tier_change | 2 | 0 | 0 | 2 |
| tier_deductible | 1 | 0 | 0 | 1 |
| human_request | 5 | 0 | 0 | 5 |
| contact_details | 2 | 0 | 0 | 2 |

## Response time (recorded, not gated)

All scored messages: p50 3133 ms, p95 6680 ms, n=83.

## Failing and flaky cases (1)

### bug-23d - FAIL (0/1 runs passed)

*Bug class from ans-23.*

Run 1: **FAIL** - no sources returned

> **Customer:** Can I get pet insurance for my dog from you?
> **Bot:** I don't have information about pet insurance in the GnomeGuard Insurance documents. According to the Premium Tiers document, GnomeGuard offers three coverage tiers (Basic, Plus, and Premier) for garden gnome insurance. The Exclusions & Definitions document also says that only Garden Gnomes are insurable, and that non-gnome items can't be added to a policy. ⏎ I can tell you about our gnome coverage, tiers and premiums, or how to file a claim if you'd like.
>

## All cases

| ID | Layer | Verdict | Runs passed |
|---|---|---|---|
| ans-01 | baseline | PASS | 1/1 |
| ans-02 | baseline | PASS | 1/1 |
| ans-03 | baseline | PASS | 1/1 |
| ans-04 | baseline | PASS | 1/1 |
| ans-05 | baseline | PASS | 1/1 |
| ans-06 | baseline | PASS | 1/1 |
| ans-07 | baseline | PASS | 1/1 |
| ans-08 | baseline | PASS | 1/1 |
| ans-09 | baseline | PASS | 1/1 |
| ans-10 | baseline | PASS | 1/1 |
| ans-11 | baseline | PASS | 1/1 |
| ans-12 | bug | PASS | 1/1 |
| ans-13 | baseline | PASS | 1/1 |
| ans-14 | baseline | PASS | 1/1 |
| ans-15 | baseline | PASS | 1/1 |
| ans-16 | baseline | PASS | 1/1 |
| ans-17 | baseline | PASS | 1/1 |
| ans-18 | baseline | PASS | 1/1 |
| ans-19 | baseline | PASS | 1/1 |
| ans-20 | baseline | PASS | 1/1 |
| ans-21 | baseline | PASS | 1/1 |
| ans-22 | baseline | PASS | 1/1 |
| ans-23 | bug | PASS | 1/1 |
| ans-24 | baseline | PASS | 1/1 |
| ans-25 | baseline | PASS | 1/1 |
| ans-26 | baseline | PASS | 1/1 |
| ans-27 | bug | PASS | 1/1 |
| ans-28 | bug | PASS | 1/1 |
| ans-29 | baseline | PASS | 1/1 |
| ans-30 | baseline | PASS | 1/1 |
| fu-01 | baseline | PASS | 1/1 |
| fu-02 | baseline | PASS | 1/1 |
| fu-03 | baseline | PASS | 1/1 |
| oos-01 | baseline | PASS | 1/1 |
| oos-02 | baseline | PASS | 1/1 |
| oos-03 | baseline | PASS | 1/1 |
| oos-04 | baseline | PASS | 1/1 |
| oos-05 | baseline | PASS | 1/1 |
| oos-06 | baseline | PASS | 1/1 |
| oos-07 | baseline | PASS | 1/1 |
| oos-08 | baseline | PASS | 1/1 |
| oos-09 | baseline | PASS | 1/1 |
| oos-10 | baseline | PASS | 1/1 |
| oos-11 | baseline | PASS | 1/1 |
| oos-12 | baseline | PASS | 1/1 |
| oos-13 | baseline | PASS | 1/1 |
| chat-01 | baseline | PASS | 1/1 |
| chat-02 | baseline | PASS | 1/1 |
| esc-human-01 | baseline | PASS | 1/1 |
| esc-human-02 | baseline | PASS | 1/1 |
| esc-human-03 | baseline | PASS | 1/1 |
| esc-human-04 | baseline | PASS | 1/1 |
| esc-human-05 | bug | PASS | 1/1 |
| esc-gap-01 | baseline | PASS | 1/1 |
| esc-gap-02 | baseline | PASS | 1/1 |
| esc-gap-03 | baseline | PASS | 1/1 |
| esc-gap-04 | baseline | PASS | 1/1 |
| esc-gap-05 | baseline | PASS | 1/1 |
| esc-gap-06 | baseline | PASS | 1/1 |
| esc-rep-01 | baseline | PASS | 1/1 |
| esc-rep-02 | baseline | PASS | 1/1 |
| gap-01 | baseline | PASS | 1/1 |
| gap-02 | baseline | PASS | 1/1 |
| gap-03 | baseline | PASS | 1/1 |
| gap-04 | baseline | PASS | 1/1 |
| gap-05 | baseline | PASS | 1/1 |
| ctl-01 | baseline | PASS | 1/1 |
| ctl-02 | baseline | PASS | 1/1 |
| bug-12b | bug | PASS | 1/1 |
| bug-12c | bug | PASS | 1/1 |
| bug-20b | bug | PASS | 1/1 |
| bug-23b | bug | PASS | 1/1 |
| bug-23c | bug | PASS | 1/1 |
| bug-23d | bug | FAIL | 0/1 |
| bug-27b | bug | PASS | 1/1 |
| bug-27c | bug | PASS | 1/1 |
| bug-27d | bug | PASS | 1/1 |
| bug-28b | bug | PASS | 1/1 |
| bug-28c | bug | PASS | 1/1 |
| bug-05b | bug | PASS | 1/1 |
| bug-05c | bug | PASS | 1/1 |
| bug-05d | bug | PASS | 1/1 |
| bug-05e | bug | PASS | 1/1 |

Full responses for every run are in the matching .json file.
