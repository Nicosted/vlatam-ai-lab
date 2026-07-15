# AI LAB sandbox blocker root-cause audit — 2026-07-15

## Resumen ejecutivo para CEO

El Read Model reporta **33 bloqueos**, pero debajo hay **11 causas raíz independientes** y **2 estados derivados de propagación**. La diferencia se debe a que varias capas repiten deliberadamente el mismo problema para no perder trazabilidad: dossier, propuesta, revisión de activación y preflight fallan de forma encadenada.

La ruta crítica comienza con seis frentes que pueden avanzar en paralelo: precio exacto, ruta exacta, manejo de datos, salida estructurada, aceptación del caso sintético y asignación de responsables operativos. Luego deben ocurrir, en orden, la revisión de evidencia, las revisiones de seguridad y legal, y las aprobaciones humanas independientes. Nicolás —o personas humanas designadas por él— debe nombrar revisores y responsables, aceptar o rechazar decisiones con identidad autenticada y mantener separación de funciones. Este informe no asigna identidades.

La primera llamada sintética **parece factible**, pero hoy falta evidencia externa y de la cuenta del proveedor. La clasificación es `viable_but_external_evidence_missing`: no hay prueba suficiente para descartar MiniMax M2.7, pero tampoco para habilitarlo. El camino seguro más rápido es refrescar y revisar precio/ruta/privacidad/ZDR, aceptar el caso de oro y asignar responsables en paralelo; después reconciliar elegibilidad y recién entonces proponer configuración de activación, autorización de una sola vez y ejecución manual.

Todavía no se debe intentar habilitar el runtime, emitir autorización, cargar secretos, desactivar el kill switch, ejecutar desde CI, hacer una llamada, usar datos de clientes o guardar respuestas crudas. Presupuesto, autorización/consumo atómico y secreto son compuertas posteriores: hoy están deshabilitadas y no deben adelantarse.

## 1. Scope and evidence boundary

Evidence-only audit of the repository-backed Operator Read Model for:

- provider: `openrouter`;
- model: `minimax/minimax-m2.7`;
- capability: `evidence.extraction.normative_claims`;
- scope: `one_synthetic_gold_case_sandbox_activation`.

No internet research, provider/account access, secret access, configuration approval, runtime enablement, identity assignment, migration, or provider call was performed.

## 2. Preconditions and source snapshot

| Check                         | Exact result                                                                      |
| ----------------------------- | --------------------------------------------------------------------------------- |
| Repository                    | `Nicosted/vlatam-ai-lab` (local repository root verified)                         |
| Remote                        | `origin https://github.com/Nicosted/vlatam-ai-lab.git`                            |
| Branch before work            | `main`                                                                            |
| Worktree before work          | clean                                                                             |
| Refreshed local/main equality | `main == origin/main == e32b3b53462aaa643c6cf574f79ffe4d6e1cb60a`                 |
| PR #109                       | merged; merge subject `feat: add governed OpenRouter sandbox human review (#109)` |
| Operator state                | `blocked`                                                                         |
| Evaluated at                  | `2026-07-15T12:00:00.000Z`                                                        |
| Contract / hash               | `1.1.0` / `d9a9e1da88aaa43035522a80ee36a46a5b33dda48f5d01c1a90450c223dc2b64`      |
| Raw blockers                  | 33                                                                                |
| Required human actions        | 6                                                                                 |
| Pending approvals             | 8                                                                                 |

Source evaluators: `external_evidence_pack`, `readiness_dossier`, `sandbox_activation_review`, `sandbox_gold_case`, `sandbox_preflight`, `sandbox_proposal`.

Required actions: `resolve:evidence_review` (evidence_reviewer), `resolve:external_account_configuration` (provider_account_owner), `resolve:human_approval` (independent_human_approver), `resolve:legal_review` (legal_reviewer), `resolve:runtime_configuration` (runtime_operator), `resolve:security_review` (security_reviewer).

Pending activation decisions: `activation_approval_pending`, `evidence_review_pending`, `exact_routing_limitation_unacknowledged`, `gold_case_acceptance_pending`, `incident_owner_unassigned`, `kill_switch_owner_unassigned`.

