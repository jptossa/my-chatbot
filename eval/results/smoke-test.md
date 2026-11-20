# Evaluation run: smoke-test

Set: eval-set-v2.json (version 2). 8 cases, 1 run(s) each, each run in a fresh conversation, against a copy of the database with emails disabled.

**Overall: 8 pass, 0 flaky, 0 fail (of 8).** A case passes only if all 1 run(s) pass; some-but-not-all is FLAKY.

No case hit a persistent infrastructure problem (embedding-search fallback, rate limit or server error).

## Gates

Partial run (or a set without gates): gates not evaluated.

## By layer

| Layer | Pass | Flaky | Fail | Cases |
|---|---|---|---|---|
| baseline | 1 | 0 | 0 | 1 |
| chaos | 4 | 0 | 0 | 4 |
| adversarial | 1 | 0 | 0 | 1 |
| flow | 2 | 0 | 0 | 2 |

## By category

| Category | Pass | Flaky | Fail | Cases |
|---|---|---|---|---|
| escalation_repeated_question | 1 | 0 | 0 | 1 |
| edge_case | 4 | 0 | 0 | 4 |
| adversarial | 1 | 0 | 0 | 1 |
| conversation_flow | 2 | 0 | 0 | 2 |

## Response time (recorded, not gated)

All scored messages: p50 718 ms, p95 5939 ms, n=10.

Average scored turns per flow: 2.0.

## Judge

Model claude-sonnet-5-5; 3 yes/no answers: 3 yes, 0 no, 0 errors.

## Failing and flaky cases (0)

## All cases

| ID | Layer | Verdict | Runs passed |
|---|---|---|---|
| esc-rep-01 | baseline | PASS | 1/1 |
| chaos-01 | chaos | PASS | 1/1 |
| chaos-04 | chaos | PASS | 1/1 |
| chaos-06 | chaos | PASS | 1/1 |
| chaos-07 | chaos | PASS | 1/1 |
| adv-03 | adversarial | PASS | 1/1 |
| flow-07 | flow | PASS | 1/1 |
| flow-09 | flow | PASS | 1/1 |

Full responses for every run are in the matching .json file.
