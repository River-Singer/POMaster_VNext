// 原型转换实验用的样例（prototype.convert）：一份「BA 风格」的原型片段（自带一套与规范无关的字体、颜色、
// 间距与栅格），以及两份重绘结果——正确的（ant-design-vue 渲染出来的 DOM 结构）与漏了东西的。
// 样例是自写的演示数据，不含任何真实项目内容。实验里原型片段按原样（含它的内联样式）显示，抽取器读的是同一份文本。

export const PROTOTYPE_SAMPLE = `<div class="page" style="font-family: 'Comic Sans MS', 'Fira Sans', sans-serif; background: #fffbe6; padding: 14px; border: 2px dashed #f59e0b; border-radius: 2px">
  <h1 style="font-size: 19px; color: #7c2d12; margin: 0 0 6px">客户管理</h1>
  <div class="tip-bar" style="background: #e0f2fe; color: #0369a1; font-size: 11px; padding: 3px 7px; margin-bottom: 9px">信用额度超过 100 万的客户需要财务审批后才能生效。</div>
  <div class="modal" style="background: #fff; border: 1px solid #a3a3a3; box-shadow: 4px 4px 0 #fcd34d; padding: 11px; width: 300px">
    <h2 style="font-size: 15px; margin: 0 0 8px; color: #9a3412">新增客户</h2>
    <div class="grid-2" style="display: grid; grid-template-columns: 1fr 1fr; gap: 7px 13px">
      <div style="grid-column: span 2; font-weight: 700; font-size: 12px; color: #57534e" class="font-bold">基本信息</div>
      <div><label style="font-size: 11px">客户名称<span class="req" style="color: #dc2626">*</span></label><input maxlength="50" style="width: 100%; border: 1px solid #78716c; font-size: 12px; padding: 2px"></div>
      <div><label style="font-size: 11px">所属区域<span class="req" style="color: #dc2626">*</span></label><select style="width: 100%; font-size: 12px"><option value="">请选择</option><option>华东</option><option>华南</option><option>华北</option></select></div>
      <div><label style="font-size: 11px">信用额度（元）</label><input type="number" min="0" style="width: 100%; border: 1px solid #78716c; font-size: 12px; padding: 2px"></div>
      <div style="grid-column: span 2; font-weight: 700; font-size: 12px; color: #57534e" class="font-bold">联系人</div>
      <div><label style="font-size: 11px">联系人<span class="req" style="color: #dc2626">*</span></label><input style="width: 100%; border: 1px solid #78716c; font-size: 12px; padding: 2px"></div>
      <div><label style="font-size: 11px">联系电话</label><input type="tel" style="width: 100%; border: 1px solid #78716c; font-size: 12px; padding: 2px"></div>
    </div>
    <div style="display: flex; justify-content: flex-end; gap: 5px; margin-top: 10px">
      <button style="background: #e7e5e4; border: 0; padding: 3px 9px; font-size: 12px">取消</button>
      <button style="background: #ea580c; color: #fff; border: 0; padding: 3px 9px; font-size: 12px">保存</button>
    </div>
  </div>
</div>`;

const FIELD = (id: string, label: string, control: string, required: boolean) =>
  `<div class="ant-form-item"><div class="ant-row ant-form-item-row"><div class="ant-col ant-form-item-label"><label for="${id}"${required ? ' class="ant-form-item-required"' : ""} title="${label}">${label}</label></div><div class="ant-col ant-form-item-control">${control}</div></div></div>`;

const DIVIDER = (text: string) => `<div class="ant-divider ant-divider-horizontal ant-divider-with-text ant-divider-with-text-left" role="separator"><span class="ant-divider-inner-text">${text}</span></div>`;

function rebuilt(options: { readonly regions: string; readonly withCredit: boolean; readonly swapContact: boolean; readonly withNotice: boolean }): string {
  const contact = FIELD("customer_contact", "联系人", '<input id="customer_contact" type="text" class="ant-input">', true);
  const phone = FIELD("customer_phone", "联系电话", '<input id="customer_phone" type="tel" class="ant-input">', false);
  return [
    `<main class="ant-layout-content">`,
    `<h1>客户管理</h1>`,
    options.withNotice ? `<div role="alert" class="ant-alert ant-alert-info"><div class="ant-alert-message">信用额度超过 100 万的客户需要财务审批后才能生效。</div></div>` : "",
    `<div class="ant-modal-wrap" role="dialog" aria-labelledby="dlg"><div class="ant-modal"><div class="ant-modal-content">`,
    `<div class="ant-modal-header"><div class="ant-modal-title" id="dlg">新增客户</div></div>`,
    `<div class="ant-modal-body"><form class="ant-form ant-form-vertical">`,
    DIVIDER("基本信息"),
    FIELD("customer_name", "客户名称", '<input id="customer_name" type="text" class="ant-input" maxlength="50">', true),
    FIELD("customer_region", "所属区域", `<div class="ant-select"><input id="customer_region" role="combobox" readonly aria-required="true" data-pomaster-options='${options.regions}'></div>`, true),
    options.withCredit ? FIELD("customer_credit", "信用额度（元）", '<div class="ant-input-number"><input id="customer_credit" role="spinbutton" aria-valuemin="0"></div>', false) : "",
    DIVIDER("联系人"),
    options.swapContact ? phone + contact : contact + phone,
    `</form></div>`,
    `<div class="ant-modal-footer"><button type="button" class="ant-btn"><span>取消</span></button><button type="button" class="ant-btn ant-btn-primary"><span>保存</span></button></div>`,
    `</div></div></div>`,
    `</main>`,
  ].join("");
}

/** 正确的重绘：换成 antd 的组件与规范的排版，事实一条不少。 */
export const REBUILT_RIGHT = rebuilt({ regions: '["华东","华南","华北"]', withCredit: true, swapContact: false, withNotice: true });

/** 错误的重绘：漏了「信用额度」、把「华北」改成「北方」、调换了联系人与联系电话、丢了审批提示。 */
export const REBUILT_WRONG = rebuilt({ regions: '["华东","华南","北方"]', withCredit: false, swapContact: true, withNotice: false });