Execution-disabled invariants: zero execution authorizations; no policy issued; no consumption attempted; gateway and transport not invoked; adapter disabled; live traffic forbidden; budget disabled; kill switch active; secret not configured.

## 3. Root-cause matrix

There are 11 independent root causes and 2 propagated dependency groups (13 analysis groups total). RC-12 and RC-13 add no new external fact, but they require explicit governed artifact reconciliation and therefore remain execution-priority work.

| ID    | Root cause                                               | Raw entries | Owner role                  | Prerequisites                                                               | External evidence | Parallel at start |
| ----- | -------------------------------------------------------- | ----------: | --------------------------- | --------------------------------------------------------------------------- | ----------------- | ----------------- |
| RC-01 | Exact, bounded pricing policy                            |           6 | evidence_reviewer           | —                                                                           | yes               | yes               |
| RC-02 | Exact upstream routing and limitation acknowledgment     |           4 | provider_account_owner      | —                                                                           | yes               | yes               |
| RC-03 | Privacy, retention, training-use, and geography evidence |           1 | security_reviewer           | —                                                                           | yes               | yes               |
| RC-04 | ZDR eligibility and provider-account configuration       |           3 | provider_account_owner      | RC-02, RC-03                                                                | yes               | no                |
| RC-05 | Strict structured-output verification                    |           2 | evidence_reviewer           | RC-02                                                                       | yes               | yes               |
| RC-06 | Capability evidence and gold-case acceptance             |           4 | evidence_reviewer           | —                                                                           | no                | yes               |
| RC-07 | Evidence review and artifact reconciliation              |           3 | evidence_reviewer           | RC-01, RC-02, RC-03, RC-04, RC-05, RC-06                                    | yes               | no                |
| RC-08 | Security review                                          |           1 | security_reviewer           | RC-02, RC-03, RC-04                                                         | yes               | no                |
| RC-09 | Legal review                                             |           1 | legal_reviewer              | RC-02, RC-03                                                                | yes               | no                |
| RC-10 | Independent authenticated approvals                      |           3 | sandbox_activation_approver | RC-07, RC-08, RC-09                                                         | no                | no                |
| RC-11 | Operational ownership                                    |           2 | runtime_operator            | —                                                                           | no                | yes               |
| RC-12 | Governed eligibility and runtime-state alignment         |           2 | runtime_operator            | RC-01, RC-02, RC-03, RC-04, RC-05, RC-06, RC-07, RC-08, RC-09, RC-10, RC-11 | no                | no                |
| RC-13 | Preflight dependency cascade                             |           1 | runtime_operator            | RC-12                                                                       | no                | no                |

### Root-cause closure criteria

#### RC-01 — Exact, bounded pricing policy

Cause: The collected price evidence is route-dependent and conflicting, while no candidate-specific governed pricing policy is present in config/ai-pricing.json or bound into the activation review.

Required evidence/decision: A current, human-reviewed exact-route price identity with effective date and input/cache/output rates, followed by a bounded OpenRouter/MiniMax pricing policy whose ID and hash are bound into the review.

Exact closure: The pricing evidence is verified and non-conflicting; a current pricing entry exactly matches provider openrouter and model minimax/minimax-m2.7; the activation binding is resolved to its computed hash; dossier/proposal evaluations emit no pricing reason code.

#### RC-02 — Exact upstream routing and limitation acknowledgment

Cause: The route is explicitly variable: provider order and no-fallback controls are proposed, but no reviewed endpoint/revision pair proves exact MiniMax routing; the review also lacks a human acknowledgment of that limitation.

Required evidence/decision: Current official routing/account evidence showing whether order=[minimax], allow_fallbacks=false, require_parameters=true, data_collection=deny and zdr=true can satisfy the repository's exact-route requirement, plus an authenticated limitation acknowledgment.

Exact closure: The governed route and dossier record verified exact upstream routing (or a separately reviewed contract change explicitly permits the residual limitation), the proposal/runtime status is verified, and the activation review records limitations_acknowledged=true.

#### RC-03 — Privacy, retention, training-use, and geography evidence

Cause: Router-level statements do not establish the selected upstream endpoint's retention, training-use, subprocessors, controller/processor roles, or processing geography.

