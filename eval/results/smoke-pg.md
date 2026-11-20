# Evaluation run: smoke-pg

Set: eval-set-v2.json (version 2). 5 cases, 1 run(s) each, each run in a fresh conversation, against a copy of the database with emails disabled.

**Overall: 5 pass, 0 flaky, 0 fail (of 5).** A case passes only if all 1 run(s) pass; some-but-not-all is FLAKY.

No case hit a persistent infrastructure problem (embedding-search fallback, rate limit or server error).

## Gates

Partial run (or a set without gates): gates not evaluated.

## By layer

| Layer | Pass | Flaky | Fail | Cases |
|---|---|---|---|---|
| baseline | 1 | 0 | 0 | 1 |
| chaos | 3 | 0 | 0 | 3 |
| flow | 1 | 0 | 0 | 1 |

## By category

| Category | Pass | Flaky | Fail | Cases |
|---|---|---|---|---|
| escalation_human_requested | 1 | 0 | 0 | 1 |
| edge_case | 3 | 0 | 0 | 3 |
| conversation_flow | 1 | 0 | 0 | 1 |

## By intent

| Intent | Pass | Flaky | Fail | Cases |
|---|---|---|---|---|
| human_request | 1 | 0 | 0 | 1 |

## Response time (recorded, not gated)

All scored messages: p50 20 ms, p95 608 ms, n=6.

Average scored turns per flow: 2.0.

## Judge

Model claude-sonnet-5-5; 1 yes/no answers: 1 yes, 0 no, 0 errors.

## Failing and flaky cases (0)

## All cases

| ID | Layer | Verdict | Runs passed |
|---|---|---|---|
| esc-human-01 | baseline | PASS | 1/1 |
| chaos-01 | chaos | PASS | 1/1 |
| chaos-04 | chaos | PASS | 1/1 |
| chaos-06 | chaos | PASS | 1/1 |
| flow-07 | flow | PASS | 1/1 |

Full responses for every run are in the matching .json file.
