// 样式候选的三张代表页面（IN-2b）：列表页、复杂表单、详情页——每套候选渲染同一组页面、同一份数据，
// 只有 ConfigProvider 的 theme 不同（见 profiles.ts）。页面用 antdv 全局组件（preview.ts 与挂载测试
// 都 app.use(Antd)），业务数据沿用画廊演示的车队调度场景（NON-AUTHORITATIVE：示例数据，不是业务实体）。
export type PageComponent = {
  readonly setup: () => Record<string, unknown>;
  readonly template: string;
};

const PAGE_STYLE = "padding:24px;background:#f5f5f5;min-height:480px;box-sizing:border-box";

// ── 列表页：筛选 + 表格 + 行操作 + 分页 ─────────────────────────────────────

export function listPage(): PageComponent {
  return {
    setup() {
      const statusOptions = [
        { value: "all", label: "全部状态" },
        { value: "running", label: "在途" },
        { value: "idle", label: "停用" },
        { value: "repair", label: "维修" },
      ];
      const columns = [
        { title: "车牌", dataIndex: "plate", key: "plate" },
        { title: "车型", dataIndex: "model", key: "model" },
        { title: "所属车队", dataIndex: "team", key: "team" },
        { title: "载重（吨）", dataIndex: "load", key: "load", align: "right" },
        { title: "状态", dataIndex: "status", key: "status" },
        { title: "更新时间", dataIndex: "updated", key: "updated" },
        { title: "操作", key: "actions" },
      ];
      const rows = [
        { plate: "沪A·D2391", model: "厢式冷链车", team: "浦东车队一组", load: 8.5, status: "在途", updated: "11-16 18:42" },
        { plate: "沪A·D2760", model: "平板车", team: "浦东车队一组", load: 12, status: "在途", updated: "11-16 17:05" },
        { plate: "沪B·F1183", model: "厢式货车", team: "浦东车队二组", load: 9.6, status: "停用", updated: "11-15 09:30" },
        { plate: "沪B·F2047", model: "冷藏车", team: "浦西车队一组", load: 6.2, status: "在途", updated: "11-16 16:20" },
        { plate: "沪C·G3325", model: "厢式冷链车", team: "浦西车队一组", load: 8.5, status: "维修", updated: "11-14 14:11" },
        { plate: "沪C·G4102", model: "平板车", team: "浦西车队二组", load: 12, status: "在途", updated: "11-16 15:47" },
      ];
      return { pageStyle: PAGE_STYLE, statusOptions, columns, rows };
    },
    template: `
<div :style="pageStyle" data-page="style-candidates-list">
  <a-card title="车辆台账">
    <template #extra><a-button type="primary">新建车辆</a-button></template>
    <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap;align-items:center">
      <a-input-search placeholder="搜车牌 / 车型" style="width:240px" />
      <a-select :options="statusOptions" style="width:140px" default-value="all" />
      <a-button>重置</a-button>
    </div>
    <a-table :columns="columns" :data-source="rows" row-key="plate" :pagination="{ pageSize: 10 }" size="middle">
      <template #bodyCell="{ column, record }">
        <template v-if="column.key === 'status'">
          <a-tag :color="record.status === '在途' ? 'processing' : record.status === '维修' ? 'error' : 'default'">{{ record.status }}</a-tag>
        </template>
        <template v-else-if="column.key === 'actions'">
          <a-button type="link" size="small">详情</a-button>
          <a-button type="link" size="small">停用</a-button>
        </template>
      </template>
    </a-table>
  </a-card>
</div>`.trim(),
  };
}

// ── 复杂表单：分组卡片 + 多种录入控件 + 必填标记 + 操作区 ────────────────────

