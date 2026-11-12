#!/usr/bin/env node
// 测试用假 MCP 服务（tools-prepare.spec / toolchain.spec）：真进程、真 stdio JSON-RPC，浏览器动作改成
// 用 fetch 取夹具页正文。按参数认身份：带 --executablePath = chrome-devtools，带 --browser = playwright。
// 行为开关读托管根下的 fake-behavior.json（假 npm 把本文件拷到 <root>/node_modules/… 里）：
//   { "fail": "handshake" | "tools" | "browser" | "sandbox" }
//   sandbox = 不带 --chromeArg=--no-sandbox 时 new_page 报 Chrome 沙箱错误。
import { existsSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(import.meta.url);
const root = here.slice(0, here.indexOf(`${sep}node_modules${sep}`));
const behaviorPath = join(root, "fake-behavior.json");
const behavior = existsSync(behaviorPath) ? JSON.parse(readFileSync(behaviorPath, "utf8")) : {};
const kind = process.argv.includes("--executablePath") ? "chrome-devtools" : "playwright";
const noSandbox = process.argv.includes("--chromeArg=--no-sandbox");
const tools =
  kind === "chrome-devtools"
    ? ["new_page", "take_snapshot", "list_pages", "navigate_page"]
    : ["browser_navigate", "browser_snapshot", "browser_close", "browser_click"];
if (behavior.fail === "tools") tools.splice(1, 1);
let page = null;

const send = (message) => process.stdout.write(`${JSON.stringify(message)}\n`);
const text = (value, isError = false) => ({ content: [{ type: "text", text: value }], ...(isError ? { isError: true } : {}) });

async function open(url) {
  const response = await fetch(url);
  const html = await response.text();
  const h1 = /<h1>([^<]*)<\/h1>/.exec(html)?.[1] ?? "";
  const title = /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
  page = { url, h1, title };
}

async function call(name, args) {
  if (behavior.fail === "browser") return text("Error: browser failed to launch", true);
  if (kind === "chrome-devtools") {
    if (name === "new_page") {
      if (behavior.fail === "sandbox" && !noSandbox) return text("Failed to launch the browser process! No usable sandbox! Update your kernel or see …", true);
      await open(args.url);
      return text(`# new_page response\n## Pages\n1: about:blank\n2: ${page.title} (${page.url}) [selected]`);
    }
    if (name === "list_pages") return text(page === null ? "## Pages\n1: about:blank" : `## Pages\n1: about:blank\n2: ${page.title} (${page.url}) [selected]`);
    if (name === "take_snapshot") {
      if (args.pageId !== 2 || page === null) return text(`No page with id ${args.pageId}`, true);
      return text(`# take_snapshot response\nuid=1_0 RootWebArea "${page.title}"\n  uid=1_1 heading "${page.h1}" level="1"`);
    }
  } else {
    if (name === "browser_navigate") {
      await open(args.url);
      return text(`### Page\n- Page URL: ${page.url}\n- Page Title: ${page.title}`);
    }
    if (name === "browser_snapshot") return text(page === null ? "about:blank" : `- heading "${page.h1}" [level=1] [ref=e2]`);
    if (name === "browser_close") return text("closed");
  }
  return text(`unknown tool ${name}`, true);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  for (let newline = buffer.indexOf("\n"); newline >= 0; newline = buffer.indexOf("\n")) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (line !== "") void handle(JSON.parse(line));
  }
});
process.stdin.on("end", () => process.exit(0));
process.stdout.write("fake-mcp: 非 JSON 的日志行，客户端应忽略\n");

async function handle(message) {
  if (message.id === undefined) return;
  if (message.method === "initialize") {
    if (behavior.fail === "handshake") process.exit(3);
    send({ jsonrpc: "2.0", id: message.id, result: { protocolVersion: message.params.protocolVersion, capabilities: { tools: {} }, serverInfo: { name: `fake-${kind}`, version: "0.0.0" } } });
    send({ jsonrpc: "2.0", id: 999, method: "ping" }); // 服务端发起的请求，客户端要回
    return;
  }
  if (message.method === "tools/list") {
    send({ jsonrpc: "2.0", id: message.id, result: { tools: tools.map((name) => ({ name, inputSchema: { type: "object" } })) } });
    return;
  }
  if (message.method === "tools/call") {
    send({ jsonrpc: "2.0", id: message.id, result: await call(message.params.name, message.params.arguments ?? {}) });
    return;
  }
  send({ jsonrpc: "2.0", id: message.id, error: { code: -32601, message: `unknown ${message.method}` } });
}
