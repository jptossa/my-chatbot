# Evaluation sets

Two frozen versions. Expectations are written **before** a set is run; if a result
looks wrong, decide whether the chatbot or the set is at fault and record that as a
new version rather than editing a frozen one.

| File | Cases | SHA-256 |
|---|---|---|
| `eval-set.json` (version 1) | 68 | `d77d594d6706962c14a3694075c9e4973492f2fe84de314232d571c090cda61a` |
| `eval-set-v2.json` (version 2) | 191 | `7d0d308624f20448d7c0f950142a93beda68b8aef5116133998efacb9c5aa2f1` |

If a file no longer hashes to the value above, it has been edited since it was frozen.

Run 1 (`run-eval.js`, `results/run-1.*`) scored version 1: 63 of 68 passed.

## Version 2

Version 2 keeps all 68 version-1 cases with their expectations unchanged, and adds
123 cases, using ideas from
[7 Chatbot Testing Strategies](https://www.coval.ai/blog/chatbot-testing-strategies/)
(Coval, 2026; vendor content). The rest of this section is what changed and why.

| Layer | Cases | What it is |
|---|---|---|
| baseline | 63 | The version-1 cases that passed in run 1 |
| bug | 20 | The 5 version-1 cases that failed in run 1, plus 15 new siblings of those failures |
| intent | 70 | 14 intents, each with 5 new phrasings: formal, casual, indirect, typo, context-dependent |
| chaos | 16 | Gibberish, symbols, emoji, empty, whitespace, wrong type, 2,800-character input, multi-intent, emotional, other languages, SQL-looking text, typos, shouting, fragments |
| adversarial | 8 | Persona override, prompt extraction, injection inside a question and inside a long message, social engineering, privacy, false-coverage requests |
| persona | 3 | Rambling, beginner and skeptical customers |
| flow | 11 | Multi-turn conversations (29 turns): happy path, change of mind, context retention, state confusion, resumption, escalation mid-flow, duplicate escalation, loop detection, persona drift, off-topic detour |

Each flow turn is scored on its own, and the whole conversation is checked with
yes/no questions (for example "does the reply avoid asking for the tier again?").

### What the article suggested and where it went

- **Used:** intent coverage with 5+ phrasings per intent in five styles; a chaos set;
  conversation-flow tests with context-amnesia, state-confusion, dead-end and loop
  checks; personas; regression layers with one bug test per defect found; yes/no
  judge questions for things string matching cannot check.
- **Added because the article gives no method:** repeat runs for non-determinism
  (3 runs per case; a case passes only if all 3 do, and 1-2 of 3 is reported as
  flaky) and a calibration step for any LLM judge (agree with the hand-read run-1
  labels at least 95% of the time before it is trusted).
- **Not used yet:** load testing (needs a paid embedding tier first), A/B prompt
  testing (no variants exist), production monitoring and the escaped-defect rate
  (needs real traffic; the `escalations` table is the natural source).

### Scoring rules and gates

Defined in the file's `meta.scoring` and `meta.outcomes`. The gates are proposals
set before the first version-2 run: critical cases (all off-topic, adversarial and
escalation cases, plus three flows) 100%; bug layer 100%; every intent at least 4 of
5 new phrasings; overall at least 90% excluding flaky. Adjust them before running,
not after. Response time per case is recorded but not gated, since no baseline
exists yet.

### Known limits of this set

- Eighteen cases carry a `known_risk` note: places where the chatbot's known limits
  make failure likely. Their expectations are still the intended behavior.
- Judge-based checks (`judge`, `flow_checks`) need a judge that does not exist yet;
  run-eval.js scores only the string and flag rules.
- Everything is written for the four current documents.

## Running a set

- Use a throwaway database (`DB_PATH`) and a spare port: escalation cases create rows,
  and human-request cases would otherwise email the team (set `RESEND_API_KEY=` empty).
- Each conversation needs its own visitor cookie; send earlier messages first.
- The Voyage free tier allows 3 requests per minute and each question uses one, so
  pace requests (about 21 seconds apart) or add a payment method. Version 2 at 3 runs
  per case is several hours on the free tier.
- `run-eval.js` runs both versions. Version 2: `node --no-warnings eval/run-eval.js --set eval-set-v2.json --name run-2`.
  Options: `--runs N`, `--only id,layer:flow,intent:payout`, `--gap ms`, `--resume`
  (a run takes hours, so progress is saved after every case), `--no-judge`,
  `--dry-run` (validate and estimate; sends nothing) and `--calibrate`.
- It scores multi-turn flows turn by turn, rejected inputs, repeat runs (PASS /
  FLAKY / FAIL), acceptable alternatives, and the gates in the set. The report is
  `results/<name>.md`; every run's full responses are in `results/<name>.json`.

## The judge

Yes/no questions (`judge`, `flow_checks`) are answered by `claude-sonnet-5-5`, a
different model from the one that writes the chatbot's replies. It sees the four
documents and the transcript, plus a bracketed line of facts the harness recorded
(escalation recorded, sources shown, rows created).

Calibration (`--calibrate`, labels in `judge-calibration.json`): on the 68 hand-read
run-1 responses it agreed 67/68 (98.5%, requirement 95%) and caught all 4 hand-labelled
failures. The single disagreement was ans-24, which it marked as wrong though the reply
was fine. Only 4 labels are 'no', so this is a weak test of how often it wrongly says
'no' to a good reply or 'yes' to a subtle bad one; treat judge verdicts on
borderline cases as a prompt to read the reply, not as final.
