"use client";

import type { SharedVariable } from "@/lib/env-parser";
import { EnvField } from "./env-field";

interface StepSharedProps {
  variables: SharedVariable[];
  values: Record<string, string>;
  onChange: (key: string, value: string) => void;
}

export function StepShared({ variables, values, onChange }: StepSharedProps) {
  return (
    <div className="space-y-6 py-4">
      <p className="text-sm text-muted-foreground">
        These variables are shared across multiple apps. Setting them here will write to all relevant{" "}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">.env.local</code> files.
      </p>
      <div className="space-y-5">
        {variables.map((v) => (
          <EnvField
            key={v.key}
            variableKey={v.key}
            description={v.description}
            required={v.required}
            sources={v.sources}
            placeholder={v.placeholder}
            defaultValue={v.defaultValue}
            url={v.url}
            hint={v.hint}
            value={values[v.key] ?? ""}
            onChange={onChange}
          />
        ))}
      </div>
    </div>
  );
}
