# Scoped Human Decisions

Unknowns, conflicts and drift remain visible facts. Recording a disposition,
recovering context, writing governed state and claiming completion are separate
actions. Owner adjudication 23 authorizes the following scoped behavior.

## Discovery

`brainstorm decide --answer UNKNOWN|DEFER` records uncertainty without requiring
a grounded conclusion. Existing triage and input validation remain mandatory;
ACCEPT/CHANGE still require sufficient grounding. Recording is not resolution.

At `brainstorm decide --ready`, repeat `--decision-root <DECISION.id>` to declare
the Owner-confirmed current increment. `decision_scope` stores the roots and
current graph fingerprint inside this Discovery's task contract. Readiness checks
the transitive `depends_on` closure, reports unselected nodes in `out_of_scope`,
and promotion rejects a changed graph. No scope means the original whole graph.

## Baseline Dependencies

At readiness, repeat `--baseline-target <path>` and `--baseline-exclude <path>`
to partition all `BASELINE_CONFIRM_TARGETS`. Paths are store-relative, for example
`baseline/frontend/stack.yaml`. The command captures the stable confirmation's
sequence and all digests as `baseline_dependencies`, then promotion preserves it.
The Owner must include shared and unassessed dependencies in relevant targets;
the tool does not infer independence from directory names.

Closeout blocks related drift, historical related digest changes and pending
related changes. Explicitly excluded drift/pending changes stay warnings. Missing
declarations retain global checks; malformed or incomplete declarations cannot
relax them. Reassess the task declaration after relevant changes through the
existing governed task update path. A baseline acknowledgement alone is not a
new task dependency assessment.

## Evidence History

Optional root `baseline_inputs = {at_seq, digests}` is supported by schema 07
for runs and claims. `check --gates` captures a stable confirmed baseline before
execution; successful new `record verification` stores its validation snapshot.
If the baseline is not stable/confirmed, no snapshot is fabricated and evidence
retains conservative sequence checks. External producers may supply a captured
snapshot when importing a run; import and canonical replay preserve it unchanged.
They never stamp an old run with today's baseline.

With a complete task declaration and a captured snapshot, qualification compares
declared, captured and current relevant digests. Snapshot coverage and sequence
consistency must hold. Unrelated reconfirmation can then reuse evidence. Missing
snapshots retain the original global sequence rule. Permit invalidation, oracle
versions and subject constraints are not waived. This mechanism does not claim
full source-code or environment freshness beyond the existing qualification axes.

Already adjudicated claims remain immutable: repeated verification is NO_CHANGE,
not revalidation. Re-run affected producers and record a new claim/verification
through the existing authorized paths. Do not hand-edit historical snapshots.

## Verification Obligations

Acceptance `requires` capabilities are unioned using `PLAN_CAPABILITY_GATE_NAMES`.
Only an explicit capability exclusion with a nonempty `basis`, and no required
use of that gate elsewhere in acceptance, makes its diagnostic nonblocking.
Missing mappings and incomplete/legacy declarations retain conservative checks.
Bound Evidence Spec clauses remain independent mandatory obligations, including
their alternative candidate semantics. Exclusions cannot satisfy or waive them.

Required missing, failed or unrun gates still block completion. Optional failures
remain visible as `GATE_OPTIONAL_NOT_PASSED`, not passed. DoD, Evidence Specs and
human ACCEPT still apply. Empty machine obligations must be explicitly declared;
the resulting empty gate denominator is disclosed, not reported as proof.

## Recovery and Reporting

`session attach --reconcile` permits context recovery with dirty/missing-baseline
warnings and `clean=false`. It grants no additional Permit scope or drift approval.
`--reconcile-force` only retains compatibility reporting; it is not a durable
disposition receipt. Judge errors and live-session ownership conflicts still fail.

See [diagnostic reporting](diagnostic-reporting.md) for strict command exits,
baseline attention alongside task-side suggestions, and current reporting limits.
