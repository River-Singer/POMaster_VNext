// React sidecar 生成器（S2 · Owner 二次裁定：sidecar 内容源 = antd（React 原版）
// 真渲染，与 antdv 同设计系统两端对照浏览；geist 无渲染实例——诚实说明页手写）。
//
// 枚举路径（与 Vue 主实例同构）：静态解析 node_modules 内 antd/es/index.js 的
// `export { default as X } from './x';` 行——版本钉 5.29.3 实抓。
//
// 对齐裁定：组件族清单与 antdv 4.2.6 侧（71 族）对齐——antdv 有而 antd 5.29.3 无的
// 三族（Comment / PageHeader / LocaleProvider，v5 已移除）不在座、记入对齐差异表；
// antd 独有导出（BackTop/ColorPicker/Splitter）记入差异表不产对齐 story。
// 每页标注「Vue 对应件」做 antdv↔antd 对照浏览（本 sidecar 的独特价值）。
//
// 纪律：遥测双关闭 + private 不入发布面 + generated/ 产物 gitignore——全部照抄
// Vue 主实例；「Vue 对应件」注记与「服务场景」反向映射共用 Vue 主实例的
// archetype-component-map.json（单一事实源，跨包只读 import）。
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { resetDir, writeFileEnsuringDir } from "../../../studio/scripts/lib/common.mjs";
import {
  deriveReverseMap,
  readArchetypeComponentMap,
} from "../../../studio/scripts/lib/archetype-map.mjs";

// antd 深路径（pnpm 符号链接经本包 node_modules 解析；lib/ → 包根上溯两级）。
const ANTD_INDEX_JS = join(
  import.meta.dirname,
  "..",
  "..",
  "node_modules",
  "antd",
  "es",
  "index.js",
);
const ANTD_VERSION = "5.29.3";

/**
 * antdv 4.2.6 族 → antd 5.29.3 对齐表（71 族逐条；antd=null = v5 已移除，差异表在座）。
 * vSelectiveNote：antdv 特有用法差异注记（React items 形态等——antdv 4.x 无 items
 * 的是 Vue 侧事实；React 侧按 antd 官方 items prop 词形）。
 */
const ALIGNMENT = [
  { antdv: "Affix", antd: "Affix" },
  { antdv: "Alert", antd: "Alert" },
  { antdv: "Anchor", antd: "Anchor" },
  { antdv: "App", antd: "App" },
  { antdv: "AutoComplete", antd: "AutoComplete" },
  { antdv: "Avatar", antd: "Avatar" },
  { antdv: "Badge", antd: "Badge" },
  { antdv: "Breadcrumb", antd: "Breadcrumb" },
  { antdv: "Button", antd: "Button" },
  { antdv: "Calendar", antd: "Calendar" },
  { antdv: "Card", antd: "Card" },
  { antdv: "Carousel", antd: "Carousel" },
  { antdv: "Cascader", antd: "Cascader" },
  { antdv: "Checkbox", antd: "Checkbox" },
  { antdv: "Col", antd: "Col" },
  { antdv: "Collapse", antd: "Collapse" },
  { antdv: "Comment", antd: null, note: "antd v5 已移除（Vue 侧 antdv 4.2.6 仍在座）" },
  { antdv: "ConfigProvider", antd: "ConfigProvider" },
  { antdv: "DatePicker", antd: "DatePicker" },
  { antdv: "Descriptions", antd: "Descriptions" },
  { antdv: "Divider", antd: "Divider" },
  { antdv: "Dropdown", antd: "Dropdown" },
  { antdv: "Drawer", antd: "Drawer" },
  { antdv: "Empty", antd: "Empty" },
  { antdv: "FloatButton", antd: "FloatButton" },
  { antdv: "Form", antd: "Form" },
  { antdv: "Grid", antd: "Grid" },
  { antdv: "Image", antd: "Image" },
  { antdv: "Input", antd: "Input" },
  { antdv: "InputNumber", antd: "InputNumber" },
  { antdv: "Layout", antd: "Layout" },
  { antdv: "List", antd: "List" },
  { antdv: "LocaleProvider", antd: null, note: "antd v5 已移除（ConfigProvider 取代；Vue 侧仍在座）" },
  { antdv: "Mentions", antd: "Mentions" },
  { antdv: "Menu", antd: "Menu" },
  { antdv: "message", antd: "message" },
  { antdv: "Modal", antd: "Modal" },
  { antdv: "Statistic", antd: "Statistic" },
  { antdv: "notification", antd: "notification" },
  { antdv: "PageHeader", antd: null, note: "antd v5 已移除（Vue 侧 antdv 4.2.6 仍在座）" },
  { antdv: "Pagination", antd: "Pagination" },
  { antdv: "Popconfirm", antd: "Popconfirm" },
  { antdv: "Popover", antd: "Popover" },
  { antdv: "Progress", antd: "Progress" },
  { antdv: "QRCode", antd: "QRCode" },
  { antdv: "Radio", antd: "Radio" },
  { antdv: "Rate", antd: "Rate" },
  { antdv: "Result", antd: "Result" },
  { antdv: "Row", antd: "Row" },
  { antdv: "Select", antd: "Select" },
  { antdv: "Skeleton", antd: "Skeleton" },
  { antdv: "Slider", antd: "Slider" },
  { antdv: "Space", antd: "Space" },
  { antdv: "Spin", antd: "Spin" },
  { antdv: "Steps", antd: "Steps" },
  { antdv: "Switch", antd: "Switch" },
  { antdv: "Table", antd: "Table" },
  { antdv: "Tabs", antd: "Tabs" },
  { antdv: "Tag", antd: "Tag" },
  { antdv: "TimePicker", antd: "TimePicker" },
  { antdv: "Timeline", antd: "Timeline" },
  { antdv: "Tooltip", antd: "Tooltip" },
  { antdv: "Tour", antd: "Tour" },
  { antdv: "Transfer", antd: "Transfer" },
  { antdv: "Tree", antd: "Tree" },
  { antdv: "TreeSelect", antd: "TreeSelect" },
  { antdv: "Typography", antd: "Typography" },
  { antdv: "Upload", antd: "Upload" },
  { antdv: "Watermark", antd: "Watermark" },
  { antdv: "Segmented", antd: "Segmented" },
  { antdv: "Flex", antd: "Flex" },
];

