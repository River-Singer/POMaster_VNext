// 组件族示例配置表（审计 N4 修复 · 声明式最小合法组合 + S1 交互态矩阵）。
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
// S1 交互态矩阵（任务 09-06-studio-depth-react-geist-mapping · Owner 裁定）：
// states 数组每项 = 一个交互态 story（生成器循环产出多导出）。prop 词形全部为
// antdv 4.2.6 官方 API（node_modules types/d.ts 实抓 + happy-dom 渲染探针核定，
// 不发明 prop）；keyDom/minCount/portal 语义与族级同，缺省回落族级值。
// 无视觉交互态的族（ConfigProvider/App/LocaleProvider/Grid 上下文容器与工具
// 命名空间）与服务式 API（service）不产 states——缺席诚实，不凑数。
//
// 测试消费：keyDom/minCount/portal 供真实挂载断言（tests/components-mount.spec.ts）——
// 「有生成文件」不再冒充「可挂载」，逐族逐态断言关键 DOM 存在。
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
      states: [
        {
          name: "Variants",
          keyDom: ".studio-demo-chip",
          minCount: 2,
          template:
            '<Affix :offset-top="48"><span class="studio-demo-chip">顶部固定</span></Affix>' +
            '<Affix :offset-bottom="48"><span class="studio-demo-chip">底部固定</span></Affix>',
        },
      ],
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
      states: [
        {
          name: "Variants",
          template:
            '<Anchor :affix="false"><AnchorLink href="#studio-demo-anchor-v" title="非固定锚点" /></Anchor>' +
            '<p id="studio-demo-anchor-v">锚点目标段落</p>',
        },
      ],
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
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-select-disabled",
          template:
            '<AutoComplete :options="autoCompleteOptions" disabled placeholder="禁用自动完成" style="width: 160px;" />',
        },
        {
          name: "Sizes",
          keyDom: ".ant-select-lg, .ant-select-sm",
          minCount: 2,
          template:
            '<AutoComplete :options="autoCompleteOptions" size="large" placeholder="大型自动完成" style="width: 160px;" />' +
            '<AutoComplete :options="autoCompleteOptions" size="small" placeholder="小型自动完成" style="width: 160px;" />',
        },
        {
          name: "Status",
          keyDom: ".ant-select-status-error, .ant-select-status-warning",
          minCount: 2,
          template:
            '<AutoComplete :options="autoCompleteOptions" status="error" placeholder="错误态" style="width: 160px;" />' +
            '<AutoComplete :options="autoCompleteOptions" status="warning" placeholder="警告态" style="width: 160px;" />',
        },
      ],
    },
  ],
  [
    "Alert",
    {
      kind: "curated",
      keyDom: ".ant-alert",
      template: '<Alert message="提示文案" type="success" show-icon />',
      states: [
        {
          name: "Variants",
          minCount: 6,
          template:
            '<Alert message="成功提示" type="success" show-icon closable />' +
            '<Alert message="信息提示" type="info" show-icon />' +
            '<Alert message="警告提示" type="warning" show-icon />' +
            '<Alert message="错误提示" type="error" show-icon />' +
            '<Alert message="横幅提示" banner />' +
            '<Alert message="带描述的提示" description="详细描述内容" type="info" show-icon />',
        },
      ],
    },
  ],
  [
    "Avatar",
    {
      kind: "curated",
      keyDom: ".ant-avatar",
      minCount: 2,
      template: '<AvatarGroup><Avatar>甲</Avatar><Avatar>乙</Avatar></AvatarGroup>',
      states: [
        {
          name: "Variants",
          keyDom: ".ant-avatar-square, .ant-avatar-lg, .ant-avatar-sm",
          minCount: 3,
          template:
            '<Avatar shape="square" size="large">方大</Avatar>' +
            '<Avatar shape="circle" size="small">圆小</Avatar>' +
            '<Avatar size="large">大</Avatar>',
        },
      ],
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
      states: [
        {
          name: "Variants",
          keyDom: ".ant-badge, .ant-badge-status",
          minCount: 6,
          template:
            '<Badge :count="99" :overflow-count="10"><span class="studio-demo-chip">溢出</span></Badge>' +
            '<Badge dot><span class="studio-demo-chip">点标</span></Badge>' +
            '<Badge status="success" text="成功" />' +
            '<Badge status="error" text="错误" />' +
            '<Badge color="blue" text="自定义色" />' +
            '<Badge :count="5" size="small"><span class="studio-demo-chip">小号</span></Badge>',
        },
      ],
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
      states: [
        {
          name: "Variants",
          minCount: 2,
          template:
            '<Breadcrumb separator="-&gt;"><BreadcrumbItem>首页</BreadcrumbItem><BreadcrumbItem>目录</BreadcrumbItem></Breadcrumb>' +
            "<Breadcrumb><BreadcrumbItem>图标首页</BreadcrumbItem><BreadcrumbSeparator>：</BreadcrumbSeparator><BreadcrumbItem>当前页</BreadcrumbItem></Breadcrumb>",
        },
      ],
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
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-btn[disabled]",
          minCount: 3,
          template:
            '<Button type="primary" disabled>主要禁用</Button>' +
            "<Button disabled>次要禁用</Button>" +
            '<Button type="link" disabled>链接禁用</Button>',
        },
        {
          name: "Loading",
          keyDom: ".ant-btn-loading",
          minCount: 2,
          template:
            '<Button type="primary" loading>加载中</Button>' +
            "<Button loading>提交中</Button>",
        },
        {
          name: "Sizes",
          keyDom: ".ant-btn-lg, .ant-btn-sm",
          minCount: 2,
          template:
            '<Button type="primary" size="large">大型主要</Button>' +
            '<Button size="small">小型</Button>',
        },
        {
          name: "Variants",
          minCount: 10,
          template:
            '<Button type="primary">主要</Button>' +
            '<Button type="dashed">虚线</Button>' +
            '<Button type="text">文本</Button>' +
            '<Button type="link">链接</Button>' +
            "<Button danger>危险</Button>" +
            '<Button type="primary" danger>主要危险</Button>' +
            '<Button type="primary" shape="circle">圆</Button>' +
            '<Button type="primary" shape="round">圆角</Button>' +
            "<Button ghost>幽灵</Button>" +
            "<Button block>块级</Button>",
        },
      ],
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
      states: [
        {
          name: "Loading",
          keyDom: ".ant-card-loading",
          template: '<Card loading title="加载中卡片" />',
        },
        {
          name: "Sizes",
          keyDom: ".ant-card-small",
          minCount: 2,
          template:
            '<Card size="small" title="小号卡片甲" />' +
            '<Card size="small" title="小号卡片乙"><CardGrid style="width: 25%; text-align: center;">栅格</CardGrid></Card>',
        },
        {
          name: "Variants",
          minCount: 3,
          template:
            '<Card title="外层卡片" hoverable><Card type="inner" title="内层卡片" /><CardMeta title="元信息" description="描述" /></Card>' +
            '<Card title="无边框卡片" :bordered="false" />',
        },
      ],
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
      states: [
        {
          name: "Variants",
          keyDom: ".ant-collapse-ghost",
          minCount: 1,
          template:
            "<Collapse ghost accordion>" +
            '<CollapsePanel key="g1" header="手风琴面板">内容</CollapsePanel>' +
            "</Collapse>" +
            '<Collapse expand-icon-position="end">' +
            '<CollapsePanel key="e1" header="尾部图标面板">内容</CollapsePanel>' +
            "</Collapse>",
        },
      ],
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
      states: [
        {
          name: "Variants",
          minCount: 4,
          template:
            '<Carousel autoplay><div>自动轮播一</div><div>自动轮播二</div></Carousel>' +
            '<Carousel :dots="false" effect="fade"><div>淡入一</div><div>淡入二</div></Carousel>',
        },
      ],
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
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-select-disabled",
          template:
            '<Cascader :options="cascaderOptions" disabled placeholder="禁用级联" style="width: 200px;" />',
        },
        {
          name: "Sizes",
          keyDom: ".ant-select-lg, .ant-select-sm",
          minCount: 2,
          template:
            '<Cascader :options="cascaderOptions" size="large" placeholder="大型级联" style="width: 200px;" />' +
            '<Cascader :options="cascaderOptions" size="small" placeholder="小型级联" style="width: 200px;" />',
        },
        {
          name: "Variants",
          minCount: 2,
          template:
            '<Cascader :options="cascaderOptions" change-on-select placeholder="可选任意级" style="width: 200px;" />' +
            '<Cascader :options="cascaderOptions" :multiple="true" placeholder="多选级联" style="width: 200px;" />',
        },
      ],
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
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-checkbox-disabled",
          minCount: 3,
          template:
            "<Checkbox disabled>禁用复选</Checkbox>" +
            '<Checkbox :checked="true" disabled>选中禁用</Checkbox>' +
            '<CheckboxGroup :options="[\'禁用组甲\', \'禁用组乙\']" disabled />',
        },
        {
          name: "Variants",
          keyDom: ".ant-checkbox-indeterminate, .ant-checkbox-wrapper",
          minCount: 3,
          template:
            '<Checkbox :indeterminate="true">半选</Checkbox>' +
            "<CheckboxGroup :options=\"[{ label: '带值甲', value: 'jia' }, { label: '带值乙', value: 'yi' }]\" />",
        },
      ],
    },
  ],
  [
    "Col",
    {
      kind: "curated",
      keyDom: ".ant-col",
      template: '<Col :span="12">列内容</Col>',
      states: [
        {
          name: "Variants",
          minCount: 3,
          template:
            '<Col :span="8" :offset="4">偏移列</Col>' +
            '<Col :span="6" :pull="2">左拉列</Col>' +
            '<Col :span="6" :push="2">右推列</Col>',
        },
      ],
    },
  ],
  [
    "Comment",
    {
      kind: "curated",
      keyDom: ".ant-comment",
      template:
        '<Comment author="演示用户"><template #content><p>评论内容</p></template></Comment>',
      states: [
        {
          name: "Variants",
          minCount: 2,
          template:
            '<Comment author="演示用户" content="完整字段评论" datetime="2026-09-07"><template #actions><span>回复</span><span>赞</span></template>' +
            '<Comment author="嵌套用户" content="嵌套回复" /></Comment>',
        },
      ],
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
      states: [
        {
          name: "Sizes",
          keyDom: ".ant-descriptions-small, .ant-descriptions-middle",
          minCount: 2,
          template:
            '<Descriptions size="small" title="小号详情"><DescriptionsItem label="名称">值</DescriptionsItem></Descriptions>' +
            '<Descriptions size="middle" title="中号详情"><DescriptionsItem label="名称">值</DescriptionsItem></Descriptions>',
        },
        {
          name: "Variants",
          keyDom: ".ant-descriptions-bordered",
          minCount: 1,
          template:
            '<Descriptions bordered :column="2" title="带边框详情"><DescriptionsItem label="名称">值</DescriptionsItem><DescriptionsItem label="说明">内容</DescriptionsItem></Descriptions>' +
            '<Descriptions layout="vertical" title="垂直布局详情"><DescriptionsItem label="名称">值</DescriptionsItem></Descriptions>',
        },
      ],
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
      states: [
        {
          name: "Variants",
          minCount: 3,
          template:
            '<Dropdown :menu="dropdownMenu" :trigger="[\'click\']"><Button>点击触发</Button></Dropdown>' +
            '<Dropdown :menu="dropdownMenu" placement="topLeft"><Button>顶部弹出</Button></Dropdown>' +
            '<DropdownButton :menu="dropdownMenu" type="primary">主要按钮下拉</DropdownButton>',
        },
      ],
    },
  ],
  [
    "Drawer",
    {
      kind: "curated",
      keyDom: ".ant-drawer",
      portal: true,
      template: '<Drawer :open="true" title="抽屉标题"><p>抽屉内容</p></Drawer>',
      states: [
        {
          name: "Variants",
          minCount: 3,
          template:
            '<Drawer :open="true" title="左侧抽屉" placement="left"><p>内容</p></Drawer>' +
            '<Drawer :open="true" title="大号抽屉" size="large"><p>内容</p></Drawer>' +
            '<Drawer :open="true" title="底部抽屉" placement="bottom"><p>内容</p></Drawer>',
        },
      ],
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
      states: [
        {
          name: "Variants",
          minCount: 4,
          template:
            '<FloatButtonGroup><FloatButton type="primary" /><FloatButton description="说明" /><FloatButton tooltip="悬浮提示" /><FloatButton :badge="{ count: 5 }" /></FloatButtonGroup>',
        },
      ],
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
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-input-disabled",
          template:
            '<Form disabled :model="formState">' +
            '<FormItem label="名称" name="name"><Input v-model:value="formState.name" placeholder="整表禁用" /></FormItem>' +
            "</Form>",
        },
        {
          name: "Variants",
          keyDom: ".ant-form-vertical, .ant-form-inline",
          minCount: 2,
          template:
            '<Form layout="vertical" :model="formState">' +
            '<FormItem label="名称" name="name"><Input v-model:value="formState.name" placeholder="垂直布局" /></FormItem>' +
            "</Form>" +
            '<Form layout="inline" :model="formState">' +
            '<FormItem label="名称" name="name"><Input v-model:value="formState.name" placeholder="行内布局" /></FormItem>' +
            "</Form>",
        },
      ],
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
      states: [
        {
          name: "Disabled",
          keyDom: "input[disabled]",
          minCount: 2,
          template:
            '<Input placeholder="禁用输入" disabled />' +
            '<InputPassword placeholder="禁用密码" disabled />',
        },
        {
          name: "Sizes",
          keyDom: ".ant-input-lg, .ant-input-sm",
          minCount: 2,
          template:
            '<Input size="large" placeholder="大型输入" />' +
            '<Input size="small" placeholder="小型输入" />',
        },
        {
          name: "Status",
          keyDom: ".ant-input-status-error, .ant-input-status-warning",
          minCount: 2,
          template:
            '<Input status="error" placeholder="错误态" />' +
            '<Input status="warning" placeholder="警告态" />',
        },
        {
          name: "Variants",
          minCount: 4,
          template:
            '<Input allow-clear placeholder="可清空" />' +
            '<Input :bordered="false" placeholder="无边框" />' +
            '<InputSearch enter-button placeholder="搜索按钮" />' +
            '<Textarea placeholder="固定多行" :rows="3" />',
        },
      ],
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
      states: [
        {
          name: "Variants",
          minCount: 3,
          template:
            '<Image :width="120" :height="80" />' +
            '<Image :width="120" :preview="false" />' +
            '<Image :width="120" fallback="studio-demo-fallback" />',
        },
      ],
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
      states: [
        {
          name: "Variants",
          keyDom: ".ant-layout-sider-dark",
          minCount: 1,
          template:
            "<Layout>" +
            '<LayoutSider theme="dark" collapsible>暗色侧栏</LayoutSider>' +
            "<LayoutContent>内容区</LayoutContent>" +
            "</Layout>",
        },
      ],
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
      states: [
        {
          name: "Variants",
          minCount: 4,
          template:
            '<List size="small" bordered :data-source="listData" header="小号带边框列表">' +
            '<template #renderItem="{ item }"><ListItem><ListItemMeta title="条目标题" :description="item" /></ListItem></template>' +
            "</List>" +
            '<List :data-source="listData" :split="false" footer="无分割线列表">' +
            '<template #renderItem="{ item }"><ListItem><ListItemMeta title="条目标题" :description="item" /></ListItem></template>' +
            "</List>",
        },
      ],
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
        menuStateItems: [
          { key: "s1", label: "菜单一" },
          { key: "s2", label: "危险项", danger: true },
        ],
      }`,
      template:
        '<Menu mode="inline" :items="menuItems" style="width: 200px;" />' +
        '<Menu mode="inline" style="width: 200px;">' +
        '<MenuItemGroup title="分组标题"><MenuItem key="group-a">菜单项甲</MenuItem><MenuItem key="group-b">菜单项乙</MenuItem></MenuItemGroup>' +
        '<SubMenu key="sub-1" title="子菜单"><MenuItem key="sub-1-a">子菜单项</MenuItem></SubMenu>' +
        "<MenuDivider />" +
        "</Menu>",
      states: [
        {
          name: "Variants",
          keyDom: ".ant-menu-horizontal, .ant-menu-vertical, .ant-menu-item-danger",
          minCount: 3,
          template:
            '<Menu mode="horizontal" :items="menuItems" />' +
            '<Menu mode="vertical" :items="menuStateItems" style="width: 200px;" />',
        },
        {
          name: "DarkTheme",
          keyDom: ".ant-menu-dark",
          minCount: 1,
          template:
            '<Menu mode="inline" theme="dark" :items="menuItems" style="width: 200px;" />',
        },
      ],
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
      states: [
        {
          name: "Disabled",
          keyDom: "textarea[disabled]",
          template:
            '<Mentions disabled placeholder="禁用提及" style="width: 160px;" />',
        },
        {
          name: "Variants",
          keyDom: "textarea",
          template:
            '<Mentions :prefix="[\'#\', \'@\']" placeholder="多触发符" style="width: 160px;" />',
        },
      ],
    },
  ],
  [
    "Modal",
    {
      kind: "curated",
      keyDom: ".ant-modal",
      portal: true,
      template: '<Modal :open="true" title="对话框标题"><p>对话框内容</p></Modal>',
      states: [
        {
          name: "Variants",
          minCount: 2,
          template:
            '<Modal :open="true" title="确认对话框" ok-text="确认" cancel-text="取消" :confirm-loading="true"><p>确认加载态</p></Modal>' +
            '<Modal :open="true" title="无页脚" :footer="null"><p>无页脚内容</p></Modal>',
        },
      ],
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
      states: [
        {
          name: "Variants",
          minCount: 3,
          template:
            '<Statistic title="精确小数" :value="93.5" :precision="2" />' +
            '<Statistic title="带前后缀" :value="112893" prefix="¥" suffix="元" />' +
            '<StatisticCountdown title="格式化倒计时" :value="1893456000000" format="D 天 H 时 m 分 s 秒" />',
        },
      ],
    },
  ],
  [
    "PageHeader",
    {
      kind: "curated",
      keyDom: ".ant-page-header",
      template: '<PageHeader title="页头标题" />',
      states: [
        {
          name: "Variants",
          minCount: 2,
          template:
            '<PageHeader title="副标题页头" sub-title="这里是副标题" />' +
            '<PageHeader title="操作区页头" sub-title="副标题"><template #extra><span>操作区</span></template><template #footer><span>页脚区</span></template></PageHeader>',
        },
      ],
    },
  ],
  [
    "Pagination",
    {
      kind: "curated",
      keyDom: ".ant-pagination-item",
      minCount: 2,
      template: '<Pagination :total="50" />',
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-pagination-disabled",
          minCount: 1,
          template: '<Pagination :total="50" disabled />',
        },
        {
          name: "Sizes",
          keyDom: ".ant-pagination-mini",
          minCount: 1,
          template: '<Pagination :total="50" size="small" />',
        },
        {
          name: "Variants",
          keyDom: ".ant-pagination-simple, .ant-pagination-options",
          minCount: 2,
          template:
            '<Pagination :total="50" simple />' +
            '<Pagination :total="50" show-size-changer show-quick-jumper />',
        },
      ],
    },
  ],
  [
    "Popconfirm",
    {
      kind: "curated",
      keyDom: ".ant-btn",
      extraImports: ["Button"],
      template: '<Popconfirm title="确认执行？"><Button>触发确认</Button></Popconfirm>',
      states: [
        {
          name: "Variants",
          minCount: 2,
          template:
            '<Popconfirm title="确认删除？" ok-text="删除" cancel-text="保留"><Button danger>危险确认</Button></Popconfirm>' +
            '<Popconfirm title="顶部确认" placement="topLeft"><Button>触发</Button></Popconfirm>',
        },
      ],
    },
  ],
  [
    "Popover",
    {
      kind: "curated",
      keyDom: "span",
      template: '<Popover title="浮层标题" content="浮层内容"><span>悬浮触发</span></Popover>',
      states: [
        {
          name: "Variants",
          minCount: 2,
          template:
            '<Popover title="点击弹出" trigger="click" content="点击触发内容"><span class="studio-demo-chip">点击触发</span></Popover>' +
            '<Popover title="位置" placement="topLeft" content="位置内容"><span class="studio-demo-chip">位置触发</span></Popover>',
        },
      ],
    },
  ],
  [
    "Progress",
    {
      kind: "curated",
      keyDom: ".ant-progress",
      template: '<Progress :percent="60" />',
      states: [
        {
          name: "Variants",
          minCount: 5,
          template:
            '<Progress :percent="70" status="exception" />' +
            '<Progress :percent="100" status="success" />' +
            '<Progress type="circle" :percent="70" />' +
            '<Progress type="dashboard" :percent="70" />' +
            '<Progress :percent="50" size="small" />',
        },
      ],
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
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-radio-wrapper-disabled",
          minCount: 2,
          template:
            "<Radio disabled>禁用单选</Radio>" +
            "<RadioGroup disabled :options=\"['禁用甲', '禁用乙']\" />",
        },
        {
          name: "Sizes",
          keyDom: ".ant-radio-group-large, .ant-radio-group-small",
          minCount: 2,
          template:
            "<RadioGroup size=\"large\" option-type=\"button\" :options=\"['大甲', '大乙']\" />" +
            "<RadioGroup size=\"small\" option-type=\"button\" :options=\"['小甲', '小乙']\" />",
        },
        {
          name: "Variants",
          keyDom: ".ant-radio-button-wrapper",
          minCount: 2,
          template:
            "<RadioGroup :value=\"'jia'\" button-style=\"solid\"><RadioButton value=\"jia\">实底甲</RadioButton><RadioButton value=\"yi\">实底乙</RadioButton></RadioGroup>",
        },
      ],
    },
  ],
  [
    "Result",
    {
      kind: "curated",
      keyDom: ".ant-result",
      template: '<Result title="操作完成" sub-title="结果说明" />',
      states: [
        {
          name: "Variants",
          minCount: 3,
          extraImports: ["Button"],
          template:
            '<Result status="404" title="404" sub-title="页面不存在" />' +
            '<Result status="500" title="500" sub-title="服务器错误" />' +
            '<Result status="warning" title="警告" sub-title="存在风险"><template #extra><Button type="primary">返回</Button></template></Result>',
        },
      ],
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
      states: [
        {
          name: "Variants",
          minCount: 2,
          template:
            '<Row :gutter="16"><Col :span="12">槽距列甲</Col><Col :span="12">槽距列乙</Col></Row>' +
            '<Row justify="space-between" align="middle"><Col :span="6">对齐列甲</Col><Col :span="6">对齐列乙</Col></Row>',
        },
      ],
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
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-select-disabled",
          template:
            '<Select :options="selectOptions" disabled placeholder="禁用选择" style="width: 160px;" />',
        },
        {
          name: "Loading",
          keyDom: ".ant-select-loading",
          template:
            '<Select :options="selectOptions" loading placeholder="加载中" style="width: 160px;" />',
        },
        {
          name: "Sizes",
          keyDom: ".ant-select-lg, .ant-select-sm",
          minCount: 2,
          template:
            '<Select :options="selectOptions" size="large" placeholder="大型选择" style="width: 160px;" />' +
            '<Select :options="selectOptions" size="small" placeholder="小型选择" style="width: 160px;" />',
        },
        {
          name: "Variants",
          keyDom: ".ant-select-multiple, .ant-select-tags, .ant-select-status-error, .ant-select-borderless",
          minCount: 4,
          template:
            '<Select :options="selectOptions" mode="multiple" placeholder="多选" style="width: 200px;" />' +
            '<Select :options="selectOptions" mode="tags" placeholder="标签" style="width: 200px;" />' +
            '<Select :options="selectOptions" status="error" placeholder="错误态" style="width: 160px;" />' +
            '<Select :options="selectOptions" :bordered="false" placeholder="无边框" style="width: 160px;" />',
        },
      ],
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
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-segmented-disabled",
          template: '<Segmented disabled :value="segmentedValue" :options="segmentedOptions" />',
        },
        {
          name: "Sizes",
          keyDom: ".ant-segmented-lg, .ant-segmented-sm",
          minCount: 2,
          template:
            '<Segmented size="large" :value="segmentedValue" :options="segmentedOptions" />' +
            '<Segmented size="small" :value="segmentedValue" :options="segmentedOptions" />',
        },
      ],
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
      states: [
        {
          name: "Variants",
          keyDom: ".ant-space-vertical",
          minCount: 1,
          template:
            '<Space direction="vertical" size="large"><span>纵一大</span><span>纵二大</span></Space>' +
            '<Space wrap align="center"><span>换行甲</span><span>换行乙</span><span>换行丙</span></Space>',
        },
      ],
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
      states: [
        {
          name: "Sizes",
          keyDom: ".ant-steps-small",
          minCount: 1,
          template:
            '<Steps size="small" :current="1"><Step title="小号步骤一" /><Step title="小号步骤二" /><Step title="小号步骤三" /></Steps>',
        },
        {
          name: "Variants",
          keyDom: ".ant-steps-vertical, .ant-steps-dot",
          minCount: 2,
          template:
            '<Steps direction="vertical" :current="1"><Step title="垂直步骤一" description="说明" /><Step title="垂直步骤二" description="说明" /></Steps>' +
            '<Steps :current="2" status="error" progress-dot><Step title="点状步骤一" /><Step title="点状步骤二" /><Step title="点状步骤三" /></Steps>',
        },
      ],
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
      states: [
        {
          name: "Loading",
          keyDom: ".ant-spin",
          minCount: 1,
          template: '<Table :columns="tableColumns" :data-source="tableData" loading />',
        },
        {
          name: "Sizes",
          keyDom: ".ant-table-small, .ant-table-middle",
          minCount: 2,
          template:
            '<Table :columns="tableColumns" :data-source="tableData" size="small" />' +
            '<Table :columns="tableColumns" :data-source="tableData" size="middle" />',
        },
        {
          name: "Variants",
          keyDom: ".ant-table-bordered, .ant-table-selection-column",
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
        tableRowSelection: { selectedRowKeys: ["1"] },
      }`,
          template:
            '<Table :columns="tableColumns" :data-source="tableData" bordered />' +
            '<Table :columns="tableColumns" :data-source="tableData" :row-selection="tableRowSelection" />',
        },
      ],
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
      states: [
        {
          name: "Sizes",
          keyDom: ".ant-tabs-small, .ant-tabs-large",
          minCount: 2,
          template:
            "<Tabs size=\"small\">" +
            '<TabPane key="1" tab="小号一">内容</TabPane>' +
            '<TabPane key="2" tab="小号二">内容</TabPane>' +
            "</Tabs>" +
            "<Tabs size=\"large\">" +
            '<TabPane key="1" tab="大号一">内容</TabPane>' +
            '<TabPane key="2" tab="大号二">内容</TabPane>' +
            "</Tabs>",
        },
        {
          name: "Variants",
          keyDom: ".ant-tabs-card, .ant-tabs-left",
          minCount: 2,
          template:
            "<Tabs type=\"card\">" +
            '<TabPane key="1" tab="卡片一">内容</TabPane>' +
            '<TabPane key="2" tab="卡片二">内容</TabPane>' +
            "</Tabs>" +
            "<Tabs tab-position=\"left\" style=\"height: 120px;\">" +
            '<TabPane key="1" tab="左一">内容</TabPane>' +
            '<TabPane key="2" tab="左二">内容</TabPane>' +
            "</Tabs>",
        },
      ],
    },
  ],
  [
    "Tag",
    {
      kind: "curated",
      keyDom: ".ant-tag",
      minCount: 2,
      template: '<Tag>标签</Tag><CheckableTag :checked="true">可选中标签</CheckableTag>',
      states: [
        {
          name: "Variants",
          minCount: 7,
          template:
            '<Tag color="success">成功</Tag>' +
            '<Tag color="processing">进行中</Tag>' +
            '<Tag color="error">错误</Tag>' +
            '<Tag color="warning">警告</Tag>' +
            '<Tag color="magenta">品红</Tag>' +
            "<Tag closable>可关闭</Tag>" +
            '<Tag :bordered="false">无边框</Tag>',
        },
      ],
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
      states: [
        {
          name: "Variants",
          keyDom: ".ant-timeline-alternate, .ant-timeline-reverse",
          minCount: 2,
          template:
            '<Timeline mode="alternate"><TimelineItem>左侧节点</TimelineItem><TimelineItem color="red">红色右侧节点</TimelineItem><TimelineItem>左侧节点二</TimelineItem></Timeline>' +
            "<Timeline reverse><TimelineItem>倒序一</TimelineItem><TimelineItem>倒序二</TimelineItem></Timeline>",
        },
      ],
    },
  ],
  [
    "Tooltip",
    {
      kind: "curated",
      keyDom: "span",
      template: '<Tooltip title="提示文字"><span>悬浮目标</span></Tooltip>',
      states: [
        {
          name: "Variants",
          minCount: 2,
          template:
            '<Tooltip title="顶部提示" placement="top"><span class="studio-demo-chip">上方</span></Tooltip>' +
            '<Tooltip title="彩色提示" color="geekblue"><span class="studio-demo-chip">彩色</span></Tooltip>',
        },
      ],
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
      states: [
        {
          name: "Variants",
          keyDom: ".ant-tree-checkbox",
          minCount: 2,
          template:
            '<Tree checkable show-line :tree-data="treeData" default-expand-all />',
        },
      ],
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
      states: [
        {
          name: "Variants",
          keyDom: ".ant-select",
          minCount: 2,
          template:
            '<TreeSelect :tree-data="treeSelectData" multiple placeholder="多选树选" style="width: 200px;" />' +
            '<TreeSelect :tree-data="treeSelectData" show-search tree-checkable placeholder="树勾选" style="width: 200px;" />',
        },
      ],
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
      states: [
        {
          name: "Variants",
          minCount: 2,
          template:
            '<Transfer :data-source="transferData" :render="transferRender" show-search />' +
            '<Transfer :data-source="transferData" :render="transferRender" disabled one-way />',
        },
      ],
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
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-upload-disabled",
          minCount: 1,
          template:
            '<Upload disabled :before-upload="keepUploadLocal"><Button disabled>禁用上传</Button></Upload>',
        },
        {
          name: "Variants",
          minCount: 3,
          template:
            '<Upload list-type="picture-card"><span class="studio-demo-chip">+</span></Upload>' +
            '<Upload directory :before-upload="keepUploadLocal"><Button>目录上传</Button></Upload>' +
            '<Upload :max-count="1" :before-upload="keepUploadLocal"><Button>单文件上传</Button></Upload>',
        },
      ],
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
      states: [
        {
          name: "Variants",
          minCount: 2,
          template:
            '<Watermark content="斜排水印" :rotate="-22" :gap="[80, 80]"><div style="height: 96px;">水印区域甲</div></Watermark>' +
            '<Watermark :content="[\'多行\', \'水印\']" :font="{ fontSize: 12 }"><div style="height: 96px;">水印区域乙</div></Watermark>',
        },
      ],
    },
  ],
  [
    "QRCode",
    {
      kind: "curated",
      keyDom: ".ant-qrcode",
      template: '<QRCode value="POMASTER-DEMO" />',
      states: [
        {
          name: "Variants",
          minCount: 3,
          template:
            '<QRCode value="POMASTER" :size="96" />' +
            '<QRCode value="POMASTER" :bordered="false" />' +
            '<QRCode value="POMASTER" color="#13c2c2" />',
        },
      ],
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
      states: [
        {
          name: "Variants",
          minCount: 2,
          template:
            '<Flex vertical gap="large"><span>纵一</span><span>纵二</span></Flex>' +
            '<Flex justify="space-around" align="flex-start" wrap="wrap"><span>甲</span><span>乙</span></Flex>',
        },
      ],
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
  [
    "Calendar",
    {
      kind: "default",
      keyDom: ".ant-picker-calendar, .ant-picker-panel",
      states: [
        {
          name: "Variants",
          keyDom: ".ant-picker-calendar",
          minCount: 1,
          template: '<Calendar :fullscreen="false" />',
        },
      ],
    },
  ],
  [
    "DatePicker",
    {
      kind: "default",
      keyDom: ".ant-picker",
      minCount: 5,
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-picker-disabled",
          minCount: 2,
          template:
            "<DatePicker disabled /><RangePicker disabled />",
        },
        {
          name: "Sizes",
          keyDom: ".ant-picker-large, .ant-picker-small",
          minCount: 2,
          template:
            '<DatePicker size="large" /><DatePicker size="small" />',
        },
        {
          name: "Status",
          keyDom: ".ant-picker-status-error, .ant-picker-status-warning",
          minCount: 2,
          template:
            '<DatePicker status="error" /><DatePicker status="warning" />',
        },
        {
          name: "Variants",
          minCount: 4,
          template:
            '<DatePicker picker="month" /><DatePicker picker="week" /><RangePicker /><DatePicker show-time />',
        },
      ],
    },
  ],
  [
    "Divider",
    {
      kind: "default",
      keyDom: ".ant-divider",
      states: [
        {
          name: "Variants",
          minCount: 5,
          template:
            '<Divider orientation="left">左标题</Divider>' +
            '<Divider orientation="right">右标题</Divider>' +
            "<Divider dashed />" +
            "<Divider plain>弱化文本</Divider>" +
            '<Divider type="vertical" />',
        },
      ],
    },
  ],
  [
    "Empty",
    {
      kind: "default",
      keyDom: ".ant-empty",
      states: [
        {
          name: "Variants",
          minCount: 2,
          extraImports: ["Button"],
          setupData: `{
        simpleImage: Empty.PRESENTED_IMAGE_SIMPLE,
      }`,
          template:
            '<Empty :image="simpleImage" description="简单图像" />' +
            '<Empty description="自定义描述"><Button>再试一次</Button></Empty>',
        },
      ],
    },
  ],
  [
    "InputNumber",
    {
      kind: "default",
      keyDom: ".ant-input-number",
      states: [
        {
          name: "Disabled",
          keyDom: "input[disabled]",
          template: '<InputNumber disabled :value="10" />',
        },
        {
          name: "Sizes",
          keyDom: ".ant-input-number",
          minCount: 2,
          template:
            '<InputNumber size="large" :value="10" />' +
            '<InputNumber size="small" :value="10" />',
        },
        {
          name: "Variants",
          minCount: 3,
          template:
            '<InputNumber :min="0" :max="10" :step="0.1" :value="1.5" />' +
            '<InputNumber addon-before="¥" addon-after="元" :value="20" />' +
            '<InputNumber :controls="false" :value="42" />',
        },
      ],
    },
  ],
  [
    "Rate",
    {
      kind: "default",
      keyDom: ".ant-rate",
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-rate-disabled",
          template: '<Rate disabled :value="3" />',
        },
        {
          name: "Variants",
          minCount: 3,
          template:
            '<Rate allow-half :value="2.5" />' +
            '<Rate :count="8" :value="5" />' +
            '<Rate character="好" :value="3" />',
        },
      ],
    },
  ],
  [
    "Skeleton",
    {
      kind: "default",
      keyDom: ".ant-skeleton",
      minCount: 2,
      states: [
        {
          name: "Variants",
          minCount: 4,
          template:
            '<Skeleton loading active :avatar="{ size: \'large\' }" :paragraph="{ rows: 4 }" />' +
            "<SkeletonButton active /><SkeletonImage /><SkeletonInput active />",
        },
      ],
    },
  ],
  [
    "Slider",
    {
      kind: "default",
      keyDom: ".ant-slider",
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-slider-disabled",
          template: '<Slider disabled :value="30" />',
        },
        {
          name: "Variants",
          minCount: 3,
          template:
            '<Slider range :value="[20, 50]" />' +
            '<div style="height: 120px;"><Slider vertical :value="30" /></div>' +
            '<Slider :marks="{ 0: \'0°C\', 30: \'30°C\', 100: \'100°C\' }" :value="30" />',
        },
      ],
    },
  ],
  [
    "Spin",
    {
      kind: "default",
      keyDom: ".ant-spin",
      states: [
        {
          name: "Sizes",
          keyDom: ".ant-spin-sm, .ant-spin-lg",
          minCount: 2,
          template: '<Spin size="small" /><Spin size="large" />',
        },
        {
          name: "Variants",
          minCount: 1,
          template:
            '<Spin :spinning="false"><div class="studio-demo-chip">不旋转容器</div></Spin>' +
            '<Spin tip="加载中"><div class="studio-demo-chip">容器内容</div></Spin>',
        },
      ],
    },
  ],
  [
    "Switch",
    {
      kind: "default",
      keyDom: ".ant-switch",
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-switch-disabled",
          minCount: 2,
          template: '<Switch disabled /><Switch :checked="true" disabled />',
        },
        {
          name: "Loading",
          keyDom: ".ant-switch-loading",
          template: '<Switch loading :checked="true" />',
        },
        {
          name: "Sizes",
          keyDom: ".ant-switch-small",
          minCount: 2,
          template: '<Switch size="small" /><Switch :checked="true" size="small" />',
        },
        {
          name: "Variants",
          keyDom: ".ant-switch-checked",
          minCount: 2,
          template:
            '<Switch :checked="true" checked-children="开" un-checked-children="关" />' +
            '<Switch :checked="true" />' +
            '<Switch checked-value="是" un-checked-value="否" />',
        },
      ],
    },
  ],
  [
    "TimePicker",
    {
      kind: "default",
      keyDom: ".ant-picker",
      minCount: 2,
      states: [
        {
          name: "Disabled",
          keyDom: ".ant-picker-disabled",
          template: "<TimePicker disabled />",
        },
        {
          name: "Sizes",
          keyDom: ".ant-picker-large, .ant-picker-small",
          minCount: 2,
          template: '<TimePicker size="large" /><TimePicker size="small" />',
        },
        {
          name: "Status",
          keyDom: ".ant-picker-status-error",
          template: '<TimePicker status="error" />',
        },
      ],
    },
  ],
  [
    "Typography",
    {
      kind: "default",
      keyDom: ".ant-typography",
      minCount: 4,
      states: [
        {
          name: "Variants",
          minCount: 9,
          template:
            '<TypographyTitle :level="2">二级标题</TypographyTitle>' +
            "<TypographyTitle :level=\"4\" code>四级代码标题</TypographyTitle>" +
            '<TypographyText type="secondary">次要文本</TypographyText>' +
            '<TypographyText type="danger">危险文本</TypographyText>' +
            "<TypographyText disabled>禁用文本</TypographyText>" +
            "<TypographyText mark>标记文本</TypographyText>" +
            "<TypographyText code>代码文本</TypographyText>" +
            "<TypographyText underline delete>删除下划线文本</TypographyText>" +
            "<TypographyParagraph strong copyable>可复制加粗段落</TypographyParagraph>",
        },
      ],
    },
  ],

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
