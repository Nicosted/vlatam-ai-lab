# Vercel Eve Architecture Assessment — Evidence-Gap Record

Assessment date: 2026-07-17. Evidence cutoff: local repository commit `15334caae6c7f385c2e2baf4e8ef7e33d7c1b900`.

AI-120 prohibited network access, installation, invocation and external authentication. The inspected repository contains no timestamped snapshot of Eve's public repository documentation. Therefore this assessment does not convert recollection, vendor branding or uninspected current web content into facts. Eve is registered only as `discovered`, version `0.0.0`, disabled, kill-switched and unapproved.

| Required topic              | Accepted repository evidence         | Assessment                                                 |
| --------------------------- | ------------------------------------ | ---------------------------------------------------------- |
| filesystem-first authoring  | none                                 | unverified                                                 |
| durable sessions            | none                                 | unverified                                                 |
| continuation tokens         | none                                 | unverified; profile declares resume unsupported            |
| replayable event streams    | none                                 | unverified                                                 |
| human input                 | none                                 | unverified                                                 |
| subagents                   | none                                 | unverified                                                 |
| structured results          | none                                 | unverified                                                 |
| sandbox adapters            | none                                 | unverified                                                 |
| evals                       | none                                 | unverified                                                 |
| instrumentation             | none                                 | unverified                                                 |
| reasoning-event privacy     | no event/payload semantics captured  | critical open risk; reasoning capture remains disabled     |
| beta/API change             | no versioned stability evidence      | high risk; exact version unknown                           |
| portability/Vercel coupling | no dependency or deployment evidence | unverified; assume no portability for eligibility purposes |

Evidence needed before `sandbox_only`: a locally captured public-repository commit/tag and documentation snapshot with content hashes and capture time; license and stability status; session durability/resume/cancellation semantics; event schema including reasoning fields/defaults; human-input and subagent boundaries; structured-output guarantees; sandbox adapter/trust model; eval and instrumentation APIs; export/retention/region behavior; cost/accounting integration; and a portability inventory of mandatory Vercel services. An independent reviewer must approve the snapshot. No Eve execution may be used to produce its own eligibility evidence.
