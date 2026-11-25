/** Test-only external PATH installation backed by the real, already-built CLI.
 * No npm install, target-tree executable, fabricated verdict, or global env edit.
 * The wrapper leaves package/dependency/asset resolution at the actual dist entry.
 */
import { spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, dirname, isAbsolute, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect } from "vitest";

const cliEntry = fileURLToPath(new URL("../../packages/cli/dist/bin.js", import.meta.url));

interface PythonRuntime {
  readonly executable: string;
  readonly home: string;
  readonly dllRoots: readonly string[];
}

function pythonRuntime(): PythonRuntime | null {
  for (const command of [["python"], ["python3"], ["py", "-3"]]) {
    const [file, ...args] = command;
    if (!file) continue;
    const script = "import json, os, sys, sysconfig; assert sys.version_info >= (3, 8); "
      + "print(json.dumps({'executable': sys.executable, 'home': sys.prefix, "
      + "'dllRoots': [os.path.dirname(sys.executable), sys.base_prefix, "
      + "os.path.dirname(getattr(sys, '_base_executable', sys.executable)), sysconfig.get_config_var('BINDIR')]}))";
    const run = spawnSync(file, [...args, "-I", "-c", script], { encoding: "utf8" });
    if (!run.error && run.status === 0) {
      const runtime = JSON.parse(run.stdout) as PythonRuntime;
      if (existsSync(runtime.executable)) return {
        executable: realpathSync.native(runtime.executable),
        home: realpathSync.native(runtime.home),
        dllRoots: [...new Set(runtime.dllRoots.filter(path => path && existsSync(path)).map(path => realpathSync.native(path)))],
      };
    }
  }
  return null;
}

const quoteSh = (value: string): string => `'${value.replaceAll("'", "'\\''")}'`;

/** PATH lists only this bin. Never expose a host runtime's colocated global CLI. */
function createRuntimeBin(bin: string, python: PythonRuntime | null): void {
  mkdirSync(bin);
  if (process.platform !== "win32") {
    const runtimes: [string, string][] = [["node", process.execPath]];
    if (python) runtimes.push(["python", python.executable], ["python3", python.executable]);
    for (const [name, actual] of runtimes) {
      writeFileSync(join(bin, name), `#!/bin/sh\nexec ${quoteSh(actual)} "$@"\n`, { mode: 0o755 });
    }
    return;
  }
  // Real executables (not CMD shims): Node spawn(shell:false) must work on Windows
  // without symlink privileges. Python's library home remains its probed sys.prefix.
  copyFileSync(process.execPath, join(bin, "node.exe"));
  if (python) {
    copyFileSync(python.executable, join(bin, "python.exe"));
    copyFileSync(python.executable, join(bin, "python3.exe"));
  }
  const roots = [...new Set([...(python?.dllRoots ?? []), dirname(process.execPath)])];
  for (const root of roots) for (const name of readdirSync(root)) {
    // Only runtime DLL names; no scripts, CLI binaries, or whole runtime directories.
    if (!/^(?:python\d+t?(?:_d)?|node|libnode|libuv|vcruntime140(?:_1)?|msvcp140|ucrtbase)\.dll$/i.test(name)) continue;
    const target = join(bin, name);
    if (!existsSync(target)) copyFileSync(join(root, name), target);
  }
}

export interface TrustedCliFixture {
  readonly root: string;
  readonly pathEntry: string;
  readonly python: string | null;
  readonly env: NodeJS.ProcessEnv;
  /** Real runtimes, but deliberately no fixture or user CLI installation. */
  readonly withoutCliEnv: NodeJS.ProcessEnv;
  dispose(): void;
}

