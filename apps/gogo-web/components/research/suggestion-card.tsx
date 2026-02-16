"use client";

import { AlertTriangle, ArrowRight, FileCode, Info, ShieldAlert, Zap } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useConvertSuggestion } from "@/hooks/use-research";
import type { ResearchSuggestionInfo } from "@/lib/api";

const SEVERITY_CONFIG: Record<string, { color: string; icon: React.ElementType }> = {
  critical: {
    color: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300",
    icon: ShieldAlert,
  },
  high: {
    color: "bg-orange-100 text-orange-800 dark:bg-orange-900/50 dark:text-orange-300",
    icon: AlertTriangle,
  },
  medium: {
    color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/50 dark:text-yellow-300",
    icon: Info,
  },
  low: {
    color: "bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300",
    icon: Zap,
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  ui: "UI",
  ux: "UX",
  security: "Security",
  durability: "Durability",
  performance: "Performance",
  testing: "Testing",
  accessibility: "Accessibility",
  documentation: "Documentation",
};

interface SuggestionCardProps {
  suggestion: ResearchSuggestionInfo;
  sessionId: string;
}

export function SuggestionCard({ suggestion, sessionId }: SuggestionCardProps) {
  const { mutate: convert, isPending } = useConvertSuggestion();

  const severity = SEVERITY_CONFIG[suggestion.severity] ?? SEVERITY_CONFIG.medium;
  const SeverityIcon = severity.icon;

  const handleConvert = (convertTo: "manual_job" | "github_issue") => {
    convert(
      { sessionId, suggestionId: suggestion.id, convertTo },
      {
        onSuccess: (response) => {
          if (response.error) {
            toast.error("Failed to convert", {
              description: response.error,
            });
          } else {
            toast.success(convertTo === "manual_job" ? "Job Created" : "Marked for Issue Creation", {
              description: `"${suggestion.title}" has been converted.`,
            });
          }
        },
        onError: (err) => {
          toast.error("Failed to convert", { description: err.message });
        },
      },
    );
  };

  const isConverted = !!suggestion.convertedTo;

  return (
    <Card className="relative">
      <CardHeader className="pb-2">
        <div className="flex items-start gap-2">
          <SeverityIcon className="h-4 w-4 mt-0.5 shrink-0" />
          <div className="flex-1 min-w-0">
            <CardTitle className="text-sm font-medium leading-snug">{suggestion.title}</CardTitle>
          </div>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <Badge variant="outline" className="text-xs">
            {CATEGORY_LABELS[suggestion.category] ?? suggestion.category}
          </Badge>
          <Badge className={`text-xs ${severity.color}`}>{suggestion.severity}</Badge>
          {isConverted && (
            <Badge variant="secondary" className="text-xs">
              Converted
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">{suggestion.description}</p>

        {suggestion.filePaths && suggestion.filePaths.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {suggestion.filePaths.map((filePath) => (
              <span
                key={filePath}
                className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-xs font-mono text-muted-foreground"
              >
                <FileCode className="h-3 w-3" />
                {filePath}
              </span>
            ))}
          </div>
        )}

        {!isConverted && (
          <div className="flex items-center gap-2 pt-1">
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              disabled={isPending}
              onClick={() => handleConvert("manual_job")}
            >
              <ArrowRight className="h-3 w-3 mr-1" />
              Create Job
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
