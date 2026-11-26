import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CliError } from "./envelope.js";

export interface GuardFaultEvent {
  readonly type: "GUARD_FAULT_OBSERVED";
  readonly observed_at: string;
  readonly target: string;
  readonly reason: string;
  readonly protected: boolean;
  readonly disposition: "fail_closed" | "fail_open";
}
export interface GuardFaultAssessment { readonly events: readonly GuardFaultEvent[]; readonly errors: readonly CliError[]; }
/** Pure telemetry reader: malformed/unreadable evidence is never silently a clean assessment. */
export function readGuardFaults(root: string): GuardFaultAssessment {
  const file = join(root, ".pomaster/state/guard-faults.jsonl");
  let raw: string;
  try { raw = readFileSync(file, "utf8"); } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return { events: [], errors: [] };
    return { events: [], errors: [{ code: "GUARD_FAULT_LOG_INVALID", message: `Cannot read ${file}`, hint: "Restore readable fault telemetry before closeout." }] };
  }
  const events: GuardFaultEvent[] = [], errors: CliError[] = [];
  for (const [index, line] of raw.split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    try {
      const row = JSON.parse(line) as GuardFaultEvent;
      if (!row || row.type !== "GUARD_FAULT_OBSERVED" || typeof row.protected !== "boolean" || typeof row.target !== "string" || typeof row.reason !== "string" || typeof row.observed_at !== "string" || !Number.isFinite(Date.parse(row.observed_at)) || row.disposition !== (row.protected ? "fail_closed" : "fail_open")) throw new Error("Invalid event");
      events.push(row);
    } catch { errors.push({ code: "GUARD_FAULT_LOG_INVALID", message: `Malformed guard fault at line ${index + 1}`, hint: "Do not erase faults; investigate the broken telemetry producer." }); }
  }
  return { events, errors };
}

/** Future closeout/doctor/alerts consumer; no completion or permission side effects. */
export function guardFaultErrors(root: string): readonly CliError[] {
  const read = readGuardFaults(root);
  return [...read.errors, ...read.events.map(event => ({ code: "GUARD_FAULT_OBSERVED", message: `${event.disposition}: ${event.target}: ${event.reason}`, hint: "Repair the trusted guard runtime and rerun affected execution evidence; an allowed tool call does not clear this fault." }))];
}
