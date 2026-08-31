# THIRD_PARTY_NOTICES — POMaster vNext 第三方依赖事实清单

> 状态：**事实整理件（呈报材料）**，非法律意见，不是 License Decision Gate 的裁定。
> PRD 依据：§87.3 / §87.5 / §87.6。Owner 签字位见本文末节与 `docs/license-draft-polyform.md`（Owner-local，不入库）。
>
> **许可策略声明（占位）**：本仓库预期的许可路线是 PRD §87.3 默认推荐——PolyForm Noncommercial 1.0.0 + 单独商业授权（Source-Available 双许可）。该路线**尚未经 §87.5 License Decision Gate 裁定**，本文件不含任何 Owner 选型签字。正式 `LICENSE` 文件尚未落盘（final-acceptance #6），落盘前本清单仅作事实底账。

## 0. 锚点与口径

- **版本锚**：本清单以仓库内 `pnpm-lock.yaml`（lockfileVersion 9.0）为唯一锚点；该 lockfile 最后变更于 commit `bbb41f05aaa4b6c27e5a78b1227675e30b702492`，截至本清单编制时的仓库 HEAD `d144364` 未再变更。本清单不写墙钟生成日期——刷新口径 = 「以 pnpm-lock.yaml 对应 commit 为锚」。
- **依赖面**：lockfile `packages:` 节共 **204 个第三方包**，按用途拆两节：
  - **§A 运行时依赖**（`packages/*/package.json` `dependencies` 的非 workspace 传递闭包）：**6 个**。
  - **§B 开发工具链依赖**（vitest / eslint / typescript / typescript-eslint / @types/node / ajv-formats / js-yaml 及其传递闭包）：**198 个**。
  - **分发口径 pending**：对外分发时 §A 必然构成第三方 notice 义务；§B 是否随分发触发 notice 义务取决于分发形态（源码仓库分发 / 产物分发），归 License Decision Gate 裁定。两节都先列全。
- **事实源方法**：对 lockfile 内每个包，在本机 `node_modules/.pnpm/` 实际打开其 LICENSE 文件核对 license id（不凭记忆）。未在本机安装的 47 个平台二进制/可选包按证据等级 B3/B4 显式标注，绝不混充本地核对。
- **证据等级**：
  - **B1** = 本地打开包内 LICENSE 文件，文件正文与 license id 一致。
  - **B2** = 包内无 LICENSE 文件；license id 取自该包 `package.json` 的 `license` 字段（README 佐证逐包注明）。
  - **B3** = 平台二进制包未在本机（win32-x64）安装；license id 按同族已安装成员核对结果外推（esbuild 家族锚点 `@esbuild/win32-x64@0.21.5`、rollup 家族锚点 `@rollup/rollup-win32-x64-{gnu,msvc}@4.63.0`；两家族主包 LICENSE.md 均声明覆盖全部平台包）。**非本地逐个打开。**
  - **B4** = 未安装且无同族锚点；license id 取自 npm registry 元数据（`@napi-rs/lzma-linux-x64-gnu@1.5.1`、`fsevents@2.3.3` 均为 MIT）。**非本地文件核对。**

### license id 分布（204 包）

| id | 数量 | 标注 |
|---|---|---|
| MIT | 116 | B1 本地核对 |
| MIT（平台包家族外推）* | 45 | B3 |
| MIT（registry 元数据）** | 2 | B4 |
| MIT（无 LICENSE 文件）† | 7 | B2 |
| Apache-2.0 | 14 | B1 |
| Apache-2.0（无 LICENSE 文件）† | 1（@humanfs/types） | B2 |
| ISC | 8 | B1 |
| BSD-2-Clause | 5 | B1 |
| BSD-2-Clause（无 LICENSE 文件）† | 1（esrecurse） | B2 |
| BSD-3-Clause | 3 | B1 |
| Python-2.0 | 1（argparse） | B1，见 §2 注记 |
| BlueOak-1.0.0 | 1（minimatch@10.2.6） | B1，见 §2 注记 |

**净事实**：本仓库依赖树（§A+§B）中**未检出任何 copyleft 家族许可证**（GPL/LGPL/AGPL/MPL/SSPL/EPL 零命中）；全部为宽松许可（MIT / ISC / BSD / Apache-2.0 / BlueOak-1.0.0 / Python-2.0）。MIT/ISC/BSD/Apache 均要求保留版权与许可声明——本文件即该 notice 义务的载体。

## §A 运行时依赖（6 包）

构成：`@pomaster/kernel` → ajv；`@pomaster/cli` → commander（无传递依赖）；ajv@8.20.0 → fast-deep-equal / fast-uri / json-schema-traverse / require-from-string。`@pomaster/schemas`、`@pomaster/gauntlet-lite` 无第三方运行时依赖。

| 包名 | 版本 | license id | license 源文件路径（本仓库 node_modules 内） | 证据 |
|---|---|---|---|---|

| ajv | 8.20.0 | MIT | node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/LICENSE | B1 |
| commander | 14.0.3 | MIT | node_modules/.pnpm/commander@14.0.3/node_modules/commander/LICENSE | B1 |
| fast-deep-equal | 3.1.3 | MIT | node_modules/.pnpm/fast-deep-equal@3.1.3/node_modules/fast-deep-equal/LICENSE | B1 |
| fast-uri | 3.1.6 | BSD-3-Clause | node_modules/.pnpm/fast-uri@3.1.6/node_modules/fast-uri/LICENSE | B1 |
| json-schema-traverse | 1.0.0 | MIT | node_modules/.pnpm/json-schema-traverse@1.0.0/node_modules/json-schema-traverse/LICENSE | B1 |
| require-from-string | 2.0.2 | MIT | node_modules/.pnpm/require-from-string@2.0.2/node_modules/require-from-string/license | B1 |


