# AI-120 Tournament Threat Model

Scope: proposed continuous evaluation control plane. Date: 2026-07-17. The implementation in AI-120 is contract/read-model only and has no transport or execution authority.

| Threat                                 | Required control                                                                                              | Fail-closed response                                |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| runtime bypasses AI LAB governance     | runtime receives only a bound profile; architecture boundary forbids transport in tournament modules          | reject result, block candidate                      |
| provider-selection bypass/substitution | separate gateway/model/endpoint identities and exact version bindings                                         | disqualify, block endpoint/profile                  |
| stale authorization replay             | bind authorization identity, expiry, profile, run and idempotency; use durable single-use consumption         | reject before action; no retry                      |
| duplicated cost consumption            | one reservation/reconciliation per stable attempt; retries have distinct attempt IDs                          | stop run and investigate ledger integrity           |
| untrusted runtime events               | closed schema, correlation binding, sequence/state validation and evidence hash                               | discard event and disqualify incomplete result      |
| reasoning leakage                      | capture disabled by default; event schema has no reasoning payload; approved summaries are separate artifacts | reject event/artifact, suspend candidate            |
| prompt injection                       | immutable policy/tool allowlist; synthetic adversarial cases; treat document instructions as data             | block action and disqualify incorrect tool behavior |
| sandbox escape                         | isolated candidate sessions and no shared credentials/data; sandbox evidence required before eligibility      | cancel, kill-switch, block candidate                |
| secret leakage                         | no secrets in cases/events/evidence; credential/path scans; no tournament secret resolver                     | cancel, invalidate artifacts, block candidate       |
| benchmark contamination                | preselected immutable sentinel/rotation, contamination review, withheld cases and versioned hashes            | exclude contaminated cases/run                      |
| evaluator bias                         | publish policies before selection; separate rankings; independent human review; rotate/compare evaluators     | defer decisions and record bias blocker             |
| vendor self-evaluation                 | evaluator/approver identities controlled by AI LAB; `candidate_is_decision_maker: false`                      | reject promotion artifact                           |
| cached-result distortion               | declare cache status and exact cache key; separate cached/uncached metrics                                    | exclude cache hit from uncached/provider validation |
| version drift                          | bind every component version/hash and rerun after drift                                                       | expire evidence and return to discovered/benchmark  |
| regional/retention ambiguity           | explicit endpoint region/retention/ZDR evidence with expiry                                                   | endpoint remains unapproved                         |
| automated promotion                    | lifecycle transition requires independent human approval and reviewed evidence                                | no state or traffic change                          |
| incorrect external action              | synthetic-only stage; action allowlist and idempotency; no external-action tools initially                    | disqualify and block candidate                      |
| incomplete evidence lineage            | require selection, policy, versions, events, result, reconciliation and review references                     | report partial; forbid promotion                    |

Residual risks: evaluator specifications may encode hidden preferences; synthetic cases may underrepresent real operational failure modes; a future distributed scheduler needs stronger concurrency/ledger guarantees than local SQLite; vendor documentation can change without notice; and regional/retention claims require periodic independent revalidation.
