import type { OperatorReadModel } from "./operator-read-model.js";

const ROUTES = [
  ["Overview", "/operator"],
  ["Providers", "/operator/providers"],
  ["Governance", "/operator/governance"],
  ["Blockers", "/operator/blockers"],
  ["Actions", "/operator/actions"],
  ["Execution", "/operator/execution"],
  ["Audit", "/operator/audit"],
] as const;

const escapeHtml = (value: unknown): string =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

const label = (value: unknown): string =>
  String(value ?? "unknown").replaceAll("_", " ");
const badge = (value: unknown): string =>
  `<span class="badge status-${escapeHtml(value)}">${escapeHtml(label(value))}</span>`;
const code = (value: unknown): string => `<code>${escapeHtml(value)}</code>`;
const providerValue = (
  provider: Record<string, unknown>,
  key: string,
): unknown => provider[key] ?? "unknown";
const metric = (name: string, value: unknown): string =>
  `<div class="metric"><span>${escapeHtml(name)}</span><strong>${escapeHtml(value)}</strong></div>`;
const rows = (items: readonly [string, unknown][]): string =>
  items
    .map(
      ([key, value]) =>
        `<dt>${escapeHtml(key)}</dt><dd>${typeof value === "string" && value.length > 28 ? code(value) : escapeHtml(label(value))}</dd>`,
    )
    .join("");