## §B 开发工具链依赖（198 包）

构成：vitest@2.1.9 树（含 vite@5.4.21 / rollup@4.63.0 / esbuild@0.21.5 及其平台二进制）、eslint@9.39.5 树、typescript@5.9.3、typescript-eslint@8.68.0 树、@types/node@22.20.1、ajv-formats@3.0.1、js-yaml@4.3.2、ajv@6.15.0（eslint 侧）等传递闭包。`ajv-formats` 与 `js-yaml` 仅被 tests/scripts 引用（源码 grep 确认不进 `packages/*/src` 运行时路径）。

| 包名 | 版本 | license id | license 源文件路径 | 证据 |
|---|---|---|---|---|

| @esbuild/aix-ppc64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/android-arm | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/android-arm64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/android-x64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/darwin-arm64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/darwin-x64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/freebsd-arm64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/freebsd-x64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-arm | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-arm64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-ia32 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-loong64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-mips64el | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-ppc64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-riscv64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-s390x | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-x64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/netbsd-x64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/openbsd-x64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/sunos-x64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/win32-arm64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/win32-ia32 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/win32-x64 | 0.21.5 | MIT† | （包内无 LICENSE 文件） | B2 |
| @eslint-community/eslint-utils | 4.10.1 | MIT | node_modules/.pnpm/@eslint-community+eslint-utils@4.10.1_eslint@9.39.5/node_modules/@eslint-community/eslint-utils/LICENSE | B1 |
| @eslint-community/regexpp | 4.12.2 | MIT | node_modules/.pnpm/@eslint-community+regexpp@4.12.2/node_modules/@eslint-community/regexpp/LICENSE | B1 |
| @eslint/config-array | 0.21.2 | Apache-2.0 | node_modules/.pnpm/@eslint+config-array@0.21.2/node_modules/@eslint/config-array/LICENSE | B1 |
| @eslint/config-helpers | 0.4.2 | Apache-2.0 | node_modules/.pnpm/@eslint+config-helpers@0.4.2/node_modules/@eslint/config-helpers/LICENSE | B1 |
| @eslint/core | 0.17.0 | Apache-2.0 | node_modules/.pnpm/@eslint+core@0.17.0/node_modules/@eslint/core/LICENSE | B1 |
| @eslint/eslintrc | 3.3.6 | MIT | node_modules/.pnpm/@eslint+eslintrc@3.3.6/node_modules/@eslint/eslintrc/LICENSE | B1 |
| @eslint/js | 9.39.5 | MIT | node_modules/.pnpm/@eslint+js@9.39.5/node_modules/@eslint/js/LICENSE | B1 |
| @eslint/object-schema | 2.1.7 | Apache-2.0 | node_modules/.pnpm/@eslint+object-schema@2.1.7/node_modules/@eslint/object-schema/LICENSE | B1 |
| @eslint/plugin-kit | 0.4.1 | Apache-2.0 | node_modules/.pnpm/@eslint+plugin-kit@0.4.1/node_modules/@eslint/plugin-kit/LICENSE | B1 |
| @humanfs/core | 0.19.2 | Apache-2.0 | node_modules/.pnpm/@humanfs+core@0.19.2/node_modules/@humanfs/core/LICENSE | B1 |
| @humanfs/node | 0.16.8 | Apache-2.0 | node_modules/.pnpm/@humanfs+node@0.16.8/node_modules/@humanfs/node/LICENSE | B1 |
| @humanfs/types | 0.15.0 | Apache-2.0† | （包内无 LICENSE 文件） | B2 |
| @humanwhocodes/module-importer | 1.0.1 | Apache-2.0 | node_modules/.pnpm/@humanwhocodes+module-importer@1.0.1/node_modules/@humanwhocodes/module-importer/LICENSE | B1 |
| @humanwhocodes/retry | 0.4.3 | Apache-2.0 | node_modules/.pnpm/@humanwhocodes+retry@0.4.3/node_modules/@humanwhocodes/retry/LICENSE | B1 |
| @jridgewell/sourcemap-codec | 1.5.5 | MIT | node_modules/.pnpm/@jridgewell+sourcemap-codec@1.5.5/node_modules/@jridgewell/sourcemap-codec/LICENSE | B1 |
| @napi-rs/lzma-linux-x64-gnu | 1.5.1 | MIT** | (未安装) | B4 |
| @rollup/rollup-android-arm-eabi | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-android-arm64 | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-darwin-arm64 | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-darwin-x64 | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-freebsd-arm64 | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-freebsd-x64 | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-linux-arm-gnueabihf | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-linux-arm-musleabihf | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-linux-arm64-gnu | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-linux-arm64-musl | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-linux-loong64-gnu | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-linux-loong64-musl | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-linux-ppc64-gnu | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-linux-ppc64-musl | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-linux-riscv64-gnu | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-linux-riscv64-musl | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-linux-s390x-gnu | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-linux-x64-gnu | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-linux-x64-musl | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-openbsd-x64 | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-openharmony-arm64 | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-win32-arm64-msvc | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-win32-ia32-msvc | 4.63.0 | MIT* | (未安装) | B3 |
| @rollup/rollup-win32-x64-gnu | 4.63.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| @rollup/rollup-win32-x64-msvc | 4.63.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| @types/estree | 1.0.9 | MIT | node_modules/.pnpm/@types+estree@1.0.9/node_modules/@types/estree/LICENSE | B1 |
| @types/json-schema | 7.0.15 | MIT | node_modules/.pnpm/@types+json-schema@7.0.15/node_modules/@types/json-schema/LICENSE | B1 |
| @types/node | 22.20.1 | MIT | node_modules/.pnpm/@types+node@22.20.1/node_modules/@types/node/LICENSE | B1 |
| @typescript-eslint/eslint-plugin | 8.68.0 | MIT | node_modules/.pnpm/@typescript-eslint+eslint-plugin@8.68.0_@typescript-eslint+parser@8.68.0_eslint@9.39.5_typesc_xrzdpqnaxc7i73xaavdcoxmsay/node_modules/@typescript-eslint/eslint-plugin/LICENSE | B1 |
| @typescript-eslint/parser | 8.68.0 | MIT | node_modules/.pnpm/@typescript-eslint+parser@8.68.0_eslint@9.39.5_typescript@5.9.3/node_modules/@typescript-eslint/parser/LICENSE | B1 |
| @typescript-eslint/project-service | 8.68.0 | MIT | node_modules/.pnpm/@typescript-eslint+project-service@8.68.0_typescript@5.9.3/node_modules/@typescript-eslint/project-service/LICENSE | B1 |
| @typescript-eslint/scope-manager | 8.68.0 | MIT | node_modules/.pnpm/@typescript-eslint+scope-manager@8.68.0/node_modules/@typescript-eslint/scope-manager/LICENSE | B1 |
| @typescript-eslint/tsconfig-utils | 8.68.0 | MIT | node_modules/.pnpm/@typescript-eslint+tsconfig-utils@8.68.0_typescript@5.9.3/node_modules/@typescript-eslint/tsconfig-utils/LICENSE | B1 |
| @typescript-eslint/type-utils | 8.68.0 | MIT | node_modules/.pnpm/@typescript-eslint+type-utils@8.68.0_eslint@9.39.5_typescript@5.9.3/node_modules/@typescript-eslint/type-utils/LICENSE | B1 |
| @typescript-eslint/types | 8.68.0 | MIT | node_modules/.pnpm/@typescript-eslint+types@8.68.0/node_modules/@typescript-eslint/types/LICENSE | B1 |
| @typescript-eslint/typescript-estree | 8.68.0 | MIT | node_modules/.pnpm/@typescript-eslint+typescript-estree@8.68.0_typescript@5.9.3/node_modules/@typescript-eslint/typescript-estree/LICENSE | B1 |
| @typescript-eslint/utils | 8.68.0 | MIT | node_modules/.pnpm/@typescript-eslint+utils@8.68.0_eslint@9.39.5_typescript@5.9.3/node_modules/@typescript-eslint/utils/LICENSE | B1 |
| @typescript-eslint/visitor-keys | 8.68.0 | MIT | node_modules/.pnpm/@typescript-eslint+visitor-keys@8.68.0/node_modules/@typescript-eslint/visitor-keys/LICENSE | B1 |
| @vitest/expect | 2.1.9 | MIT | node_modules/.pnpm/@vitest+expect@2.1.9/node_modules/@vitest/expect/LICENSE | B1 |
| @vitest/mocker | 2.1.9 | MIT | node_modules/.pnpm/@vitest+mocker@2.1.9_vite@5.4.21_@types+node@22.20.1_/node_modules/@vitest/mocker/LICENSE | B1 |
| @vitest/pretty-format | 2.1.9 | MIT | node_modules/.pnpm/@vitest+pretty-format@2.1.9/node_modules/@vitest/pretty-format/LICENSE | B1 |
| @vitest/runner | 2.1.9 | MIT | node_modules/.pnpm/@vitest+runner@2.1.9/node_modules/@vitest/runner/LICENSE | B1 |
| @vitest/snapshot | 2.1.9 | MIT | node_modules/.pnpm/@vitest+snapshot@2.1.9/node_modules/@vitest/snapshot/LICENSE | B1 |
| @vitest/spy | 2.1.9 | MIT | node_modules/.pnpm/@vitest+spy@2.1.9/node_modules/@vitest/spy/LICENSE | B1 |
| @vitest/utils | 2.1.9 | MIT | node_modules/.pnpm/@vitest+utils@2.1.9/node_modules/@vitest/utils/LICENSE | B1 |
| acorn | 8.18.0 | MIT | node_modules/.pnpm/acorn@8.18.0/node_modules/acorn/LICENSE | B1 |
| acorn-jsx | 5.3.2 | MIT | node_modules/.pnpm/acorn-jsx@5.3.2_acorn@8.18.0/node_modules/acorn-jsx/LICENSE | B1 |
| ajv | 6.15.0 | MIT | node_modules/.pnpm/ajv@6.15.0/node_modules/ajv/LICENSE | B1 |
| ajv-formats | 3.0.1 | MIT | node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.20.0/node_modules/ajv-formats/LICENSE | B1 |
| ansi-styles | 4.3.0 | MIT | node_modules/.pnpm/ansi-styles@4.3.0/node_modules/ansi-styles/license | B1 |
| argparse | 2.0.1 | Python-2.0 | node_modules/.pnpm/argparse@2.0.1/node_modules/argparse/LICENSE | B1 |
| assertion-error | 2.0.1 | MIT | node_modules/.pnpm/assertion-error@2.0.1/node_modules/assertion-error/LICENSE | B1 |
| balanced-match | 1.0.2 | MIT | node_modules/.pnpm/balanced-match@1.0.2/node_modules/balanced-match/LICENSE.md | B1 |
| balanced-match | 4.0.4 | MIT | node_modules/.pnpm/balanced-match@4.0.4/node_modules/balanced-match/LICENSE.md | B1 |
| brace-expansion | 1.1.18 | MIT | node_modules/.pnpm/brace-expansion@1.1.18/node_modules/brace-expansion/LICENSE | B1 |
| brace-expansion | 5.0.9 | MIT | node_modules/.pnpm/brace-expansion@5.0.9/node_modules/brace-expansion/LICENSE | B1 |
| cac | 6.7.14 | MIT | node_modules/.pnpm/cac@6.7.14/node_modules/cac/LICENSE | B1 |
| callsites | 3.1.0 | MIT | node_modules/.pnpm/callsites@3.1.0/node_modules/callsites/license | B1 |
| chai | 5.3.3 | MIT | node_modules/.pnpm/chai@5.3.3/node_modules/chai/LICENSE | B1 |
| chalk | 4.1.2 | MIT | node_modules/.pnpm/chalk@4.1.2/node_modules/chalk/license | B1 |
| check-error | 2.1.3 | MIT | node_modules/.pnpm/check-error@2.1.3/node_modules/check-error/LICENSE | B1 |
| color-convert | 2.0.1 | MIT | node_modules/.pnpm/color-convert@2.0.1/node_modules/color-convert/LICENSE | B1 |
| color-name | 1.1.4 | MIT | node_modules/.pnpm/color-name@1.1.4/node_modules/color-name/LICENSE | B1 |
| concat-map | 0.0.1 | MIT | node_modules/.pnpm/concat-map@0.0.1/node_modules/concat-map/LICENSE | B1 |
| cross-spawn | 7.0.6 | MIT | node_modules/.pnpm/cross-spawn@7.0.6/node_modules/cross-spawn/LICENSE | B1 |
| debug | 4.4.3 | MIT | node_modules/.pnpm/debug@4.4.3/node_modules/debug/LICENSE | B1 |
| deep-eql | 5.0.2 | MIT | node_modules/.pnpm/deep-eql@5.0.2/node_modules/deep-eql/LICENSE | B1 |
| deep-is | 0.1.4 | MIT | node_modules/.pnpm/deep-is@0.1.4/node_modules/deep-is/LICENSE | B1 |
| es-module-lexer | 1.7.0 | MIT | node_modules/.pnpm/es-module-lexer@1.7.0/node_modules/es-module-lexer/LICENSE | B1 |
| esbuild | 0.21.5 | MIT | node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild/LICENSE.md | B1 |
| escape-string-regexp | 4.0.0 | MIT | node_modules/.pnpm/escape-string-regexp@4.0.0/node_modules/escape-string-regexp/license | B1 |
| eslint | 9.39.5 | MIT | node_modules/.pnpm/eslint@9.39.5/node_modules/eslint/LICENSE | B1 |
| eslint-scope | 8.4.0 | BSD-2-Clause | node_modules/.pnpm/eslint-scope@8.4.0/node_modules/eslint-scope/LICENSE | B1 |
| eslint-visitor-keys | 3.4.3 | Apache-2.0 | node_modules/.pnpm/eslint-visitor-keys@3.4.3/node_modules/eslint-visitor-keys/LICENSE | B1 |
| eslint-visitor-keys | 4.2.1 | Apache-2.0 | node_modules/.pnpm/eslint-visitor-keys@4.2.1/node_modules/eslint-visitor-keys/LICENSE | B1 |
| eslint-visitor-keys | 5.0.1 | Apache-2.0 | node_modules/.pnpm/eslint-visitor-keys@5.0.1/node_modules/eslint-visitor-keys/LICENSE | B1 |
| espree | 10.4.0 | BSD-2-Clause | node_modules/.pnpm/espree@10.4.0/node_modules/espree/LICENSE | B1 |
| esquery | 1.7.0 | BSD-3-Clause | node_modules/.pnpm/esquery@1.7.0/node_modules/esquery/license.txt | B1 |
| esrecurse | 4.3.0 | BSD-2-Clause† | （包内无 LICENSE 文件） | B2 |
| estraverse | 5.3.0 | BSD-2-Clause | node_modules/.pnpm/estraverse@5.3.0/node_modules/estraverse/LICENSE.BSD | B1 |
| estree-walker | 3.0.3 | MIT | node_modules/.pnpm/estree-walker@3.0.3/node_modules/estree-walker/LICENSE | B1 |
| esutils | 2.0.3 | BSD-2-Clause | node_modules/.pnpm/esutils@2.0.3/node_modules/esutils/LICENSE.BSD | B1 |
| expect-type | 1.4.0 | Apache-2.0 | node_modules/.pnpm/expect-type@1.4.0/node_modules/expect-type/LICENSE | B1 |
| fast-json-stable-stringify | 2.1.0 | MIT | node_modules/.pnpm/fast-json-stable-stringify@2.1.0/node_modules/fast-json-stable-stringify/LICENSE | B1 |
| fast-levenshtein | 2.0.6 | MIT | node_modules/.pnpm/fast-levenshtein@2.0.6/node_modules/fast-levenshtein/LICENSE.md | B1 |
| fdir | 6.5.0 | MIT | node_modules/.pnpm/fdir@6.5.0_picomatch@4.0.7/node_modules/fdir/LICENSE | B1 |
| file-entry-cache | 8.0.0 | MIT | node_modules/.pnpm/file-entry-cache@8.0.0/node_modules/file-entry-cache/LICENSE | B1 |
| find-up | 5.0.0 | MIT | node_modules/.pnpm/find-up@5.0.0/node_modules/find-up/license | B1 |
| flat-cache | 4.0.1 | MIT | node_modules/.pnpm/flat-cache@4.0.1/node_modules/flat-cache/LICENSE | B1 |
| flatted | 3.4.4 | ISC | node_modules/.pnpm/flatted@3.4.4/node_modules/flatted/LICENSE | B1 |
| fsevents | 2.3.3 | MIT** | (未安装) | B4 |
| glob-parent | 6.0.2 | ISC | node_modules/.pnpm/glob-parent@6.0.2/node_modules/glob-parent/LICENSE | B1 |
| globals | 14.0.0 | MIT | node_modules/.pnpm/globals@14.0.0/node_modules/globals/license | B1 |
| has-flag | 4.0.0 | MIT | node_modules/.pnpm/has-flag@4.0.0/node_modules/has-flag/license | B1 |
| ignore | 5.3.2 | MIT | node_modules/.pnpm/ignore@5.3.2/node_modules/ignore/LICENSE-MIT | B1 |
| ignore | 7.0.6 | MIT | node_modules/.pnpm/ignore@7.0.6/node_modules/ignore/LICENSE-MIT | B1 |
| import-fresh | 3.3.1 | MIT | node_modules/.pnpm/import-fresh@3.3.1/node_modules/import-fresh/license | B1 |
| imurmurhash | 0.1.4 | MIT† | （包内无 LICENSE 文件） | B2 |
| is-extglob | 2.1.1 | MIT | node_modules/.pnpm/is-extglob@2.1.1/node_modules/is-extglob/LICENSE | B1 |
| is-glob | 4.0.3 | MIT | node_modules/.pnpm/is-glob@4.0.3/node_modules/is-glob/LICENSE | B1 |
| isexe | 2.0.0 | ISC | node_modules/.pnpm/isexe@2.0.0/node_modules/isexe/LICENSE | B1 |
| js-yaml | 4.3.2 | MIT | node_modules/.pnpm/js-yaml@4.3.2/node_modules/js-yaml/LICENSE | B1 |
| json-buffer | 3.0.1 | MIT | node_modules/.pnpm/json-buffer@3.0.1/node_modules/json-buffer/LICENSE | B1 |
| json-schema-traverse | 0.4.1 | MIT | node_modules/.pnpm/json-schema-traverse@0.4.1/node_modules/json-schema-traverse/LICENSE | B1 |
| json-stable-stringify-without-jsonify | 1.0.1 | MIT | node_modules/.pnpm/json-stable-stringify-without-jsonify@1.0.1/node_modules/json-stable-stringify-without-jsonify/LICENSE | B1 |
| keyv | 4.5.4 | MIT† | （包内无 LICENSE 文件） | B2 |
| levn | 0.4.1 | MIT | node_modules/.pnpm/levn@0.4.1/node_modules/levn/LICENSE | B1 |
| locate-path | 6.0.0 | MIT | node_modules/.pnpm/locate-path@6.0.0/node_modules/locate-path/license | B1 |
| lodash.merge | 4.6.2 | MIT | node_modules/.pnpm/lodash.merge@4.6.2/node_modules/lodash.merge/LICENSE | B1 |
| loupe | 3.2.1 | MIT | node_modules/.pnpm/loupe@3.2.1/node_modules/loupe/LICENSE | B1 |
| magic-string | 0.30.21 | MIT | node_modules/.pnpm/magic-string@0.30.21/node_modules/magic-string/LICENSE | B1 |
| minimatch | 10.2.6 | BlueOak-1.0.0 | node_modules/.pnpm/minimatch@10.2.6/node_modules/minimatch/LICENSE.md | B1 |
| minimatch | 3.1.5 | ISC | node_modules/.pnpm/minimatch@3.1.5/node_modules/minimatch/LICENSE | B1 |
| ms | 2.1.3 | MIT | node_modules/.pnpm/ms@2.1.3/node_modules/ms/license.md | B1 |
| nanoid | 3.3.18 | MIT | node_modules/.pnpm/nanoid@3.3.18/node_modules/nanoid/LICENSE | B1 |
| natural-compare | 1.4.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| optionator | 0.9.4 | MIT | node_modules/.pnpm/optionator@0.9.4/node_modules/optionator/LICENSE | B1 |
| p-limit | 3.1.0 | MIT | node_modules/.pnpm/p-limit@3.1.0/node_modules/p-limit/license | B1 |
| p-locate | 5.0.0 | MIT | node_modules/.pnpm/p-locate@5.0.0/node_modules/p-locate/license | B1 |
| parent-module | 1.0.1 | MIT | node_modules/.pnpm/parent-module@1.0.1/node_modules/parent-module/license | B1 |
| path-exists | 4.0.0 | MIT | node_modules/.pnpm/path-exists@4.0.0/node_modules/path-exists/license | B1 |
| path-key | 3.1.1 | MIT | node_modules/.pnpm/path-key@3.1.1/node_modules/path-key/license | B1 |
| pathe | 1.1.2 | MIT | node_modules/.pnpm/pathe@1.1.2/node_modules/pathe/LICENSE | B1 |
| pathval | 2.0.1 | MIT | node_modules/.pnpm/pathval@2.0.1/node_modules/pathval/LICENSE | B1 |
| picocolors | 1.1.1 | ISC | node_modules/.pnpm/picocolors@1.1.1/node_modules/picocolors/LICENSE | B1 |
| picomatch | 4.0.7 | MIT | node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/LICENSE | B1 |
| postcss | 8.5.26 | MIT | node_modules/.pnpm/postcss@8.5.26/node_modules/postcss/LICENSE | B1 |
| prelude-ls | 1.2.1 | MIT | node_modules/.pnpm/prelude-ls@1.2.1/node_modules/prelude-ls/LICENSE | B1 |
| punycode | 2.3.1 | MIT | node_modules/.pnpm/punycode@2.3.1/node_modules/punycode/LICENSE-MIT.txt | B1 |
| resolve-from | 4.0.0 | MIT | node_modules/.pnpm/resolve-from@4.0.0/node_modules/resolve-from/license | B1 |
| rollup | 4.63.0 | MIT | node_modules/.pnpm/rollup@4.63.0/node_modules/rollup/LICENSE.md | B1 |
| semver | 7.8.5 | ISC | node_modules/.pnpm/semver@7.8.5/node_modules/semver/LICENSE | B1 |
| shebang-command | 2.0.0 | MIT | node_modules/.pnpm/shebang-command@2.0.0/node_modules/shebang-command/license | B1 |
| shebang-regex | 3.0.0 | MIT | node_modules/.pnpm/shebang-regex@3.0.0/node_modules/shebang-regex/license | B1 |
| siginfo | 2.0.0 | ISC | node_modules/.pnpm/siginfo@2.0.0/node_modules/siginfo/LICENSE | B1 |
| source-map-js | 1.2.1 | BSD-3-Clause | node_modules/.pnpm/source-map-js@1.2.1/node_modules/source-map-js/LICENSE | B1 |
| stackback | 0.0.2 | MIT† | （包内无 LICENSE 文件） | B2 |
| std-env | 3.10.0 | MIT | node_modules/.pnpm/std-env@3.10.0/node_modules/std-env/LICENCE | B1 |
| strip-json-comments | 3.1.1 | MIT | node_modules/.pnpm/strip-json-comments@3.1.1/node_modules/strip-json-comments/license | B1 |
| supports-color | 7.2.0 | MIT | node_modules/.pnpm/supports-color@7.2.0/node_modules/supports-color/license | B1 |
| tinybench | 2.9.0 | MIT | node_modules/.pnpm/tinybench@2.9.0/node_modules/tinybench/LICENSE | B1 |
| tinyexec | 0.3.2 | MIT | node_modules/.pnpm/tinyexec@0.3.2/node_modules/tinyexec/LICENSE | B1 |
| tinyglobby | 0.2.17 | MIT | node_modules/.pnpm/tinyglobby@0.2.17/node_modules/tinyglobby/LICENSE | B1 |
| tinypool | 1.1.1 | MIT | node_modules/.pnpm/tinypool@1.1.1/node_modules/tinypool/LICENSE | B1 |
| tinyrainbow | 1.2.0 | MIT | node_modules/.pnpm/tinyrainbow@1.2.0/node_modules/tinyrainbow/LICENCE | B1 |
| tinyspy | 3.0.2 | MIT | node_modules/.pnpm/tinyspy@3.0.2/node_modules/tinyspy/LICENCE | B1 |
| ts-api-utils | 2.5.0 | MIT | node_modules/.pnpm/ts-api-utils@2.5.0_typescript@5.9.3/node_modules/ts-api-utils/LICENSE.md | B1 |
| type-check | 0.4.0 | MIT | node_modules/.pnpm/type-check@0.4.0/node_modules/type-check/LICENSE | B1 |
| typescript | 5.9.3 | Apache-2.0 | node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/LICENSE.txt | B1 |
| typescript-eslint | 8.68.0 | MIT | node_modules/.pnpm/typescript-eslint@8.68.0_eslint@9.39.5_typescript@5.9.3/node_modules/typescript-eslint/LICENSE | B1 |
| undici-types | 6.21.0 | MIT | node_modules/.pnpm/undici-types@6.21.0/node_modules/undici-types/LICENSE | B1 |
| uri-js | 4.4.1 | BSD-2-Clause | node_modules/.pnpm/uri-js@4.4.1/node_modules/uri-js/LICENSE | B1 |
| vite | 5.4.21 | MIT | node_modules/.pnpm/vite@5.4.21_@types+node@22.20.1/node_modules/vite/LICENSE.md | B1 |
| vite-node | 2.1.9 | MIT | node_modules/.pnpm/vite-node@2.1.9_@types+node@22.20.1/node_modules/vite-node/LICENSE | B1 |
| vitest | 2.1.9 | MIT | node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.1/node_modules/vitest/LICENSE.md | B1 |
| which | 2.0.2 | ISC | node_modules/.pnpm/which@2.0.2/node_modules/which/LICENSE | B1 |
| why-is-node-running | 2.3.0 | MIT | node_modules/.pnpm/why-is-node-running@2.3.0/node_modules/why-is-node-running/LICENSE | B1 |
| word-wrap | 1.2.5 | MIT | node_modules/.pnpm/word-wrap@1.2.5/node_modules/word-wrap/LICENSE | B1 |
| yocto-queue | 0.1.0 | MIT | node_modules/.pnpm/yocto-queue@0.1.0/node_modules/yocto-queue/license | B1 |


