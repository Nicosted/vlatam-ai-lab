# ADR-007: Governed Typed Decision Candidate Registry

- Status: proposed (contracts, validators, hashing, fixtures and seed inventory `ai-lab-typed-decision-candidates@1.0.0` in review)
- Date: 2026-09-26

## Context

AI-140 defined the typed decision contract and AI-141 the Gold Decision
evaluation truth. Before any candidate can be sandboxed (AI-143) or
compared (AI-147), AI LAB needs an inventory of candidate sources that
records exactly which upstream revision was inspected, what evidence
exists and what is unknown, without turning a repository name, a README
claim or a license file into execution authority.

## Decision

1. Introduce closed, versioned contracts `1.0.0` for a typed decision
   candidate entry and registry manifest in `src/decision-candidates/`,
   reusing the AI-140 `registry-json-v1` canonicalizer with new hash
   domains `vlatam-ai-lab:typed-decision-candidate:v1` and
   `vlatam-ai-lab:typed-decision-candidate-registry:v1`.
2. A candidate registry records what we know; it does not authorize what
   may run. Registration is not execution, approval, benchmark
   eligibility or promotion eligibility. Every entry carries a constant
   lifecycle (`registry_state: "discovered"`, every execution, benchmark,
   promotion, production and routing flag `false`,
   `authority: "evidence_only"`).
3. Candidate identity (`candidate_id`, AI LAB-owned) is separate from
   candidate evidence revision (`evidence_revision` + `supersedes`). A new
   upstream commit or new evidence is a new revision; registry succession
   rejects a changed hash without a higher revision.
4. Evidence binds to an exact 40-hex upstream commit with immutable
   locators (path, git blob SHA, content SHA-256, commit URL). Mutable
   branch, tag or bare-repository references are rejected.
5. Roles (`typed_decision_model`, `typed_decision_adapter`,
   `typed_decision_runtime`, `research_methodology`) describe kinds of
   source, require cited evidence and are never ranked.
6. Licensing is layered (code, weights, base model, training data). No
   layer is inferred from another, from a README, package metadata,
   repository description or another project. `evidenced` requires
   first-party license or model-card evidence; a candidate's notice about
   a third party's license (`third_party_notice`) never evidences a layer;
   unknown is `unresolved`. No legal or commercial conclusion is recorded.
7. Upstream claims are evidence only (`verification: "upstream_claim"`);
   `1.0.0` has no AI LAB-verified state.
8. Evidence gaps and completeness are derived and hash-bound, so
   incomplete evidence is expressible without rejecting a candidate's
   existence, and can never silently read as complete.
9. A registry cannot approve itself: review states `draft` and
   `in_review` only; `authority: "evidence_only"`,
   `universal_winner: false`.
10. The module is pure and unwired: no network, process, environment,
    filesystem, clock, provider SDK, loader or runtime access; AI-120 and
    AI-141 are unchanged. The AI-140 architecture test admits this
    registry as a second pure consumer of the canonical form only.

## Consequences

AI-143 can bind a sandbox adapter to an exact `candidate_hash`, and
AI-147 can reference `(candidate_id, evidence_revision, candidate_hash,
registry_hash)` additively from AI-120 records, without either relying on
mutable upstream state. The seed inventory records seven public
repositories captured read-only at exact commits (shallow bare fetch, no
checkout, no install, no execution); it ships `in_review` with every entry
`incomplete` (archive state unobservable, every base-model license
unresolved). Legal review of any recorded license remains a separate
human process.
