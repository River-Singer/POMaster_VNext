# THIRD_PARTY_NOTICES — POMaster vNext 第三方依赖事实清单

> 状态：**事实整理件（呈报材料）**，非法律意见，不是 License Decision Gate 的裁定。
> PRD 依据：§87.3 / §87.5 / §87.6。Owner 签字位见本文末节与 `docs/license-draft-polyform.md`（Owner-local，不入库）。
>
> **许可策略声明（占位）**：本仓库预期的许可路线是 PRD §87.3 默认推荐——PolyForm Noncommercial 1.0.0 + 单独商业授权（Source-Available 双许可）。该路线**尚未经 §87.5 License Decision Gate 裁定**，本文件不含任何 Owner 选型签字。正式 `LICENSE` 文件尚未落盘（final-acceptance #6），落盘前本清单仅作事实底账。

## 0. 锚点与口径

<!-- notices-sync:begin:anchor -->
- **版本锚**：本清单以仓库内 `pnpm-lock.yaml`（lockfileVersion 9.0）为唯一锚点；该 lockfile 最后变更于 commit `aa81c0af7897b0373a987ad6a244aa13b1a21456`；lockfile 内容指纹 sha256 = `a25e8edacccd5fc60624d7598139836cda816378ae8647285b460ef120781f6d`。本清单不写墙钟生成日期、不写仓库 HEAD（HEAD 随无关提交漂移，不可作锚）——刷新口径 = 「以 pnpm-lock.yaml 对应 commit + 内容指纹为锚」。
<!-- notices-sync:end:anchor -->
<!-- notices-sync:begin:dep-face -->
- **依赖面**：lockfile `packages:` 节共 **617 个第三方包**（name@version 去重；peer 多变体同包只记一行），按用途拆两节：
  - **§A 运行时依赖**（workspace 各包 `dependencies` 的非 workspace 传递闭包）：**8 个**。
  - **§B 开发工具链依赖**（其余全部：root / studio / studio-react devDependencies 闭包）：**609 个**。
  - **分发口径 pending**：对外分发时 §A 必然构成第三方 notice 义务；§B 是否随分发触发 notice 义务取决于分发形态（源码仓库分发 / 产物分发），归 License Decision Gate 裁定。两节都先列全。
<!-- notices-sync:end:dep-face -->
<!-- notices-sync:begin:method -->
- **事实源方法**：对 lockfile 内每个包，在本机 `node_modules/.pnpm/` 实际打开其 LICENSE 文件核对 license id（不凭记忆）。未在本机安装的 142 个平台二进制/可选包按证据等级 B3/B4 显式标注，绝不混充本地核对。
<!-- notices-sync:end:method -->
<!-- notices-sync:begin:grades -->
- **证据等级**：
  - **B1** = 本地打开包内 LICENSE 文件，文件正文与 license id 一致。
  - **B2** = 包内无 LICENSE 文件；license id 取自该包 `package.json` 的 `license` 字段（README 佐证逐包注明）。
  - **B3** = 平台二进制包（lockfile `os`/`cpu` 受限包）不设 B1 路径锚——装与未装都不可跨平台逐包核对；license id 按同族已核对成员/主包 LICENSE 声明外推（本轮回：esbuild 家族锚点 esbuild@0.21.5（B1 MIT）；rollup 家族锚点 rollup@4.63.0（B1 MIT）；lightningcss 家族锚点 lightningcss@1.33.0（B1 MPL-2.0）；oxc-parser 家族锚点 oxc-parser@0.127.0（B1 MIT）；oxc-resolver 家族锚点 oxc-resolver@11.21.2（B2 MIT）；rolldown 家族锚点 rolldown@1.2.7（B1 MIT））。**非 B1 逐包路径锚。**
  - **B4** = 未安装且无同族锚点；license id 取自 npm registry 元数据（`npm view <pkg>@<ver> license`，本轮回 `@emnapi/core@{1.11.0,1.9.2}`、`@emnapi/runtime@{1.11.0,1.9.2}`、`@emnapi/wasi-threads@{1.2.1,1.2.2}`、`@napi-rs/lzma-linux-x64-gnu@{1.5.1}`、`@napi-rs/wasm-runtime@{1.2.3}`、`@tybys/wasm-util@{0.10.3}`、`fsevents@{2.3.3}` 均为 MIT）。**非本地文件核对。**
<!-- notices-sync:end:grades -->
<!-- notices-sync:begin:distribution -->
### license id 分布（617 包）

| id | 数量 | 标注 |
|---|---|---|
| MIT | 389 | B1 本地核对 |
| MIT（平台包家族外推）* | 121 | B3 |
| MIT（registry 元数据）** | 10 | B4 |
| MIT（无 LICENSE 文件）† | 26 | B2 |
| Apache-2.0 | 20 | B1 本地核对 |
| Apache-2.0（无 LICENSE 文件）† | 1（@humanfs/types） | B2 |
| ISC | 17 | B1 本地核对 |
| MPL-2.0 | 1（lightningcss） | B1 本地核对 |
| MPL-2.0（平台包家族外推）* | 11 | B3 |
| BSD-2-Clause | 7 | B1 本地核对 |
| BSD-2-Clause（无 LICENSE 文件）† | 1（esrecurse） | B2 |
| BlueOak-1.0.0 | 5 | B1 本地核对 |
| BSD-3-Clause | 4 | B1 本地核对 |
| 0BSD | 1（tslib） | B1 本地核对 |
| CC-BY-4.0 | 1（caniuse-lite） | B1 本地核对 |
| CC0-1.0 | 1（type-fest） | B1 本地核对 |
| Python-2.0 | 1（argparse） | B1 本地核对 |

**净事实**：本仓库依赖树（§A+§B）共 617 包。**强 copyleft 家族（GPL/LGPL/AGPL/SSPL/EPL）零命中**；copyleft 家族仅命中 **MPL-2.0**（12 包：lightningcss、lightningcss-android-arm64、lightningcss-darwin-arm64、lightningcss-darwin-x64、lightningcss-freebsd-x64、lightningcss-linux-arm-gnueabihf、lightningcss-linux-arm64-gnu、lightningcss-linux-arm64-musl、lightningcss-linux-x64-gnu、lightningcss-linux-x64-musl、lightningcss-win32-arm64-msvc、lightningcss-win32-x64-msvc——文件级弱 copyleft：以依赖形式原样引用不传染使用方源码；随源码仓库可见/产物分发时须保留 MPL 许可文本与文件级改动声明，收录范围归 §0 分发口径裁定）。其余全部为宽松或公共域许可（MIT / ISC / 0BSD / BSD-2-Clause / BSD-3-Clause / Apache-2.0 / CC0-1.0 / CC-BY-4.0 / BlueOak-1.0.0 / Python-2.0）。MIT/ISC/BSD/Apache 均要求保留版权与许可声明——本文件即该 notice 义务的载体。
<!-- notices-sync:end:distribution -->
<!-- notices-sync:begin:section-a -->
## §A 运行时依赖（8 包）

构成：workspace 各包 `dependencies`（非 dev）的非 workspace 传递闭包——packages/cli → commander；packages/gauntlet-lite →（无第三方运行时依赖）；packages/kernel → ajv / js-yaml；packages/schemas →（无第三方运行时依赖）；packages/studio →（无第三方运行时依赖）；packages/studio-react →（无第三方运行时依赖）。

| 包名 | 版本 | license id | license 源文件路径（本仓库 node_modules 内） | 证据 |
|---|---|---|---|---|
| ajv | 8.20.0 | MIT | node_modules/.pnpm/ajv@8.20.0/node_modules/ajv/LICENSE | B1 |
| argparse | 2.0.1 | Python-2.0 | node_modules/.pnpm/argparse@2.0.1/node_modules/argparse/LICENSE | B1 |
| commander | 14.0.3 | MIT | node_modules/.pnpm/commander@14.0.3/node_modules/commander/LICENSE | B1 |
| fast-deep-equal | 3.1.3 | MIT | node_modules/.pnpm/fast-deep-equal@3.1.3/node_modules/fast-deep-equal/LICENSE | B1 |
| fast-uri | 3.1.6 | BSD-3-Clause | node_modules/.pnpm/fast-uri@3.1.6/node_modules/fast-uri/LICENSE | B1 |
| js-yaml | 4.3.2 | MIT | node_modules/.pnpm/js-yaml@4.3.2/node_modules/js-yaml/LICENSE | B1 |
| json-schema-traverse | 1.0.0 | MIT | node_modules/.pnpm/json-schema-traverse@1.0.0/node_modules/json-schema-traverse/LICENSE | B1 |
| require-from-string | 2.0.2 | MIT | node_modules/.pnpm/require-from-string@2.0.2/node_modules/require-from-string/license | B1 |
<!-- notices-sync:end:section-a -->
<!-- notices-sync:begin:section-b -->
## §B 开发工具链依赖（609 包）

构成：lockfile 其余全部包——root devDependencies 闭包（@types/node / ajv / ajv-formats / esbuild / eslint / js-yaml / typescript / typescript-eslint / vitest）+ packages/studio devDependencies 闭包（@storybook/addon-docs / @storybook/vue3 / @storybook/vue3-vite / @vue/test-utils / ant-design-vue / happy-dom / js-yaml / storybook / vite / vue）+ packages/studio-react devDependencies 闭包（@storybook/addon-docs / @storybook/react / @storybook/react-vite / antd / react / react-dom / storybook / vite）。

