// 总 Storybook 编排：两个抽屉（Vue · Ant Design、React · Geist）组合成一个 Storybook。
//
// 用法（root scripts）：
//   pnpm studio:dev   → node scripts/studio.mjs dev    两个抽屉各起 dev 服务（6006 / 6007），总 Storybook 在 6008
//   pnpm studio:build → node scripts/studio.mjs build  静态构建到 dist-studio/：总 Storybook 在根路径，抽屉在 vue/、react/
//
// 架构锁定后只起对应的抽屉（POMASTER_STUDIO_SYSTEM，或 POMASTER_STUDIO_PROJECT 指向的项目里已落地的规范；
// 规则见 packages/studio/scripts/lib/drawers.mjs）。静态构建的发布位由 POMASTER_STUDIO_SITE_URL 指定
// （缺省是 GitHub Pages 在线版），各 Storybook 的 vite base 随之取发布位的路径部分。
import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const { HOST_PORT, resolveDrawers, siteUrl } = await import("../packages/studio/scripts/lib/drawers.mjs");

const action = process.argv[2] ?? "";
if (!["dev", "build"].includes(action)) {
  console.error("用法: node scripts/studio.mjs <dev|build>");
  process.exit(1);
}

const { drawers, reason } = resolveDrawers();
console.log(`[studio] 抽屉：${drawers.map((drawer) => drawer.title).join("、")}（${reason}）`);
const runner = (drawer) => join(root, drawer.package, "run.mjs");
const hostRunner = join(root, "packages", "studio-react", "run.mjs");

if (action === "dev") {
  const children = [
    ...drawers.map((drawer) => spawn(process.execPath, [runner(drawer), "dev"], { cwd: root, stdio: "inherit", env: process.env })),
    spawn(process.execPath, [hostRunner, "host-dev"], { cwd: root, stdio: "inherit", env: process.env }),
  ];
  console.log(`[studio] 总 Storybook：http://localhost:${HOST_PORT}（抽屉 ${drawers.map((drawer) => `${drawer.title} ${drawer.port}`).join("，")}）`);
  const stop = () => {
    for (const child of children) if (child.exitCode === null) child.kill("SIGTERM");
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  let failed = 0;
  await Promise.all(
    children.map(
      (child) =>
        new Promise((resolve) =>
          child.on("exit", (code) => {
            if (code !== 0 && code !== null) failed = code;
            stop();
            resolve();
          }),
        ),
    ),
  );
  process.exit(failed);
}

// build：总 Storybook 先建（它会清空输出目录），抽屉再放进子路径。
const out = join(root, "dist-studio");
const basePath = new URL(`${siteUrl()}/`).pathname;
rmSync(out, { recursive: true, force: true });
const steps = [
  { label: "总 Storybook", args: [hostRunner, "host-build"], dir: out, base: basePath },
  ...drawers.map((drawer) => ({ label: drawer.title, args: [runner(drawer), "build"], dir: join(out, drawer.id), base: `${basePath}${drawer.id}/` })),
];
for (const step of steps) {
  console.log(`[studio] 构建 ${step.label} → ${step.dir}（base ${step.base}）`);
  const result = spawnSync(process.execPath, step.args, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, STORYBOOK_OUTPUT_DIR: step.dir, STORYBOOK_BASE: step.base },
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
console.log(`[studio] 完成：${out}（发布位 ${siteUrl()}/）`);
