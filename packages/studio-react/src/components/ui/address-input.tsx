// 地址输入（Geist Address Input 的形态，按中国地址顺序）：省 / 市 / 区用级联选择，详细地址单独一栏，邮编可选；
// 每栏有标签、可分别校验，整组用 fieldset + legend。
import * as React from "react";
import { cn } from "../../lib/utils";
import { Cascader, type CascaderOption } from "./cascader";
import { Input } from "./input";
import { Label } from "./label";

export interface AddressValue {
  readonly region: readonly string[];
  readonly detail: string;
  readonly postcode?: string;
}

export interface AddressInputProps {
  readonly regions: readonly CascaderOption[];
  readonly value: AddressValue;
  readonly onValueChange: (value: AddressValue) => void;
  readonly legend?: string;
  readonly withPostcode?: boolean;
  readonly className?: string;
}

export function AddressInput({ regions, value, onValueChange, legend = "地址", withPostcode = false, className }: AddressInputProps) {
  const id = React.useId();
  return (
    <fieldset data-slot="address-input" className={cn("flex w-full max-w-md flex-col gap-3", className)}>
      <legend className="mb-1 text-label-14">{legend}</legend>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-region`}>省 / 市 / 区</Label>
        <Cascader id={`${id}-region`} options={regions} value={value.region} onValueChange={(region) => onValueChange({ ...value, region })} placeholder="选择所在地区" />
      </div>
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-detail`}>详细地址</Label>
        <Input id={`${id}-detail`} autoComplete="street-address" placeholder="街道、门牌号、楼层" maxLength={120} value={value.detail} onChange={(event) => onValueChange({ ...value, detail: event.target.value })} />
      </div>
      {withPostcode ? (
        <div className="flex flex-col gap-2">
          <Label htmlFor={`${id}-postcode`}>邮政编码</Label>
          <Input id={`${id}-postcode`} autoComplete="postal-code" inputMode="numeric" maxLength={6} className="w-32 tabular-nums" value={value.postcode ?? ""} onChange={(event) => onValueChange({ ...value, postcode: event.target.value.replace(/\D/g, "") })} />
        </div>
      ) : null}
    </fieldset>
  );
}
