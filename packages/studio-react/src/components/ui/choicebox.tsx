// 选择卡片（Geist Choicebox）：比单选 / 多选更显眼的选项卡，每张卡有标题与说明；单选用 RadioGroup、多选用 Checkbox 的语义，
// 整张卡可点，选中态描边加深并打勾。适合 2–4 个需要解释差异的选项（套餐、部署区域）。
import * as React from "react";
import { RadioGroup as RadioGroupPrimitive } from "radix-ui";
import { CheckIcon } from "lucide-react";
import { cn } from "../../lib/utils";

const CARD =
  "relative flex cursor-pointer flex-col gap-1 rounded-lg border border-ds-gray-400 bg-ds-background-100 p-4 pr-10 text-left outline-none hover:border-ds-gray-500 focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=checked]:border-ds-gray-1000 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50";

export interface ChoiceboxOption {
  readonly value: string;
  readonly title: string;
  readonly description?: string;
  readonly disabled?: boolean;
}

function Mark() {
  return (
    <span aria-hidden="true" className="absolute top-4 right-4 flex size-4 items-center justify-center rounded-full border border-ds-gray-400 group-data-[state=checked]:border-ds-gray-1000 group-data-[state=checked]:bg-ds-gray-1000 group-data-[state=checked]:text-ds-background-100">
      <CheckIcon className="size-3 opacity-0 group-data-[state=checked]:opacity-100" />
    </span>
  );
}

export interface ChoiceboxGroupProps {
  readonly options: readonly ChoiceboxOption[];
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly columns?: 1 | 2 | 3;
  readonly className?: string;
  readonly "aria-label"?: string;
}

export function ChoiceboxGroup({ options, value, onValueChange, columns = 2, className, ...rest }: ChoiceboxGroupProps) {
  return (
    <RadioGroupPrimitive.Root data-slot="choicebox-group" value={value} onValueChange={onValueChange} aria-label={rest["aria-label"]} className={cn("grid gap-3", columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-2" : "grid-cols-3", className)}>
      {options.map((option) => (
        <RadioGroupPrimitive.Item key={option.value} value={option.value} disabled={option.disabled} className={cn(CARD, "group")}>
          <span className="text-label-14 text-ds-gray-1000">{option.title}</span>
          {option.description !== undefined ? <span className="text-copy-13 text-ds-gray-900">{option.description}</span> : null}
          <Mark />
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

export interface ChoiceboxMultiProps {
  readonly options: readonly ChoiceboxOption[];
  readonly value: readonly string[];
  readonly onValueChange: (value: string[]) => void;
  readonly columns?: 1 | 2 | 3;
  readonly className?: string;
  readonly "aria-label"?: string;
}

export function ChoiceboxMulti({ options, value, onValueChange, columns = 2, className, ...rest }: ChoiceboxMultiProps) {
  return (
    <div role="group" data-slot="choicebox-multi" aria-label={rest["aria-label"]} className={cn("grid gap-3", columns === 1 ? "grid-cols-1" : columns === 2 ? "grid-cols-2" : "grid-cols-3", className)}>
      {options.map((option) => {
        const checked = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            role="checkbox"
            aria-checked={checked}
            disabled={option.disabled}
            data-state={checked ? "checked" : "unchecked"}
            data-disabled={option.disabled ? "" : undefined}
            className={cn(CARD, "group")}
            onClick={() => onValueChange(checked ? value.filter((item) => item !== option.value) : [...value, option.value])}
          >
            <span className="text-label-14 text-ds-gray-1000">{option.title}</span>
            {option.description !== undefined ? <span className="text-copy-13 text-ds-gray-900">{option.description}</span> : null}
            <Mark />
          </button>
        );
      })}
    </div>
  );
}