| 包名 | 版本 | license id | license 源文件路径 | 证据 |
|---|---|---|---|---|
| @adobe/css-tools | 4.5.0 | MIT | node_modules/.pnpm/@adobe+css-tools@4.5.0/node_modules/@adobe/css-tools/LICENSE | B1 |
| @ant-design/colors | 6.0.0 | MIT | node_modules/.pnpm/@ant-design+colors@6.0.0/node_modules/@ant-design/colors/LICENSE | B1 |
| @ant-design/colors | 7.2.1 | MIT | node_modules/.pnpm/@ant-design+colors@7.2.1/node_modules/@ant-design/colors/LICENSE | B1 |
| @ant-design/cssinjs | 1.24.0 | MIT | node_modules/.pnpm/@ant-design+cssinjs@1.24.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@ant-design/cssinjs/LICENSE.md | B1 |
| @ant-design/cssinjs-utils | 1.1.3 | MIT | node_modules/.pnpm/@ant-design+cssinjs-utils@1.1.3_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@ant-design/cssinjs-utils/LICENSE | B1 |
| @ant-design/fast-color | 2.0.6 | MIT | node_modules/.pnpm/@ant-design+fast-color@2.0.6/node_modules/@ant-design/fast-color/LICENSE | B1 |
| @ant-design/icons | 5.6.1 | MIT | node_modules/.pnpm/@ant-design+icons@5.6.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@ant-design/icons/LICENSE | B1 |
| @ant-design/icons-svg | 4.6.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| @ant-design/icons-vue | 7.0.1 | MIT† | （包内无 LICENSE 文件） | B2 |
| @ant-design/react-slick | 1.1.2 | MIT | node_modules/.pnpm/@ant-design+react-slick@1.1.2_react@18.3.1/node_modules/@ant-design/react-slick/LICENSE | B1 |
| @babel/code-frame | 7.29.7 | MIT | node_modules/.pnpm/@babel+code-frame@7.29.7/node_modules/@babel/code-frame/LICENSE | B1 |
| @babel/compat-data | 7.29.7 | MIT | node_modules/.pnpm/@babel+compat-data@7.29.7/node_modules/@babel/compat-data/LICENSE | B1 |
| @babel/core | 7.29.7 | MIT | node_modules/.pnpm/@babel+core@7.29.7/node_modules/@babel/core/LICENSE | B1 |
| @babel/generator | 7.29.8 | MIT | node_modules/.pnpm/@babel+generator@7.29.8/node_modules/@babel/generator/LICENSE | B1 |
| @babel/helper-compilation-targets | 7.29.7 | MIT | node_modules/.pnpm/@babel+helper-compilation-targets@7.29.7/node_modules/@babel/helper-compilation-targets/LICENSE | B1 |
| @babel/helper-globals | 7.29.7 | MIT | node_modules/.pnpm/@babel+helper-globals@7.29.7/node_modules/@babel/helper-globals/LICENSE | B1 |
| @babel/helper-module-imports | 7.29.7 | MIT | node_modules/.pnpm/@babel+helper-module-imports@7.29.7/node_modules/@babel/helper-module-imports/LICENSE | B1 |
| @babel/helper-module-transforms | 7.29.7 | MIT | node_modules/.pnpm/@babel+helper-module-transforms@7.29.7_@babel+core@7.29.7/node_modules/@babel/helper-module-transforms/LICENSE | B1 |
| @babel/helper-string-parser | 7.29.7 | MIT | node_modules/.pnpm/@babel+helper-string-parser@7.29.7/node_modules/@babel/helper-string-parser/LICENSE | B1 |
| @babel/helper-validator-identifier | 7.29.7 | MIT | node_modules/.pnpm/@babel+helper-validator-identifier@7.29.7/node_modules/@babel/helper-validator-identifier/LICENSE | B1 |
| @babel/helper-validator-option | 7.29.7 | MIT | node_modules/.pnpm/@babel+helper-validator-option@7.29.7/node_modules/@babel/helper-validator-option/LICENSE | B1 |
| @babel/helpers | 7.29.7 | MIT | node_modules/.pnpm/@babel+helpers@7.29.7/node_modules/@babel/helpers/LICENSE | B1 |
| @babel/parser | 7.29.8 | MIT | node_modules/.pnpm/@babel+parser@7.29.8/node_modules/@babel/parser/LICENSE | B1 |
| @babel/runtime | 7.29.7 | MIT | node_modules/.pnpm/@babel+runtime@7.29.7/node_modules/@babel/runtime/LICENSE | B1 |
| @babel/template | 7.29.7 | MIT | node_modules/.pnpm/@babel+template@7.29.7/node_modules/@babel/template/LICENSE | B1 |
| @babel/traverse | 7.29.8 | MIT | node_modules/.pnpm/@babel+traverse@7.29.8/node_modules/@babel/traverse/LICENSE | B1 |
| @babel/types | 7.29.8 | MIT | node_modules/.pnpm/@babel+types@7.29.8/node_modules/@babel/types/LICENSE | B1 |
| @ctrl/tinycolor | 3.6.1 | MIT | node_modules/.pnpm/@ctrl+tinycolor@3.6.1/node_modules/@ctrl/tinycolor/LICENSE | B1 |
| @emnapi/core | 1.11.0 | MIT** | (未安装) | B4 |
| @emnapi/core | 1.9.2 | MIT** | (未安装) | B4 |
| @emnapi/runtime | 1.11.0 | MIT** | (未安装) | B4 |
| @emnapi/runtime | 1.9.2 | MIT** | (未安装) | B4 |
| @emnapi/wasi-threads | 1.2.1 | MIT** | (未安装) | B4 |
| @emnapi/wasi-threads | 1.2.2 | MIT** | (未安装) | B4 |
| @emotion/hash | 0.8.0 | MIT | node_modules/.pnpm/@emotion+hash@0.8.0/node_modules/@emotion/hash/LICENSE | B1 |
| @emotion/hash | 0.9.2 | MIT | node_modules/.pnpm/@emotion+hash@0.9.2/node_modules/@emotion/hash/LICENSE | B1 |
| @emotion/unitless | 0.7.5 | MIT | node_modules/.pnpm/@emotion+unitless@0.7.5/node_modules/@emotion/unitless/LICENSE | B1 |
| @emotion/unitless | 0.8.1 | MIT | node_modules/.pnpm/@emotion+unitless@0.8.1/node_modules/@emotion/unitless/LICENSE | B1 |
| @esbuild/aix-ppc64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/aix-ppc64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/android-arm | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/android-arm | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/android-arm64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/android-arm64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/android-x64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/android-x64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/darwin-arm64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/darwin-arm64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/darwin-x64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/darwin-x64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/freebsd-arm64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/freebsd-arm64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/freebsd-x64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/freebsd-x64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/linux-arm | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-arm | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/linux-arm64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-arm64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/linux-ia32 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-ia32 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/linux-loong64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-loong64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/linux-mips64el | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-mips64el | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/linux-ppc64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-ppc64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/linux-riscv64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-riscv64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/linux-s390x | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-s390x | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/linux-x64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/linux-x64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/netbsd-arm64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/netbsd-x64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/netbsd-x64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/openbsd-arm64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/openbsd-x64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/openbsd-x64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/openharmony-arm64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/sunos-x64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/sunos-x64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/win32-arm64 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/win32-arm64 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/win32-ia32 | 0.21.5 | MIT* | (未安装) | B3 |
| @esbuild/win32-ia32 | 0.28.2 | MIT* | (未安装) | B3 |
| @esbuild/win32-x64 | 0.21.5 | MIT† | （包内无 LICENSE 文件） | B2 |
| @esbuild/win32-x64 | 0.28.2 | MIT† | （包内无 LICENSE 文件） | B2 |
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
| @joshwooding/vite-plugin-react-docgen-typescript | 0.7.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| @jridgewell/gen-mapping | 0.3.13 | MIT | node_modules/.pnpm/@jridgewell+gen-mapping@0.3.13/node_modules/@jridgewell/gen-mapping/LICENSE | B1 |
| @jridgewell/remapping | 2.3.5 | MIT | node_modules/.pnpm/@jridgewell+remapping@2.3.5/node_modules/@jridgewell/remapping/LICENSE | B1 |
| @jridgewell/resolve-uri | 3.1.2 | MIT | node_modules/.pnpm/@jridgewell+resolve-uri@3.1.2/node_modules/@jridgewell/resolve-uri/LICENSE | B1 |
| @jridgewell/sourcemap-codec | 1.5.5 | MIT | node_modules/.pnpm/@jridgewell+sourcemap-codec@1.5.5/node_modules/@jridgewell/sourcemap-codec/LICENSE | B1 |
| @jridgewell/trace-mapping | 0.3.31 | MIT | node_modules/.pnpm/@jridgewell+trace-mapping@0.3.31/node_modules/@jridgewell/trace-mapping/LICENSE | B1 |
| @mdx-js/react | 3.1.1 | MIT | node_modules/.pnpm/@mdx-js+react@3.1.1_@types+react@19.2.18_react@18.3.1/node_modules/@mdx-js/react/license | B1 |
| @napi-rs/lzma-linux-x64-gnu | 1.5.1 | MIT** | (未安装) | B4 |
| @napi-rs/wasm-runtime | 1.2.3 | MIT** | (未安装) | B4 |
| @one-ini/wasm | 0.2.1 | MIT | node_modules/.pnpm/@one-ini+wasm@0.2.1/node_modules/@one-ini/wasm/LICENSE | B1 |
| @oxc-parser/binding-android-arm-eabi | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-android-arm64 | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-darwin-arm64 | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-darwin-x64 | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-freebsd-x64 | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-linux-arm-gnueabihf | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-linux-arm-musleabihf | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-linux-arm64-gnu | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-linux-arm64-musl | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-linux-ppc64-gnu | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-linux-riscv64-gnu | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-linux-riscv64-musl | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-linux-s390x-gnu | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-linux-x64-gnu | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-linux-x64-musl | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-openharmony-arm64 | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-wasm32-wasi | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-win32-arm64-msvc | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-win32-ia32-msvc | 0.127.0 | MIT* | (未安装) | B3 |
| @oxc-parser/binding-win32-x64-msvc | 0.127.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| @oxc-project/types | 0.127.0 | MIT | node_modules/.pnpm/@oxc-project+types@0.127.0/node_modules/@oxc-project/types/LICENSE | B1 |
| @oxc-project/types | 0.148.0 | MIT | node_modules/.pnpm/@oxc-project+types@0.148.0/node_modules/@oxc-project/types/LICENSE | B1 |
| @oxc-resolver/binding-android-arm-eabi | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-android-arm64 | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-darwin-arm64 | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-darwin-x64 | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-freebsd-x64 | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-linux-arm-gnueabihf | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-linux-arm-musleabihf | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-linux-arm64-gnu | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-linux-arm64-musl | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-linux-ppc64-gnu | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-linux-riscv64-gnu | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-linux-riscv64-musl | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-linux-s390x-gnu | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-linux-x64-gnu | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-linux-x64-musl | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-openharmony-arm64 | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-wasm32-wasi | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-win32-arm64-msvc | 11.21.2 | MIT* | (未安装) | B3 |
| @oxc-resolver/binding-win32-x64-msvc | 11.21.2 | MIT† | （包内无 LICENSE 文件） | B2 |
| @rc-component/async-validator | 5.1.2 | MIT | node_modules/.pnpm/@rc-component+async-validator@5.1.2/node_modules/@rc-component/async-validator/LICENSE.md | B1 |
| @rc-component/color-picker | 2.0.1 | MIT | node_modules/.pnpm/@rc-component+color-picker@2.0.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@rc-component/color-picker/LICENSE.md | B1 |
| @rc-component/context | 1.4.0 | MIT | node_modules/.pnpm/@rc-component+context@1.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@rc-component/context/LICENSE.md | B1 |
| @rc-component/mini-decimal | 1.1.4 | MIT | node_modules/.pnpm/@rc-component+mini-decimal@1.1.4/node_modules/@rc-component/mini-decimal/LICENSE | B1 |
| @rc-component/mutate-observer | 1.1.0 | MIT | node_modules/.pnpm/@rc-component+mutate-observer@1.1.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@rc-component/mutate-observer/LICENSE | B1 |
| @rc-component/portal | 1.1.2 | MIT | node_modules/.pnpm/@rc-component+portal@1.1.2_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@rc-component/portal/LICENSE | B1 |
| @rc-component/qrcode | 1.1.3 | MIT | node_modules/.pnpm/@rc-component+qrcode@1.1.3_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@rc-component/qrcode/LICENSE | B1 |
| @rc-component/tour | 1.15.1 | MIT | node_modules/.pnpm/@rc-component+tour@1.15.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@rc-component/tour/LICENSE | B1 |
| @rc-component/trigger | 2.3.1 | MIT | node_modules/.pnpm/@rc-component+trigger@2.3.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/@rc-component/trigger/LICENSE | B1 |
| @rolldown/binding-android-arm-eabi | 1.2.7 | MIT* | (未安装) | B3 |
| @rolldown/binding-android-arm64 | 1.2.7 | MIT* | (未安装) | B3 |
| @rolldown/binding-darwin-arm64 | 1.2.7 | MIT* | (未安装) | B3 |
| @rolldown/binding-darwin-x64 | 1.2.7 | MIT* | (未安装) | B3 |
| @rolldown/binding-freebsd-x64 | 1.2.7 | MIT* | (未安装) | B3 |
| @rolldown/binding-linux-arm-gnueabihf | 1.2.7 | MIT* | (未安装) | B3 |
| @rolldown/binding-linux-arm64-gnu | 1.2.7 | MIT* | (未安装) | B3 |
| @rolldown/binding-linux-arm64-musl | 1.2.7 | MIT* | (未安装) | B3 |
| @rolldown/binding-linux-ppc64-gnu | 1.2.7 | MIT* | (未安装) | B3 |
| @rolldown/binding-linux-s390x-gnu | 1.2.7 | MIT* | (未安装) | B3 |
| @rolldown/binding-linux-x64-gnu | 1.2.7 | MIT* | (未安装) | B3 |
| @rolldown/binding-linux-x64-musl | 1.2.7 | MIT* | (未安装) | B3 |
| @rolldown/binding-openharmony-arm64 | 1.2.7 | MIT* | (未安装) | B3 |
| @rolldown/binding-win32-arm64-msvc | 1.2.7 | MIT* | (未安装) | B3 |
| @rolldown/binding-win32-x64-msvc | 1.2.7 | MIT† | （包内无 LICENSE 文件） | B2 |
| @rolldown/pluginutils | 1.0.1 | MIT | node_modules/.pnpm/@rolldown+pluginutils@1.0.1/node_modules/@rolldown/pluginutils/LICENSE | B1 |
| @rollup/pluginutils | 5.4.0 | MIT | node_modules/.pnpm/@rollup+pluginutils@5.4.0_rollup@4.63.0/node_modules/@rollup/pluginutils/LICENSE | B1 |
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
| @simonwep/pickr | 1.8.2 | MIT | node_modules/.pnpm/@simonwep+pickr@1.8.2/node_modules/@simonwep/pickr/LICENSE | B1 |
| @storybook/addon-docs | 10.6.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| @storybook/builder-vite | 10.6.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| @storybook/global | 5.0.0 | MIT | node_modules/.pnpm/@storybook+global@5.0.0/node_modules/@storybook/global/LICENSE | B1 |
| @storybook/icons | 2.1.0 | MIT | node_modules/.pnpm/@storybook+icons@2.1.0_react@18.3.1/node_modules/@storybook/icons/LICENSE.md | B1 |
| @storybook/react | 10.6.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| @storybook/react-dom-shim | 10.6.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| @storybook/react-vite | 10.6.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| @storybook/vue3 | 10.6.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| @storybook/vue3-vite | 10.6.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| @testing-library/dom | 10.4.1 | MIT | node_modules/.pnpm/@testing-library+dom@10.4.1/node_modules/@testing-library/dom/LICENSE | B1 |
| @testing-library/jest-dom | 6.9.1 | MIT | node_modules/.pnpm/@testing-library+jest-dom@6.9.1/node_modules/@testing-library/jest-dom/LICENSE | B1 |
| @testing-library/user-event | 14.6.7 | MIT | node_modules/.pnpm/@testing-library+user-event@14.6.7_@testing-library+dom@10.4.1/node_modules/@testing-library/user-event/LICENSE | B1 |
| @tybys/wasm-util | 0.10.3 | MIT** | (未安装) | B4 |
| @types/aria-query | 5.0.4 | MIT | node_modules/.pnpm/@types+aria-query@5.0.4/node_modules/@types/aria-query/LICENSE | B1 |
| @types/babel__core | 7.20.5 | MIT | node_modules/.pnpm/@types+babel__core@7.20.5/node_modules/@types/babel__core/LICENSE | B1 |
| @types/babel__generator | 7.27.0 | MIT | node_modules/.pnpm/@types+babel__generator@7.27.0/node_modules/@types/babel__generator/LICENSE | B1 |
| @types/babel__template | 7.4.4 | MIT | node_modules/.pnpm/@types+babel__template@7.4.4/node_modules/@types/babel__template/LICENSE | B1 |
| @types/babel__traverse | 7.28.0 | MIT | node_modules/.pnpm/@types+babel__traverse@7.28.0/node_modules/@types/babel__traverse/LICENSE | B1 |
| @types/chai | 5.2.3 | MIT | node_modules/.pnpm/@types+chai@5.2.3/node_modules/@types/chai/LICENSE | B1 |
| @types/deep-eql | 4.0.2 | MIT | node_modules/.pnpm/@types+deep-eql@4.0.2/node_modules/@types/deep-eql/LICENSE | B1 |
| @types/doctrine | 0.0.9 | MIT | node_modules/.pnpm/@types+doctrine@0.0.9/node_modules/@types/doctrine/LICENSE | B1 |
| @types/estree | 1.0.9 | MIT | node_modules/.pnpm/@types+estree@1.0.9/node_modules/@types/estree/LICENSE | B1 |
| @types/json-schema | 7.0.15 | MIT | node_modules/.pnpm/@types+json-schema@7.0.15/node_modules/@types/json-schema/LICENSE | B1 |
| @types/mdx | 2.0.14 | MIT | node_modules/.pnpm/@types+mdx@2.0.14/node_modules/@types/mdx/LICENSE | B1 |
| @types/node | 22.20.1 | MIT | node_modules/.pnpm/@types+node@22.20.1/node_modules/@types/node/LICENSE | B1 |
| @types/react | 19.2.18 | MIT | node_modules/.pnpm/@types+react@19.2.18/node_modules/@types/react/LICENSE | B1 |
| @types/resolve | 1.20.6 | MIT | node_modules/.pnpm/@types+resolve@1.20.6/node_modules/@types/resolve/LICENSE | B1 |
| @types/whatwg-mimetype | 3.0.2 | MIT | node_modules/.pnpm/@types+whatwg-mimetype@3.0.2/node_modules/@types/whatwg-mimetype/LICENSE | B1 |
| @types/ws | 8.18.1 | MIT | node_modules/.pnpm/@types+ws@8.18.1/node_modules/@types/ws/LICENSE | B1 |
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
| @vitest/expect | 3.2.4 | MIT | node_modules/.pnpm/@vitest+expect@3.2.4/node_modules/@vitest/expect/LICENSE | B1 |
| @vitest/mocker | 2.1.9 | MIT | node_modules/.pnpm/@vitest+mocker@2.1.9_vite@5.4.21_@types+node@22.20.1_lightningcss@1.33.0_/node_modules/@vitest/mocker/LICENSE | B1 |
| @vitest/pretty-format | 2.1.9 | MIT | node_modules/.pnpm/@vitest+pretty-format@2.1.9/node_modules/@vitest/pretty-format/LICENSE | B1 |
| @vitest/pretty-format | 3.2.4 | MIT | node_modules/.pnpm/@vitest+pretty-format@3.2.4/node_modules/@vitest/pretty-format/LICENSE | B1 |
| @vitest/runner | 2.1.9 | MIT | node_modules/.pnpm/@vitest+runner@2.1.9/node_modules/@vitest/runner/LICENSE | B1 |
| @vitest/snapshot | 2.1.9 | MIT | node_modules/.pnpm/@vitest+snapshot@2.1.9/node_modules/@vitest/snapshot/LICENSE | B1 |
| @vitest/spy | 2.1.9 | MIT | node_modules/.pnpm/@vitest+spy@2.1.9/node_modules/@vitest/spy/LICENSE | B1 |
| @vitest/spy | 3.2.4 | MIT | node_modules/.pnpm/@vitest+spy@3.2.4/node_modules/@vitest/spy/LICENSE | B1 |
| @vitest/utils | 2.1.9 | MIT | node_modules/.pnpm/@vitest+utils@2.1.9/node_modules/@vitest/utils/LICENSE | B1 |
| @vitest/utils | 3.2.4 | MIT | node_modules/.pnpm/@vitest+utils@3.2.4/node_modules/@vitest/utils/LICENSE | B1 |
| @volar/language-core | 2.4.28 | MIT | node_modules/.pnpm/@volar+language-core@2.4.28/node_modules/@volar/language-core/LICENSE | B1 |
| @volar/source-map | 2.4.28 | MIT | node_modules/.pnpm/@volar+source-map@2.4.28/node_modules/@volar/source-map/LICENSE | B1 |
| @volar/typescript | 2.4.28 | MIT | node_modules/.pnpm/@volar+typescript@2.4.28/node_modules/@volar/typescript/LICENSE | B1 |
| @vue/compiler-core | 3.5.42 | MIT | node_modules/.pnpm/@vue+compiler-core@3.5.42/node_modules/@vue/compiler-core/LICENSE | B1 |
| @vue/compiler-dom | 3.5.42 | MIT | node_modules/.pnpm/@vue+compiler-dom@3.5.42/node_modules/@vue/compiler-dom/LICENSE | B1 |
| @vue/compiler-sfc | 3.5.42 | MIT | node_modules/.pnpm/@vue+compiler-sfc@3.5.42/node_modules/@vue/compiler-sfc/LICENSE | B1 |
| @vue/compiler-ssr | 3.5.42 | MIT | node_modules/.pnpm/@vue+compiler-ssr@3.5.42/node_modules/@vue/compiler-ssr/LICENSE | B1 |
| @vue/language-core | 3.3.11 | MIT | node_modules/.pnpm/@vue+language-core@3.3.11/node_modules/@vue/language-core/LICENSE | B1 |
| @vue/reactivity | 3.5.42 | MIT | node_modules/.pnpm/@vue+reactivity@3.5.42/node_modules/@vue/reactivity/LICENSE | B1 |
| @vue/runtime-core | 3.5.42 | MIT | node_modules/.pnpm/@vue+runtime-core@3.5.42/node_modules/@vue/runtime-core/LICENSE | B1 |
| @vue/runtime-dom | 3.5.42 | MIT | node_modules/.pnpm/@vue+runtime-dom@3.5.42/node_modules/@vue/runtime-dom/LICENSE | B1 |
| @vue/server-renderer | 3.5.42 | MIT | node_modules/.pnpm/@vue+server-renderer@3.5.42/node_modules/@vue/server-renderer/LICENSE | B1 |
| @vue/shared | 3.5.42 | MIT | node_modules/.pnpm/@vue+shared@3.5.42/node_modules/@vue/shared/LICENSE | B1 |
| @vue/test-utils | 2.5.0 | MIT | node_modules/.pnpm/@vue+test-utils@2.5.0_@vue+compiler-dom@3.5.42_@vue+server-renderer@3.5.42_vue@3.5.42_typescript@5.9.3_/node_modules/@vue/test-utils/LICENSE | B1 |
| @webcontainer/env | 1.1.1 | MIT | node_modules/.pnpm/@webcontainer+env@1.1.1/node_modules/@webcontainer/env/LICENSE.md | B1 |
| abbrev | 5.0.0 | ISC | node_modules/.pnpm/abbrev@5.0.0/node_modules/abbrev/LICENSE | B1 |
| acorn | 7.4.1 | MIT | node_modules/.pnpm/acorn@7.4.1/node_modules/acorn/LICENSE | B1 |
| acorn | 8.18.0 | MIT | node_modules/.pnpm/acorn@8.18.0/node_modules/acorn/LICENSE | B1 |
| acorn-jsx | 5.3.2 | MIT | node_modules/.pnpm/acorn-jsx@5.3.2_acorn@8.18.0/node_modules/acorn-jsx/LICENSE | B1 |
| ajv | 6.15.0 | MIT | node_modules/.pnpm/ajv@6.15.0/node_modules/ajv/LICENSE | B1 |
| ajv-formats | 3.0.1 | MIT | node_modules/.pnpm/ajv-formats@3.0.1_ajv@8.20.0/node_modules/ajv-formats/LICENSE | B1 |
| alien-signals | 3.2.1 | MIT | node_modules/.pnpm/alien-signals@3.2.1/node_modules/alien-signals/LICENSE | B1 |
| ansi-regex | 5.0.1 | MIT | node_modules/.pnpm/ansi-regex@5.0.1/node_modules/ansi-regex/license | B1 |
| ansi-styles | 4.3.0 | MIT | node_modules/.pnpm/ansi-styles@4.3.0/node_modules/ansi-styles/license | B1 |
| ansi-styles | 5.2.0 | MIT | node_modules/.pnpm/ansi-styles@5.2.0/node_modules/ansi-styles/license | B1 |
| ant-design-vue | 4.2.6 | MIT | node_modules/.pnpm/ant-design-vue@4.2.6_vue@3.5.42_typescript@5.9.3_/node_modules/ant-design-vue/LICENSE | B1 |
| antd | 5.29.3 | MIT | node_modules/.pnpm/antd@5.29.3_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/antd/LICENSE | B1 |
| aria-query | 5.3.0 | Apache-2.0 | node_modules/.pnpm/aria-query@5.3.0/node_modules/aria-query/LICENSE | B1 |
| aria-query | 5.3.2 | Apache-2.0 | node_modules/.pnpm/aria-query@5.3.2/node_modules/aria-query/LICENSE | B1 |
| array-tree-filter | 2.1.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| asap | 2.0.6 | MIT | node_modules/.pnpm/asap@2.0.6/node_modules/asap/LICENSE.md | B1 |
| assert-never | 1.4.0 | MIT | node_modules/.pnpm/assert-never@1.4.0/node_modules/assert-never/LICENSE | B1 |
| assertion-error | 2.0.1 | MIT | node_modules/.pnpm/assertion-error@2.0.1/node_modules/assertion-error/LICENSE | B1 |
| ast-types | 0.16.3 | MIT | node_modules/.pnpm/ast-types@0.16.3/node_modules/ast-types/LICENSE | B1 |
| async-validator | 4.2.5 | MIT | node_modules/.pnpm/async-validator@4.2.5/node_modules/async-validator/LICENSE.md | B1 |
| babel-walk | 3.0.0-canary-5 | MIT | node_modules/.pnpm/babel-walk@3.0.0-canary-5/node_modules/babel-walk/LICENSE.md | B1 |
| balanced-match | 1.0.2 | MIT | node_modules/.pnpm/balanced-match@1.0.2/node_modules/balanced-match/LICENSE.md | B1 |
| balanced-match | 4.0.4 | MIT | node_modules/.pnpm/balanced-match@4.0.4/node_modules/balanced-match/LICENSE.md | B1 |
| baseline-browser-mapping | 2.11.21 | Apache-2.0 | node_modules/.pnpm/baseline-browser-mapping@2.11.21/node_modules/baseline-browser-mapping/LICENSE.txt | B1 |
| brace-expansion | 1.1.18 | MIT | node_modules/.pnpm/brace-expansion@1.1.18/node_modules/brace-expansion/LICENSE | B1 |
| brace-expansion | 5.0.9 | MIT | node_modules/.pnpm/brace-expansion@5.0.9/node_modules/brace-expansion/LICENSE | B1 |
| browserslist | 4.28.9 | MIT | node_modules/.pnpm/browserslist@4.28.9/node_modules/browserslist/LICENSE | B1 |
| buffer-image-size | 0.6.4 | MIT | node_modules/.pnpm/buffer-image-size@0.6.4/node_modules/buffer-image-size/LICENSE | B1 |
| bundle-name | 4.1.0 | MIT | node_modules/.pnpm/bundle-name@4.1.0/node_modules/bundle-name/license | B1 |
| cac | 6.7.14 | MIT | node_modules/.pnpm/cac@6.7.14/node_modules/cac/LICENSE | B1 |
| call-bind-apply-helpers | 1.0.2 | MIT | node_modules/.pnpm/call-bind-apply-helpers@1.0.2/node_modules/call-bind-apply-helpers/LICENSE | B1 |
| call-bound | 1.0.4 | MIT | node_modules/.pnpm/call-bound@1.0.4/node_modules/call-bound/LICENSE | B1 |
| callsites | 3.1.0 | MIT | node_modules/.pnpm/callsites@3.1.0/node_modules/callsites/license | B1 |
| caniuse-lite | 1.0.30001810 | CC-BY-4.0 | node_modules/.pnpm/caniuse-lite@1.0.30001810/node_modules/caniuse-lite/LICENSE | B1 |
| chai | 5.3.3 | MIT | node_modules/.pnpm/chai@5.3.3/node_modules/chai/LICENSE | B1 |
| chalk | 4.1.2 | MIT | node_modules/.pnpm/chalk@4.1.2/node_modules/chalk/license | B1 |
| character-parser | 2.2.0 | MIT | node_modules/.pnpm/character-parser@2.2.0/node_modules/character-parser/LICENSE | B1 |
| check-error | 2.1.3 | MIT | node_modules/.pnpm/check-error@2.1.3/node_modules/check-error/LICENSE | B1 |
| classnames | 2.5.1 | MIT | node_modules/.pnpm/classnames@2.5.1/node_modules/classnames/LICENSE | B1 |
| color-convert | 2.0.1 | MIT | node_modules/.pnpm/color-convert@2.0.1/node_modules/color-convert/LICENSE | B1 |
| color-name | 1.1.4 | MIT | node_modules/.pnpm/color-name@1.1.4/node_modules/color-name/LICENSE | B1 |
| compute-scroll-into-view | 1.0.20 | MIT | node_modules/.pnpm/compute-scroll-into-view@1.0.20/node_modules/compute-scroll-into-view/LICENSE | B1 |
| compute-scroll-into-view | 3.1.1 | MIT | node_modules/.pnpm/compute-scroll-into-view@3.1.1/node_modules/compute-scroll-into-view/LICENSE | B1 |
| concat-map | 0.0.1 | MIT | node_modules/.pnpm/concat-map@0.0.1/node_modules/concat-map/LICENSE | B1 |
| config-chain | 1.1.13 | MIT | node_modules/.pnpm/config-chain@1.1.13/node_modules/config-chain/LICENCE | B1 |
| constantinople | 4.0.1 | MIT | node_modules/.pnpm/constantinople@4.0.1/node_modules/constantinople/LICENSE | B1 |
| convert-source-map | 2.0.0 | MIT | node_modules/.pnpm/convert-source-map@2.0.0/node_modules/convert-source-map/LICENSE | B1 |
| copy-to-clipboard | 3.3.3 | MIT | node_modules/.pnpm/copy-to-clipboard@3.3.3/node_modules/copy-to-clipboard/LICENSE | B1 |
| core-js | 3.50.0 | MIT | node_modules/.pnpm/core-js@3.50.0/node_modules/core-js/LICENSE | B1 |
| cross-spawn | 7.0.6 | MIT | node_modules/.pnpm/cross-spawn@7.0.6/node_modules/cross-spawn/LICENSE | B1 |
| css.escape | 1.5.1 | MIT | node_modules/.pnpm/css.escape@1.5.1/node_modules/css.escape/LICENSE-MIT.txt | B1 |
| csstype | 3.2.3 | MIT | node_modules/.pnpm/csstype@3.2.3/node_modules/csstype/LICENSE | B1 |
| dayjs | 1.11.23 | MIT | node_modules/.pnpm/dayjs@1.11.23/node_modules/dayjs/LICENSE | B1 |
| debug | 4.4.3 | MIT | node_modules/.pnpm/debug@4.4.3/node_modules/debug/LICENSE | B1 |
| deep-eql | 5.0.2 | MIT | node_modules/.pnpm/deep-eql@5.0.2/node_modules/deep-eql/LICENSE | B1 |
| deep-is | 0.1.4 | MIT | node_modules/.pnpm/deep-is@0.1.4/node_modules/deep-is/LICENSE | B1 |
| default-browser | 5.5.1 | MIT | node_modules/.pnpm/default-browser@5.5.1/node_modules/default-browser/license | B1 |
| default-browser-id | 5.0.1 | MIT | node_modules/.pnpm/default-browser-id@5.0.1/node_modules/default-browser-id/license | B1 |
| define-lazy-prop | 3.0.0 | MIT | node_modules/.pnpm/define-lazy-prop@3.0.0/node_modules/define-lazy-prop/license | B1 |
| dequal | 2.0.3 | MIT | node_modules/.pnpm/dequal@2.0.3/node_modules/dequal/license | B1 |
| detect-libc | 2.1.2 | Apache-2.0 | node_modules/.pnpm/detect-libc@2.1.2/node_modules/detect-libc/LICENSE | B1 |
| doctrine | 3.0.0 | Apache-2.0 | node_modules/.pnpm/doctrine@3.0.0/node_modules/doctrine/LICENSE | B1 |
| doctypes | 1.1.0 | MIT | node_modules/.pnpm/doctypes@1.1.0/node_modules/doctypes/LICENSE | B1 |
| dom-accessibility-api | 0.5.16 | MIT | node_modules/.pnpm/dom-accessibility-api@0.5.16/node_modules/dom-accessibility-api/LICENSE.md | B1 |
| dom-accessibility-api | 0.6.3 | MIT | node_modules/.pnpm/dom-accessibility-api@0.6.3/node_modules/dom-accessibility-api/LICENSE.md | B1 |
| dom-align | 1.12.4 | MIT | node_modules/.pnpm/dom-align@1.12.4/node_modules/dom-align/LICENSE.md | B1 |
| dom-scroll-into-view | 2.0.1 | MIT† | （包内无 LICENSE 文件） | B2 |
| dunder-proto | 1.0.1 | MIT | node_modules/.pnpm/dunder-proto@1.0.1/node_modules/dunder-proto/LICENSE | B1 |
| editorconfig | 3.0.2 | MIT | node_modules/.pnpm/editorconfig@3.0.2/node_modules/editorconfig/LICENSE | B1 |
| electron-to-chromium | 1.5.422 | ISC | node_modules/.pnpm/electron-to-chromium@1.5.422/node_modules/electron-to-chromium/LICENSE | B1 |
| empathic | 2.0.1 | MIT | node_modules/.pnpm/empathic@2.0.1/node_modules/empathic/license | B1 |
| entities | 7.0.1 | BSD-2-Clause | node_modules/.pnpm/entities@7.0.1/node_modules/entities/LICENSE | B1 |
| es-define-property | 1.0.1 | MIT | node_modules/.pnpm/es-define-property@1.0.1/node_modules/es-define-property/LICENSE | B1 |
| es-errors | 1.3.0 | MIT | node_modules/.pnpm/es-errors@1.3.0/node_modules/es-errors/LICENSE | B1 |
| es-module-lexer | 1.7.0 | MIT | node_modules/.pnpm/es-module-lexer@1.7.0/node_modules/es-module-lexer/LICENSE | B1 |
| es-object-atoms | 1.1.2 | MIT | node_modules/.pnpm/es-object-atoms@1.1.2/node_modules/es-object-atoms/LICENSE | B1 |
| esbuild | 0.21.5 | MIT | node_modules/.pnpm/esbuild@0.21.5/node_modules/esbuild/LICENSE.md | B1 |
| esbuild | 0.28.2 | MIT | node_modules/.pnpm/esbuild@0.28.2/node_modules/esbuild/LICENSE.md | B1 |
| escalade | 3.2.0 | MIT | node_modules/.pnpm/escalade@3.2.0/node_modules/escalade/license | B1 |
| escape-string-regexp | 4.0.0 | MIT | node_modules/.pnpm/escape-string-regexp@4.0.0/node_modules/escape-string-regexp/license | B1 |
| eslint | 9.39.5 | MIT | node_modules/.pnpm/eslint@9.39.5/node_modules/eslint/LICENSE | B1 |
| eslint-scope | 8.4.0 | BSD-2-Clause | node_modules/.pnpm/eslint-scope@8.4.0/node_modules/eslint-scope/LICENSE | B1 |
| eslint-visitor-keys | 3.4.3 | Apache-2.0 | node_modules/.pnpm/eslint-visitor-keys@3.4.3/node_modules/eslint-visitor-keys/LICENSE | B1 |
| eslint-visitor-keys | 4.2.1 | Apache-2.0 | node_modules/.pnpm/eslint-visitor-keys@4.2.1/node_modules/eslint-visitor-keys/LICENSE | B1 |
| eslint-visitor-keys | 5.0.1 | Apache-2.0 | node_modules/.pnpm/eslint-visitor-keys@5.0.1/node_modules/eslint-visitor-keys/LICENSE | B1 |
| esm-resolve | 1.0.11 | Apache-2.0 | node_modules/.pnpm/esm-resolve@1.0.11/node_modules/esm-resolve/LICENSE | B1 |
| espree | 10.4.0 | BSD-2-Clause | node_modules/.pnpm/espree@10.4.0/node_modules/espree/LICENSE | B1 |
| esprima | 4.0.1 | BSD-2-Clause | node_modules/.pnpm/esprima@4.0.1/node_modules/esprima/LICENSE.BSD | B1 |
| esquery | 1.7.0 | BSD-3-Clause | node_modules/.pnpm/esquery@1.7.0/node_modules/esquery/license.txt | B1 |
| esrecurse | 4.3.0 | BSD-2-Clause† | （包内无 LICENSE 文件） | B2 |
| estraverse | 5.3.0 | BSD-2-Clause | node_modules/.pnpm/estraverse@5.3.0/node_modules/estraverse/LICENSE.BSD | B1 |
| estree-walker | 2.0.2 | MIT | node_modules/.pnpm/estree-walker@2.0.2/node_modules/estree-walker/LICENSE | B1 |
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
| function-bind | 1.1.2 | MIT | node_modules/.pnpm/function-bind@1.1.2/node_modules/function-bind/LICENSE | B1 |
| gensync | 1.0.0-beta.2 | MIT | node_modules/.pnpm/gensync@1.0.0-beta.2/node_modules/gensync/LICENSE | B1 |
| get-intrinsic | 1.3.0 | MIT | node_modules/.pnpm/get-intrinsic@1.3.0/node_modules/get-intrinsic/LICENSE | B1 |
| get-proto | 1.0.1 | MIT | node_modules/.pnpm/get-proto@1.0.1/node_modules/get-proto/LICENSE | B1 |
| glob | 13.0.6 | BlueOak-1.0.0 | node_modules/.pnpm/glob@13.0.6/node_modules/glob/LICENSE.md | B1 |
| glob-parent | 6.0.2 | ISC | node_modules/.pnpm/glob-parent@6.0.2/node_modules/glob-parent/LICENSE | B1 |
| globals | 14.0.0 | MIT | node_modules/.pnpm/globals@14.0.0/node_modules/globals/license | B1 |
| gopd | 1.2.0 | MIT | node_modules/.pnpm/gopd@1.2.0/node_modules/gopd/LICENSE | B1 |
| happy-dom | 20.14.0 | MIT | node_modules/.pnpm/happy-dom@20.14.0/node_modules/happy-dom/LICENSE | B1 |
| has-flag | 4.0.0 | MIT | node_modules/.pnpm/has-flag@4.0.0/node_modules/has-flag/license | B1 |
| has-symbols | 1.1.0 | MIT | node_modules/.pnpm/has-symbols@1.1.0/node_modules/has-symbols/LICENSE | B1 |
| has-tostringtag | 1.0.2 | MIT | node_modules/.pnpm/has-tostringtag@1.0.2/node_modules/has-tostringtag/LICENSE | B1 |
| hash-sum | 2.0.0 | MIT | node_modules/.pnpm/hash-sum@2.0.0/node_modules/hash-sum/license | B1 |
| hasown | 2.0.4 | MIT | node_modules/.pnpm/hasown@2.0.4/node_modules/hasown/LICENSE | B1 |
| ignore | 5.3.2 | MIT | node_modules/.pnpm/ignore@5.3.2/node_modules/ignore/LICENSE-MIT | B1 |
| ignore | 7.0.6 | MIT | node_modules/.pnpm/ignore@7.0.6/node_modules/ignore/LICENSE-MIT | B1 |
| import-fresh | 3.3.1 | MIT | node_modules/.pnpm/import-fresh@3.3.1/node_modules/import-fresh/license | B1 |
| imurmurhash | 0.1.4 | MIT† | （包内无 LICENSE 文件） | B2 |
| indent-string | 4.0.0 | MIT | node_modules/.pnpm/indent-string@4.0.0/node_modules/indent-string/license | B1 |
| ini | 1.3.8 | ISC | node_modules/.pnpm/ini@1.3.8/node_modules/ini/LICENSE | B1 |
| is-core-module | 2.16.2 | MIT | node_modules/.pnpm/is-core-module@2.16.2/node_modules/is-core-module/LICENSE | B1 |
| is-docker | 3.0.0 | MIT | node_modules/.pnpm/is-docker@3.0.0/node_modules/is-docker/license | B1 |
| is-expression | 4.0.0 | MIT | node_modules/.pnpm/is-expression@4.0.0/node_modules/is-expression/LICENSE.md | B1 |
| is-extglob | 2.1.1 | MIT | node_modules/.pnpm/is-extglob@2.1.1/node_modules/is-extglob/LICENSE | B1 |
| is-glob | 4.0.3 | MIT | node_modules/.pnpm/is-glob@4.0.3/node_modules/is-glob/LICENSE | B1 |
| is-inside-container | 1.0.0 | MIT | node_modules/.pnpm/is-inside-container@1.0.0/node_modules/is-inside-container/license | B1 |
| is-plain-object | 3.0.1 | MIT | node_modules/.pnpm/is-plain-object@3.0.1/node_modules/is-plain-object/LICENSE | B1 |
| is-promise | 2.2.2 | MIT | node_modules/.pnpm/is-promise@2.2.2/node_modules/is-promise/LICENSE | B1 |
| is-regex | 1.2.1 | MIT | node_modules/.pnpm/is-regex@1.2.1/node_modules/is-regex/LICENSE | B1 |
| is-wsl | 3.1.1 | MIT | node_modules/.pnpm/is-wsl@3.1.1/node_modules/is-wsl/license | B1 |
| isexe | 2.0.0 | ISC | node_modules/.pnpm/isexe@2.0.0/node_modules/isexe/LICENSE | B1 |
| js-beautify | 2.0.3 | MIT | node_modules/.pnpm/js-beautify@2.0.3/node_modules/js-beautify/LICENSE | B1 |
| js-cookie | 3.0.8 | MIT | node_modules/.pnpm/js-cookie@3.0.8/node_modules/js-cookie/LICENSE | B1 |
| js-stringify | 1.0.2 | MIT | node_modules/.pnpm/js-stringify@1.0.2/node_modules/js-stringify/LICENSE | B1 |
| js-tokens | 4.0.0 | MIT | node_modules/.pnpm/js-tokens@4.0.0/node_modules/js-tokens/LICENSE | B1 |
| jsesc | 3.1.0 | MIT | node_modules/.pnpm/jsesc@3.1.0/node_modules/jsesc/LICENSE-MIT.txt | B1 |
| json-buffer | 3.0.1 | MIT | node_modules/.pnpm/json-buffer@3.0.1/node_modules/json-buffer/LICENSE | B1 |
| json-schema-traverse | 0.4.1 | MIT | node_modules/.pnpm/json-schema-traverse@0.4.1/node_modules/json-schema-traverse/LICENSE | B1 |
| json-stable-stringify-without-jsonify | 1.0.1 | MIT | node_modules/.pnpm/json-stable-stringify-without-jsonify@1.0.1/node_modules/json-stable-stringify-without-jsonify/LICENSE | B1 |
| json2mq | 0.2.0 | MIT | node_modules/.pnpm/json2mq@0.2.0/node_modules/json2mq/LICENSE | B1 |
| json5 | 2.2.3 | MIT | node_modules/.pnpm/json5@2.2.3/node_modules/json5/LICENSE.md | B1 |
| jsonc-parser | 3.3.1 | MIT | node_modules/.pnpm/jsonc-parser@3.3.1/node_modules/jsonc-parser/LICENSE.md | B1 |
| jstransformer | 1.0.0 | MIT | node_modules/.pnpm/jstransformer@1.0.0/node_modules/jstransformer/LICENSE.md | B1 |
| keyv | 4.5.4 | MIT† | （包内无 LICENSE 文件） | B2 |
| levn | 0.4.1 | MIT | node_modules/.pnpm/levn@0.4.1/node_modules/levn/LICENSE | B1 |
| lightningcss | 1.33.0 | MPL-2.0 | node_modules/.pnpm/lightningcss@1.33.0/node_modules/lightningcss/LICENSE | B1 |
| lightningcss-android-arm64 | 1.33.0 | MPL-2.0* | (未安装) | B3 |
| lightningcss-darwin-arm64 | 1.33.0 | MPL-2.0* | (未安装) | B3 |
| lightningcss-darwin-x64 | 1.33.0 | MPL-2.0* | (未安装) | B3 |
| lightningcss-freebsd-x64 | 1.33.0 | MPL-2.0* | (未安装) | B3 |
| lightningcss-linux-arm-gnueabihf | 1.33.0 | MPL-2.0* | (未安装) | B3 |
| lightningcss-linux-arm64-gnu | 1.33.0 | MPL-2.0* | (未安装) | B3 |
| lightningcss-linux-arm64-musl | 1.33.0 | MPL-2.0* | (未安装) | B3 |
| lightningcss-linux-x64-gnu | 1.33.0 | MPL-2.0* | (未安装) | B3 |
| lightningcss-linux-x64-musl | 1.33.0 | MPL-2.0* | (未安装) | B3 |
| lightningcss-win32-arm64-msvc | 1.33.0 | MPL-2.0* | (未安装) | B3 |
| lightningcss-win32-x64-msvc | 1.33.0 | MPL-2.0* | (未安装) | B3 |
| locate-path | 6.0.0 | MIT | node_modules/.pnpm/locate-path@6.0.0/node_modules/locate-path/license | B1 |
| lodash | 4.18.1 | MIT | node_modules/.pnpm/lodash@4.18.1/node_modules/lodash/LICENSE | B1 |
| lodash-es | 4.18.1 | MIT | node_modules/.pnpm/lodash-es@4.18.1/node_modules/lodash-es/LICENSE | B1 |
| lodash.merge | 4.6.2 | MIT | node_modules/.pnpm/lodash.merge@4.6.2/node_modules/lodash.merge/LICENSE | B1 |
| loose-envify | 1.4.0 | MIT | node_modules/.pnpm/loose-envify@1.4.0/node_modules/loose-envify/LICENSE | B1 |
| loupe | 3.2.1 | MIT | node_modules/.pnpm/loupe@3.2.1/node_modules/loupe/LICENSE | B1 |
| lru-cache | 11.5.2 | BlueOak-1.0.0 | node_modules/.pnpm/lru-cache@11.5.2/node_modules/lru-cache/LICENSE.md | B1 |
| lru-cache | 5.1.1 | ISC | node_modules/.pnpm/lru-cache@5.1.1/node_modules/lru-cache/LICENSE | B1 |
| lru-cache | 8.0.5 | ISC | node_modules/.pnpm/lru-cache@8.0.5/node_modules/lru-cache/LICENSE | B1 |
| lz-string | 1.5.0 | MIT | node_modules/.pnpm/lz-string@1.5.0/node_modules/lz-string/LICENSE | B1 |
| magic-string | 0.30.21 | MIT | node_modules/.pnpm/magic-string@0.30.21/node_modules/magic-string/LICENSE | B1 |
| magic-string | 1.2.3 | MIT | node_modules/.pnpm/magic-string@1.2.3/node_modules/magic-string/LICENSE | B1 |
| math-intrinsics | 1.1.0 | MIT | node_modules/.pnpm/math-intrinsics@1.1.0/node_modules/math-intrinsics/LICENSE | B1 |
| min-indent | 1.0.1 | MIT | node_modules/.pnpm/min-indent@1.0.1/node_modules/min-indent/license | B1 |
| minimatch | 10.2.6 | BlueOak-1.0.0 | node_modules/.pnpm/minimatch@10.2.6/node_modules/minimatch/LICENSE.md | B1 |
| minimatch | 3.1.5 | ISC | node_modules/.pnpm/minimatch@3.1.5/node_modules/minimatch/LICENSE | B1 |
| minimist | 1.2.8 | MIT | node_modules/.pnpm/minimist@1.2.8/node_modules/minimist/LICENSE | B1 |
| minipass | 7.1.3 | BlueOak-1.0.0 | node_modules/.pnpm/minipass@7.1.3/node_modules/minipass/LICENSE.md | B1 |
| ms | 2.1.3 | MIT | node_modules/.pnpm/ms@2.1.3/node_modules/ms/license.md | B1 |
| muggle-string | 0.4.1 | MIT | node_modules/.pnpm/muggle-string@0.4.1/node_modules/muggle-string/LICENSE | B1 |
| nanoid | 3.3.18 | MIT | node_modules/.pnpm/nanoid@3.3.18/node_modules/nanoid/LICENSE | B1 |
| nanopop | 2.4.2 | MIT | node_modules/.pnpm/nanopop@2.4.2/node_modules/nanopop/LICENSE | B1 |
| natural-compare | 1.4.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| node-releases | 2.0.54 | MIT | node_modules/.pnpm/node-releases@2.0.54/node_modules/node-releases/LICENSE | B1 |
| nopt | 10.0.1 | ISC | node_modules/.pnpm/nopt@10.0.1/node_modules/nopt/LICENSE | B1 |
| object-assign | 4.1.1 | MIT | node_modules/.pnpm/object-assign@4.1.1/node_modules/object-assign/license | B1 |
| open | 10.2.0 | MIT | node_modules/.pnpm/open@10.2.0/node_modules/open/license | B1 |
| optionator | 0.9.4 | MIT | node_modules/.pnpm/optionator@0.9.4/node_modules/optionator/LICENSE | B1 |
| oxc-parser | 0.127.0 | MIT | node_modules/.pnpm/oxc-parser@0.127.0/node_modules/oxc-parser/LICENSE | B1 |
| oxc-resolver | 11.21.2 | MIT† | （包内无 LICENSE 文件） | B2 |
| p-limit | 3.1.0 | MIT | node_modules/.pnpm/p-limit@3.1.0/node_modules/p-limit/license | B1 |
| p-locate | 5.0.0 | MIT | node_modules/.pnpm/p-locate@5.0.0/node_modules/p-locate/license | B1 |
| parent-module | 1.0.1 | MIT | node_modules/.pnpm/parent-module@1.0.1/node_modules/parent-module/license | B1 |
| path-browserify | 1.0.1 | MIT | node_modules/.pnpm/path-browserify@1.0.1/node_modules/path-browserify/LICENSE | B1 |
| path-exists | 4.0.0 | MIT | node_modules/.pnpm/path-exists@4.0.0/node_modules/path-exists/license | B1 |
| path-key | 3.1.1 | MIT | node_modules/.pnpm/path-key@3.1.1/node_modules/path-key/license | B1 |
| path-parse | 1.0.7 | MIT | node_modules/.pnpm/path-parse@1.0.7/node_modules/path-parse/LICENSE | B1 |
| path-scurry | 2.0.2 | BlueOak-1.0.0 | node_modules/.pnpm/path-scurry@2.0.2/node_modules/path-scurry/LICENSE.md | B1 |
| pathe | 1.1.2 | MIT | node_modules/.pnpm/pathe@1.1.2/node_modules/pathe/LICENSE | B1 |
| pathval | 2.0.1 | MIT | node_modules/.pnpm/pathval@2.0.1/node_modules/pathval/LICENSE | B1 |
| picocolors | 1.1.1 | ISC | node_modules/.pnpm/picocolors@1.1.1/node_modules/picocolors/LICENSE | B1 |
| picomatch | 4.0.7 | MIT | node_modules/.pnpm/picomatch@4.0.7/node_modules/picomatch/LICENSE | B1 |
| postcss | 8.5.26 | MIT | node_modules/.pnpm/postcss@8.5.26/node_modules/postcss/LICENSE | B1 |
| prelude-ls | 1.2.1 | MIT | node_modules/.pnpm/prelude-ls@1.2.1/node_modules/prelude-ls/LICENSE | B1 |
| pretty-format | 27.5.1 | MIT | node_modules/.pnpm/pretty-format@27.5.1/node_modules/pretty-format/LICENSE | B1 |
| promise | 7.3.1 | MIT | node_modules/.pnpm/promise@7.3.1/node_modules/promise/LICENSE | B1 |
| proto-list | 1.2.4 | ISC | node_modules/.pnpm/proto-list@1.2.4/node_modules/proto-list/LICENSE | B1 |
| pug | 3.0.4 | MIT | node_modules/.pnpm/pug@3.0.4/node_modules/pug/LICENSE | B1 |
| pug-attrs | 3.0.0 | MIT | node_modules/.pnpm/pug-attrs@3.0.0/node_modules/pug-attrs/LICENSE | B1 |
| pug-code-gen | 3.0.4 | MIT | node_modules/.pnpm/pug-code-gen@3.0.4/node_modules/pug-code-gen/LICENSE | B1 |
| pug-error | 2.1.0 | MIT | node_modules/.pnpm/pug-error@2.1.0/node_modules/pug-error/LICENSE | B1 |
| pug-filters | 4.0.0 | MIT | node_modules/.pnpm/pug-filters@4.0.0/node_modules/pug-filters/LICENSE | B1 |
| pug-lexer | 5.0.1 | MIT | node_modules/.pnpm/pug-lexer@5.0.1/node_modules/pug-lexer/LICENSE | B1 |
| pug-linker | 4.0.0 | MIT | node_modules/.pnpm/pug-linker@4.0.0/node_modules/pug-linker/LICENSE | B1 |
| pug-load | 3.0.0 | MIT | node_modules/.pnpm/pug-load@3.0.0/node_modules/pug-load/LICENSE | B1 |
| pug-parser | 6.0.0 | MIT | node_modules/.pnpm/pug-parser@6.0.0/node_modules/pug-parser/LICENSE | B1 |
| pug-runtime | 3.0.1 | MIT | node_modules/.pnpm/pug-runtime@3.0.1/node_modules/pug-runtime/LICENSE | B1 |
| pug-strip-comments | 2.0.0 | MIT | node_modules/.pnpm/pug-strip-comments@2.0.0/node_modules/pug-strip-comments/LICENSE.md | B1 |
| pug-walk | 2.0.0 | MIT | node_modules/.pnpm/pug-walk@2.0.0/node_modules/pug-walk/LICENSE | B1 |
| punycode | 2.3.1 | MIT | node_modules/.pnpm/punycode@2.3.1/node_modules/punycode/LICENSE-MIT.txt | B1 |
| rc-cascader | 3.34.0 | MIT | node_modules/.pnpm/rc-cascader@3.34.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-cascader/LICENSE.md | B1 |
| rc-checkbox | 3.5.0 | MIT | node_modules/.pnpm/rc-checkbox@3.5.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-checkbox/LICENSE.md | B1 |
| rc-collapse | 3.9.0 | MIT | node_modules/.pnpm/rc-collapse@3.9.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-collapse/LICENSE.md | B1 |
| rc-dialog | 9.6.0 | MIT | node_modules/.pnpm/rc-dialog@9.6.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-dialog/LICENSE.md | B1 |
| rc-drawer | 7.3.0 | MIT | node_modules/.pnpm/rc-drawer@7.3.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-drawer/LICENSE | B1 |
| rc-dropdown | 4.2.1 | MIT | node_modules/.pnpm/rc-dropdown@4.2.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-dropdown/LICENSE | B1 |
| rc-field-form | 2.7.1 | MIT | node_modules/.pnpm/rc-field-form@2.7.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-field-form/LICENSE | B1 |
| rc-image | 7.12.0 | MIT | node_modules/.pnpm/rc-image@7.12.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-image/LICENSE.md | B1 |
| rc-input | 1.8.0 | MIT | node_modules/.pnpm/rc-input@1.8.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-input/LICENSE.md | B1 |
| rc-input-number | 9.5.0 | MIT | node_modules/.pnpm/rc-input-number@9.5.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-input-number/LICENSE.md | B1 |
| rc-mentions | 2.20.0 | MIT | node_modules/.pnpm/rc-mentions@2.20.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-mentions/LICENSE.md | B1 |
| rc-menu | 9.16.1 | MIT | node_modules/.pnpm/rc-menu@9.16.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-menu/LICENSE.md | B1 |
| rc-motion | 2.9.5 | MIT | node_modules/.pnpm/rc-motion@2.9.5_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-motion/LICENSE.md | B1 |
| rc-notification | 5.6.4 | MIT | node_modules/.pnpm/rc-notification@5.6.4_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-notification/LICENSE.md | B1 |
| rc-overflow | 1.5.0 | MIT | node_modules/.pnpm/rc-overflow@1.5.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-overflow/LICENSE.md | B1 |
| rc-pagination | 5.1.0 | MIT | node_modules/.pnpm/rc-pagination@5.1.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-pagination/LICENSE.md | B1 |
| rc-picker | 4.11.3 | MIT | node_modules/.pnpm/rc-picker@4.11.3_dayjs@1.11.23_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-picker/LICENSE.md | B1 |
| rc-progress | 4.0.0 | MIT | node_modules/.pnpm/rc-progress@4.0.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-progress/LICENSE.md | B1 |
| rc-rate | 2.13.1 | MIT | node_modules/.pnpm/rc-rate@2.13.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-rate/LICENSE.md | B1 |
| rc-resize-observer | 1.4.3 | MIT | node_modules/.pnpm/rc-resize-observer@1.4.3_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-resize-observer/LICENSE.md | B1 |
| rc-segmented | 2.7.1 | MIT | node_modules/.pnpm/rc-segmented@2.7.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-segmented/LICENSE.md | B1 |
| rc-select | 14.16.8 | MIT | node_modules/.pnpm/rc-select@14.16.8_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-select/LICENSE.md | B1 |
| rc-slider | 11.1.9 | MIT | node_modules/.pnpm/rc-slider@11.1.9_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-slider/LICENSE | B1 |
| rc-steps | 6.0.1 | MIT | node_modules/.pnpm/rc-steps@6.0.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-steps/LICENSE.md | B1 |
| rc-switch | 4.1.0 | MIT | node_modules/.pnpm/rc-switch@4.1.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-switch/LICENSE.md | B1 |
| rc-table | 7.54.0 | MIT | node_modules/.pnpm/rc-table@7.54.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-table/LICENSE.md | B1 |
| rc-tabs | 15.7.0 | MIT | node_modules/.pnpm/rc-tabs@15.7.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-tabs/LICENSE.md | B1 |
| rc-textarea | 1.10.2 | MIT | node_modules/.pnpm/rc-textarea@1.10.2_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-textarea/LICENSE.md | B1 |
| rc-tooltip | 6.4.0 | MIT | node_modules/.pnpm/rc-tooltip@6.4.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-tooltip/LICENSE | B1 |
| rc-tree | 5.13.1 | MIT | node_modules/.pnpm/rc-tree@5.13.1_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-tree/LICENSE.md | B1 |
| rc-tree-select | 5.27.0 | MIT | node_modules/.pnpm/rc-tree-select@5.27.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-tree-select/LICENSE.md | B1 |
| rc-upload | 4.11.0 | MIT | node_modules/.pnpm/rc-upload@4.11.0_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-upload/LICENSE | B1 |
| rc-util | 5.44.4 | MIT | node_modules/.pnpm/rc-util@5.44.4_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-util/LICENSE | B1 |
| rc-virtual-list | 3.19.2 | MIT | node_modules/.pnpm/rc-virtual-list@3.19.2_react-dom@18.3.1_react@18.3.1__react@18.3.1/node_modules/rc-virtual-list/LICENSE | B1 |
| react | 18.3.1 | MIT | node_modules/.pnpm/react@18.3.1/node_modules/react/LICENSE | B1 |
| react-docgen | 8.0.3 | MIT | node_modules/.pnpm/react-docgen@8.0.3/node_modules/react-docgen/LICENSE | B1 |
| react-docgen-typescript | 2.4.0 | MIT | node_modules/.pnpm/react-docgen-typescript@2.4.0_typescript@5.9.3/node_modules/react-docgen-typescript/LICENSE.md | B1 |
| react-dom | 18.3.1 | MIT | node_modules/.pnpm/react-dom@18.3.1_react@18.3.1/node_modules/react-dom/LICENSE | B1 |
| react-is | 17.0.2 | MIT | node_modules/.pnpm/react-is@17.0.2/node_modules/react-is/LICENSE | B1 |
| react-is | 18.3.1 | MIT | node_modules/.pnpm/react-is@18.3.1/node_modules/react-is/LICENSE | B1 |
| recast | 0.23.21 | MIT | node_modules/.pnpm/recast@0.23.21/node_modules/recast/LICENSE | B1 |
| redent | 3.0.0 | MIT | node_modules/.pnpm/redent@3.0.0/node_modules/redent/license | B1 |
| resize-observer-polyfill | 1.5.1 | MIT | node_modules/.pnpm/resize-observer-polyfill@1.5.1/node_modules/resize-observer-polyfill/LICENSE | B1 |
| resolve | 1.22.12 | MIT | node_modules/.pnpm/resolve@1.22.12/node_modules/resolve/LICENSE | B1 |
| resolve-from | 4.0.0 | MIT | node_modules/.pnpm/resolve-from@4.0.0/node_modules/resolve-from/license | B1 |
| rolldown | 1.2.7 | MIT | node_modules/.pnpm/rolldown@1.2.7/node_modules/rolldown/LICENSE | B1 |
| rollup | 4.63.0 | MIT | node_modules/.pnpm/rollup@4.63.0/node_modules/rollup/LICENSE.md | B1 |
| run-applescript | 7.1.0 | MIT | node_modules/.pnpm/run-applescript@7.1.0/node_modules/run-applescript/license | B1 |
| scheduler | 0.23.2 | MIT | node_modules/.pnpm/scheduler@0.23.2/node_modules/scheduler/LICENSE | B1 |
| scroll-into-view-if-needed | 2.2.31 | MIT | node_modules/.pnpm/scroll-into-view-if-needed@2.2.31/node_modules/scroll-into-view-if-needed/LICENSE | B1 |
| scroll-into-view-if-needed | 3.1.0 | MIT | node_modules/.pnpm/scroll-into-view-if-needed@3.1.0/node_modules/scroll-into-view-if-needed/LICENSE | B1 |
| semver | 6.3.1 | ISC | node_modules/.pnpm/semver@6.3.1/node_modules/semver/LICENSE | B1 |
| semver | 7.8.5 | ISC | node_modules/.pnpm/semver@7.8.5/node_modules/semver/LICENSE | B1 |
| shallow-equal | 1.2.1 | MIT | node_modules/.pnpm/shallow-equal@1.2.1/node_modules/shallow-equal/LICENSE | B1 |
| shebang-command | 2.0.0 | MIT | node_modules/.pnpm/shebang-command@2.0.0/node_modules/shebang-command/license | B1 |
| shebang-regex | 3.0.0 | MIT | node_modules/.pnpm/shebang-regex@3.0.0/node_modules/shebang-regex/license | B1 |
| siginfo | 2.0.0 | ISC | node_modules/.pnpm/siginfo@2.0.0/node_modules/siginfo/LICENSE | B1 |
| source-map | 0.6.1 | BSD-3-Clause | node_modules/.pnpm/source-map@0.6.1/node_modules/source-map/LICENSE | B1 |
| source-map-js | 1.2.1 | BSD-3-Clause | node_modules/.pnpm/source-map-js@1.2.1/node_modules/source-map-js/LICENSE | B1 |
| stackback | 0.0.2 | MIT† | （包内无 LICENSE 文件） | B2 |
| std-env | 3.10.0 | MIT | node_modules/.pnpm/std-env@3.10.0/node_modules/std-env/LICENCE | B1 |
| storybook | 10.6.0 | MIT† | （包内无 LICENSE 文件） | B2 |
| string-convert | 0.2.1 | MIT | node_modules/.pnpm/string-convert@0.2.1/node_modules/string-convert/LICENSE | B1 |
| strip-bom | 3.0.0 | MIT | node_modules/.pnpm/strip-bom@3.0.0/node_modules/strip-bom/license | B1 |
| strip-indent | 3.0.0 | MIT | node_modules/.pnpm/strip-indent@3.0.0/node_modules/strip-indent/license | B1 |
| strip-indent | 4.1.1 | MIT | node_modules/.pnpm/strip-indent@4.1.1/node_modules/strip-indent/license | B1 |
| strip-json-comments | 3.1.1 | MIT | node_modules/.pnpm/strip-json-comments@3.1.1/node_modules/strip-json-comments/license | B1 |
| stylis | 4.4.0 | MIT | node_modules/.pnpm/stylis@4.4.0/node_modules/stylis/LICENSE | B1 |
| supports-color | 7.2.0 | MIT | node_modules/.pnpm/supports-color@7.2.0/node_modules/supports-color/license | B1 |
| supports-preserve-symlinks-flag | 1.0.0 | MIT | node_modules/.pnpm/supports-preserve-symlinks-flag@1.0.0/node_modules/supports-preserve-symlinks-flag/LICENSE | B1 |
| tagged-tag | 1.0.0 | MIT | node_modules/.pnpm/tagged-tag@1.0.0/node_modules/tagged-tag/license | B1 |
| throttle-debounce | 5.0.2 | MIT | node_modules/.pnpm/throttle-debounce@5.0.2/node_modules/throttle-debounce/LICENSE.md | B1 |
| tiny-invariant | 1.3.3 | MIT | node_modules/.pnpm/tiny-invariant@1.3.3/node_modules/tiny-invariant/LICENSE | B1 |
| tinybench | 2.9.0 | MIT | node_modules/.pnpm/tinybench@2.9.0/node_modules/tinybench/LICENSE | B1 |
| tinyexec | 0.3.2 | MIT | node_modules/.pnpm/tinyexec@0.3.2/node_modules/tinyexec/LICENSE | B1 |
| tinyglobby | 0.2.17 | MIT | node_modules/.pnpm/tinyglobby@0.2.17/node_modules/tinyglobby/LICENSE | B1 |
| tinypool | 1.1.1 | MIT | node_modules/.pnpm/tinypool@1.1.1/node_modules/tinypool/LICENSE | B1 |
| tinyrainbow | 1.2.0 | MIT | node_modules/.pnpm/tinyrainbow@1.2.0/node_modules/tinyrainbow/LICENCE | B1 |
| tinyrainbow | 2.0.0 | MIT | node_modules/.pnpm/tinyrainbow@2.0.0/node_modules/tinyrainbow/LICENCE | B1 |
| tinyspy | 3.0.2 | MIT | node_modules/.pnpm/tinyspy@3.0.2/node_modules/tinyspy/LICENCE | B1 |
| tinyspy | 4.0.6 | MIT | node_modules/.pnpm/tinyspy@4.0.6/node_modules/tinyspy/LICENCE | B1 |
| toggle-selection | 1.0.6 | MIT† | （包内无 LICENSE 文件） | B2 |
| token-stream | 1.0.0 | MIT | node_modules/.pnpm/token-stream@1.0.0/node_modules/token-stream/LICENSE | B1 |
| ts-api-utils | 2.5.0 | MIT | node_modules/.pnpm/ts-api-utils@2.5.0_typescript@5.9.3/node_modules/ts-api-utils/LICENSE.md | B1 |
| ts-dedent | 2.3.0 | MIT | node_modules/.pnpm/ts-dedent@2.3.0/node_modules/ts-dedent/LICENSE | B1 |
| ts-map | 1.0.3 | MIT | node_modules/.pnpm/ts-map@1.0.3/node_modules/ts-map/LICENCE | B1 |
| tsconfig-paths | 4.2.0 | MIT | node_modules/.pnpm/tsconfig-paths@4.2.0/node_modules/tsconfig-paths/LICENSE | B1 |
| tslib | 2.8.1 | 0BSD | node_modules/.pnpm/tslib@2.8.1/node_modules/tslib/LICENSE.txt | B1 |
| type-check | 0.4.0 | MIT | node_modules/.pnpm/type-check@0.4.0/node_modules/type-check/LICENSE | B1 |
| type-fest | 5.9.0 | CC0-1.0 | node_modules/.pnpm/type-fest@5.9.0/node_modules/type-fest/license-cc0 | B1 |
| typescript | 5.9.3 | Apache-2.0 | node_modules/.pnpm/typescript@5.9.3/node_modules/typescript/LICENSE.txt | B1 |
| typescript-eslint | 8.68.0 | MIT | node_modules/.pnpm/typescript-eslint@8.68.0_eslint@9.39.5_typescript@5.9.3/node_modules/typescript-eslint/LICENSE | B1 |
| undici-types | 6.21.0 | MIT | node_modules/.pnpm/undici-types@6.21.0/node_modules/undici-types/LICENSE | B1 |
| unplugin | 2.3.11 | MIT | node_modules/.pnpm/unplugin@2.3.11/node_modules/unplugin/LICENSE | B1 |
| update-browserslist-db | 1.3.2 | MIT | node_modules/.pnpm/update-browserslist-db@1.3.2_browserslist@4.28.9/node_modules/update-browserslist-db/LICENSE | B1 |
| uri-js | 4.4.1 | BSD-2-Clause | node_modules/.pnpm/uri-js@4.4.1/node_modules/uri-js/LICENSE | B1 |
| use-sync-external-store | 1.6.0 | MIT | node_modules/.pnpm/use-sync-external-store@1.6.0_react@18.3.1/node_modules/use-sync-external-store/LICENSE | B1 |
| vite | 5.4.21 | MIT | node_modules/.pnpm/vite@5.4.21_@types+node@22.20.1_lightningcss@1.33.0/node_modules/vite/LICENSE.md | B1 |
| vite | 8.2.2 | MIT | node_modules/.pnpm/vite@8.2.2_@types+node@22.20.1_esbuild@0.28.2/node_modules/vite/LICENSE.md | B1 |
| vite-node | 2.1.9 | MIT | node_modules/.pnpm/vite-node@2.1.9_@types+node@22.20.1_lightningcss@1.33.0/node_modules/vite-node/LICENSE | B1 |
| vitest | 2.1.9 | MIT | node_modules/.pnpm/vitest@2.1.9_@types+node@22.20.1_happy-dom@20.14.0_lightningcss@1.33.0/node_modules/vitest/LICENSE.md | B1 |
| void-elements | 3.1.0 | MIT | node_modules/.pnpm/void-elements@3.1.0/node_modules/void-elements/LICENSE | B1 |
| vscode-uri | 3.2.0 | MIT | node_modules/.pnpm/vscode-uri@3.2.0/node_modules/vscode-uri/LICENSE.md | B1 |
| vue | 3.5.42 | MIT | node_modules/.pnpm/vue@3.5.42_typescript@5.9.3/node_modules/vue/LICENSE | B1 |
| vue-component-meta | 3.3.11 | MIT | node_modules/.pnpm/vue-component-meta@3.3.11_typescript@5.9.3/node_modules/vue-component-meta/LICENSE | B1 |
| vue-component-type-helpers | 3.3.11 | MIT | node_modules/.pnpm/vue-component-type-helpers@3.3.11/node_modules/vue-component-type-helpers/LICENSE | B1 |
| vue-docgen-api | 4.79.2 | MIT | node_modules/.pnpm/vue-docgen-api@4.79.2_vue@3.5.42_typescript@5.9.3_/node_modules/vue-docgen-api/LICENSE | B1 |
| vue-inbrowser-compiler-independent-utils | 4.71.1 | MIT | node_modules/.pnpm/vue-inbrowser-compiler-independent-utils@4.71.1_vue@3.5.42_typescript@5.9.3_/node_modules/vue-inbrowser-compiler-independent-utils/LICENSE | B1 |
| vue-types | 3.0.2 | MIT | node_modules/.pnpm/vue-types@3.0.2_vue@3.5.42_typescript@5.9.3_/node_modules/vue-types/LICENSE | B1 |
| warning | 4.0.3 | MIT | node_modules/.pnpm/warning@4.0.3/node_modules/warning/LICENSE.md | B1 |
| webpack-virtual-modules | 0.6.2 | MIT | node_modules/.pnpm/webpack-virtual-modules@0.6.2/node_modules/webpack-virtual-modules/LICENSE | B1 |
| whatwg-mimetype | 3.0.0 | MIT | node_modules/.pnpm/whatwg-mimetype@3.0.0/node_modules/whatwg-mimetype/LICENSE.txt | B1 |
| which | 2.0.2 | ISC | node_modules/.pnpm/which@2.0.2/node_modules/which/LICENSE | B1 |
| why-is-node-running | 2.3.0 | MIT | node_modules/.pnpm/why-is-node-running@2.3.0/node_modules/why-is-node-running/LICENSE | B1 |
| with | 7.0.2 | MIT | node_modules/.pnpm/with@7.0.2/node_modules/with/LICENSE | B1 |
| word-wrap | 1.2.5 | MIT | node_modules/.pnpm/word-wrap@1.2.5/node_modules/word-wrap/LICENSE | B1 |
| ws | 8.21.3 | MIT | node_modules/.pnpm/ws@8.21.3/node_modules/ws/LICENSE | B1 |
| wsl-utils | 0.1.0 | MIT | node_modules/.pnpm/wsl-utils@0.1.0/node_modules/wsl-utils/license | B1 |
| yallist | 3.1.1 | ISC | node_modules/.pnpm/yallist@3.1.1/node_modules/yallist/LICENSE | B1 |
| yocto-queue | 0.1.0 | MIT | node_modules/.pnpm/yocto-queue@0.1.0/node_modules/yocto-queue/license | B1 |
<!-- notices-sync:end:section-b -->