/** antd 独有导出（antdv 族清单外）——差异表呈现，不产对齐 story。 */
export const ANTD_ONLY_EXPORTS = ["BackTop", "ColorPicker", "Splitter"];

/** 解析 antd es/index.js 的默认导出名（文件序，确定性）。 */
export function parseAntdExports(indexJsContent) {
  const names = [];
  const exportPattern = /^export\s*\{\s*default as ([A-Za-z][A-Za-z0-9]*)\s*\}\s*from\s*'[^']+';\s*$/;
  for (const line of indexJsContent.split("\n")) {
    const match = exportPattern.exec(line.trim());
    if (match) names.push(match[1]);
  }
  if (names.length === 0) {
    throw new Error("antd es/index.js 解析出 0 个导出——文件形态变化？");
  }
  return names;
}

/** 服务场景注记（与 Vue 侧同源反向映射——共用 archetype-component-map.json）。 */
function serviceSceneNote(primary, reverseMap) {
  const scenes = reverseMap.get(primary);
  if (!scenes || scenes.length === 0) return "";
  const slugs = scenes
    .map((scene) => scene.archetype.replace(/^archetype\./, "").replace(/\.json$/, ""))
    .slice(0, 5)
    .join("、");
  return ` 服务场景（archetype 反向映射）：${slugs}——见 Vue 主实例 Archetype 语义卡。`;
}

/** 对齐族的 JSX 演示体（antd 5 官方词形：items/options 数据 prop 形态）。
 *  extraImports = 该族演示体需要的额外 antd 导入（文件级 import 并集）。 */