Required evidence/decision: Current router and applicable upstream evidence for content/metadata handling, retention duration, training use, subprocessors, and jurisdictions, scoped to the intended route.

Exact closure: All mandatory dossier sections for privacy, retention, training use, and geography are current, verified by named reviewers, integrity-bound, and accepted by security and legal where applicable.

#### RC-04 — ZDR eligibility and provider-account configuration

Cause: The governed ZDR evidence store is empty and neither exact-route ZDR eligibility nor the required account/guardrail/request configuration has been authenticated and reviewed.

Required evidence/decision: Authenticated provider-account evidence, without secrets, proving applicable ZDR controls and exact-route eligibility; a reviewed OpenRouter ZDR record in config/ai-zdr-evidence.json bound by ID and hash.

Exact closure: A current reviewed ZDR record for openrouter exists and is hash-bound as resolved; account/guardrail/request settings are attested; all privacy requirements are approved; no privacy/ZDR reason code remains.

#### RC-05 — Strict structured-output verification

Cause: The candidate declares JSON-object support, but strict schema conformance and exact-route reliability for the required normative-claims shape are unproven.

Required evidence/decision: Reviewed capability evidence or an approved non-live verification artifact establishing the exact contract; if only a live observation can establish it, this must be handled as an explicitly accepted first-call observation risk rather than guessed.

Exact closure: The dossier records json_schema_suitable=true with current reviewed evidence and the proposal records strict_structured_output_verified=true without weakening the deterministic gold-case scorer.

#### RC-06 — Capability evidence and gold-case acceptance

Cause: No relevant benchmark is approved. A deterministic synthetic gold case now exists and is hash-bound, but its human acceptance remains pending and the proposal still records capability acceptance as false.

Required evidence/decision: Authenticated acceptance of gold-case hash 03af337eed0adda99b84a8dbf220210c5b8b897d9f994d4b33d543ad51688b27 with substantive reason, plus the governed eligibility artifact that recognizes the accepted gold case or another approved capability benchmark.

Exact closure: The gold case evaluates accepted, its exact hash is bound in reviewed decisions, and the readiness/proposal path records capability benchmark or gold-case acceptance as approved.

#### RC-07 — Evidence review and artifact reconciliation

Cause: Collected records have no authenticated reviewer identity or approval timestamps, several mandatory records are unverified/missing/conflicting, and the activation decision has no reviewed hashes.

Required evidence/decision: A named authenticated evidence reviewer re-retrieves the canonical sources, resolves conflicts and expiry, records decisions and exact hashes, and remains independent from the activation approver.

Exact closure: The external pack is reviewable, the dossier is ready for sandbox review, and the activation evidence_review decision is approved with reason, timestamp, and exact dossier/evidence/proposal/gold/runtime hashes.

#### RC-08 — Security review

Cause: No authenticated security reviewer has accepted the route-specific data controls, account posture, secret boundary, kill switch, and one-call constraints.

Required evidence/decision: A scoped security review of verified privacy/ZDR evidence, account attestation, routing controls, secret plan, no-retry/no-fallback constraints, and observation handling.

Exact closure: The proposal security_review is approved by an authenticated security reviewer and the reviewed artifacts remain hash-identical.

#### RC-09 — Legal review

Cause: Applicable OpenRouter and upstream terms, commercial/acceptable use, export controls, model-license applicability, and data roles have not been accepted by counsel or a designated legal reviewer.

Required evidence/decision: A scoped legal decision against current router/upstream terms and the synthetic-only, experimental, no-reliance use case.

Exact closure: The proposal legal_review is approved by an authenticated legal reviewer with the reviewed terms/evidence identified and still current.

#### RC-10 — Independent authenticated approvals

Cause: The dossier risk remains open, configuration approval is pending, and no independent activation approver has approved the exact artifact hashes after evidence review.

Required evidence/decision: Authenticated configuration and activation decisions with substantive reasons, exact hashes, expiry, permitted scope, and enforced separation of duties; the existing disabled candidate profile must be reconciled with the older dossier assertion that the profile is absent.

Exact closure: The dossier/profile state is reconciled; configuration approval and activation approval are approved in order, scoped only to the synthetic one-call path, current, hash-exact, and issued by eligible humans distinct from authors/reviewers.