## §2 特殊条目注记

1. **argparse@2.0.1 — Python-2.0**：js-yaml@4.3.2 的依赖（仅 dev 侧）。包内 LICENSE 文件为 Python Software Foundation 许可证全文（含历史说明），与 `Python-2.0` SPDX id 一致（B1）。
2. **minimatch@10.2.6 — BlueOak-1.0.0**：`@typescript-eslint/typescript-estree@8.68.0` 的依赖。Blue Oak Model License 1.0.0 为现代宽松许可证（非 MIT/BSD/Apache 家族），包内 LICENSE.md 全文核对一致（B1）。分发 notice 建议原文保留。
3. **@pkgjs/parseargs 双源不一致（不在本 lockfile 内，仅记录）**：本机 node_modules 残留的 `@pkgjs/parseargs@0.11.0`（c8 树残留，见 §3）package.json 声明 MIT 但包内 LICENSE 文件为 Apache-2.0 全文。该包**不属于本 lockfile 依赖面**，但作为上游双源不一致样本记录在案；若未来进入依赖面需 Owner/上游确认。
4. **`require-from-string@2.0.2` 与多个 sindresorhus 系包的 license 文件名为小写 `license`**：属文件名大小写差异，内容均为对应 license id 全文（B1）。

## §3 node_modules 与 lockfile 漂移（审计发现）

