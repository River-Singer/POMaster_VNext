# Diagnostic Reports and Strict Checks

## Reporting Boundary

`pomaster status`, `pomaster session`, and the alerts breadcrumb present next-action
guidance. Successfully presenting an unresolved fact does not mean that fact passed
verification. Store/input failures remain failures; reporting is not an unconditional
exit-zero wrapper. Hooks have their own delivery contract and are not CI checks.

Next-action keeps the existing `route_id`, `beat`, `command`, and `reason` shape.
The primary route remains first-match for compatibility. When baseline confirmation
is the primary recommendation, `reason` also presents a task-side suggestion using
the same route prerequisites, excluding baseline confirmation and closeout. Permit
renewal/issuance and missing/stale context remain ahead of execution or verification.
The breadcrumb includes this explanation as well as the primary command.

Baseline codes remain visible even when blocking unknowns or an unjudgeable baseline
prevent recommending confirmation. Task-side suggestions are preparation paths, not
proof that a baseline change is unrelated. Each command must check its own authority,
context and dependencies. Unjudgeable routes stay explicitly unjudgeable. Stale
derived context calls for `context compile`, not automatic human approval.

No persisted state, new JSON field, blanket exemption, or automatic baseline
acknowledgement is introduced. Machine consumers continue to use the primary route;
parallel suggestions are human guidance in `reason`, not a new structured action API.
The alerts workflow-card heading still follows the primary route; its breadcrumb
carries the parallel guidance. Consumers that display only `command` will not show it.

## Strict Diagnostic Boundary

The following existing commands retain their exit semantics, including with `--json`:

| Command | Strict outcome |
| --- | --- |
| `pomaster doctor` | All probes must be `READY`; missing configuration or defects keep `ok=false` and exit 1. Baseline presentation is separate from the probe denominator. |
| `pomaster portability check` | All checks must pass; `FAIL` and `NOT_RUN` retain failure and exit 1. |
| `pomaster catalog status` | Catalog lock drift retains failure and exit 1; presenting drift does not relock assets. |
| `pomaster memory harvest` | Detected `MEMORY_DRIFT` retains failure and a pending inbox entry; an unrun probe remains `MEMORY_HARVEST_NOT_RUN`, not verified success. Harvest is not a read-only report. |

The CLI dispatches these outcomes through the common `runCli` exit mapping: exit 0
requires successful outcomes. `bin.ts` uses that returned code. JSON formatting does
not change this mapping. Existing CI consumers can continue relying on nonzero exit
codes. No new `--report` mode or task-specific doctor denominator is provided here.

A diagnostic failure alone does not establish that every development action is
blocked. Evaluate the affected action and its evidenced dependencies. Independent
work may continue under its existing authority; missing required verification cannot
be described as passed. Human risk acceptance does not create evidence, grant Permit
scope, resolve conflicting authority, or replace human ACCEPT at closeout.

## Regression Anchors and Limits

- `packages/cli/tests/next-action.spec.ts`: baseline attention alongside task
  prerequisites, stale-context refresh, unavailable confirmation and unjudgeable
  routes; unchanged primary route and read-only snapshot.
- `packages/cli/tests/{doctor,portability,catalog,catalog-relock,memory}.spec.ts`:
  existing strict outcomes, drift and missing-capability behavior.
- `packages/cli/src/{status,session,bootstrap-harness}.ts` consume `reason`;
  `packages/cli/src/alerts.ts` consumes the shared breadcrumb renderer.

This is a reporting change, not a dependency-relevance engine. It does not establish
baseline impact closure, change evidence freshness, optional-gate policy or closeout
requirements, nor complete other batches of the hard-gate audit. A future structured
parallel-action API or explicit report mode needs a separately reviewed consumer and
schema migration; strict diagnostic behavior must remain available.
