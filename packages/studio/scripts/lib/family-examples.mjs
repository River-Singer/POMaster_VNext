// 组件族示例配置表（审计 N4 修复 · 声明式最小合法组合）。
//
// 裁定来源：审计 09-06 N4——components.mjs 曾把主/子导出当兄弟节点裸挂载，
// MenuItem 等要求 Menu 注入上下文（useInjectMenu() 无兜底，源码实抓：es/menu/src/
// hooks/useMenuContext.js 唯二无兜底 inject 之一，另一为 vc-cascader 且无消费者），
// 浏览器实测 Menu 预览崩溃（Cannot destructure property 'prefixCls'）、Tabs 空 tablist。
//
// 本表 = 族 → 最小合法组合的单一事实源：
// - kind "curated"：prop/上下文/children 饥饿族，给出官方形态最小数据（内容为
//   组件用法示例，NON-AUTHORITATIVE；形态按 antdv 4.2.6 源码实抓核定，见各条目注）；
//   同族子导出一律在父级组合内部结构中渲染，绝不兄弟裸挂载。
// - kind "default"：无必需 props 的叶子族，保持生成器基础渲染形态（裸挂载/slot 文本）。
//   仅限「全部导出均独立合法」的族（源码 sweep 证实只有 Menu 族子导出有上下文硬依赖）。
// - kind "service"：服务式 API（message/notification），触发按钮真实调用演示。
// - kind "utility"：非组件导出（Grid = { useBreakpoint } 工具命名空间，es/grid/index.js
//   default export 实抓），以 Row/Col 栅格组合演示语义，绝不伪造组件挂载。
//
// 测试消费：keyDom/minCount/portal 供真实挂载断言（tests/components-mount.spec.ts）——
// 「有生成文件」不再冒充「可挂载」，逐族断言关键 DOM 存在。
//
// 形态核定的关键源码事实（antdv 4.2.6，node_modules 实抓）：
// 1. Menu：items 数组形态在座（useItems.js convertItemsToNodes）；无 items 时回退
//    children（Menu.js `itemsNodes.value || flattenChildren(slots.default)`，弃用警告
//    已被上游注释掉）——items + children 双形态皆合法，模板两种都用。
// 2. Tabs：4.2.6 无 items prop（tabsProps 无 items；wrapper 仅 parseTabList(children)）
//    ——TabPane children 是唯一官方形态（「Tabs 用 items」不适用于 antdv，系 React antd 5 形态）。
// 3. Collapse/Descriptions/Timeline：无 items prop，children 形态（CollapsePanel/
//    DescriptionsItem/TimelineItem）为官方形态；Steps 经 vc-steps 双轨（items + children）。
// 4. Tree/TreeSelect/Mentions：children 形态 deprecated 但功能在座（仅 dev 警告）；
//    模板以 treeData/options 形态为主、children 形态覆盖子导出。
// 5. List：renderItem prop 或 slot（list/index.js `props.renderItem ?? slots.renderItem`）。
// 6. Transfer：dataSource + render prop 在座。
// 7. AutoComplete：无 options prop 时回退 slots.options/dataSource（deprecated 警告）；
//    子导出经 #options slot 父内渲染。
// 8. table/Column.js、ColumnGroup.js：纯 no-op 存根（render return null）——置于 Table
//    children（旧 slot-columns API 的合法父位）覆盖导出面。
export const FAMILY_EXAMPLES = new Map([
  // ————— curated（上下文/数据饥饿族：官方形态最小合法组合） —————
  [
    "Affix",
    {
      kind: "curated",
      keyDom: "span",
      template:
        '<Affix :offset-top="48"><span class="studio-demo-chip">滚动固定的内容块</span></Affix>',
    },
  ],
  [
    "Anchor",
    {
      kind: "curated",
      keyDom: ".ant-anchor",
      template:
        '<Anchor><AnchorLink href="#studio-demo-anchor" title="演示锚点" /></Anchor>' +
        '<p id="studio-demo-anchor">锚点目标段落</p>',
    },
  ],
  [
    "AutoComplete",
    {
      kind: "curated",
      keyDom: ".ant-select",
      minCount: 2,
      setupData: `{
        autoCompleteOptions: [{ value: "选项甲" }, { value: "选项乙" }],
      }`,
      template:
        '<AutoComplete :options="autoCompleteOptions" placeholder="请输入" style="width: 160px;" />' +
        '<AutoComplete placeholder="子导出组合" style="width: 160px;">' +
        '<template #options><AutoCompleteOptGroup label="分组"><AutoCompleteOption value="a">选项甲</AutoCompleteOption></AutoCompleteOptGroup></template>' +
        "</AutoComplete>",
    },
  ],
  [
    "Alert",
    {
      kind: "curated",
      keyDom: ".ant-alert",
      template: '<Alert message="提示文案" type="success" show-icon />',
    },
  ],
  [
    "Avatar",
    {
      kind: "curated",
      keyDom: ".ant-avatar",
      minCount: 2,
      template: '<AvatarGroup><Avatar>甲</Avatar><Avatar>乙</Avatar></AvatarGroup>',
    },
  ],
  [
    "Badge",
    {
      kind: "curated",
      keyDom: ".ant-badge",
      template:
        '<Badge :count="5"><span class="studio-demo-chip">消息</span></Badge>' +
        '<BadgeRibbon text="丝带"><span class="studio-demo-chip">丝带内容</span></BadgeRibbon>',
    },
  ],
  [
    "Breadcrumb",
    {
      kind: "curated",
      keyDom: ".ant-breadcrumb",
      template:
        "<Breadcrumb>" +
        '<BreadcrumbItem>首页</BreadcrumbItem><BreadcrumbItem>分类</BreadcrumbItem>' +
        "<BreadcrumbSeparator />" +
        "<BreadcrumbItem>详情</BreadcrumbItem></Breadcrumb>",
    },
  ],
  [
    "Button",
    {
      kind: "curated",
      keyDom: ".ant-btn",
      minCount: 3,
      template:
        '<Button type="primary">主要按钮</Button>' +
        "<ButtonGroup><Button>组内甲</Button><Button>组内乙</Button></ButtonGroup>",
    },
  ],
  [
    "Card",
    {
      kind: "curated",
      keyDom: ".ant-card",
      minCount: 2,
      template:
        '<Card title="卡片标题"><CardMeta title="元信息标题" description="元信息描述" /></Card>' +
        '<Card hoverable><CardGrid style="width: 25%; text-align: center;">栅格卡片</CardGrid></Card>',
    },
  ],
  [
    "Collapse",
    {
      kind: "curated",
      keyDom: ".ant-collapse-item",
      minCount: 2,
      template:
        "<Collapse>" +
        '<CollapsePanel key="1" header="面板一">内容一</CollapsePanel>' +
        '<CollapsePanel key="2" header="面板二">内容二</CollapsePanel>' +
        "</Collapse>",
    },
  ],
  [
    "Carousel",
    {
      kind: "curated",
      keyDom: ".slick-slide",
      minCount: 2,
      template:
        "<Carousel><div>幻灯片一</div><div>幻灯片二</div></Carousel>",
    },
  ],
  [
    "Cascader",
    {
      kind: "curated",
      keyDom: ".ant-select, .ant-cascader",
      minCount: 1,
      setupData: `{
        cascaderOptions: [
          { value: "yi", label: "选项一", children: [{ value: "yi-a", label: "子选项一" }] },
          { value: "er", label: "选项二" },
        ],
      }`,
      template:
        '<Cascader :options="cascaderOptions" placeholder="请选择" style="width: 200px;" />',
    },
  ],
  [
    "Checkbox",
    {
      kind: "curated",
      keyDom: ".ant-checkbox",
      minCount: 3,
      template:
        "<Checkbox>复选框</Checkbox>" +
        '<CheckboxGroup :options="[\'选项甲\', \'选项乙\']" />',
    },
  ],
  [
    "Col",
    {
      kind: "curated",
      keyDom: ".ant-col",
      template: '<Col :span="12">列内容</Col>',
    },
  ],
  [
    "Comment",
    {
      kind: "curated",
      keyDom: ".ant-comment",
      template:
        '<Comment author="演示用户"><template #content><p>评论内容</p></template></Comment>',
    },
  ],
  [
    "ConfigProvider",
    {
      kind: "curated",
      keyDom: "span",
      template: "<ConfigProvider><span>配置上下文内的内容</span></ConfigProvider>",
    },
  ],
  [
    "Descriptions",
    {
      kind: "curated",
      keyDom: ".ant-descriptions-item",
      minCount: 2,
      template:
        '<Descriptions title="详情标题">' +
        '<DescriptionsItem label="名称">值</DescriptionsItem>' +
        '<DescriptionsItem label="说明">说明内容</DescriptionsItem></Descriptions>',
    },
  ],
  [
    "Dropdown",
    {
      kind: "curated",
      keyDom: ".ant-btn",
      minCount: 2,
      extraImports: ["Button"],
      setupData: `{
        dropdownMenu: { items: [{ key: "1", label: "菜单项一" }, { key: "2", label: "菜单项二" }] },
      }`,
      template:
        '<Dropdown :menu="dropdownMenu"><Button>下拉触发</Button></Dropdown>' +
        '<DropdownButton :menu="dropdownMenu">按钮下拉</DropdownButton>',
    },
  ],
  [
    "Drawer",
    {
      kind: "curated",
      keyDom: ".ant-drawer",
      portal: true,
      template: '<Drawer :open="true" title="抽屉标题"><p>抽屉内容</p></Drawer>',
    },
  ],
  [
    "FloatButton",
    {
      kind: "curated",
      keyDom: ".ant-float-btn",
      minCount: 2,
      template:
        '<FloatButtonGroup><FloatButton tooltip="悬浮按钮" /></FloatButtonGroup><BackTop />',
    },
  ],
  [
    "Form",
    {
      kind: "curated",
      keyDom: ".ant-form-item",
      extraImports: ["Input"],
      setupData: `{
        formState: { name: "" },
      }`,
      template:
        '<Form :model="formState">' +
        '<FormItem label="名称" name="name"><Input v-model:value="formState.name" placeholder="请输入名称" /></FormItem>' +
        "<FormItemRest><span>非表单项区域</span></FormItemRest>" +
        "</Form>",
    },
  ],
  [
    "Input",
    {
      kind: "curated",
      keyDom: ".ant-input",
      minCount: 5,
      template:
        '<Input placeholder="基础输入" />' +
        "<InputGroup><Input placeholder=\"组合输入一\" /><Input placeholder=\"组合输入二\" /></InputGroup>" +
        '<InputPassword placeholder="密码输入" /><InputSearch placeholder="搜索输入" />' +
        '<Textarea placeholder="多行输入" :rows="2" />',
    },
  ],
  [
    "Image",
    {
      kind: "curated",
      keyDom: ".ant-image",
      minCount: 2,
      template:
        '<ImagePreviewGroup><Image :width="96" /><Image :width="96" /></ImagePreviewGroup>',
    },
  ],
  [
    "Layout",
    {
      kind: "curated",
      keyDom: ".ant-layout",
      minCount: 2,
      template:
        "<Layout>" +
        '<LayoutHeader>页头</LayoutHeader>' +
        "<Layout><LayoutSider>侧栏</LayoutSider><LayoutContent>内容区</LayoutContent></Layout>" +
        "<LayoutFooter>页脚</LayoutFooter>" +
        "</Layout>",
    },
  ],
  [
    "List",
    {
      kind: "curated",
      keyDom: ".ant-list-item",
      minCount: 2,
      setupData: `{
        listData: ["列表条目一", "列表条目二"],
      }`,
      template:
        '<List :data-source="listData">' +
        '<template #renderItem="{ item }"><ListItem><ListItemMeta title="列表标题" :description="item" /></ListItem></template>' +
        "</List>",
    },
  ],
  [
    "Menu",
    {
      // 审计 N4 主症状族：items 形态（4.2.6 官方）+ children 形态覆盖四个子导出
      //（MenuItem/MenuItemGroup/SubMenu/MenuDivider 必须父内渲染——useInjectMenu 无兜底）。
      kind: "curated",
      keyDom: '[role="menu"] [role="menuitem"]',
      minCount: 4,
      setupData: `{
        menuItems: [
          { key: "1", label: "导航一" },
          { key: "2", label: "导航二" },
          { key: "3", label: "导航三" },
        ],
      }`,
      template:
        '<Menu mode="inline" :items="menuItems" style="width: 200px;" />' +
        '<Menu mode="inline" style="width: 200px;">' +
        '<MenuItemGroup title="分组标题"><MenuItem key="group-a">菜单项甲</MenuItem><MenuItem key="group-b">菜单项乙</MenuItem></MenuItemGroup>' +
        '<SubMenu key="sub-1" title="子菜单"><MenuItem key="sub-1-a">子菜单项</MenuItem></SubMenu>' +
        "<MenuDivider />" +
        "</Menu>",
    },
  ],
  [
    "Mentions",
    {
      kind: "curated",
      keyDom: "textarea",
      minCount: 2,
      setupData: `{
        mentionsOptions: [{ value: "甲" }, { value: "乙" }],
      }`,
      template:
        '<Mentions :options="mentionsOptions" placeholder="输入 @ 触发" style="width: 160px;" />' +
        '<Mentions placeholder="子导出组合"><MentionsOption value="甲">选项甲</MentionsOption></Mentions>',
    },
  ],
  [
    "Modal",
    {
      kind: "curated",
      keyDom: ".ant-modal",
      portal: true,
      template: '<Modal :open="true" title="对话框标题"><p>对话框内容</p></Modal>',
    },
  ],
  [
    "Statistic",
    {
      kind: "curated",
      keyDom: ".ant-statistic",
      minCount: 2,
      template:
        '<Statistic title="示例数值" :value="42" />' +
        '<StatisticCountdown title="示例倒计时" :value="1893456000000" />',
    },
  ],
  [
    "PageHeader",
    {
      kind: "curated",
      keyDom: ".ant-page-header",
      template: '<PageHeader title="页头标题" />',
    },
  ],
  [
    "Pagination",
    {
      kind: "curated",
      keyDom: ".ant-pagination-item",
      minCount: 2,
      template: '<Pagination :total="50" />',
    },
  ],
  [
    "Popconfirm",
    {
      kind: "curated",
      keyDom: ".ant-btn",
      extraImports: ["Button"],
      template: '<Popconfirm title="确认执行？"><Button>触发确认</Button></Popconfirm>',
    },
  ],
  [
    "Popover",
    {
      kind: "curated",
      keyDom: "span",
      template: '<Popover title="浮层标题" content="浮层内容"><span>悬浮触发</span></Popover>',
    },
  ],
  [
    "Progress",
    {
      kind: "curated",
      keyDom: ".ant-progress",
      template: '<Progress :percent="60" />',
    },
  ],
  [
    "Radio",
    {
      // RadioButton 渲染独立类名 .ant-radio-button-wrapper（与 wrapper 并集覆盖三形态）。
      kind: "curated",
      keyDom: ".ant-radio-wrapper, .ant-radio-button-wrapper",
      minCount: 5,
      template:
        "<Radio>单选项</Radio>" +
        "<RadioGroup :options=\"['甲', '乙']\" />" +
        "<RadioGroup><RadioButton value=\"jia\">按钮甲</RadioButton><RadioButton value=\"yi\">按钮乙</RadioButton></RadioGroup>",
    },
  ],
  [
    "Result",
    {
      kind: "curated",
      keyDom: ".ant-result",
      template: '<Result title="操作完成" sub-title="结果说明" />',
    },
  ],
  [
    "Row",
    {
      kind: "curated",
      keyDom: ".ant-row",
      extraImports: ["Col"],
      template:
        '<Row :gutter="8"><Col :span="12">列甲</Col><Col :span="12">列乙</Col></Row>',
    },
  ],
  [
    "Select",
    {
      kind: "curated",
      keyDom: '[role="combobox"]',
      minCount: 2,
      setupData: `{
        selectOptions: [{ value: "a", label: "选项甲" }, { value: "b", label: "选项乙" }],
      }`,
      template:
        '<Select :options="selectOptions" placeholder="请选择" style="width: 160px;" />' +
        '<Select placeholder="分组子导出" style="width: 160px;">' +
        '<SelectOptGroup label="分组"><SelectOption value="a">选项甲</SelectOption><SelectOption value="b">选项乙</SelectOption></SelectOptGroup>' +
        "</Select>",
    },
  ],
  [
    "Segmented",
    {
      // value 为 required prop（segmentedProps 实抓）——静态 demo 给受控值。
      kind: "curated",
      keyDom: ".ant-segmented-item",
      minCount: 3,
      setupData: `{
        segmentedValue: "day",
        segmentedOptions: [{ label: "日", value: "day" }, { label: "周", value: "week" }, { label: "月", value: "month" }],
      }`,
      template: '<Segmented :value="segmentedValue" :options="segmentedOptions" />',
    },
  ],
  [
    "Space",
    {
      kind: "curated",
      keyDom: ".ant-space, .ant-space-compact",
      minCount: 2,
      extraImports: ["Input"],
      template:
        "<Space><span>甲</span><span>乙</span></Space>" +
        '<Compact><Input placeholder="输入甲" /><Input placeholder="输入乙" /></Compact>',
    },
  ],
  [
    "Steps",
    {
      kind: "curated",
      keyDom: ".ant-steps-item",
      minCount: 3,
      template:
        '<Steps :current="1"><Step title="步骤一" /><Step title="步骤二" /><Step title="步骤三" /></Steps>',
    },
  ],
  [
    "Table",
    {
      kind: "curated",
      keyDom: "tbody tr",
      minCount: 2,
      setupData: `{
        tableColumns: [
          { title: "名称", dataIndex: "name", key: "name" },
          { title: "数量", dataIndex: "count", key: "count" },
        ],
        tableData: [
          { key: "1", name: "示例甲", count: 12 },
          { key: "2", name: "示例乙", count: 34 },
        ],
      }`,
      template:
        '<Table :columns="tableColumns" :data-source="tableData">' +
        "<template #summary><TableSummary><TableSummaryRow><TableSummaryCell :index=\"0\" :col-span=\"2\">汇总</TableSummaryCell></TableSummaryRow></TableSummary></template>" +
        "<TableColumn /><TableColumnGroup><TableColumn /></TableColumnGroup>" +
        "</Table>",
    },
  ],
  [
    "Tabs",
    {
      // 审计 N4 症状族：4.2.6 无 items prop（源码实抓）——TabPane children 是官方形态。
      kind: "curated",
      keyDom: '[role="tablist"] [role="tab"]',
      minCount: 2,
      template:
        "<Tabs>" +
        '<TabPane key="1" tab="标签一">内容一</TabPane>' +
        '<TabPane key="2" tab="标签二">内容二</TabPane>' +
        '<TabPane key="3" tab="标签三">内容三</TabPane>' +
        "</Tabs>",
    },
  ],
  [
    "Tag",
    {
      kind: "curated",
      keyDom: ".ant-tag",
      minCount: 2,
      template: '<Tag>标签</Tag><CheckableTag :checked="true">可选中标签</CheckableTag>',
    },
  ],
  [
    "Timeline",
    {
      kind: "curated",
      keyDom: ".ant-timeline-item",
      minCount: 3,
      template:
        "<Timeline><TimelineItem>节点一</TimelineItem><TimelineItem>节点二</TimelineItem><TimelineItem>节点三</TimelineItem></Timeline>",
    },
  ],
  [
    "Tooltip",
    {
      kind: "curated",
      keyDom: "span",
      template: '<Tooltip title="提示文字"><span>悬浮目标</span></Tooltip>',
    },
  ],
  [
    "Tree",
    {
      kind: "curated",
      keyDom: ".ant-tree-treenode",
      minCount: 4,
      setupData: `{
        treeData: [
          { title: "节点一", key: "node-1", children: [{ title: "子节点", key: "node-1-1" }] },
        ],
      }`,
      template:
        '<Tree :tree-data="treeData" default-expand-all />' +
        '<Tree default-expand-all><TreeNode title="树节点甲" key="t-a"><TreeNode title="子树节点" key="t-a-1" /></TreeNode><TreeNode title="树节点乙" key="t-b" /></Tree>' +
        '<DirectoryTree :tree-data="treeData" default-expand-all />',
    },
  ],
  [
    "TreeSelect",
    {
      kind: "curated",
      keyDom: ".ant-select",
      minCount: 2,
      setupData: `{
        treeSelectData: [
          { title: "树选项一", value: "tree-1", children: [{ title: "子树选项", value: "tree-1-1" }] },
        ],
      }`,
      template:
        '<TreeSelect :tree-data="treeSelectData" placeholder="请选择" style="width: 200px;" />' +
        '<TreeSelect placeholder="子导出组合" style="width: 200px;"><TreeSelectNode title="树选项甲" value="a" /></TreeSelect>',
    },
  ],
  [
    "Transfer",
    {
      kind: "curated",
      keyDom: ".ant-transfer-list",
      minCount: 2,
      setupData: `{
        transferData: [
          { key: "1", title: "条目一" },
          { key: "2", title: "条目二" },
        ],
        transferRender: (item) => item.title,
      }`,
      template: '<Transfer :data-source="transferData" :render="transferRender" />',
    },
  ],
  [
    "Upload",
    {
      kind: "curated",
      keyDom: ".ant-upload",
      minCount: 2,
      extraImports: ["Button"],
      setupData: `{
        keepUploadLocal: () => false,
      }`,
      template:
        '<Upload :before-upload="keepUploadLocal"><Button>上传文件</Button></Upload>' +
        "<UploadDragger><p>拖拽上传区域</p></UploadDragger>",
    },
  ],
  [
    "Watermark",
    {
      // happy-dom 无 2d canvas 位图（尺寸 0 不出水印层）——断言组件签名包裹层
      //（position: relative 容器）+ 子内容在座，语义=水印容器真实挂载。
      kind: "curated",
      keyDom: 'div[style*="position: relative"]',
      template:
        '<Watermark content="演示水印"><div style="height: 96px;">水印内容区域</div></Watermark>',
    },
  ],
  [
    "QRCode",
    {
      kind: "curated",
      keyDom: ".ant-qrcode",
      template: '<QRCode value="POMASTER-DEMO" />',
    },
  ],
  [
    "Tour",
    {
      kind: "curated",
      keyDom: ".ant-tour",
      portal: true,
      setupData: `{
        tourSteps: [{ title: "步骤标题", description: "步骤说明" }],
      }`,
      template: '<Tour :open="true" :steps="tourSteps" />',
    },
  ],
  [
    "App",
    {
      kind: "curated",
      keyDom: "span",
      template: "<App><span>应用容器内的内容</span></App>",
    },
  ],
  [
    "Flex",
    {
      kind: "curated",
      keyDom: ".ant-flex",
      template: '<Flex gap="small"><span>甲</span><span>乙</span></Flex>',
    },
  ],
  [
    "LocaleProvider",
    {
      kind: "curated",
      keyDom: "span",
      template: "<LocaleProvider><span>遗留本地化容器内的内容</span></LocaleProvider>",
    },
  ],

  // ————— default（无必需 props 的叶子族：保持基础渲染形态，全部导出独立合法） —————
  ["Calendar", { kind: "default", keyDom: ".ant-picker-calendar, .ant-picker-panel" }],
  ["DatePicker", { kind: "default", keyDom: ".ant-picker", minCount: 5 }],
  ["Divider", { kind: "default", keyDom: ".ant-divider" }],
  ["Empty", { kind: "default", keyDom: ".ant-empty" }],
  ["InputNumber", { kind: "default", keyDom: ".ant-input-number" }],
  ["Rate", { kind: "default", keyDom: ".ant-rate" }],
  ["Skeleton", { kind: "default", keyDom: ".ant-skeleton", minCount: 2 }],
  ["Slider", { kind: "default", keyDom: ".ant-slider" }],
  ["Spin", { kind: "default", keyDom: ".ant-spin" }],
  ["Switch", { kind: "default", keyDom: ".ant-switch" }],
  ["TimePicker", { kind: "default", keyDom: ".ant-picker", minCount: 2 }],
  ["Typography", { kind: "default", keyDom: ".ant-typography", minCount: 4 }],

  // ————— service（服务式 API：触发按钮真实调用演示，保持现有形态） —————
  ["message", { kind: "service", keyDom: ".studio-demo-trigger" }],
  ["notification", { kind: "service", keyDom: ".studio-demo-trigger" }],

  // ————— utility（非组件导出：工具命名空间，栅格语义演示） —————
  [
    "Grid",
    {
      kind: "utility",
      keyDom: ".ant-row",
      extraImports: ["Row", "Col"],
      template:
        '<Row :gutter="8"><Col :span="12">栅格列甲</Col><Col :span="12">栅格列乙</Col></Row>',
    },
  ],
]);

/** 条目形态别名（供生成器与测试消费的窄化视图）。 */
export const SERVICE_API_COMPONENTS = new Set(
  [...FAMILY_EXAMPLES.entries()].filter(([, v]) => v.kind === "service").map(([k]) => k),
);