export function createTrustedCliFixture(): TrustedCliFixture {
  if (!existsSync(cliEntry)) throw new Error(`Real CLI distribution missing: ${cliEntry}; build prerequisite required`);
  const root = mkdtempSync(join(tmpdir(), "pomaster trusted cli "));
  try {
    const bin = join(root, "bin");
    const home = join(root, "home");
    mkdirSync(bin);
    mkdirSync(home);
    const runtime = pythonRuntime();
    const python = runtime?.executable ?? null;
    const runtimePath = join(root, "runtime-bin");
    createRuntimeBin(runtimePath, runtime);
    // Use native batch execution on Windows, not a Unix executable or file association.
    const pathEntry = join(bin, process.platform === "win32" ? "pomaster.cmd" : "pomaster");
    writeFileSync(pathEntry, process.platform === "win32"
      ? `@"${process.execPath}" "${cliEntry}" %*\r\n@exit /b %errorlevel%\r\n`
      : `#!/bin/sh\nexec ${quoteSh(process.execPath)} ${quoteSh(cliEntry)} "$@"\n`,
    { mode: 0o755 });
    const withoutCliEnv: NodeJS.ProcessEnv = { ...process.env };
    // Windows environment names are case-insensitive; don't retain a second Path
    // spelling that Node 22 might select instead of our isolated PATH.
    for (const key of Object.keys(withoutCliEnv)) {
      if (["PATH", "POMASTER_CLI_ENTRY", "PYTHONHOME", "PYTHONPATH"].includes(key.toUpperCase())) delete withoutCliEnv[key];
    }
    Object.assign(withoutCliEnv, {
      PATH: runtimePath,
      HOME: home,
      USERPROFILE: home,
      PYTHONIOENCODING: "utf-8",
    });
    // Runtime library-location data only, never a CLI trust grant. Copying the
    // Windows exe changes its directory, not where the real standard library lives.
    if (process.platform === "win32" && runtime) withoutCliEnv.PYTHONHOME = runtime.home;
    const env = { ...withoutCliEnv, PATH: [bin, runtimePath].join(delimiter) };
    return { root, pathEntry, python, env, withoutCliEnv, dispose: () => rmSync(root, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}

/** Exercise the same real Python PATH discovery/execution used by the installed hook. */
export function expectTrustedCliInstallation(fixture: TrustedCliFixture, project: string): void {
  const rel = relative(realpathSync.native(project), realpathSync.native(fixture.pathEntry));
  expect(isAbsolute(rel) || rel === ".." || rel.startsWith(`..${process.platform === "win32" ? "\\" : "/"}`)).toBe(true);
  expect(fixture.python, "Python 3.8+ is an explicit installed-hook prerequisite").not.toBeNull();
  const absent = spawnSync(fixture.python!, ["-c", "import json, shutil; print(json.dumps(shutil.which('pomaster')))"], {
    cwd: project, env: fixture.withoutCliEnv, encoding: "utf8",
  });
  expect(absent.error).toBeUndefined();
  expect(absent.status, absent.stderr).toBe(0);
  expect(JSON.parse(absent.stdout)).toBeNull();
  const resolved = spawnSync(fixture.python!, ["-c", "import os, shutil; print(os.path.realpath(shutil.which('pomaster')))"], {
    cwd: project, env: fixture.env, encoding: "utf8",
  });
  expect(resolved.error).toBeUndefined();
  expect(resolved.status, resolved.stderr).toBe(0);
  expect(realpathSync.native(resolved.stdout.trim())).toBe(realpathSync.native(fixture.pathEntry));
  const script = "import shutil, subprocess, sys; p = subprocess.run([shutil.which('pomaster'), '--help']); sys.exit(p.returncode)";
  const installed = spawnSync(fixture.python!, ["-c", script], { cwd: project, env: fixture.env, encoding: "utf8" });
  const actual = spawnSync(process.execPath, [cliEntry, "--help"], { cwd: project, env: fixture.env, encoding: "utf8" });
  expect(installed.error).toBeUndefined();
  expect(actual.error).toBeUndefined();
  expect(actual.status, actual.stderr).toBe(0);
  expect(installed.status, installed.stderr).toBe(0);
  expect(installed.stdout).toBe(actual.stdout);
  expect(installed.stdout).toContain("exec-guard");
  const version = spawnSync(fixture.python!, ["-c", script.replace("--help", "--version")], {
    cwd: project, env: fixture.env, encoding: "utf8",
  });
  const packageVersion = (JSON.parse(readFileSync(join(dirname(cliEntry), "../package.json"), "utf8")) as { version: string }).version;
  expect(version.error).toBeUndefined();
  expect(version.status, version.stderr).toBe(0);
  expect(version.stdout.trim()).toBe(packageVersion);
  expect(readFileSync(fixture.pathEntry, "utf8")).toContain(cliEntry);
  expect(readFileSync(fixture.pathEntry, "utf8")).toContain(process.execPath);
}
