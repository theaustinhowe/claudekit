"use client";

import { Clock, Loader2, MessageSquarePlus, Send, Zap } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useJobAction } from "@/hooks/use-jobs";

type InjectMode = "immediate" | "queued";

interface InjectModalProps {
  jobId: string;
  disabled?: boolean;
  /** Use "prominent" for running jobs to make the button more visible */
  variant?: "default" | "prominent";
}

export function InjectModal({ jobId, disabled, variant = "default" }: InjectModalProps) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<InjectMode>("immediate");
  const { mutate: performAction, isPending } = useJobAction();

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!message.trim()) return;

    performAction(
      {
        jobId,
        action: {
          type: "inject",
          payload: { message: message.trim(), mode },
        },
      },
      {
        onSuccess: () => {
          toast.success("Message Injected", {
            description:
              mode === "immediate"
                ? "Agent will be interrupted to process your message."
                : "Your message will be delivered at the next break point.",
          });
          setMessage("");
          setMode("immediate");
          setOpen(false);
        },
        onError: (error) => {
          toast.error("Failed to inject message", {
            description: error.message,
          });
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant={variant === "prominent" ? "default" : "outline"}
          size="sm"
          disabled={disabled}
          className={variant === "prominent" ? "bg-blue-600 hover:bg-blue-700 text-white" : undefined}
        >
          <MessageSquarePlus className="h-4 w-4 mr-1" />
          Guide Agent
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Guide Agent</DialogTitle>
            <DialogDescription>
              Send a message to the agent. This will be added to its context and can influence its behavior.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Delivery Mode</Label>
              <div className="space-y-2">
                {/* Immediate option */}
                <button
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    mode === "immediate"
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-muted-foreground/50"
                  }`}
                  onClick={() => setMode("immediate")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setMode("immediate");
                    }
                  }}
                  type="button"
                  tabIndex={0}
                >
                  <div className="flex items-center gap-2">
                    <Zap className={`h-4 w-4 ${mode === "immediate" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="font-medium">Immediate</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    Pauses the agent, injects your message, and resumes immediately. The agent will see your message in
                    its next turn.
                  </p>
                </button>

                {/* Queued option */}
                <button
                  className={`p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                    mode === "queued" ? "border-primary bg-primary/5" : "border-muted hover:border-muted-foreground/50"
                  }`}
                  onClick={() => setMode("queued")}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setMode("queued");
                    }
                  }}
                  type="button"
                  tabIndex={0}
                >
                  <div className="flex items-center gap-2">
                    <Clock className={`h-4 w-4 ${mode === "queued" ? "text-primary" : "text-muted-foreground"}`} />
                    <span className="font-medium">Queued</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 ml-6">
                    Stores the message for delivery at the agent's next natural stopping point. The agent continues
                    working until it finishes its current task.
                  </p>
                </button>
              </div>

              {/* Usage tips */}
              <div className="text-xs text-muted-foreground mt-3 p-2 bg-muted rounded-md">
                <p className="font-medium mb-1">When to use:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>
                    <strong>Immediate:</strong> Urgent corrections, stop wrong actions
                  </li>
                  <li>
                    <strong>Queued:</strong> Additional context, non-urgent guidance
                  </li>
                </ul>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                placeholder="Enter your message to the agent..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!message.trim() || isPending}>
              {isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Send className="h-4 w-4 mr-1" />}
              {isPending ? "Sending..." : "Send"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
