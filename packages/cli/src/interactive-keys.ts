/**
 * interactive-keys.ts —— TTY 交互共用底层：按键词表闭包 + 原地重绘渲染器。
 *
 * R-M 问卷批（2026-09-05）从 init.ts 抽出：init 平台复选清单与 baseline 技术栈
 * 问卷共用同一按键词表与同一 ANSI 重绘出口（单一实现，禁两套词表/两套渲染漂移；
 * 同时避免 init.ts ↔ baseline.ts 的运行时环——两交互器各自单向依赖本文件）。
 *
 * §45 纪律注记：本文件的 ANSI 光标控制序列（\x1b[nA 上移 / \x1b[0K 清行）是全仓
 * 唯一 ANSI 字面出口，且只经 ChecklistIo.write 进入真实终端的 TTY 交互路径；
 * --json 信封与人读完成输出恒零 ANSI（纪律不破）。
 */

/**
 * 清单按键词形闭包（raw 模式字节；测试与生产共用同一词表）。
 * init 平台复选清单与 baseline 技术栈问卷共用；词表外键一律忽略（零状态变化）。
 */
export const CHECKLIST_KEYS = {
  /** ↑ */
  up: "\x1b[A",
  /** ↓ */
  down: "\x1b[B",
  /** 空格（0x20）：切换光标行选中态 */
  toggle: " ",
  /** 回车（\r；\n 亦收）：确认 */
  confirm: "\r",
  /** Ctrl+C：中止（终端恢复后由调用方退出） */
  abort: "\x03",
} as const;

/** 退格（DEL 0x7f）：自由输入缓冲删尾字符（baseline 问卷自定义输入行）。 */
export const INTERACTIVE_BACKSPACE_KEY = "\x7f";

/**
 * 原地重绘序列：光标上移至帧首行首 + 逐行清行重写（ANSI 全仓唯一出口，仅 TTY
 * 交互路径；帧 = 行集快照零 ANSI，重绘包装器才携带控制序列）。
 */
export function redrawFrame(frame: string): string {
  const lines = frame.split("\n");
  return (
    `\x1b[${lines.length - 1}A\r` +
    lines
      .map((line, i) => `\x1b[0K${line}${i < lines.length - 1 ? "\n" : ""}`)
      .join("")
  );
}