#### RC-11 — Operational ownership

Cause: No authenticated humans are assigned to stop the run or own incident response; both must be independent from the activation approver.

Required evidence/decision: Named, authenticated kill-switch and incident owners who accept the runbook responsibilities; one person may hold both operational roles if separation from the approver is preserved.

Exact closure: Both ownership records are assigned to valid human identities, neither equals the activation approver, and the runtime kill-switch reference is updated only in the later governed activation configuration.

#### RC-12 — Governed eligibility and runtime-state alignment

Cause: These are intentional downstream propagation blockers: the proposal observes the blocked dossier, and the activation review observes the blocked proposal. They do not identify new evidence failures.

Required evidence/decision: Regenerated/reviewed dossier, proposal, activation review, registries, profile, and runtime bindings after upstream root causes close; no direct manual suppression of reason codes.

Exact closure: The dossier is ready_for_sandbox_review, the proposal is eligible_for_configuration, the activation review is eligible_for_activation_configuration, and all bound hashes match while components remain disabled.

#### RC-13 — Preflight dependency cascade

Cause: Preflight fails at its first dependency gate because runtime metadata still says readiness/proposal blocked and exact routing unresolved. Later gates have deliberately not been reached.

Required evidence/decision: A separately reviewed activation-configuration artifact that consumes the eligible hashes and preserves one request, no retries/fallback, synthetic-only scope, active kill switch, disabled secret boundary, and no execution authority.

Exact closure: A dry preflight reaches (but does not cross) the later authorization/kill-switch/budget/secret gates without readiness_or_routing_blocked; no transport, secret resolution, authorization consumption, or provider call occurs in that PR.

## 4. Raw blocker traceability

Every snapshot blocker appears exactly once below and exactly once in the JSON `blocker_records`. “Layered duplicate” means the repository intentionally preserves the same semantic cause in another evaluator layer; it is not safe to delete or collapse the source record.