const DEMO_BODY = {
  Affix: { extraImports: [], body: '<Affix offsetTop={48}><span className="studio-demo-chip">滚动固定的内容块</span></Affix>' },
  Alert: { extraImports: [], body: '<Alert message="提示文案" type="success" showIcon />' },
  Anchor: { extraImports: [], body: '<Anchor><AnchorLink href="#studio-react-anchor" title="演示锚点" /></Anchor><p id="studio-react-anchor">锚点目标段落</p>' },
  App: { extraImports: [], body: "<App><span>应用容器内的内容</span></App>" },
  AutoComplete: { extraImports: [], body: '<AutoComplete options={[{ value: "选项甲" }, { value: "选项乙" }]} placeholder="请输入" style={{ width: 160 }} />' },
  Avatar: { extraImports: [], body: "<Avatar.Group><Avatar>甲</Avatar><Avatar>乙</Avatar></Avatar.Group>" },
  Badge: { extraImports: [], body: '<Badge count={5}><span className="studio-demo-chip">消息</span></Badge>' },
  Breadcrumb: { extraImports: [], body: "<Breadcrumb><Breadcrumb.Item>首页</Breadcrumb.Item><Breadcrumb.Item>分类</Breadcrumb.Item><Breadcrumb.Item>详情</Breadcrumb.Item></Breadcrumb>" },
  Button: { extraImports: ["Space"], body: '<Space wrap><Button type="primary">主要按钮</Button><Button>默认按钮</Button><Button type="link">链接</Button></Space>' },
  Calendar: { extraImports: [], body: "<Calendar fullscreen={false} />" },
  Card: { extraImports: [], body: '<Card title="卡片标题"><Card.Meta title="元信息标题" description="元信息描述" /></Card>' },
  Carousel: { extraImports: [], body: "<Carousel><div>幻灯片一</div><div>幻灯片二</div></Carousel>" },
  Cascader: { extraImports: [], body: '<Cascader options={[{ value: "yi", label: "选项一", children: [{ value: "yi-a", label: "子选项一" }] }]} placeholder="请选择" style={{ width: 200 }} />' },
  Checkbox: { extraImports: ["Space"], body: '<Space><Checkbox>复选框</Checkbox><Checkbox.Group options={["选项甲", "选项乙"]} /></Space>' },
  Col: { extraImports: [], body: "<Col span={12}>列内容</Col>" },
  Collapse: { extraImports: [], body: '<Collapse items={[{ key: "1", label: "面板一", children: "内容一" }, { key: "2", label: "面板二", children: "内容二" }]} />' },
  ConfigProvider: { extraImports: [], body: "<ConfigProvider><span>配置上下文内的内容</span></ConfigProvider>" },
  DatePicker: { extraImports: [], body: '<DatePicker placeholder="请选择日期" />' },
  Descriptions: { extraImports: [], body: '<Descriptions title="详情标题" items={[{ key: "1", label: "名称", children: "值" }, { key: "2", label: "说明", children: "说明内容" }]} />' },
  Divider: { extraImports: [], body: "<Divider>分割线</Divider>" },
  Dropdown: { extraImports: ["Button"], body: '<Dropdown menu={{ items: [{ key: "1", label: "菜单项一" }, { key: "2", label: "菜单项二" }] }}><Button>下拉触发</Button></Dropdown>' },
  Drawer: { extraImports: [], body: '<Drawer open title="抽屉标题"><p>抽屉内容</p></Drawer>' },
  Empty: { extraImports: [], body: "<Empty />" },
  FloatButton: { extraImports: [], body: '<FloatButton tooltip="悬浮按钮" />' },
  Form: { extraImports: ["Input"], body: '<Form style={{ maxWidth: 320 }}><Form.Item label="名称" name="name"><Input placeholder="请输入名称" /></Form.Item></Form>' },
  Grid: { extraImports: ["Row", "Col"], body: '<Row gutter={8}><Col span={12}>栅格列甲</Col><Col span={12}>栅格列乙</Col></Row>' },
  Image: { extraImports: [], body: "<Image width={96} />" },
  Input: { extraImports: [], body: '<Input placeholder="基础输入" style={{ width: 160 }} />' },
  InputNumber: { extraImports: [], body: "<InputNumber min={0} max={10} defaultValue={5} />" },
  Layout: { extraImports: [], body: "<Layout><Layout.Header>页头</Layout.Header><Layout><Layout.Sider>侧栏</Layout.Sider><Layout.Content>内容区</Layout.Content></Layout><Layout.Footer>页脚</Layout.Footer></Layout>" },
  List: { extraImports: [], body: '<List size="small" bordered dataSource={["列表条目一", "列表条目二"]} renderItem={(item) => <List.Item>{item}</List.Item>} />' },
  Mentions: { extraImports: [], body: '<Mentions options={[{ value: "甲" }, { value: "乙" }]} placeholder="输入 @ 触发" style={{ width: 160 }} />' },
  Menu: { extraImports: [], body: '<Menu mode="inline" style={{ width: 200 }} items={[{ key: "1", label: "导航一" }, { key: "2", label: "导航二" }]} />' },
  message: { extraImports: [], body: "SERVICE_MESSAGE" },
  Modal: { extraImports: [], body: '<Modal open title="对话框标题"><p>对话框内容</p></Modal>' },
  Statistic: { extraImports: ["Space"], body: '<Space><Statistic title="示例数值" value={42} /><Statistic.Countdown title="示例倒计时" value={1893456000000} /></Space>' },
  notification: { extraImports: [], body: "SERVICE_NOTIFICATION" },
  Pagination: { extraImports: [], body: "<Pagination total={50} />" },
  Popconfirm: { extraImports: ["Button"], body: '<Popconfirm title="确认执行？"><Button>触发确认</Button></Popconfirm>' },
  Popover: { extraImports: [], body: '<Popover title="浮层标题" content="浮层内容"><span>悬浮触发</span></Popover>' },
  Progress: { extraImports: [], body: "<Progress percent={60} />" },
  QRCode: { extraImports: [], body: '<QRCode value="POMASTER-DEMO" />' },
  Radio: { extraImports: ["Space"], body: '<Space><Radio>单选项</Radio><Radio.Group options={["甲", "乙"]} /></Space>' },
  Rate: { extraImports: [], body: "<Rate defaultValue={3} />" },
  Result: { extraImports: [], body: '<Result status="success" title="操作完成" sub-title="结果说明" />' },
  Row: { extraImports: ["Col"], body: '<Row gutter={8}><Col span={12}>列甲</Col><Col span={12}>列乙</Col></Row>' },
  Select: { extraImports: [], body: '<Select options={[{ value: "a", label: "选项甲" }, { value: "b", label: "选项乙" }]} placeholder="请选择" style={{ width: 160 }} />' },
  Skeleton: { extraImports: [], body: "<Skeleton loading active avatar paragraph={{ rows: 2 }} />" },
  Slider: { extraImports: [], body: '<Slider defaultValue={30} style={{ width: 160 }} />' },
  Space: { extraImports: [], body: "<Space><span>甲</span><span>乙</span></Space>" },
  Spin: { extraImports: [], body: "<Spin />" },
  Steps: { extraImports: [], body: '<Steps current={1} items={[{ title: "步骤一" }, { title: "步骤二" }, { title: "步骤三" }]} />' },
  Switch: { extraImports: [], body: "<Switch defaultChecked />" },
  Table: { extraImports: [], body: '<Table columns={[{ title: "名称", dataIndex: "name", key: "name" }, { title: "数量", dataIndex: "count", key: "count" }]} dataSource={[{ key: "1", name: "示例甲", count: 12 }, { key: "2", name: "示例乙", count: 34 }]} size="small" />' },
  Tabs: { extraImports: [], body: '<Tabs items={[{ key: "1", label: "标签一", children: "内容一" }, { key: "2", label: "标签二", children: "内容二" }]} />' },
  Tag: { extraImports: ["Space"], body: '<Space><Tag>标签</Tag><Tag color="success">成功</Tag></Space>' },
  TimePicker: { extraImports: [], body: '<TimePicker placeholder="请选择时间" />' },
  Timeline: { extraImports: [], body: '<Timeline items={[{ children: "节点一" }, { children: "节点二" }, { children: "节点三" }]} />' },
  Tooltip: { extraImports: [], body: '<Tooltip title="提示文字"><span>悬浮目标</span></Tooltip>' },
  Tour: { extraImports: [], body: '<Tour open steps={[{ title: "步骤标题", description: "步骤说明" }]} />' },
  Transfer: { extraImports: [], body: '<Transfer dataSource={[{ key: "1", title: "条目一" }, { key: "2", title: "条目二" }]} render={(item) => item.title} />' },
  Tree: { extraImports: [], body: '<Tree treeData={[{ title: "节点一", key: "node-1", children: [{ title: "子节点", key: "node-1-1" }] }]} defaultExpandAll />' },
  TreeSelect: { extraImports: [], body: '<TreeSelect treeData={[{ title: "树选项一", value: "tree-1" }]} placeholder="请选择" style={{ width: 200 }} />' },
  Typography: { extraImports: [], body: '<Space direction="vertical"><Typography.Title level={4}>标题</Typography.Title><Typography.Text type="secondary">文本</Typography.Text><Typography.Paragraph>文本段落</Typography.Paragraph></Space>' },
  Upload: { extraImports: ["Button"], body: '<Upload beforeUpload={() => false}><Button>上传文件</Button></Upload>' },
  Watermark: { extraImports: [], body: '<Watermark content="演示水印"><div style={{ height: 96 }}>水印内容区域</div></Watermark>' },
  Segmented: { extraImports: [], body: '<Segmented options={[{ label: "日", value: "day" }, { label: "周", value: "week" }]} defaultValue="day" />' },
  Flex: { extraImports: [], body: '<Flex gap="small"><span>甲</span><span>乙</span></Flex>' },
};

