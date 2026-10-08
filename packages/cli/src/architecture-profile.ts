/**
 * init architecture profiles.
 *
 * An explicit profile is an input to generation, not a heuristic observation.
 * The profile sidecar is deliberately small and content addressed so rerunning
 * init can prove which architecture rules produced the generated governance.
 */
import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { ensureParentDir } from "./store-layout.js";
import type { InitFileReport } from "./init.js";
import type { StackAnswer } from "./baseline.js";

export const ARCHITECTURE_PROFILE_RELATIVE = ".pomaster/state/architecture-profile.json";
export const ARCHITECTURE_GOVERNANCE_RELATIVE = ".pomaster/baseline/frontend/architecture-profile.md";

export const ARCHITECTURE_IDS = ["vue", "react"] as const;
export type ArchitectureId = (typeof ARCHITECTURE_IDS)[number];

interface ArchitectureDefinition {
  readonly id: ArchitectureId;
  readonly profile_id: string;
  readonly version: string;
  readonly governance: string;
  readonly answers: readonly StackAnswer[];
}

const DEFINITIONS: Readonly<Record<ArchitectureId, ArchitectureDefinition>> = {
  vue: {
    id: "vue",
    profile_id: "frontend.vue3",
    version: "1.0.0",
    governance: [
      "# Frontend architecture profile: Vue",
      "",
      "- 组件边界以 Vue SFC 为单位；模板、script setup、style scoped 的职责和依赖必须可解释。",
      "- 响应式状态使用 Composition API；跨页面状态进入 Pinia，server state 由查询缓存层管理。",
      "- 路由治理以 vue-router 为基线；页面入口、路由守卫和异步组件的边界必须可追踪。",
      "- 版本、插件和构建配置以项目实际 package manifest 为证据，未知项保持 UNKNOWN。",
    ].join("\n") + "\n",
    answers: [
      { lane: "frontend", key: "framework", value: "vue3" },
      { lane: "frontend", key: "router", value: "vue-router" },
      { lane: "frontend", key: "state", value: "pinia" },
    ],
  },
  react: {
    id: "react",
    profile_id: "frontend.react",
    version: "1.0.0",
    governance: [
      "# Frontend architecture profile: React",
      "",
      "- 组件边界以 React component/tree 为单位；渲染、hooks、副作用和外部适配职责必须可解释。",
      "- 本地状态使用 hooks；跨组件状态使用 Zustand，server state 由查询缓存层管理。",
      "- 路由治理以 react-router 为基线；路由模块、loader/action 与页面边界必须可追踪。",
      "- 版本、插件和构建配置以项目实际 package manifest 为证据，未知项保持 UNKNOWN。",
    ].join("\n") + "\n",
    answers: [
      { lane: "frontend", key: "framework", value: "react" },
      { lane: "frontend", key: "router", value: "react-router" },
      { lane: "frontend", key: "state", value: "zustand" },
    ],
  },
};

export interface ArchitectureProfile {
  readonly id: ArchitectureId;
  readonly profile_id: string;
  readonly version: string;
  readonly source: "explicit" | "owner_confirmed_task";
  readonly confirmed_task_ref?: string;
  readonly source_digest: string;
  readonly governance_digest: string;
}

export type ArchitectureProfileWrite =
  | { readonly ok: true; readonly profile: ArchitectureProfile }
  | { readonly ok: false; readonly code: string; readonly message: string; readonly hint: string };

export function parseArchitectureId(raw: string | undefined):
  | { readonly ok: true; readonly id: ArchitectureId }
  | { readonly ok: false; readonly message: string; readonly hint: string } {
  if (raw !== undefined && (ARCHITECTURE_IDS as readonly string[]).includes(raw)) {
    return { ok: true, id: raw as ArchitectureId };
  }
  return {
    ok: false,
    message: raw === undefined ? "缺少架构选择" : `不支持的架构：${raw}`,
    hint: "显式选择 --architecture vue 或 --architecture react；brownfield 架构必须由识别 TASK 确认。",
  };
}

export function architectureDefinition(id: ArchitectureId): ArchitectureDefinition {
  return DEFINITIONS[id];
}

export function architectureAnswers(id: ArchitectureId): readonly StackAnswer[] {
  return DEFINITIONS[id].answers;
}

export function architectureProfile(
  id: ArchitectureId,
  source: ArchitectureProfile["source"] = "explicit",
  confirmedTaskRef?: string,
): ArchitectureProfile {
  const definition = DEFINITIONS[id];
  const sourceMaterial = [
    `${definition.profile_id}@${definition.version}`,
    `source=${source}`,
    ...(confirmedTaskRef === undefined ? [] : [`task=${confirmedTaskRef}`]),
    definition.governance,
  ].join("\n");
  return {
    id,
    profile_id: definition.profile_id,
    version: definition.version,
    source,
    ...(confirmedTaskRef === undefined ? {} : { confirmed_task_ref: confirmedTaskRef }),
    source_digest: `sha256:${createHash("sha256").update(sourceMaterial).digest("hex")}`,
    governance_digest: `sha256:${createHash("sha256").update(definition.governance).digest("hex")}`,
  };
}

function profileJson(profile: ArchitectureProfile): string {
  return `${JSON.stringify(profile, null, 2)}\n`;
}

/** Write both the machine profile and its human governance projection, seed-once. */
export async function writeArchitectureProfile(
  rootDir: string,
  id: ArchitectureId,
  files: InitFileReport[],
  options: {
    readonly source?: ArchitectureProfile["source"];
    readonly confirmedTaskRef?: string;
  } = {},
): Promise<ArchitectureProfileWrite> {
  const profile = architectureProfile(id, options.source, options.confirmedTaskRef);
  const definition = architectureDefinition(id);
  const targets = [
    [ARCHITECTURE_PROFILE_RELATIVE, profileJson(profile)],
    [ARCHITECTURE_GOVERNANCE_RELATIVE, `${definition.governance}\n<!-- source_digest: ${profile.governance_digest} -->\n`],
  ] as const;
  const existing = await Promise.all(targets.map(async ([relative, content]) => {
    try {
      return { relative, content, value: await readFile(`${rootDir}/${relative}`, "utf8") };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { relative, content, value: null };
      return { relative, content, value: "__UNREADABLE__" };
    }
  }));
  const conflict = existing.find(({ value, content }) => value !== null && value !== content);
  if (conflict !== undefined) {
    return {
      ok: false,
      code: "ARCHITECTURE_PROFILE_CONFLICT",
      message: `${conflict.relative} 已存在且内容不匹配或不可读，init 不覆盖人工架构治理文件`,
      hint: "核对已有 profile 后重跑；需要换型时走显式治理变更，不让 init 静默覆盖。",
    };
  }
  for (const { relative, content, value } of existing) {
    if (value === content) {
      files.push({ file: relative, action: "unchanged" });
      continue;
    }
    const path = `${rootDir}/${relative}`;
    await ensureParentDir(path);
    await writeFile(path, content, "utf8");
    files.push({ file: relative, action: "created" });
  }
  return { ok: true, profile };
}