## §2 特殊条目注记

1. **argparse@2.0.1 — Python-2.0**：js-yaml@4.3.2 的依赖（仅 dev 侧）。包内 LICENSE 文件为 Python Software Foundation 许可证全文（含历史说明），与 `Python-2.0` SPDX id 一致（B1）。
2. **minimatch@10.2.6 — BlueOak-1.0.0**：`@typescript-eslint/typescript-estree@8.68.0` 的依赖。Blue Oak Model License 1.0.0 为现代宽松许可证（非 MIT/BSD/Apache 家族），包内 LICENSE.md 全文核对一致（B1）。分发 notice 建议原文保留。
3. **@pkgjs/parseargs 双源不一致（不在本 lockfile 内，仅记录）**：本机 node_modules 残留的 `@pkgjs/parseargs@0.11.0`（c8 树残留，见 §3）package.json 声明 MIT 但包内 LICENSE 文件为 Apache-2.0 全文。该包**不属于本 lockfile 依赖面**，但作为上游双源不一致样本记录在案；若未来进入依赖面需 Owner/上游确认。
4. **`require-from-string@2.0.2` 与多个 sindresorhus 系包的 license 文件名为小写 `license`**：属文件名大小写差异，内容均为对应 license id 全文（B1）。

## §3 node_modules 与 lockfile 漂移（审计发现）

