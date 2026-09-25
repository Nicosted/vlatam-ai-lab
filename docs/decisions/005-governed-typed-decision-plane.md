# ADR-005: Governed Typed Decision Plane

- Status: accepted for architecture/contracts only
- Date: 2026-09-25

## Context

AI LAB governs deterministic software and frontier generative models. Many
bounded tasks (classify among declared options, answer a yes/no over declared
facts, score on a fixed scale, rank declared steps) may be served by typed
decision models that return a typed answer or abstain. Without a contract,
such engines would arrive with vendor-specific outputs, uncalibrated
"confidence" presented as certainty, and pressure to fall back to a frontier
model automatically when unsure.

## Decision

1. Introduce the execution paradigm vocabulary `deterministic`,
   `typed_decision`, `frontier_reasoning` as vocabulary only; no routing.
2. Define closed, provider-neutral, model-neutral typed decision request and
   result contracts `1.0.0` (`choice`, `boolean`, `score`, `ranking`,
   first-class abstention) with pure fail-closed validators.
3. A confidence or probability value is evidence about a model output, not
   authority to act. Probabilities are exact integer parts-per-million and are
   never normalized or repaired; confidence is uncalibrated and calibration
   claims are rejected until a reviewed calibration artifact exists.
4. Typed decision execution may recommend abstention or escalation, but
   escalation must be governed explicitly and must never behave as an
   implicit fallback. Escalation is never executed by this plane.
5. Results reuse AI-71 governance with `downstream_allowed: false` and no
   carried approval. Human review requirements bind from the request.
6. Candidate identity is stable and independent of display order; exact and
   semantic request hashes support future permutation-invariance testing.
7. Only `synthetic_fixture` results are admitted; no runtime exists.

## Consequences

Future engines integrate only as governed candidates (AI-142 registry,
AI-143 sandbox, AI-141 gold decisions, AI-147 tournament integration). AI-120
contracts are unchanged; `execution_paradigm` is a documented additive
extension point. The plane is not wired into any execution, routing, server,
scheduler or Operator path.