本机 `node_modules/.pnpm` 存在 **46 个不属于当前 pnpm-lock.yaml 的残留包**（c8@10.1.3 / istanbul 系 / yargs 系 / glob@10 树等）。溯源：安装时点 lock 副本（`node_modules/.pnpm/lock.yaml`）含已删除的 workspace importer `docs/audit-fx`（devDeps: c8+vitest）；该 importer 移除后 lockfile 收敛，但 node_modules 未重装。残留包 license id 见文末附录表。**建议**：Owner 执行一次干净重装（删 `node_modules` + `pnpm install`）使本机安装面与 lockfile 对齐；本清单以 lockfile 为准，不受漂移影响。

## §4 Owner 签字位（License Decision Gate §87.5 相关）

- [x] **O-L1 许可路线裁定**：是否采纳 PRD §87.3 默认推荐（PolyForm Noncommercial 1.0.0 + 单独 Commercial License）作为对外分发许可？（备选：§87.4 表中 AGPL-3.0 / PolyForm Internal Use / PolyForm Small Business / BSL 1.1 / 自定义 EULA）——**已采纳（Owner 直答 2026-09-01），LICENSE 已落盘**。
- [x] **O-L2 分发口径**：对外分发形态是「源码仓库可见」还是「产物分发」？§B 开发工具链依赖是否进入分发物（决定 THIRD_PARTY_NOTICES 对外版本的收录范围）？——**源码仓库公开可见（Owner 确认 2026-09-01，public 已成事实）；本清单 204 包（§A+§B）即对外版收录范围**。
- [x] **O-L3 §87.5 yaml 两个显式 Owner 位**：`free_internal_business_use`（企业内部商用是否免费）与 `free_small_business_use`（小企业商用是否免费）——PRD 显式标注「必须由 Owner 决定」，Agent 不得代填。——**Owner 2026-09-01 裁定：均否（不豁免，商用另谈）**；正式载体=COMMERCIAL_LICENSE.md 严格口径声明。
- [x] **O-L4 正式 LICENSE 落盘**：裁定后按 §87.6 要求落盘官方标准文本 LICENSE（PolyForm 全文不魔改）+ COMMERCIAL_LICENSE.md / TRADEMARKS.md / CONTRIBUTING.md / SECURITY.md 等其余法律文件清单。——**已执行（2026-09-01，官方 blob 字节级比对一致）**。
- [x] **O-L5 node_modules 漂移处置**：是否授权执行干净重装以消除 §3 的 46 包残留？——**已授权（Owner 2026-09-01），随 P36 收尾执行；本清单以 lockfile 为锚不受影响**。

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