本机 `node_modules/.pnpm` 存在 **46 个不属于当前 pnpm-lock.yaml 的残留包**（c8@10.1.3 / istanbul 系 / yargs 系 / glob@10 树等）。溯源：安装时点 lock 副本（`node_modules/.pnpm/lock.yaml`）含已删除的 workspace importer `docs/audit-fx`（devDeps: c8+vitest）；该 importer 移除后 lockfile 收敛，但 node_modules 未重装。残留包 license id 见文末附录表。**建议**：Owner 执行一次干净重装（删 `node_modules` + `pnpm install`）使本机安装面与 lockfile 对齐；本清单以 lockfile 为准，不受漂移影响。

## §4 Owner 签字位（License Decision Gate §87.5 相关）

- [ ] **O-L1 许可路线裁定**：是否采纳 PRD §87.3 默认推荐（PolyForm Noncommercial 1.0.0 + 单独 Commercial License）作为对外分发许可？（备选：§87.4 表中 AGPL-3.0 / PolyForm Internal Use / PolyForm Small Business / BSL 1.1 / 自定义 EULA）
- [ ] **O-L2 分发口径**：对外分发形态是「源码仓库可见」还是「产物分发」？§B 开发工具链依赖是否进入分发物（决定 THIRD_PARTY_NOTICES 对外版本的收录范围）？
- [ ] **O-L3 §87.5 yaml 两个显式 Owner 位**：`free_internal_business_use`（企业内部商用是否免费）与 `free_small_business_use`（小企业商用是否免费）——PRD 显式标注「必须由 Owner 决定」，Agent 不得代填。
- [ ] **O-L4 正式 LICENSE 落盘**：裁定后按 §87.6 要求落盘官方标准文本 LICENSE（PolyForm 全文不魔改）+ COMMERCIAL_LICENSE.md / TRADEMARKS.md / CONTRIBUTING.md / SECURITY.md 等其余法律文件清单。
- [ ] **O-L5 node_modules 漂移处置**：是否授权执行干净重装以消除 §3 的 46 包残留？

