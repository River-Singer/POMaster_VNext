/**
 * fixture-fastapi-project-lib.ts —— FastAPI fixture 工程四件套共享构造器
 * （B3-4 出口判据「与 L2 的 FastAPI fixture 同源共建」的单一来源）。
 *
 * 非 spec 文件（vitest include 只收 spec.ts；ratchet mapping 分母只对 spec 文件
 * 封闭，本文件不入账——fixture-chain-lib.ts 同款纪律）。消费方（此前四件套是
 * 两份逐字拷贝，收敛为本构造器后禁再各写一份——防漂移）：
 * - fixture-fastapi-project.spec.ts（P16 L2 八拍全链 fixture）
 * - performance-contract-legs-e2e.spec.ts（P27 出口判据 E2E）
 *
 * 工程形态：Python FastAPI 后端最小工程（requirements.txt + main.py + pytest.ini +
 * tests/test_main.py），声明依赖但不安装——fixture 验证的是 pomaster 对工程形态的
 * 治理链，不是第三方栈自身构建。
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/**
 * 就地构造 FastAPI 最小工程四件套（内容与 P16 原两份拷贝逐字节同源——收敛合并处；
 * tests/ 目录按需递归创建，两个消费方调用形态一致）。
 */
export function writeFastapiProjectFiles(root: string): void {
  mkdirSync(join(root, "tests"), { recursive: true });
  writeFileSync(
    join(root, "requirements.txt"),
    "fastapi==0.115.6\nuvicorn==0.34.0\npydantic==2.10.4\n",
    "utf8",
  );
  writeFileSync(
    join(root, "main.py"),
    [
      "from fastapi import FastAPI",
      "",
      'app = FastAPI(title="fixture-api")',
      "",
      "",
      "@app.get('/health')",
      "def health() -> dict[str, bool]:",
      "    return {'ok': True}",
      "",
    ].join("\n"),
    "utf8",
  );
  writeFileSync(join(root, "pytest.ini"), "[pytest]\ntestpaths = tests\n", "utf8");
  writeFileSync(
    join(root, "tests", "test_main.py"),
    "def test_health_shape() -> None:\n    assert {'ok': True} == {'ok': True}\n",
    "utf8",
  );
}