/** 服务式 API（message/notification）触发演示体。 */
function serviceDemoBody(primary) {
  return `<button className="studio-demo-trigger" onClick={() => ${primary}.info('POMaster 画廊演示：${primary} 服务式 API')}>触发 ${primary}（服务式 API）</button>`;
}

/** 对齐族 → CSF3 story（tsx）文本。 */
export function renderReactStory(entry, reverseMap) {
  const { antd, antdv } = entry;
  const isService = antd === "message" || antd === "notification";
  const demoConfig = DEMO_BODY[antd];
  if (!demoConfig) throw new Error(`antd 族 ${antd} 缺演示体（DEMO_BODY）`);
  const demo = isService ? serviceDemoBody(antd) : demoConfig.body;
  const extraImports = isService ? [] : demoConfig.extraImports;
  const sceneNote = serviceSceneNote(antdv, reverseMap);
  const serviceNote = isService
    ? `${antd} 是服务式 API（非组件）——画廊以触发按钮做真实调用演示。`
    : "";
  const metaLines = [
    `const meta = {`,
    `  title: 'AntD 组件/${antd}',`,
    ...(isService ? [] : [`  component: ${antd},`]),
    `  parameters: {`,
    `    docs: { description: { component: 'antd ${ANTD_VERSION} 真渲染（React sidecar，S2）。${serviceNote}Vue 对应件：ant-design-vue 4.2.6 的 ${antdv}——同设计系统两端对照浏览。${sceneNote}' } },`,
    `  },`,
    ...(isService ? [`};`] : [`} satisfies Meta<typeof ${antd}>;`]),
  ];
  return [
    `// GENERATED by packages/studio-react/scripts/lib/generate-react-stories.mjs —— 禁手改（重跑生成器覆盖）。`,
    `// 源：node_modules/antd/es/index.js export 行（版本钉 ${ANTD_VERSION}，对齐族 ${antd}）。`,
    `// NON-AUTHORITATIVE：画廊对照呈现，权威语义以 catalog/seeds 锚定源为准（G-D：业务零出现）。`,
    `import type { Meta, StoryObj } from '@storybook/react';`,
    `import { ${[antd, ...extraImports].join(", ")} } from 'antd';`,
    ``,
    ...metaLines,
    `export default meta;`,
    ``,
    `export const Default: StoryObj = {`,
    `  render: () => (`,
    `    <div className="studio-demo">${demo}</div>`,
    `  ),`,
    `};`,
    ``,
  ].join("\n");
}

