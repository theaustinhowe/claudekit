"use client";

import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Input } from "@claudekit/ui/components/input";
import { Label } from "@claudekit/ui/components/label";
import { Tooltip, TooltipContent, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { ExternalLink, Eye, EyeOff, Info } from "lucide-react";
import { useCallback, useState } from "react";

const SENSITIVE_PATTERNS = /token|key|secret|password|pat$/i;

interface EnvFieldProps {
  variableKey: string;
  description: string;
  required: boolean;
  sources?: Array<{ appId: string; label: string }>;
  placeholder?: string;
  defaultValue?: string;
  url?: string;
  hint?: string;
  value: string;
  onChange: (key: string, value: string) => void;
}

export function EnvField({
  variableKey,
  description,
  required,
  sources,
  placeholder,
  defaultValue,
  url,
  hint,
  value,
  onChange,
}: EnvFieldProps) {
  const isSensitive = SENSITIVE_PATTERNS.test(variableKey);
  const [showValue, setShowValue] = useState(!isSensitive);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(variableKey, e.target.value);
    },
    [variableKey, onChange],
  );

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 flex-wrap">
        <Label htmlFor={variableKey} className="font-mono text-sm">
          {variableKey}
        </Label>
        <Badge variant={required ? "default" : "outline"} className="text-[10px] px-1.5 py-0">
          {required ? "Required" : "Optional"}
        </Badge>
        {sources &&
          sources.length > 0 &&
          sources.map((s) => (
            <Badge key={s.appId} variant="secondary" className="text-[10px] px-1.5 py-0">
              {s.label}
            </Badge>
          ))}
        {hint && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs text-xs">
              {hint}
            </TooltipContent>
          </Tooltip>
        )}
        {url && (
          <a href={url} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        )}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="relative">
        <Input
          id={variableKey}
          type={showValue ? "text" : "password"}
          value={value}
          onChange={handleChange}
          placeholder={placeholder || defaultValue || ""}
          className={cn("pr-9 font-mono text-sm", !value && required && "border-warning/50")}
        />
        {isSensitive && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setShowValue((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showValue ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>{showValue ? "Hide value" : "Show value"}</TooltipContent>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
