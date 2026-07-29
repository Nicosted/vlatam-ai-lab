# AI-137 — First real governed ARCA regulatory batch

Date: 2026-07-28
Acquisition completed: `2026-07-28T23:46:44Z`
Branch baseline: `c911c338910341bc73fa55a1d37b347d7d45a38b`
Status: pending independent human review

## Scope and source snapshot

This local-only batch contains exactly:

1. Resolución General ARCA 5859/2026.
2. Resolución General ARCA 5845/2026.
3. Resolución General ARCA 5838/2026.

Only `biblioteca.arca.gob.ar` and `www.boletinoficial.gob.ar` were queried. No production service, database, Vercel project, Supabase project, runtime scheduler, publisher, or vLatamGlobal bridge was accessed.

The existing `data/fixtures/arca/ai-127-pending-review.json` remains a synthetic tariff fixture for tests only. It is not one of these three real regulatory artifacts.

## Official source records

| Instrument   | Issue date | Publication date | Status  | Biblioteca ARCA                                                                                                                        | Boletín Oficial                                                                           |
| ------------ | ---------- | ---------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| RG 5859/2026 | 2026-06-04 | 2026-06-05       | Vigente | [Official record](https://biblioteca.arca.gob.ar/search/query/norma.aspx?p=t%3aRAG%7cn%3a5859%7co%3a9%7ca%3a2026%7cf%3a04%2f06%2f2026) | [Official record](https://www.boletinoficial.gob.ar/detalleAviso/primera/342833/20260605) |
| RG 5845/2026 | 2026-05-12 | 2026-05-13       | Vigente | [Official record](https://biblioteca.arca.gob.ar/search/query/norma.aspx?p=t%3aRAG%7cn%3a5845%7co%3a9%7ca%3a2026%7cf%3a12%2f05%2f2026) | [Official record](https://www.boletinoficial.gob.ar/detalleAviso/primera/341889/20260513) |
| RG 5838/2026 | 2026-04-20 | 2026-04-22       | Vigente | [Official record](https://biblioteca.arca.gob.ar/search/query/norma.aspx?p=t%3aRAG%7cn%3a5838%7co%3a9%7ca%3a2026%7cf%3a20%2f04%2f2026) | [Official record](https://www.boletinoficial.gob.ar/detalleAviso/primera/341040/20260422) |

### Source body hashes

| Instrument | ARCA page SHA-256                                                  | BORA page SHA-256                                                  | BORA published PDF SHA-256                                         | Preserved official text SHA-256                                    |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| RG 5859    | `ebef3a641bca0c27b330b6dc64162a6686b1473f68859b59591c36b08dfb33b9` | `bc138c1a3bd9c59aebdaa49632b93c29050e33e975c0541ea77f876e9e30ef55` | `64cc4033b0da847793fcd60453cef8b105b5c049b346e3aecb42dc484c4502a4` | `5575f5d60b9e36eb0fb3f6a2925286f2b45ce7195e41f983c675d362ae205f5a` |
| RG 5845    | `9bbc1429c8ae6820a002fa0fa0a761d55fcdbfafaedb39f203073bd6e6ec0353` | `448dac85a5ba2f4393f1ad00b4822148e252b825b8f5ae850df9539fc71d4fa8` | `9c863c78f34504bb641d06196cf0730f787f29f67aac1bf47613f5ffdbe9652f` | `51c582476f3d843007aee07d898eb3c18fcd391ee0f8fcf57aaedb1259fad827` |
| RG 5838    | `8958f258a098173010f8cebfa845963d2f5bdd70aa75aa6d70476d0e38cc6ab7` | `b631b88fb445b6a88d59168d1c0b4335c0384d16b9b08884720ea4a740ef189a` | `a5a4268d7a68b880cac597464407c2fad1eedfbcff5c2ed0c217c671a78fba9d` | `38a971d19b901e608f76a84e879baf576d1fc4dcdee4d88630d3e3778fcf6357` |

## Cross-source verification

The comparison removes presentation-only HTML, ARCA relationship-link labels, the BORA city/date header, and BORA publication footer. It then applies Unicode NFKD normalization, removes combining marks, uppercases, and compares the remaining alphanumeric legal-text sequence.

| Instrument | Normalized legal-text SHA-256                                      | Result  |
| ---------- | ------------------------------------------------------------------ | ------- |
| RG 5859    | `285626eed34f9aaff90188b3daf8550a587a6d3de5585723bb3c6055d0b37c4b` | Matched |
| RG 5845    | `3c7becae4096228bb2838e8db2809d1dabbd3169b8bf87af1b75738d2eb892a6` | Matched |
| RG 5838    | `4567bb2af145dd8a7a845e18732a63c443119d63814aab7f3c988bade4ce0dcc` | Matched |

Titles, subjects, instrument numbers, issue dates, publication dates, official text, and annex inventories agree. Any future mismatch or missing annex makes `review_eligible=false`; no automatic preference is given to either source.

## Official annex inventory

| Instrument | Annex     | Official document                         | Pages | SHA-256                                                            | Cross-source result                    |
| ---------- | --------- | ----------------------------------------- | ----- | ------------------------------------------------------------------ | -------------------------------------- |
| RG 5859    | Anexo     | `IF-2026-01712669-ARCA-SGDADVCOAD#SDGINS` | 1     | `11db92d6411019ceef41bb77f83673b35124700ab27e8fe4b6317ca2209980a6` | ARCA and BORA bytes match              |
| RG 5845    | None      | —                                         | —     | —                                                                  | Both records publish no separate annex |
| RG 5838    | Anexo I   | `IF-2026-01041291-ARCA-SGDADVCOAD#SDGINS` | 3     | `339692d686b2989f5d4ee8c4c5eb52f39ad21e03d204dee5b1938219d685b897` | ARCA and BORA bytes match              |
| RG 5838    | Anexo II  | `IF-2026-01041311-ARCA-SGDADVCOAD#SDGINS` | 2     | `a2eb690f03a49bd41ce0caaa2bf4b68ddcab1d86328d59a9029225b85f28ab24` | ARCA and BORA bytes match              |
| RG 5838    | Anexo III | `IF-2026-01041335-ARCA-SGDADVCOAD#SDGINS` | 1     | `213185c9fb494d9313e6bc321156ac130ce8b138e5884fa6a39410178b99abc5` | ARCA and BORA bytes match              |

The BORA annex endpoint is `https://www.boletinoficial.gob.ar/pdf/download_anexo`; the exact POST parameters are preserved in each artifact. Each artifact also preserves the stable ARCA annex URL. The seven annex pages and nine BORA body pages were rendered locally and visually inspected; all were legible and complete.

## Effective-date evidence

- RG 5859 states a rule rather than a calendar date: ten business days after publication. No date was inferred.
- RG 5845 enters into force on publication, `2026-05-13`.
- RG 5838 enters into force on publication, `2026-04-22`, and separately states that application follows a future implementation schedule. That schedule was not inferred or fetched from an unauthorized domain.

## Relationships recorded without interpretation

- RG 5859 implements Resolution 26/2026 of SICyPyME.
- RG 5845 modifies RG 4352/2018 and RG 5721/2025.
- RG 5838 abrogates Resolution 3277/1996 (ANA) and External Note 15/2005 (DGA) from its effective date.

These are source-stated relationships, not a legal opinion.

## Canonical and review hashes

| Instrument | Canonical artifact hash                                            | Pending review package hash                                        |
| ---------- | ------------------------------------------------------------------ | ------------------------------------------------------------------ |
| RG 5859    | `02415dfe469aab285ec99e50abeb3a78cc611e1ce7b8448c4f76405345ab9207` | `847fbdebd4e2131b17719d62f16dc71123225dc8db94603e5787f9575e64c4a5` |
| RG 5845    | `415ba2bf1c2071914c11d129fd7fb3d1393a18004aee11986225c6e6b4e058ba` | `7f2932977642d7e8025b4e0e972ddc2f0f90a8213bebacbf499865051ef25123` |
| RG 5838    | `5ec079c8f36592c7b07adcd8ac050fc1c92fb75f8973c07bdfef7b6c20a7252b` | `6e68606abf011d71a06b33c1b55876b44a796f503ea035ab19340637304d59cd` |

Canonical hashes use `json-sorted-keys-v1`: recursively sort object keys,
preserve array order and string bytes, serialize with `JSON.stringify`, omit
only the record's own hash field, and compute lowercase SHA-256. Source-body
and annex hashes are SHA-256 over the acquired bytes; the preserved official
text hash is over its exact UTF-8 string bytes.

## Human-review workflow

All three review packages are `pending_human_review`, with no reviewer or
human decision recorded. Their evidence recommendation is
`eligible_for_human_review`; this is not an approval. The fail-closed evidence
recommendation vocabulary is:

- `eligible_for_human_review`
- `blocked_incomplete_evidence`
- `blocked_conflicting_sources`

The `/operator/arca-review` surface is GET-only and displays the three real pending items, both official links, full hashes, annexes, dates, relationships, and disclaimers. It retains the earlier synthetic tariff candidate below a prominent test-only label.

Pending review is not publication approval. A human review decision and any
later approval, export, publication, or production-reliance step require their
own governed workflow.

## Packaging boundary

The immutable ARCA regulatory batch manifest contains exactly six files: three `.artifact.json` files and three bound `.review.json` files. It contains no raw acquisition body, temporary path, fixture, wildcard, report, or directory glob.

## Non-authorities and limitations

- No artifact is approved or published.
- No recommendation or legal interpretation was generated.
- No database write, external runtime, scheduler activation, export, deployment, or production authority was added.
- The governed ARCA scheduler remains inactive.
- AI-131, AI-132, and AI-133 kill switches remain active.
- Exact official text is preserved in the artifacts; raw downloaded PDFs were used only for local hashing, comparison, and visual verification and are not part of the deployable manifest.
- Human legal and regulatory review remains mandatory.

## Rollback

There is no migration, remote write, or mutable external state to unwind. Before
merge, rollback is deletion of this branch. After merge, rollback is a normal
revert of the single AI-137 commit, which removes the six packaged records and
their read-only projection together. No kill switch, scheduler, database, or
production service needs modification.

## Validation

Final local verification:

| Check                                                                                           | Result                                |
| ----------------------------------------------------------------------------------------------- | ------------------------------------- |
| AI-137, ARCA console, deployment, and packaging focused tests                                   | 47 passed, 0 failed                   |
| Full `pnpm test` suite                                                                          | 1,437 passed, 0 failed; 372 top-level |
| `pnpm typecheck`                                                                                | Passed                                |
| `pnpm build:production`                                                                         | Passed                                |
| Scoped ESLint                                                                                   | Passed                                |
| Scoped Prettier check                                                                           | Passed                                |
| Source-agreement, deterministic hash, missing-annex, no-authority, scheduler, kill-switch tests | Passed                                |
| PDF visual inspection                                                                           | 16 pages legible and complete         |

The first full-suite run identified one stale deployment-test expectation
after the exact six-file manifest was added. The expectation was updated to
bind `vercel.json` to the union of the pre-existing Operator assets and the
immutable ARCA batch manifest; the complete suite then passed.
