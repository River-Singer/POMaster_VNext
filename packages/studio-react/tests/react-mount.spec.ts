// @vitest-environment happy-dom
// R2/R3 fix pin tests (audit-refreshed-pomaster-content-runtime R2/R3): generated
// stories mounted via react-dom smoke + generation-time unbound-JSX-root scan
// (fail-closed) + message/notification service API arg contracts.
//
// RED anchor (measured on the broken generator, same shape as the audit browser
// evidence): Anchor/Typography story mount throws ReferenceError (AnchorLink /
// Space is not defined); notification.info('string') renders a notice with no
// message body.
//
// CJK expectation strings use unicode escapes for byte-exactness (transcription
// drift immunity); readable forms are in the trailing comments.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { createRoot } from "react-dom/client";
import type { ReactElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import {
  SERVICE_API_CONTRACTS,
  assertJsxRootsBound,
  findUnboundJsxRoots,
  generateReactStories,
  renderReactStory,
} from "../scripts/lib/generate-react-stories.mjs";

// 演示锚点
const ANCHOR_TITLE = "演示锚点";
// 锚点目标段落
const ANCHOR_TARGET = "锚点目标段落";
// 标题
const TYPO_HEADING = "标题";
// 文本段落
const TYPO_PARAGRAPH = "文本段落";
// POMaster 画廊演示：<family> 服务式 API
function serviceText(family: string): string {
  return `POMaster 画廊演示：${family} 服务式 API`;
}

interface StoryModule {
  Default: { render: () => ReactElement };
}

const storyModules = import.meta.glob<Record<string, unknown>>(
  "../generated/components/*.stories.tsx",
  { eager: true },
);

const familyNames = Object.keys(storyModules)
  .map((path) => basename(path, ".stories.tsx"))
  .sort();

async function mountStory(family: string): Promise<HTMLElement> {
  const mod = storyModules[`../generated/components/${family}.stories.tsx`] as
    | StoryModule
    | undefined;
  if (!mod || typeof mod.Default?.render !== "function") {
    throw new Error(`story module or Default.render missing: ${family}`);
  }
  const element: ReactElement = mod.Default.render();
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  // 不用 act 包裹挂载：Statistic 的 Countdown 演示体带 rAF 连续 tick 循环，act 的
  // 排空循环会被持续到达的更新饿死（实测 40s 不结算）。改为裸 render + 宏任务
  // 等待（React 默认优先级的提交在数 ms 内完成，断言前 DOM 已就绪）。
  root.render(element);
  await new Promise((resolve) => setTimeout(resolve, 50));
  return container;
}

async function clickTrigger(scope: ParentNode): Promise<void> {
  const trigger = scope.querySelector(".studio-demo-trigger");
  if (!(trigger instanceof HTMLElement)) {
    throw new Error("trigger button missing (.studio-demo-trigger)");
  }
  trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  // 服务式 API 的 portal 渲染与触发的 React 根不同源（antd message/notification
  // 自建 portal 根），裸宏任务等待其提交（不依赖 act 排空语义——act 会被
  // Countdown rAF 连续 tick 饿死，见 mountStory 注；此处统一走裸事件 + 等待）。
  await new Promise((resolve) => setTimeout(resolve, 100));
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("studio-react generated stories react-dom mount smoke (audit R2/R3)", () => {
  it("glob denominator is exactly 68 (missing generation fails closed)", () => {
    expect(familyNames.length).toBe(68);
  });

  for (const family of familyNames) {
    it(`${family}: mounts without throw and renders non-empty`, async () => {
      const container = await mountStory(family);
      try {
        expect(container.innerHTML.length).toBeGreaterThan(0);
      } finally {
        container.remove();
      }
    });
  }

  it("Anchor: anchor link and target paragraph both present (R2a)", async () => {
    const container = await mountStory("Anchor");
    try {
      expect(container.textContent).toContain(ANCHOR_TITLE);
      expect(container.textContent).toContain(ANCHOR_TARGET);
    } finally {
      container.remove();
    }
  });

  it("Typography: heading and paragraph text visible (R2b)", async () => {
    const container = await mountStory("Typography");
    try {
      expect(container.textContent).toContain(TYPO_HEADING);
      expect(container.textContent).toContain(TYPO_PARAGRAPH);
    } finally {
      container.remove();
    }
  });

  it("message: body visible after trigger (JointContent string form is legal)", async () => {
    const container = await mountStory("message");
    try {
      await clickTrigger(container);
      const rendered = document.body.querySelector(".ant-message");
      expect(rendered).toBeTruthy();
      expect(rendered?.textContent).toContain(serviceText("message"));
    } finally {
      container.remove();
    }
  });

  it("notification: body visible after trigger (R3 ArgsProps object form)", async () => {
    const container = await mountStory("notification");
    try {
      await clickTrigger(container);
      const notice = document.body.querySelector(".ant-notification-notice-message");
      expect(notice?.textContent).toContain(serviceText("notification"));
    } finally {
      container.remove();
    }
  });
});

describe("R2c root-cause: generation-time unbound JSX root scan (fail-closed)", () => {
  it("unbound capitalized roots are reported (R2a/R2b symptom word forms)", () => {
    expect(
      findUnboundJsxRoots(
        '<Anchor><AnchorLink href="#x" title="y" /></Anchor>',
        new Set(["Anchor"]),
      ),
    ).toEqual(["AnchorLink"]);
    expect(
      findUnboundJsxRoots(
        '<Space direction="vertical"><Typography.Text>x</Typography.Text></Space>',
        new Set(["Typography"]),
      ),
    ).toEqual(["Space"]);
  });

  it("bound roots, compound roots (Anchor.Link) and intrinsic elements are not reported", () => {
    expect(
      findUnboundJsxRoots(
        '<Anchor><Anchor.Link href="#x" title="y" /></Anchor><p id="x">t</p>',
        new Set(["Anchor"]),
      ),
    ).toEqual([]);
    expect(
      findUnboundJsxRoots('<div><button /><span className="s">s</span></div>', new Set()),
    ).toEqual([]);
    expect(findUnboundJsxRoots("<Foo /><Foo><Bar /></Foo>", new Set(["Bar"]))).toEqual([
      "Foo",
    ]);
  });

  it("story binding gate: bound set derived from antd import line, throw when unbound", () => {
    const broken = [
      "import { Anchor } from 'antd';",
      'export const Default: StoryObj = { render: () => (<Anchor><AnchorLink href="#x" title="y" /></Anchor>) };',
    ].join("\n");
    expect(() => assertJsxRootsBound(broken, "Anchor")).toThrow(/AnchorLink/);
    const fixed = [
      "import { Anchor } from 'antd';",
      'export const Default: StoryObj = { render: () => (<Anchor><Anchor.Link href="#x" title="y" /></Anchor>) };',
    ].join("\n");
    expect(() => assertJsxRootsBound(fixed, "Anchor")).not.toThrow();
  });

  it("whole-tree scan wired in generation: all 68 artifacts pass the binding gate", () => {
    const out = mkdtempSync(join(tmpdir(), "pvnext-react-binding-"));
    try {
      const { files } = generateReactStories(out);
      expect(files.length).toBe(68);
      for (const file of files) {
        const text = readFileSync(file, "utf8");
        expect(
          () => assertJsxRootsBound(text, basename(file)),
          `${file} unbound JSX root`,
        ).not.toThrow();
      }
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});

describe("R3 contracts: message/notification service API arg contracts", () => {
  const emptyReverseMap = new Map();

  it("notification story call is ArgsProps object form (message field required)", () => {
    const text = renderReactStory(
      { antdv: "notification", antd: "notification" },
      emptyReverseMap,
    );
    expect(text).toContain("notification.info({ message: ");
    expect(text).not.toMatch(/notification\.info\(\s*['"]/);
    expect(text).toContain("ArgsProps");
  });

  it("message story keeps string form (JointContent legal; contracts not mixed)", () => {
    const text = renderReactStory({ antdv: "message", antd: "message" }, emptyReverseMap);
    expect(text).toContain(`message.info('${serviceText("message")}')`);
    expect(text).not.toContain("message.info({");
    expect(text).toContain("JointContent");
  });

  it("contract table closed over the two service families; unknown family throws", () => {
    expect(Object.keys(SERVICE_API_CONTRACTS).sort()).toEqual(["message", "notification"]);
    expect(() =>
      renderReactStory({ antdv: "modal", antd: "modal" }, emptyReverseMap),
    ).toThrow();
  });
});