function shell(
  model: OperatorReadModel,
  pathname: string,
  content: string,
): string {
  const summary = model.system_summary;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AI LAB Operator Console</title><style>
  :root{color-scheme:light;--ink:#18201f;--muted:#5d6a67;--line:#d8dfdc;--panel:#fff;--bg:#f4f6f5;--blocked:#9a2f2f;--pending:#765b00;--ok:#176b45;--focus:#005fcc}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,sans-serif}a{color:inherit}.skip{position:absolute;left:-999px}.skip:focus{left:1rem;top:1rem;background:#fff;padding:.7rem;z-index:2}header{background:#172321;color:#fff;padding:1rem 1.5rem}.top{display:flex;gap:1rem;align-items:center;justify-content:space-between;flex-wrap:wrap}.top h1{font-size:1.15rem;margin:0}.meta{display:flex;gap:.75rem;flex-wrap:wrap;color:#d7e0dd;font-size:.84rem}nav{background:#fff;border-bottom:1px solid var(--line);padding:.55rem 1.5rem;display:flex;gap:.25rem;overflow:auto}nav a{padding:.45rem .65rem;text-decoration:none;border-radius:.25rem;white-space:nowrap}nav a[aria-current=page]{background:#e5ece9;font-weight:700}a:focus-visible,select:focus-visible{outline:3px solid var(--focus);outline-offset:2px}main{max-width:1440px;margin:auto;padding:1.25rem}h2{font-size:1.4rem;margin:.2rem 0 1rem}h3{font-size:1rem;margin:0 0 .7rem}.notice{border-left:5px solid var(--blocked);background:#fff;padding:1rem;margin-bottom:1rem}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:.8rem}.card,.table-wrap{background:var(--panel);border:1px solid var(--line);border-radius:.35rem;padding:1rem;margin-bottom:1rem}.metric span{display:block;color:var(--muted);font-size:.8rem}.metric strong{font-size:1.35rem}.badge{display:inline-block;border:1px solid currentColor;border-radius:999px;padding:.12rem .5rem;font-size:.78rem;font-weight:700;text-transform:capitalize}.status-blocked,.status-invalid_state,.status-disabled,.status-active,.status-absent{color:var(--blocked);background:#fff0f0}.status-pending,.status-not_configured,.status-not_attempted{color:var(--pending);background:#fff9dc}.status-healthy,.status-enabled,.status-completed{color:var(--ok);background:#edf9f2}dl{display:grid;grid-template-columns:minmax(120px,1fr) 2fr;gap:.4rem 1rem;margin:0}dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}code{font:12px/1.5 ui-monospace,SFMono-Regular,monospace;overflow-wrap:anywhere}table{border-collapse:collapse;width:100%;font-size:.86rem}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:.6rem}th{color:var(--muted)}.filters{display:flex;gap:.7rem;flex-wrap:wrap;margin-bottom:1rem}.filters label{font-size:.8rem;color:var(--muted)}select{display:block;padding:.35rem;background:#fff;border:1px solid #87928f}.chain{display:grid;grid-template-columns:repeat(7,1fr);gap:.5rem}.stage{background:#fff;border:1px solid var(--line);padding:.75rem;text-align:center}.stage:not(:last-child)::after{content:"→";float:right;margin-right:-1.15rem}.quiet{color:var(--muted)}ul{padding-left:1.2rem}@media(max-width:800px){.chain{grid-template-columns:1fr}.stage:not(:last-child)::after{content:"↓";float:none;display:block;margin:1rem 0 -1.4rem}.table-wrap{overflow:auto}main{padding:.8rem}header,nav{padding-left:.8rem;padding-right:.8rem}}@media(max-width:480px){dl{grid-template-columns:1fr}dd{margin-bottom:.4rem}.meta{display:block}}
  </style></head><body><a class="skip" href="#main">Skip to content</a><header><div class="top"><h1>AI LAB Operator Console</h1><div class="meta"><span>Overall ${badge(summary.overall_status)}</span><span>Evaluated ${escapeHtml(summary.last_evaluated_at)}</span><span>Read model ${escapeHtml(summary.read_model_contract_version)}</span></div></div></header><nav aria-label="Operator console">${ROUTES.map(([name, href]) => `<a href="${href}"${pathname === href || (href === "/operator/providers" && pathname.startsWith("/operator/providers/")) ? ' aria-current="page"' : ""}>${name}</a>`).join("")}</nav><main id="main">${content}</main></body></html>`;
}

function overview(model: OperatorReadModel): string {
  const s = model.system_summary;
  return `<h2>Overview</h2><div class="notice"><strong>Blocked is a governed state, not an application failure.</strong><br>The console is reporting the repository decision normally and does not provide execution or approval controls.</div><div class="grid">${metric("Overall status", label(s.overall_status))}${metric("Contract version", s.read_model_contract_version)}${metric("Providers", s.total_providers)}${metric("Enabled providers", s.enabled_providers)}${metric("Blocked providers", s.blocked_providers)}${metric("Disabled adapters", s.disabled_adapters)}${metric("Blocked routes", s.blocked_routes)}${metric("Pending approvals", s.pending_approvals)}${metric("Active blockers", s.active_blockers)}${metric("Required actions", model.required_human_actions.length)}${metric("Execution authorized", s.execution_authorized_count)}</div><section class="card"><h3>Deterministic snapshot</h3><dl>${rows(
    [
      ["Evaluated at", s.last_evaluated_at],
      ["Read-model hash", s.read_model_hash],
    ],
  )}</dl></section>`;
}

function providers(model: OperatorReadModel): string {
  return `<h2>Providers</h2><p class="quiet">Every row is rendered from the Operator Read Model; the console does not interpret provider source artifacts.</p>${model.providers
    .map((p) => {
      const registeredModels =
        (p["registered_models"] as readonly string[] | undefined) ?? [];
      const registeredRoutes =
        (p["registered_routes"] as readonly string[] | undefined) ?? [];
      const registeredProfiles =
        (p["execution_profiles"] as readonly string[] | undefined) ?? [];
      const candidate = model.models.find((m) =>
        registeredModels.includes(m.entry_id),
      );
      const route = model.routes.find((r) =>
        registeredRoutes.includes(r.record_id),
      );
      const profile = model.execution_profiles.find((item) =>
        registeredProfiles.includes(item.profile_id),
      );
      const providerId = providerValue(p, "provider_id");
      const detail =
        providerId === "openrouter"
          ? `<p><a href="/operator/providers/openrouter">View governed provider detail</a></p>`
          : "";
      return `<article class="card"><h3>${escapeHtml(p["display_name"] || providerId)} ${badge(providerValue(p, "readiness_status"))}</h3><dl>${rows(
        [
          ["Provider identity", providerId],
          ["Candidate model", candidate?.model_id ?? "unknown"],
          ["Readiness", providerValue(p, "readiness_status")],
          ["Evidence", model.evidence.review_status],
          ["Sandbox proposal", providerValue(p, "proposal_status")],
          ["Runtime preflight", providerValue(p, "preflight_status")],
          ["Model", candidate?.enabled ? "enabled" : "disabled"],
          ["Route", route?.enabled ? "enabled" : "disabled"],
          ["Profile", profile?.enabled ? "enabled" : "disabled"],
          ["Adapter", providerValue(p, "adapter_state")],
          ["Budget", model.budget_state.status],
          ["Secret", providerValue(p, "secret_status")],
          ["Kill switch", providerValue(p, "kill_switch_status")],
          ["Execution allowed", providerValue(p, "execution_allowed")],
          [
            "Blocker count",
            (providerValue(p, "reason_codes") as readonly unknown[] | undefined)
              ?.length ?? 0,
          ],
        ],
      )}</dl>${detail}</article>`;
    })
    .join("")}`;
}

function openrouter(model: OperatorReadModel): string {
  const p =
    model.providers.find((item) => item["provider_id"] === "openrouter") ?? {};
  const m = model.models[0],
    r = model.routes[0],
    profile = model.execution_profiles[0],
    v = model.validation_evidence_metadata;
  return `<h2>OpenRouter detail</h2><div class="notice"><strong>Execution allowed: false.</strong> No provider call, model output, or billed usage exists.</div><div class="grid"><section class="card"><h3>Governed state</h3><dl>${rows(
    [
      ["Candidate", m?.model_id],
      [
        "Candidate path",
        `${p["provider_id"]} → ${r?.route_id} → ${m?.model_id} → ${profile?.profile_id}`,
      ],
      ["Readiness", p["readiness_status"]],
      ["Evidence verification", model.evidence.review_status],
      ["Sandbox proposal", p["proposal_status"]],
      ["Preflight", p["preflight_status"]],
      ["Model", m?.enabled ? "enabled" : "disabled"],
      ["Route", r?.enabled ? "enabled" : "disabled"],
      ["Route executable", (r?.executable_profile_ids.length ?? 0) > 0],
      ["Execution profile", profile?.enabled ? "enabled" : "disabled"],
      ["Adapter", p["adapter_state"]],
      ["Budget", model.budget_state.status],
      ["Approval", model.sandbox_proposals[0]?.approval_status],
      ["Exact policy", model.authorization.exact_policy_hash ?? "absent"],
      ["Consumption", model.consumption.status],
      ["Kill switch", model.kill_switch_state.status],
      ["Secret", model.secret_configuration_status.status],
    ],
  )}</dl></section><section class="card"><h3>Artifact identities</h3><dl>${rows(
    [
      ["Dossier", v.dossier_id],
      ["Dossier version", v.dossier_version],
      ["Dossier hash", v.dossier_hash],
      ["Evidence pack", v.evidence_pack_id],
      ["Evidence version", v.evidence_pack_version],
      ["Evidence hash", v.evidence_pack_hash],
      ["Proposal", v.proposal_id],
      ["Proposal hash", v.proposal_hash],
      ["Runtime config", v.runtime_config_id],
      ["Runtime version", v.runtime_config_version],
      ["Runtime hash", v.runtime_config_hash],
      ["Model record", m?.entry_id],
      ["Model hash", m?.hash],
      ["Route record", r?.record_id],
      ["Route hash", r?.hash],
      ["Profile", profile?.profile_id],
      ["Profile version", profile?.version],
      ["Profile hash", profile?.hash],
    ],
  )}</dl></section></div><section class="card"><h3>Metadata-only sandbox limits</h3><dl>${rows(
    [
      ["Maximum requests", model.budget_state.maximum_requests],
      ["Maximum spend USD", model.budget_state.maximum_total_spend_usd],
      ["Synthetic fixture", "openrouter.manual-sandbox.synthetic.v1"],
    ],
  )}</dl></section><section class="card"><h3>Latest evidence reports</h3><ul>${((p["evidence_paths"] as readonly string[] | undefined) ?? []).map((path) => `<li>${code(path)}</li>`).join("")}</ul></section>`;
}

const GOVERNANCE_GROUPS = [
  ["Evidence and readiness", "readiness_dossier", "evidence"],
  ["Pricing and budget", "readiness_dossier", "evidence"],
  ["Routing", "sandbox_preflight", "runtime"],
  [
    "Privacy, retention, training use, geography, and ZDR",
    "readiness_dossier",
    "security_privacy",
  ],
  ["Structured-output suitability", "sandbox_proposal", "runtime"],
  ["Benchmarks and gold cases", "sandbox_proposal", "evidence"],
  ["Legal and security review", "sandbox_proposal", "legal"],
  ["Human approval", "sandbox_proposal", "approval"],
  ["Runtime configuration", "sandbox_preflight", "runtime"],
] as const;
function governance(model: OperatorReadModel): string {
  return `<h2>Governance</h2><div class="grid">${GOVERNANCE_GROUPS.map(
    ([title, evaluator, category]) => {
      const matching = model.blockers.filter(
        (b) => b.category === category || b.source_evaluator === evaluator,
      );
      return `<section class="card"><h3>${title}</h3><p>${badge(matching.length ? "blocked" : "healthy")}</p><dl>${rows(
        [
          ["Source evaluator", evaluator],
          [
            "Blocker codes",
            matching.map((b) => b.blocker_code).join(", ") || "none",
          ],
          ["Explanation", matching[0]?.summary ?? "No blocker reported"],
          [
            "Execution impact",
            matching.some((b) => b.blocking_execution)
              ? "execution blocked"
              : "no blocking impact",
          ],
          [
            "Responsible resolution",
            [...new Set(matching.flatMap((b) => b.resolvable_by))].join(", ") ||
              "none",
          ],
        ],
      )}</dl></section>`;
    },
  ).join("")}</div>`;
}

function blockers(model: OperatorReadModel): string {
  const options = (values: readonly string[]) =>
    [...new Set(values)]
      .map(
        (v) =>
          `<option value="${escapeHtml(v)}">${escapeHtml(label(v))}</option>`,
      )
      .join("");
  return `<h2>Blockers</h2><div class="filters" aria-label="Read-only blocker filters">${[
    ["severity", model.blockers.map((b) => b.severity)],
    ["category", model.blockers.map((b) => b.category)],
    ["provider", model.blockers.map((b) => b.provider_id ?? "none")],
    ["resolution", model.blockers.flatMap((b) => b.resolvable_by)],
    ["blocking", model.blockers.map((b) => String(b.blocking_execution))],
  ]
    .map(
      ([name, values]) =>
        `<label>${label(name)}<select data-filter="${name}"><option value="">All</option>${options(values as string[])}</select></label>`,
    )
    .join(
      "",
    )}</div><div class="table-wrap"><table><thead><tr><th>Code</th><th>Severity</th><th>Category</th><th>Provider</th><th>Resolution</th><th>Execution blocking</th></tr></thead><tbody>${model.blockers.map((b) => `<tr data-severity="${b.severity}" data-category="${escapeHtml(b.category)}" data-provider="${escapeHtml(b.provider_id)}" data-resolution="${escapeHtml(b.resolvable_by.join(" "))}" data-blocking="${b.blocking_execution}"><td>${code(b.blocker_code)}<br>${escapeHtml(b.summary)}</td><td>${badge(b.severity)}</td><td>${escapeHtml(b.category)}</td><td>${escapeHtml(b.provider_id)}</td><td>${escapeHtml(b.resolvable_by.join(", "))}</td><td>${escapeHtml(String(b.blocking_execution))}</td></tr>`).join("")}</tbody></table></div><script>document.querySelectorAll('[data-filter]').forEach(function(s){s.addEventListener('change',function(){var f={};document.querySelectorAll('[data-filter]').forEach(function(x){f[x.dataset.filter]=x.value});document.querySelectorAll('tbody tr').forEach(function(r){r.hidden=Object.keys(f).some(function(k){return f[k]&&!r.dataset[k].includes(f[k])})})})})</script>`;
}

function actions(model: OperatorReadModel): string {
  return `<h2>Required actions</h2><p class="quiet">Informational only. No assignments, transitions, approvals, comments, or persistence are available.</p>${model.required_human_actions
    .map(
      (a) =>
        `<article class="card"><h3>${escapeHtml(a.title)} ${badge(a.status)}</h3><dl><dt>Action code</dt><dd>${code(a.action_code)}</dd>${rows(
          [
            ["Owner role", a.owner_role],
            ["Prerequisites", a.prerequisite_actions.join(", ") || "none"],
            ["Source blocker codes", a.source_blocker_codes.join(", ")],
            ["Required artifact", a.required_artifact],
            ["Execution impact", a.execution_impact],
          ],
        )}</dl></article>`,
    )
    .join("")}`;
}
function execution(model: OperatorReadModel): string {
  const stages: [[string, string], ...[string, string][]] = [
    ["Registry", model.models[0]?.enabled ? "available" : "disabled"],
    ["Resolution", model.routes[0]?.enabled ? "available" : "blocked"],
    [
      "Authorization",
      model.authorization.status === "no_policy_issued"
        ? "absent"
        : model.authorization.status,
    ],
    [
      "Exact policy",
      model.authorization.exact_policy_hash ? "available" : "absent",
    ],
    ["Atomic consumption", model.consumption.status],
    [
      "Gateway",
      model.gateway_adapter_state.gateway_invoked
        ? "completed"
        : "not attempted",
    ],
    ["Adapter", model.gateway_adapter_state.adapter_status],
  ];
  return `<h2>Execution boundary</h2><div class="chain" aria-label="Governed execution chain">${stages.map(([n, s]) => `<div class="stage"><strong>${n}</strong><br>${badge(s.replaceAll(" ", "_"))}</div>`).join("")}</div><section class="card"><h3>OpenRouter execution facts</h3><ul><li>No exact policy.</li><li>No authorization issued for execution.</li><li>No consumption attempt.</li><li>No provider call.</li><li>No model output.</li><li>No billed usage.</li></ul></section>`;
}
function audit(model: OperatorReadModel): string {
  const v = model.validation_evidence_metadata;
  const evidencePaths = model.providers.flatMap(
    (provider) =>
      (provider["evidence_paths"] as readonly string[] | undefined) ?? [],
  );
  return `<h2>Audit references</h2><section class="card"><dl>${rows([
    ["Contract version", model.contract_version],
    ["Read-model hash", model.system_summary.read_model_hash],
    ["Evaluation timestamp", model.system_summary.last_evaluated_at],
    ["Dossier ID", v.dossier_id],
    ["Dossier hash", v.dossier_hash],
    ["Evidence pack ID", v.evidence_pack_id],
    ["Evidence pack hash", v.evidence_pack_hash],
    ["Proposal ID", v.proposal_id],
    ["Proposal hash", v.proposal_hash],
    ["Runtime config ID", v.runtime_config_id],
    ["Runtime config hash", v.runtime_config_hash],
    [
      "Test totals",
      v.test_totals
        ? `${v.test_totals.tests} tests / ${v.test_totals.suites} suites`
        : "not injected",
    ],
  ])}</dl></section><section class="card"><h3>Approved metadata paths</h3><ul>${[...model.audit_references, ...evidencePaths, "docs/architecture/ai-lab-operator-console.md", "docs/architecture/ai-roadmap-dependency-map.md"].map((p) => `<li>${code(p)}</li>`).join("")}</ul></section>`;
}

export const OPERATOR_CONSOLE_PATHS = new Set([
  ...ROUTES.map(([, path]) => path),
  "/operator/providers/openrouter",
]);
export function renderOperatorConsole(
  model: OperatorReadModel,
  pathname: string,
): string {
  const content =
    pathname === "/operator"
      ? overview(model)
      : pathname === "/operator/providers"
        ? providers(model)
        : pathname === "/operator/providers/openrouter"
          ? openrouter(model)
          : pathname === "/operator/governance"
            ? governance(model)
            : pathname === "/operator/blockers"
              ? blockers(model)
              : pathname === "/operator/actions"
                ? actions(model)
                : pathname === "/operator/execution"
                  ? execution(model)
                  : audit(model);
  return shell(model, pathname, content);
}

export function renderOperatorInvalidState(): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Operator Console — Invalid state</title></head><body><main><h1>Invalid repository state</h1><p>The Operator Read Model failed closed. Review repository validation locally; no execution was attempted.</p></main></body></html>`;
}
