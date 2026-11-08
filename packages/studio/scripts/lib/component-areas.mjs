// 组件类型取并集（Vue · Ant Design 抽屉）：统一骨架（skeleton.yaml）里的每个组件领域落到哪个画廊页。
//
// - family：ant-design-vue 有这个类型——落到生成的「AntDV 组件/<族>」页；via 是那一页里演示这个类型的写法，
//   必须原样出现在生成的 story 里（tests/component-areas.spec.ts 核对），没有 via 的表示族本身就是这个类型。
// - custom：ant-design-vue 没有、Geist 有的类型——按 antd 的 token 在 src/components/ 里自建，页在
//   「AntDV 组件/自建/…」（src/gallery/*.stories.ts）。
//
// 与 React · Geist 抽屉对称：那边把 antd 才有的类型用 Geist 的 token 自建，这边把 Geist 才有的类型用 antd 的 token 自建，
// 两个抽屉都覆盖骨架的全部 97 个组件领域。
import { readFileSync } from "node:fs";
import yaml from "js-yaml";
import { SKELETON_PATH } from "./standard.mjs";

/** @type {Record<string, { family?: string; via?: string; custom?: string }>} */
export const COMPONENT_AREAS = {
  // 通用
  button: { family: "Button" },
  split_button: { family: "Dropdown", via: "DropdownButton" },
  copy_button: { family: "Typography", via: "copyable" },
  float_button: { family: "FloatButton" },
  typography_text: { family: "Typography" },
  code_block: { custom: "CodeBlock" },
  snippet: { custom: "Snippet" },
  kbd: { family: "Typography", via: "keyboard" },
  // 布局
  divider: { family: "Divider" },
  flex: { family: "Flex" },
  space: { family: "Space" },
  grid_component: { family: "Row" },
  page_layout: { family: "Layout" },
  scroller: { custom: "Scroller" },
  // 导航
  anchor: { family: "Anchor" },
  breadcrumb: { family: "Breadcrumb" },
  dropdown: { family: "Dropdown" },
  context_menu: { family: "Dropdown", via: "contextmenu" },
  command_menu: { custom: "CommandMenu" },
  nav_menu: { family: "Menu" },
  pagination: { family: "Pagination" },
  load_more: { family: "List", via: "#loadMore" },
  steps: { family: "Steps" },
  tabs: { family: "Tabs" },
  // 数据录入
  auto_complete: { family: "AutoComplete" },
  combobox: { family: "Select", via: "show-search" },
  cascader: { family: "Cascader" },
  checkbox: { family: "Checkbox" },
  choicebox: { custom: "Choicebox" },
  date_picker: { family: "DatePicker" },
  time_picker: { family: "TimePicker" },
  form: { family: "Form" },
  input: { family: "Input" },
  search_input: { family: "Input", via: "InputSearch" },
  textarea: { family: "Input", via: "Textarea" },
  input_number: { family: "InputNumber" },
  mentions: { family: "Mentions" },
  radio: { family: "Radio" },
  rate: { family: "Rate" },
  select: { family: "Select" },
  multi_select: { family: "Select", via: 'mode="multiple"' },
  slider: { family: "Slider" },
  switch: { family: "Switch" },
  segmented: { family: "Segmented" },
  transfer: { family: "Transfer" },
  tree_select: { family: "TreeSelect" },
  upload: { family: "Upload" },
  address_input: { custom: "AddressInput" },
  destructive_input: { custom: "DestructiveInput" },
  filter_bar: { custom: "FilterBar" },
  feedback_widget: { custom: "FeedbackWidget" },
  theme_switcher: { custom: "ThemeSwitcher" },
  // 数据展示
  avatar: { family: "Avatar" },
  badge: { family: "Badge" },
  tag: { family: "Tag" },
  status_dot: { family: "Badge", via: 'status="success"' },
  calendar: { family: "Calendar" },
  card: { family: "Card" },
  carousel: { family: "Carousel" },
  collapse: { family: "Collapse" },
  descriptions: { family: "Descriptions" },
  empty: { family: "Empty" },
  image: { family: "Image" },
  video: { custom: "Video" },
  list: { family: "List" },
  popover: { family: "Popover" },
  relative_time: { custom: "RelativeTime" },
  qrcode: { family: "QRCode" },
  statistic: { family: "Statistic" },
  gauge: { family: "Progress", via: 'type="dashboard"' },
  table: { family: "Table" },
  timeline: { family: "Timeline" },
  tooltip: { family: "Tooltip" },
  tour: { family: "Tour" },
  tree: { family: "Tree" },
  json_view: { custom: "JsonView" },
  middle_truncate: { custom: "MiddleTruncate" },
  device_frame: { custom: "DeviceFrame" },
  book: { custom: "Book" },
  comment: { family: "Comment" },
  page_header: { family: "PageHeader" },
  // 反馈
  alert: { family: "Alert" },
  banner: { family: "Alert", via: "banner" },
  drawer: { family: "Drawer" },
  bottom_sheet: { family: "Drawer", via: 'placement="bottom"' },
  message: { family: "message" },
  notification: { family: "notification" },
  modal: { family: "Modal" },
  destructive_modal: { family: "Modal", via: "danger: true" },
  popconfirm: { family: "Popconfirm" },
  progress: { family: "Progress" },
  result: { family: "Result" },
  skeleton: { family: "Skeleton" },
  spin: { family: "Spin" },
  watermark: { family: "Watermark" },
  // 其他
  affix: { family: "Affix" },
  config_provider: { family: "ConfigProvider" },
};

/** 骨架里的组件领域（文件序）：{ key, title_zh, group }。 */
export function skeletonComponentAreas(skeletonPath = SKELETON_PATH) {
  const skeleton = yaml.load(readFileSync(skeletonPath, "utf8"));
  return skeleton.areas.filter((area) => String(area.group).startsWith("components.")).map((area) => ({ key: area.key, title_zh: area.title_zh, group: area.group }));
}

/** 族 → 它覆盖的组件领域中文名（生成族页说明里的「对应规范组件领域」）。 */
export function areasByFamily(areas = skeletonComponentAreas()) {
  const byFamily = new Map();
  for (const area of areas) {
    const entry = COMPONENT_AREAS[area.key];
    if (entry?.family === undefined) continue;
    const label = entry.via === undefined ? area.title_zh : `${area.title_zh}（${entry.via}）`;
    byFamily.set(entry.family, [...(byFamily.get(entry.family) ?? []), label]);
  }
  return byFamily;
}
