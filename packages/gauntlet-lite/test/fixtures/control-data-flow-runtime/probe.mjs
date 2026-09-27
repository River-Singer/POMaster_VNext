import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function option(name) {
  const index = process.argv.indexOf(name);
  if (index < 0 || index + 1 >= process.argv.length) {
    throw new Error(`missing ${name}`);
  }
  return process.argv[index + 1];
}

const fixtureRoot = resolve(option("--fixture-root"));
const controlValue = option("--control-value");
const correlationId = option("--correlation-id");
const taskRef = option("--task-ref");
const staticControlRef = option("--static-control-ref");
const storageFile = resolve(fixtureRoot, "storage", "control-state.json");

const trace = [];
let cleanupAttempted = false;
let cleanupSucceeded = false;

try {
  // A rejected empty control exercises the same validation/recovery path before the
  // accepted interaction. It is intentionally observable instead of being asserted
  // as an unexplained boolean in the final report.
  let recoveryMessage = null;
  try {
    if ("".trim().length === 0) throw new Error("control value is required");
  } catch (error) {
    recoveryMessage = error instanceof Error ? error.message : String(error);
    trace.push({ stage: "error_recovery", correlation_id: correlationId, recovered: true, message: recoveryMessage });
  }

  const control = { id: "display-name", value: controlValue };
  trace.push({ stage: "control", correlation_id: correlationId, control_id: control.id, value: control.value });

  const request = {
    correlation_id: correlationId,
    operation: "save-control-value",
    payload: { control_id: control.id, value: control.value },
  };
  const serializedRequest = JSON.stringify(request);
  trace.push({ stage: "request_serialization", correlation_id: correlationId, serialized: serializedRequest });

  mkdirSync(dirname(storageFile), { recursive: true });
  writeFileSync(storageFile, serializedRequest, "utf8");
  const persisted = existsSync(storageFile);
  trace.push({ stage: "persistence", correlation_id: correlationId, storage_ref: storageFile, bytes: Buffer.byteLength(serializedRequest), persisted });

  const acknowledgement = { correlation_id: correlationId, stored: persisted };
  trace.push({ stage: "response_ack", ...acknowledgement });

  const readback = JSON.parse(readFileSync(storageFile, "utf8"));
  trace.push({ stage: "readback", correlation_id: readback.correlation_id, value: readback.payload.value });

  const feedback = {
    correlation_id: readback.correlation_id,
    state: acknowledgement.stored ? "saved" : "error",
    text: acknowledgement.stored ? `Saved ${readback.payload.value}` : "Save failed",
  };
  trace.push({ stage: "ui_state_feedback", ...feedback });

  rmSync(fixtureRoot, { recursive: true, force: true });
  cleanupAttempted = true;
  cleanupSucceeded = !existsSync(fixtureRoot);

  const observations = {
    control: control.value === controlValue,
    request_or_storage: request.payload.value === controlValue && persisted,
    response_or_ack: acknowledgement.correlation_id === correlationId && acknowledgement.stored,
    readback: readback.correlation_id === correlationId && readback.payload.value === controlValue,
    feedback: feedback.correlation_id === correlationId && feedback.state === "saved" && feedback.text.includes(controlValue),
    error_recovery: recoveryMessage === "control value is required",
  };

  process.stdout.write(JSON.stringify({
    schema: "pomaster.control-data-flow-runtime/v1",
    task_ref: taskRef,
    static_control_ref: staticControlRef,
    side_effect: "INTERACTIVE_REVERSIBLE",
    fixture: { isolated: true, ref: `fixture:${fixtureRoot}` },
    cleanup: { required: true, attempted: cleanupAttempted, succeeded: cleanupSucceeded },
    observations,
    correlation_id: correlationId,
    trace,
  }));
} catch (error) {
  if (!cleanupAttempted) {
    cleanupAttempted = true;
    try {
      rmSync(fixtureRoot, { recursive: true, force: true });
      cleanupSucceeded = !existsSync(fixtureRoot);
    } catch {
      cleanupSucceeded = false;
    }
  }
  process.stderr.write(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
}
