/**
 * bin.ts —— `pomaster` 可执行入口（package.json bin 指向 dist/bin.js）。
 * 仅做 process.argv 转接与退出码落地；全部语义在 ./index.js。
 */
import { runCli } from "./index.js";

const exitCode = await runCli(process.argv.slice(2));
process.exit(exitCode);
