# Safe Agent Workflow

Pipeline stages for local regulatory intelligence experiments:

1. **Source Monitor**
   - Observe approved local source folders only.
   - No external network requests.

2. **Snapshot Writer**
   - Persist immutable snapshot files to `snapshots/`.
   - Keep naming consistent and traceable.

3. **Delta Analyzer**
   - Compare latest snapshots against baseline.
   - Emit deterministic local diff summaries.

4. **Impact Analyzer**
   - Map relevant deltas to possible operational impacts.
   - Explicitly list assumptions and uncertainty.

5. **Evidence Writer**
   - Write markdown evidence reports in `reports/`.
   - Include source references and timestamps.

6. **Human Review**
   - Human validates conclusions.
   - No autonomous production action.
