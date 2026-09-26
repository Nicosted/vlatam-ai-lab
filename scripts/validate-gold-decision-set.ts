/**
 * AI-141 — offline, read-only validation of a Gold Decision Set directory
 * (`<root>/manifest.json` + `<root>/cases/*.json`). Prints the dataset
 * identity and distributions, or the fail-closed issues. It never evaluates,
 * executes or calls any candidate, model, provider or network.
 */
import { readFileSync, readdirSync } from "node:fs";

import { validateGoldDecisionSet } from "../src/decision-evaluation/index.js";

const root = process.argv[2] ?? "data/gold-decision/v1";
const read = (path: string): unknown => JSON.parse(readFileSync(path, "utf8"));
const cases = readdirSync(`${root}/cases`)
  .filter((name) => name.endsWith(".json"))
  .sort()
  .map((name) => read(`${root}/cases/${name}`));
const check = validateGoldDecisionSet(read(`${root}/manifest.json`), cases);
if (!check.ok) {
  console.error(JSON.stringify({ ok: false, issues: check.issues }, null, 2));
  process.exitCode = 1;
} else {
  const { set } = check.value;
  console.log(
    JSON.stringify(
      {
        ok: true,
        dataset_id: set.dataset_id,
        dataset_version: set.dataset_version,
        dataset_hash: set.dataset_hash,
        review_state: set.review.state,
        evaluation_purpose: set.evaluation_purpose,
        domain_representative: set.domain_representative,
        promotion_eligible: set.promotion_eligible,
        case_visibility: set.split_policy.case_visibility,
        blind_holdout: set.split_policy.blind_holdout,
        scoring_policy: set.scoring_policy,
        cases: set.cases.length,
        split_distribution: set.split_distribution,
        decision_type_distribution: set.decision_type_distribution,
        language_distribution: set.language_distribution,
        jurisdiction_distribution: set.jurisdiction_distribution,
      },
      null,
      2,
    ),
  );
}