| Order | Full blocker code                                                                | Root  | Source evaluator          | Severity | Owner                       | Layered duplicate |
| ----: | -------------------------------------------------------------------------------- | ----- | ------------------------- | -------- | --------------------------- | ----------------- |
|     1 | `external_evidence_pack:openrouter.external.pricing.v1:conflicting`              | RC-01 | external_evidence_pack    | high     | evidence_reviewer           | yes               |
|     2 | `external_evidence_pack:provider_routing_variability_explicit`                   | RC-02 | external_evidence_pack    | medium   | provider_account_owner      | yes               |
|     1 | `readiness_dossier:pricing:conflicting`                                          | RC-01 | readiness_dossier         | high     | evidence_reviewer           | yes               |
|     6 | `readiness_dossier:unresolved_mandatory_risk:benchmark-missing`                  | RC-06 | readiness_dossier         | high     | evidence_reviewer           | yes               |
|     2 | `readiness_dossier:unresolved_mandatory_risk:exact-route-unproven`               | RC-02 | readiness_dossier         | high     | provider_account_owner      | yes               |
|     5 | `readiness_dossier:unresolved_mandatory_risk:json-schema-unverified`             | RC-05 | readiness_dossier         | high     | evidence_reviewer           | yes               |
|     1 | `readiness_dossier:unresolved_mandatory_risk:pricing-conflicting`                | RC-01 | readiness_dossier         | high     | evidence_reviewer           | yes               |
|     3 | `readiness_dossier:unresolved_mandatory_risk:privacy-retention-training-unknown` | RC-03 | readiness_dossier         | high     | security_reviewer           | no                |
|    10 | `readiness_dossier:unresolved_mandatory_risk:profile-and-approval-absent`        | RC-10 | readiness_dossier         | high     | sandbox_activation_approver | yes               |
|     4 | `readiness_dossier:unresolved_mandatory_risk:zdr-unverified`                     | RC-04 | readiness_dossier         | high     | provider_account_owner      | yes               |
|     1 | `readiness_dossier:variable_pricing_without_bounded_policy`                      | RC-01 | readiness_dossier         | high     | evidence_reviewer           | yes               |
|    10 | `sandbox_activation_review:activation_approval_pending`                          | RC-10 | sandbox_activation_review | high     | sandbox_activation_approver | yes               |
|     7 | `sandbox_activation_review:evidence_review_pending`                              | RC-07 | sandbox_activation_review | high     | evidence_reviewer           | yes               |
|     2 | `sandbox_activation_review:exact_routing_limitation_unacknowledged`              | RC-02 | sandbox_activation_review | medium   | provider_account_owner      | yes               |
|     6 | `sandbox_activation_review:gold_case_acceptance_pending`                         | RC-06 | sandbox_activation_review | high     | evidence_reviewer           | yes               |
|    11 | `sandbox_activation_review:incident_owner_unassigned`                            | RC-11 | sandbox_activation_review | high     | runtime_operator            | yes               |
|    11 | `sandbox_activation_review:kill_switch_owner_unassigned`                         | RC-11 | sandbox_activation_review | high     | runtime_operator            | yes               |
|     1 | `sandbox_activation_review:pricing_policy_unresolved`                            | RC-01 | sandbox_activation_review | high     | evidence_reviewer           | yes               |
|     4 | `sandbox_activation_review:privacy_zdr_evidence_unresolved`                      | RC-04 | sandbox_activation_review | high     | provider_account_owner      | yes               |
|    12 | `sandbox_activation_review:sandbox_proposal_blocked`                             | RC-12 | sandbox_activation_review | medium   | runtime_operator            | yes               |
|     6 | `sandbox_gold_case:gold_case_acceptance_pending`                                 | RC-06 | sandbox_gold_case         | high     | evidence_reviewer           | yes               |
|    13 | `sandbox_preflight:readiness_or_routing_blocked`                                 | RC-13 | sandbox_preflight         | medium   | runtime_operator            | no                |
|     6 | `sandbox_proposal:benchmark_or_gold_case_missing`                                | RC-06 | sandbox_proposal          | high     | evidence_reviewer           | yes               |
|     7 | `sandbox_proposal:evidence_unverified`                                           | RC-07 | sandbox_proposal          | high     | evidence_reviewer           | yes               |
|     2 | `sandbox_proposal:exact_upstream_routing_unresolved`                             | RC-02 | sandbox_proposal          | medium   | provider_account_owner      | yes               |
|    10 | `sandbox_proposal:human_approval_missing`                                        | RC-10 | sandbox_proposal          | high     | sandbox_activation_approver | yes               |
|     9 | `sandbox_proposal:legal_review_pending`                                          | RC-09 | sandbox_proposal          | high     | legal_reviewer              | no                |
|     7 | `sandbox_proposal:mandatory_evidence_not_reviewable`                             | RC-07 | sandbox_proposal          | high     | evidence_reviewer           | yes               |
|     1 | `sandbox_proposal:pricing_unbounded_or_conflicting`                              | RC-01 | sandbox_proposal          | high     | evidence_reviewer           | yes               |
|     4 | `sandbox_proposal:privacy_zdr_unresolved`                                        | RC-04 | sandbox_proposal          | high     | provider_account_owner      | yes               |
|    12 | `sandbox_proposal:readiness_blocked`                                             | RC-12 | sandbox_proposal          | medium   | runtime_operator            | yes               |
|     8 | `sandbox_proposal:security_review_pending`                                       | RC-08 | sandbox_proposal          | high     | security_reviewer           | no                |
|     5 | `sandbox_proposal:structured_output_unverified`                                  | RC-05 | sandbox_proposal          | medium   | evidence_reviewer           | yes               |

The machine-readable companion contains, for each row: reason code, source artifact ID/hash/path, direct and underlying cause, related blockers, required evidence/decision, prerequisite blockers, internal/external resolution flags, authenticated-human/legal/security/account/runtime requirements, first-call impact, production-only impact, order, and exact closure criterion.

## 5. Dependency and critical path

The critical path is:

`RC-01..RC-06 + RC-11 (parallel evidence/acceptance/ownership) → RC-07/RC-08/RC-09 → RC-10 → RC-12 → RC-13`.

Nuance:

- RC-04 depends on route/data-handling evidence and authenticated account posture.
- RC-07 cannot approve evidence before RC-01 through RC-06 close.
- RC-08 and RC-09 can prepare in parallel but cannot conclude before their evidence prerequisites.
- RC-10 must follow evidence/security/legal review and preserve independent human roles.
- RC-12 and RC-13 must be regenerated from resolved upstream artifacts; reason codes must never be manually suppressed.
- Budget enablement, one-time authorization/atomic consumption, and secret readiness are later gates, not current raw blockers.

## 6. Candidate viability

Result: **`viable_but_external_evidence_missing`**.

Positive evidence:

- exact OpenRouter model identity, registry entry, route record, disabled execution profile, runtime proposal, gold case, and fixture are repository- and hash-bound;
- the gold case is entirely synthetic and deterministic;
- the activation review fixes one request, 8,000/2,000 token ceilings, 10 seconds, USD 0.05, no retries, no fallback, manual-only execution, and mandatory human review;
- every execution surface remains disabled.

Missing evidence:

- exact-route effective pricing and bounded policy;
- exact upstream routing proof under the proposed provider constraints;
- route-specific privacy, retention, training use, geography, ZDR eligibility, and authenticated account configuration;
- strict structured-output suitability;
- completed legal, security, evidence, gold-case, and independent activation decisions.

A candidate change is not yet justified because the repository does not prove that the candidate cannot meet these requirements. Reconsider the candidate if refreshed evidence shows that exact routing, bounded pricing, ZDR/data handling, or structured output cannot satisfy the existing contract without weakening it.

## 7. Dependency-aware execution-priority plan

The plan preserves:

`evidence → authenticated review → eligibility → observation contract → activation configuration → one-time authorization → atomic consumption → secret boundary → transport → observation → reconciliation → human review`.

| Milestone | Objective                                                                        | Prerequisites                                                                          | Human owner role                                                          | Non-executable | Expected outcome                                                                                                           |
| --------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| M1        | Refresh and bind mutable provider evidence                                       | none                                                                                   | evidence_reviewer + provider_account_owner                                | yes            | Current pricing/routing/privacy/ZDR facts and account posture are reviewable and hash-bound.                               |
| M2        | Complete parallel gold-case, security, legal, and operational-owner decisions    | M1 for security/legal; gold-case acceptance and owner assignment may begin in parallel | evidence_reviewer + security_reviewer + legal_reviewer + runtime_operator | yes            | Human decisions and ownership are recorded without granting activation.                                                    |
| M3        | Authenticated evidence review and eligibility reconciliation                     | M1; M2                                                                                 | evidence_reviewer then independent_human_approver                         | yes            | Eligibility layers become internally consistent and exact-hash approved; components remain disabled.                       |
| M4        | Finalize the observation contract for one synthetic gold case                    | M3                                                                                     | evidence_reviewer                                                         | yes            | Input, scorer, metadata-only observation, reconciliation, and mandatory post-run human review are exact-hash bound.        |
| M5        | Propose activation configuration, budget, and dry preflight                      | M3; M4                                                                                 | runtime_operator + security_reviewer                                      | yes            | Dry preflight reaches the one-time authorization gate with adapter/transport still disabled and kill switch active.        |
| M6        | Issue exact one-time authorization and prepare atomic consumption                | M5                                                                                     | independent_human_approver                                                | no             | One expiring exact-hash policy is issued and can be consumed exactly once immediately before transport.                    |
| M7        | Resolve the secret only at the final boundary and make one manual transport call | M6                                                                                     | runtime_operator                                                          | no             | Exactly one synthetic request, zero retries/fallback, no CI, no default raw-response persistence.                          |
| M8        | Observe, reconcile, and complete human review                                    | M7                                                                                     | evidence_reviewer + incident_owner                                        | yes            | Provider/model/usage/cost/latency metadata is reconciled, output is scored, and a human accepts or rejects the experiment. |

### Milestone details and stop conditions

#### M1 — Refresh and bind mutable provider evidence