export function formPage(): PageComponent {
  return {
    setup() {
      const regionOptions = [
        {
          value: "sh",
          label: "上海市",
          children: [
            { value: "pd", label: "浦东新区", children: [{ value: "zj", label: "张江镇" }, { value: "jq", label: "金桥镇" }] },
            { value: "xh", label: "徐汇区", children: [{ value: "tl", label: "田林街道" }] },
          ],
        },
      ];
      return {
        pageStyle: PAGE_STYLE,
        regionOptions,
        modelOptions: [
          { value: "box", label: "厢式冷链车" },
          { value: "flat", label: "平板车" },
          { value: "reefer", label: "冷藏车" },
        ],
        shift: "morning",
        crossDay: false,
        taxed: true,
      };
    },
    template: `
<div :style="pageStyle" data-page="style-candidates-form">
  <a-form layout="vertical" style="max-width:920px;margin:0 auto">
    <a-card title="新建车辆" style="margin-bottom:16px">
      <a-row :gutter="16">
        <a-col :span="8"><a-form-item label="车牌号" required><a-input placeholder="沪A·D0000" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="车型" required><a-select :options="modelOptions" placeholder="选车型" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="所属区域"><a-cascader :options="regionOptions" placeholder="市 / 区 / 街道" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="载重（吨）"><a-input-number style="width:100%" :min="0" :step="0.5" placeholder="0.0" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="所属车队"><a-input placeholder="如：浦东车队一组" /></a-form-item></a-col>
        <a-col :span="8"><a-form-item label="启用日期"><a-date-picker style="width:100%" /></a-form-item></a-col>
      </a-row>
    </a-card>
    <a-card title="排班与费用" style="margin-bottom:16px">
      <a-row :gutter="16">
        <a-col :span="12"><a-form-item label="排班周期"><a-range-picker style="width:100%" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="班次">
          <a-radio-group v-model:value="shift">
            <a-radio value="morning">早班</a-radio>
            <a-radio value="swing">中班</a-radio>
            <a-radio value="night">晚班</a-radio>
          </a-radio-group>
        </a-form-item></a-col>
        <a-col :span="12"><a-form-item label="允许跨日"><a-switch v-model:checked="crossDay" /></a-form-item></a-col>
        <a-col :span="6"><a-form-item label="单价（元 / 公里）"><a-input-number style="width:100%" :min="0" :step="0.1" placeholder="0.0" /></a-form-item></a-col>
        <a-col :span="6"><a-form-item label="币种"><a-select style="width:100%" :options="[{ value: 'cny', label: '人民币' }, { value: 'usd', label: '美元' }]" default-value="cny" /></a-form-item></a-col>
        <a-col :span="12"><a-form-item label="计费"><a-checkbox v-model:checked="taxed">按含税价计费</a-checkbox></a-form-item></a-col>
      </a-row>
    </a-card>
    <a-card title="备注" style="margin-bottom:16px">
      <a-form-item label="备注"><a-textarea :rows="3" placeholder="特殊要求、随车工具等" /></a-form-item>
    </a-card>
    <div style="display:flex;gap:8px;justify-content:flex-end">
      <a-button>取消</a-button>
      <a-button type="primary">保存</a-button>
    </div>
  </a-form>
</div>`.trim(),
  };
}

// ── 详情页：描述表 + 标签页（费用表 / 排班时间线）+ 概况统计 ─────────────────

export function detailPage(): PageComponent {
  return {
    setup() {
      const feeColumns = [
        { title: "费用项", dataIndex: "item", key: "item" },
        { title: "金额（元）", dataIndex: "amount", key: "amount", align: "right" },
        { title: "发生日期", dataIndex: "date", key: "date" },
      ];
      const feeRows = [
        { item: "路桥费", amount: 186, date: "11-15" },
        { item: "装卸费", amount: 320, date: "11-15" },
        { item: "维修预检", amount: 150, date: "11-14" },
      ];
      return { pageStyle: PAGE_STYLE, feeColumns, feeRows };
    },
    template: `
<div :style="pageStyle" data-page="style-candidates-detail">
  <a-card style="margin-bottom:16px">
    <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">
      <a-button>返回</a-button>
      <span style="font-size:16px;font-weight:600">沪A·D2391</span>
      <a-tag color="processing">在途</a-tag>
      <span style="flex:1"></span>
      <a-button>编辑</a-button>
      <a-button type="primary">派单</a-button>
    </div>
    <a-descriptions bordered :column="3" size="small">
      <a-descriptions-item label="车牌">沪A·D2391</a-descriptions-item>
      <a-descriptions-item label="车型">厢式冷链车</a-descriptions-item>
      <a-descriptions-item label="所属车队">浦东车队一组</a-descriptions-item>
      <a-descriptions-item label="载重">8.5 吨</a-descriptions-item>
      <a-descriptions-item label="启用日期">2025-03-18</a-descriptions-item>
      <a-descriptions-item label="责任人">李雯</a-descriptions-item>
    </a-descriptions>
  </a-card>
  <a-row :gutter="16">
    <a-col :span="15">
      <a-card>
        <a-tabs default-active-key="fees">
          <a-tab-pane key="fees" tab="费用记录">
            <a-table :columns="feeColumns" :data-source="feeRows" row-key="item" :pagination="false" size="small" />
          </a-tab-pane>
          <a-tab-pane key="schedule" tab="排班记录" force-render>
            <a-timeline style="margin-top:8px">
              <a-timeline-item color="blue">11-16 07:20 接单 · 张江 → 金桥（早班）</a-timeline-item>
              <a-timeline-item color="blue">11-15 08:05 接单 · 金桥 → 田林（早班）</a-timeline-item>
              <a-timeline-item color="gray">11-14 19:40 回场 · 例行保养预约</a-timeline-item>
            </a-timeline>
          </a-tab-pane>
        </a-tabs>
      </a-card>
    </a-col>
    <a-col :span="9">
      <a-card title="本月概况">
        <div style="display:flex;gap:24px;flex-wrap:wrap">
          <a-statistic title="完成趟次" :value="128" />
          <a-statistic title="准点率" :value="96.8" suffix="%" />
        </div>
        <div style="margin-top:16px">
          <a-progress :percent="86" status="active" />
          <span style="font-size:12px">出勤天数 26 / 30</span>
        </div>
      </a-card>
    </a-col>
  </a-row>
</div>`.trim(),
  };
}