/** 生成全部对齐族 story（返回 { count, files, aligned, missing, antdOnly }；outDir 幂等清场重建）。 */
export function generateReactStories(outDir, antdIndexPath = ANTD_INDEX_JS) {
  if (!outDir) throw new Error("generateReactStories 需要显式 outDir（generate-all 注入）");
  // 对齐表完整性 fail-closed：恰为 antdv 4.2.6 的 71 族（分母钉），无重复条目。
  const antdvNames = ALIGNMENT.map((entry) => entry.antdv);
  if (antdvNames.length !== 71) {
    throw new Error(`对齐表条目数漂移：${antdvNames.length} ≠ 71（antdv 4.2.6 族分母）`);
  }
  const duplicates = antdvNames.filter((name, index) => antdvNames.indexOf(name) !== index);
  if (duplicates.length > 0) {
    throw new Error(`对齐表重复条目: ${duplicates.join("、")}`);
  }
  const exports = parseAntdExports(readFileSync(antdIndexPath, "utf8"));
  const exportSet = new Set(exports);
  const reverseMap = deriveReverseMap(
    readArchetypeComponentMap(),
    ALIGNMENT.map((entry) => entry.antdv),
  );
  resetDir(outDir);
  const files = [];
  const aligned = [];
  const missing = [];
  for (const entry of ALIGNMENT) {
    if (entry.antd === null) {
      missing.push({ antdv: entry.antdv, note: entry.note ?? "" });
      continue;
    }
    if (!exportSet.has(entry.antd)) {
      throw new Error(`对齐表引用了 antd ${ANTD_VERSION} 不存在的导出: ${entry.antd}`);
    }
    const target = join(outDir, `${entry.antd}.stories.tsx`);
    writeFileEnsuringDir(target, renderReactStory(entry, reverseMap));
    files.push(target);
    aligned.push(entry);
  }
  // antd 独有导出存在性对账（差异表词形漂移即生成失败）。
  for (const name of ANTD_ONLY_EXPORTS) {
    if (!exportSet.has(name)) throw new Error(`ANTD_ONLY_EXPORTS 词形失效: ${name}`);
  }
  return {
    count: files.length,
    files,
    aligned: aligned.map((entry) => entry.antdv),
    missing,
    antdOnly: ANTD_ONLY_EXPORTS,
    antdExportCount: exports.length,
  };
}