---
*本文件为事实整理，不构成法律意见；正式公开发布或商业授权前应由熟悉开源/软件许可的法律专业人士复核（PRD §87 章首声明）。*

## 附录：node_modules 残留包（46 个，不在本 lockfile 依赖面）

| 包名@版本 | license id | license 源文件路径 |
|---|---|---|

| @bcoe/v8-coverage@1.0.2 | MIT | node_modules/.pnpm/@bcoe+v8-coverage@1.0.2/node_modules/@bcoe/v8-coverage/LICENSE.md |
| @isaacs/cliui@8.0.2 | ISC | node_modules/.pnpm/@isaacs+cliui@8.0.2/node_modules/@isaacs/cliui/LICENSE.txt |
| @istanbuljs/schema@0.1.6 | MIT | node_modules/.pnpm/@istanbuljs+schema@0.1.6/node_modules/@istanbuljs/schema/LICENSE |
| @jridgewell/resolve-uri@3.1.2 | MIT | node_modules/.pnpm/@jridgewell+resolve-uri@3.1.2/node_modules/@jridgewell/resolve-uri/LICENSE |
| @jridgewell/trace-mapping@0.3.31 | MIT | node_modules/.pnpm/@jridgewell+trace-mapping@0.3.31/node_modules/@jridgewell/trace-mapping/LICENSE |
| @pkgjs/parseargs@0.11.0 | MIT | node_modules/.pnpm/@pkgjs+parseargs@0.11.0/node_modules/@pkgjs/parseargs/LICENSE |
| @types/istanbul-lib-coverage@2.0.6 | MIT | node_modules/.pnpm/@types+istanbul-lib-coverage@2.0.6/node_modules/@types/istanbul-lib-coverage/LICENSE |
| ansi-regex@5.0.1 | MIT | node_modules/.pnpm/ansi-regex@5.0.1/node_modules/ansi-regex/license |
| ansi-regex@6.3.0 | MIT | node_modules/.pnpm/ansi-regex@6.3.0/node_modules/ansi-regex/license |
| ansi-styles@6.2.3 | MIT | node_modules/.pnpm/ansi-styles@6.2.3/node_modules/ansi-styles/license |
| brace-expansion@2.1.4 | MIT | node_modules/.pnpm/brace-expansion@2.1.4/node_modules/brace-expansion/LICENSE |
| c8@10.1.3 | ISC | node_modules/.pnpm/c8@10.1.3/node_modules/c8/LICENSE.txt |
| cliui@8.0.1 | ISC | node_modules/.pnpm/cliui@8.0.1/node_modules/cliui/LICENSE.txt |
| convert-source-map@2.0.0 | MIT | node_modules/.pnpm/convert-source-map@2.0.0/node_modules/convert-source-map/LICENSE |
| eastasianwidth@0.2.0 | MIT† | (none) |
| emoji-regex@8.0.0 | MIT | node_modules/.pnpm/emoji-regex@8.0.0/node_modules/emoji-regex/LICENSE-MIT.txt |
| emoji-regex@9.2.2 | MIT | node_modules/.pnpm/emoji-regex@9.2.2/node_modules/emoji-regex/LICENSE-MIT.txt |
| escalade@3.2.0 | MIT | node_modules/.pnpm/escalade@3.2.0/node_modules/escalade/license |
| foreground-child@3.3.1 | ISC | node_modules/.pnpm/foreground-child@3.3.1/node_modules/foreground-child/LICENSE |
| get-caller-file@2.0.5 | ISC | node_modules/.pnpm/get-caller-file@2.0.5/node_modules/get-caller-file/LICENSE.md |
| glob@10.4.5 | ISC | node_modules/.pnpm/glob@10.4.5/node_modules/glob/LICENSE |
| html-escaper@2.0.2 | MIT | node_modules/.pnpm/html-escaper@2.0.2/node_modules/html-escaper/LICENSE.txt |
| is-fullwidth-code-point@3.0.0 | MIT | node_modules/.pnpm/is-fullwidth-code-point@3.0.0/node_modules/is-fullwidth-code-point/license |
| istanbul-lib-coverage@3.2.2 | BSD-3-Clause | node_modules/.pnpm/istanbul-lib-coverage@3.2.2/node_modules/istanbul-lib-coverage/LICENSE |
| istanbul-lib-report@3.0.1 | BSD-3-Clause | node_modules/.pnpm/istanbul-lib-report@3.0.1/node_modules/istanbul-lib-report/LICENSE |
| istanbul-reports@3.2.0 | BSD-3-Clause | node_modules/.pnpm/istanbul-reports@3.2.0/node_modules/istanbul-reports/LICENSE |
| jackspeak@3.4.3 | BlueOak-1.0.0 | node_modules/.pnpm/jackspeak@3.4.3/node_modules/jackspeak/LICENSE.md |
| lru-cache@10.4.3 | ISC | node_modules/.pnpm/lru-cache@10.4.3/node_modules/lru-cache/LICENSE |
| make-dir@4.0.0 | MIT | node_modules/.pnpm/make-dir@4.0.0/node_modules/make-dir/license |
| minimatch@9.0.9 | ISC | node_modules/.pnpm/minimatch@9.0.9/node_modules/minimatch/LICENSE |
| minipass@7.1.3 | BlueOak-1.0.0 | node_modules/.pnpm/minipass@7.1.3/node_modules/minipass/LICENSE.md |
| package-json-from-dist@1.0.1 | BlueOak-1.0.0 | node_modules/.pnpm/package-json-from-dist@1.0.1/node_modules/package-json-from-dist/LICENSE.md |
| path-scurry@1.11.1 | BlueOak-1.0.0 | node_modules/.pnpm/path-scurry@1.11.1/node_modules/path-scurry/LICENSE.md |
| require-directory@2.1.1 | MIT | node_modules/.pnpm/require-directory@2.1.1/node_modules/require-directory/LICENSE |
| signal-exit@4.1.0 | ISC | node_modules/.pnpm/signal-exit@4.1.0/node_modules/signal-exit/LICENSE.txt |
| string-width@4.2.3 | MIT | node_modules/.pnpm/string-width@4.2.3/node_modules/string-width/license |
| string-width@5.1.2 | MIT | node_modules/.pnpm/string-width@5.1.2/node_modules/string-width/license |
| strip-ansi@6.0.1 | MIT | node_modules/.pnpm/strip-ansi@6.0.1/node_modules/strip-ansi/license |
| strip-ansi@7.2.0 | MIT | node_modules/.pnpm/strip-ansi@7.2.0/node_modules/strip-ansi/license |
| test-exclude@7.0.2 | ISC | node_modules/.pnpm/test-exclude@7.0.2/node_modules/test-exclude/LICENSE.txt |
| v8-to-istanbul@9.3.0 | ISC | node_modules/.pnpm/v8-to-istanbul@9.3.0/node_modules/v8-to-istanbul/LICENSE.txt |
| wrap-ansi@7.0.0 | MIT | node_modules/.pnpm/wrap-ansi@7.0.0/node_modules/wrap-ansi/license |
| wrap-ansi@8.1.0 | MIT | node_modules/.pnpm/wrap-ansi@8.1.0/node_modules/wrap-ansi/license |
| y18n@5.0.8 | ISC | node_modules/.pnpm/y18n@5.0.8/node_modules/y18n/LICENSE |
| yargs-parser@21.1.1 | ISC | node_modules/.pnpm/yargs-parser@21.1.1/node_modules/yargs-parser/LICENSE.txt |
| yargs@17.7.3 | MIT | node_modules/.pnpm/yargs@17.7.3/node_modules/yargs/LICENSE |

