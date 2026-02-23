"use client";

import { cn } from "@claudekit/ui";
import { Badge } from "@claudekit/ui/components/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@claudekit/ui/components/collapsible";
import { Input } from "@claudekit/ui/components/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { ChevronRight, ExternalLink, Eye, EyeOff, Info } from "lucide-react";
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

  const hasDetails = description || (sources && sources.length > 0) || url;

  return (
    <Collapsible className="group/field py-2 px-2 transition-colors data-[open]:bg-muted/30">
      {/* Main row: label + input */}
      <div className="flex items-center gap-3">
        {/* Toggle + label — fixed width, horizontal scroll on hover */}
        <CollapsibleTrigger
          className="flex items-center gap-1 w-[240px] shrink-0 cursor-pointer text-left"
          disabled={!hasDetails}
        >
          {hasDetails ? (
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground transition-transform duration-150 group-data-[open]/field:rotate-90" />
          ) : (
            <span className="w-3 shrink-0" />
          )}
          <span className="overflow-x-auto scrollbar-none font-mono text-xs whitespace-nowrap">{variableKey}</span>
          {required && <span className="text-destructive font-bold text-xs shrink-0">*</span>}
        </CollapsibleTrigger>

        {/* Input — slightly narrower to give label more room */}
        <div className="relative flex-1 min-w-0">
          <Input
            id={variableKey}
            type={showValue ? "text" : "password"}
            value={value}
            onChange={handleChange}
            placeholder={placeholder || defaultValue || ""}
            className={cn("h-8 text-xs font-mono", isSensitive && "pr-8", !value && required && "border-warning/50")}
          />
          {isSensitive && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  onClick={() => setShowValue((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showValue ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{showValue ? "Hide value" : "Show value"}</TooltipContent>
            </Tooltip>
          )}
        </div>
      </div>

      {/* Expandable detail row — spans full width under both label and input */}
      {hasDetails && (
        <CollapsibleContent>
          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground pt-2 pl-4">
            {sources?.length > 0 && (
              <div>
                {sources.map((s) => (
                  <Badge key={s.appId} variant="secondary" className="text-[10px] px-1.5 py-0">
                    {s.label}
                  </Badge>
                ))}
              </div>
            )}
            {description && (
              <div className="flex flex-wrap gap-1">
                <span>{description}</span>
                {hint && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3 w-3 cursor-help shrink-0" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-xs text-xs">
                      {hint}
                    </TooltipContent>
                  </Tooltip>
                )}
              </div>
            )}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-primary"
              >
                Docs <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </CollapsibleContent>
      )}
    </Collapsible>
  );
}