- Blockers addressed: `external_evidence_pack:openrouter.external.pricing.v1:conflicting`, `readiness_dossier:pricing:conflicting`, `readiness_dossier:unresolved_mandatory_risk:pricing-conflicting`, `readiness_dossier:variable_pricing_without_bounded_policy`, `sandbox_activation_review:pricing_policy_unresolved`, `sandbox_proposal:pricing_unbounded_or_conflicting`, `external_evidence_pack:provider_routing_variability_explicit`, `readiness_dossier:unresolved_mandatory_risk:exact-route-unproven`, `sandbox_activation_review:exact_routing_limitation_unacknowledged`, `sandbox_proposal:exact_upstream_routing_unresolved`, `readiness_dossier:unresolved_mandatory_risk:privacy-retention-training-unknown`, `readiness_dossier:unresolved_mandatory_risk:zdr-unverified`, `sandbox_activation_review:privacy_zdr_evidence_unresolved`, `sandbox_proposal:privacy_zdr_unresolved`.
- Likely files/systems: `config/ai-openrouter-external-evidence-pack.json`, `config/ai-openrouter-readiness-dossier.json`, `provider account read-only settings evidence`.
- External evidence required: yes.
- Changes governed state: yes.
- Remains non-executable: yes.
- Stop if: Any exact route, price, privacy, retention, training, geography, or ZDR fact remains ambiguous. Evidence would require secret disclosure or a provider call.

#### M2 — Complete parallel gold-case, security, legal, and operational-owner decisions

- Blockers addressed: `readiness_dossier:unresolved_mandatory_risk:benchmark-missing`, `sandbox_activation_review:gold_case_acceptance_pending`, `sandbox_gold_case:gold_case_acceptance_pending`, `sandbox_proposal:benchmark_or_gold_case_missing`, `sandbox_proposal:security_review_pending`, `sandbox_proposal:legal_review_pending`, `sandbox_activation_review:incident_owner_unassigned`, `sandbox_activation_review:kill_switch_owner_unassigned`.
- Likely files/systems: `config/ai-openrouter-sandbox-gold-case.json`, `config/ai-openrouter-sandbox-enablement-proposal.json`, `config/ai-openrouter-sandbox-activation-review.json`.
- External evidence required: yes.
- Changes governed state: yes.
- Remains non-executable: yes.
- Stop if: Separation of duties cannot be satisfied. Terms or data-handling evidence is not current.

#### M3 — Authenticated evidence review and eligibility reconciliation

- Blockers addressed: `readiness_dossier:unresolved_mandatory_risk:json-schema-unverified`, `sandbox_proposal:structured_output_unverified`, `sandbox_activation_review:evidence_review_pending`, `sandbox_proposal:evidence_unverified`, `sandbox_proposal:mandatory_evidence_not_reviewable`, `readiness_dossier:unresolved_mandatory_risk:profile-and-approval-absent`, `sandbox_activation_review:activation_approval_pending`, `sandbox_proposal:human_approval_missing`, `sandbox_activation_review:sandbox_proposal_blocked`, `sandbox_proposal:readiness_blocked`.
- Likely files/systems: `config/ai-openrouter-readiness-dossier.json`, `config/ai-openrouter-sandbox-enablement-proposal.json`, `config/ai-openrouter-sandbox-configuration-approval.json`, `config/ai-openrouter-sandbox-activation-review.json`.
- External evidence required: no.
- Changes governed state: yes.
- Remains non-executable: yes.
- Stop if: Any reviewed hash differs. Evidence reviewer and approver are not independent. Proposal is used to enable runtime.

#### M4 — Finalize the observation contract for one synthetic gold case

- Blockers addressed: `readiness_dossier:unresolved_mandatory_risk:benchmark-missing`, `sandbox_activation_review:gold_case_acceptance_pending`, `sandbox_gold_case:gold_case_acceptance_pending`, `sandbox_proposal:benchmark_or_gold_case_missing`.
- Likely files/systems: `config/ai-openrouter-sandbox-gold-case.json`, `data/fixtures/providers/openrouter-normative-claim-synthetic-v1.json`, `observation/reconciliation contracts`.
- External evidence required: no.
- Changes governed state: yes.
- Remains non-executable: yes.
- Stop if: Raw-response persistence becomes default. Customer, personal, production, or privileged data enters scope.

#### M5 — Propose activation configuration, budget, and dry preflight

