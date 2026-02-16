"use client";

import {
  AlertCircle,
  Bot,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  MessageSquare,
  Play,
  RefreshCw,
  User,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Textarea } from "@/components/ui/textarea";
import { useResumeAgent } from "@/hooks/use-jobs";
import { formatLastChecked } from "@/lib/utils";

interface NeedsInfoPanelProps {
  jobId: string;
  question: string | null;
  issueUrl: string;
  latestResponse?: {
    message: string;
    user?: string;
    url?: string;
  } | null;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  pollInterval?: number;
  lastCheckedAt?: Date | string | null;
  onActionComplete?: () => void;
}

export function NeedsInfoPanel({
  jobId,
  question,
  issueUrl,
  latestResponse,
  onRefresh,
  isRefreshing = false,
  pollInterval,
  lastCheckedAt,
  onActionComplete,
}: NeedsInfoPanelProps) {
  const { mutate: resumeAgent, isPending: isResumePending } = useResumeAgent();
  const [message, setMessage] = useState("");
  const [showMessageInput, setShowMessageInput] = useState(false);

  const handleResume = () => {
    // Use resumeAgent which performs atomic state transition + agent start
    resumeAgent(
      { jobId, message: message.trim() || undefined },
      {
        onSuccess: (response) => {
          if (response.success) {
            toast.success("Job Resumed", {
              description: "The agent will continue working with your answer.",
            });
            setMessage("");
            setShowMessageInput(false);
            onActionComplete?.();
          } else {
            toast.error("Failed to resume", {
              description: response.error || "Unknown error",
            });
          }
        },
        onError: (err) => {
          toast.error("Failed to resume", { description: err.message });
        },
      },
    );
  };

  return (
    <Card className="border-orange-200 dark:border-orange-900 bg-orange-50 dark:bg-orange-950/30">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base text-orange-700 dark:text-orange-400">
          <AlertCircle className="h-5 w-5" />
          Waiting for Human Response
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {question && (
          <div>
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 text-xs font-medium">
                <Bot className="h-3 w-3" />
                Agent
              </div>
              <span className="text-sm text-muted-foreground">asked:</span>
            </div>
            <div className="bg-white dark:bg-gray-900 rounded-md p-3 text-sm border border-l-4 border-l-blue-400 dark:border-l-blue-600">
              {question}
            </div>
          </div>
        )}

        {/* Local resume with message input */}
        <div className="space-y-3">
          <Collapsible open={showMessageInput} onOpenChange={setShowMessageInput}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground p-0 h-auto">
                {showMessageInput ? (
                  <ChevronDown className="h-4 w-4 mr-1" />
                ) : (
                  <ChevronRight className="h-4 w-4 mr-1" />
                )}
                <MessageSquare className="h-4 w-4 mr-1" />
                Answer locally (optional message)
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <Textarea
                placeholder="Provide answer or additional context for the agent..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[80px] bg-white dark:bg-gray-900"
                disabled={isResumePending}
              />
            </CollapsibleContent>
          </Collapsible>

          <div className="flex items-center gap-2">
            <Button variant="default" size="sm" onClick={handleResume} disabled={isResumePending} className="flex-1">
              <Play className="h-4 w-4 mr-2" />
              {isResumePending ? "Resuming..." : "Resume Agent"}
            </Button>
            {issueUrl && (
              <a href={issueUrl} target="_blank" rel="noopener noreferrer" className="flex-1">
                <Button variant="outline" size="sm" className="w-full" disabled={isResumePending}>
                  <ExternalLink className="h-4 w-4 mr-2" />
                  Answer on GitHub
                </Button>
              </a>
            )}
            {onRefresh && issueUrl && (
              <Button variant="outline" size="sm" onClick={onRefresh} disabled={isRefreshing || isResumePending}>
                <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              </Button>
            )}
          </div>
        </div>

        {latestResponse && (
          <div className="pt-2 border-t">
            <div className="flex items-center gap-2 mb-1">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300 text-xs font-medium">
                <User className="h-3 w-3" />
                {latestResponse.user || "Human"}
              </div>
              <span className="text-sm text-muted-foreground">responded:</span>
            </div>
            <div className="bg-green-50 dark:bg-green-950/30 rounded-md p-3 text-sm border border-l-4 border-l-green-400 dark:border-l-green-600">
              {latestResponse.message}
            </div>
            {latestResponse.url && (
              <a
                href={latestResponse.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary hover:underline mt-1 inline-block"
              >
                View on GitHub
              </a>
            )}
          </div>
        )}

        {/* Polling status footer - only for GitHub-backed jobs */}
        {issueUrl && (
          <div className="flex items-center justify-between text-xs text-muted-foreground pt-3 mt-4 border-t border-orange-200 dark:border-orange-900/50">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-orange-500" />
              </span>
              <span>Auto-checking every {pollInterval ? Math.floor(pollInterval / 1000) : 30}s</span>
            </div>
            {lastCheckedAt && <span>Last: {formatLastChecked(lastCheckedAt)}</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
