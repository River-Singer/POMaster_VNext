// 表单字段（Geist Fieldset / Label 的组合）：Field 把标签、控件、说明、错误串起来——标签 htmlFor 指向控件 id，说明与错误
// 经 aria-describedby 关联，出错时控件标 aria-invalid；必填用文字「必填」或星号加读屏说明。Fieldset 给一组字段加标题与说明。
import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "../../lib/utils";
import { Label } from "./label";

interface FieldContextValue {
  readonly id: string;
  readonly descriptionId: string;
  readonly errorId: string;
  readonly hasDescription: boolean;
  readonly error: string | undefined;
}

const FieldContext = React.createContext<FieldContextValue | null>(null);

export interface FieldProps extends React.ComponentProps<"div"> {
  readonly label: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly error?: string;
  readonly required?: boolean;
  readonly htmlFor?: string;
  readonly orientation?: "vertical" | "horizontal";
}

export function Field({ label, description, error, required = false, htmlFor, orientation = "vertical", className, children, ...props }: FieldProps) {
  const auto = React.useId();
  const id = htmlFor ?? `${auto}-control`;
  const value: FieldContextValue = { id, descriptionId: `${id}-description`, errorId: `${id}-error`, hasDescription: description !== undefined, error };
  return (
    <FieldContext.Provider value={value}>
      <div data-slot="field" data-invalid={error ? "" : undefined} className={cn("flex gap-2", orientation === "vertical" ? "flex-col" : "flex-row items-start", className)} {...props}>
        <Label htmlFor={id} className={cn(orientation === "horizontal" && "w-28 shrink-0 pt-2")}>
          {label}
          {required ? (
            <>
              <span aria-hidden="true" className="text-ds-red-900">
                *
              </span>
              <span className="sr-only">（必填）</span>
            </>
          ) : null}
        </Label>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {children}
          {description !== undefined && !error ? (
            <p id={value.descriptionId} className="text-copy-13 text-ds-gray-900">
              {description}
            </p>
          ) : null}
          {error ? (
            <p id={value.errorId} className="text-copy-13 text-ds-red-900">
              {error}
            </p>
          ) : null}
        </div>
      </div>
    </FieldContext.Provider>
  );
}

/** 包住控件：给它接上 id、aria-describedby、aria-invalid（控件要能接收这些属性）。 */
export function FieldControl({ children }: { readonly children: React.ReactElement }) {
  const field = React.useContext(FieldContext);
  if (field === null) return children;
  const describedBy = [field.error ? field.errorId : null, field.hasDescription && !field.error ? field.descriptionId : null].filter(Boolean).join(" ") || undefined;
  return (
    <Slot.Root id={field.id} aria-describedby={describedBy} aria-invalid={field.error ? true : undefined}>
      {children}
    </Slot.Root>
  );
}

export interface FieldsetProps extends React.ComponentProps<"fieldset"> {
  readonly legend: React.ReactNode;
  readonly description?: React.ReactNode;
  readonly footer?: React.ReactNode;
}

export function Fieldset({ legend, description, footer, className, children, ...props }: FieldsetProps) {
  return (
    <fieldset data-slot="fieldset" className={cn("overflow-hidden rounded-lg border border-ds-gray-400 bg-ds-background-100", className)} {...props}>
      <div className="flex flex-col gap-4 p-6">
        <legend className="float-left w-full text-heading-20">{legend}</legend>
        {description !== undefined ? <p className="clear-left text-copy-14 text-ds-gray-900">{description}</p> : null}
        <div className="clear-left flex flex-col gap-4">{children}</div>
      </div>
      {footer !== undefined ? <div className="flex items-center justify-between gap-4 border-t border-ds-gray-400 bg-ds-background-200 px-6 py-3">{footer}</div> : null}
    </fieldset>
  );
}