- Blockers addressed: `sandbox_preflight:readiness_or_routing_blocked`.
- Likely files/systems: `config/ai-openrouter-sandbox-runtime.json`, `budget governor`, `kill-switch implementation`, `preflight evaluator`.
- External evidence required: no.
- Changes governed state: yes.
- Remains non-executable: yes.
- Stop if: Any sandbox-armed flag, CI execution, retry, fallback, parallel nonce/KV store, or repository secret is proposed. Dry preflight invokes transport or resolves a secret.

#### M6 — Issue exact one-time authorization and prepare atomic consumption

- Blockers addressed: none; post-eligibility gate.
- Likely files/systems: `exact execution policy`, `existing authorization store`, `atomic consumption boundary`.
- External evidence required: no.
- Changes governed state: yes.
- Remains non-executable: no.
- Stop if: Policy is self-issued, broad, reusable, expired, or not hash-exact. A new nonce/KV store is introduced.

#### M7 — Resolve the secret only at the final boundary and make one manual transport call

- Blockers addressed: none; post-eligibility gate.
- Likely files/systems: `local environment secret provider`, `authorized gateway`, `disabled adapter enabled only under exact policy`.
- External evidence required: no.
- Changes governed state: yes.
- Remains non-executable: no.
- Stop if: Kill switch is active/unavailable. Budget unavailable. Authorization cannot be atomically consumed. Secret is absent or would be logged/stored. Any binding or account posture changed.

#### M8 — Observe, reconcile, and complete human review

- Blockers addressed: none; post-eligibility gate.
- Likely files/systems: `metadata-only observation artifact`, `gold-case deterministic scorer`, `reconciliation report`.
- External evidence required: no.
- Changes governed state: no.
- Remains non-executable: yes.
- Stop if: Observed provider/model differs. Cost or latency exceeds ceiling. Schema/evidence checks fail. A second call would be needed.

## 8. Explicit prohibitions

Do not use the activation review to enable runtime. Do not add a `sandbox-armed.json` flag, a parallel nonce/KV store, repository secrets, CI execution, retries, fallback, default raw-response persistence, customer data, production use, or autonomous operation. Git history is evidence, not the primary rollback control; the kill switch and exact authorization boundary remain the operational controls.

## 9. Assumptions and limitations

- Repository evidence is a dated local snapshot, not current provider truth.
- Mutable provider facts were not refreshed in this task and are classified as external evidence requirements.
- “Viable” means worth continuing through evidence review; it does not mean eligible or authorized.
- All source-layer blocker codes remain intact.
- This report proposes roles only; it assigns no human identity and grants no decision.

## 10. Validation evidence

| Validation                                | Result                                                                                                                      |
| ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Final repository-backed Operator snapshot | passed; `blocked`, 33 blockers, hash `d9a9e1da88aaa43035522a80ee36a46a5b33dda48f5d01c1a90450c223dc2b64`, execution disabled |
| JSON parse                                | passed                                                                                                                      |
| Snapshot-to-matrix set equality           | passed; no missing or extra blocker codes                                                                                   |
| Raw-record uniqueness                     | passed; 33 records and 33 unique blocker codes                                                                              |
| Root-cause membership                     | passed; every blocker belongs to at least one group                                                                         |
| Evaluator/artifact preservation           | passed; zero evaluator, artifact ID, or artifact hash mismatches                                                            |
| Required matrix fields                    | passed for every blocker record                                                                                             |
| Operator tests                            | 33/33 passed, 3 suites                                                                                                      |
| Architecture tests                        | 50/50 passed, 7 suites                                                                                                      |
| Full test suite                           | 992/992 passed, 145 suites                                                                                                  |
| Typecheck                                 | passed                                                                                                                      |
| Build                                     | passed                                                                                                                      |
| Scoped ESLint                             | exited 0; both report files were ignored by the repository ESLint configuration, producing 2 warnings and 0 errors          |
| Scoped Prettier                           | passed                                                                                                                      |
| `git diff --check`                        | passed                                                                                                                      |

The first `npm test` attempt failed only because the sandbox denied the temporary `tsx` IPC socket (`EPERM`). The same unchanged suite was rerun with the required local permission and passed 992/992. No report-specific JSON Schema was added: the repository has domain artifact schemas and generic evidence metadata, but no established pattern for versioned schemas for this class of one-off audit matrix.
