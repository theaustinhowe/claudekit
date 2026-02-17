"use client";

import { cn } from "@devkit/ui";
import { Badge } from "@devkit/ui/components/badge";
import { Button } from "@devkit/ui/components/button";
import { Textarea } from "@devkit/ui/components/textarea";
import { Check, ExternalLink } from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import { markSkillAddressed, updateSkillActionItem } from "@/lib/actions/skills";
import { SEVERITY_COLORS } from "@/lib/constants";
import type { SkillWithComments } from "@/lib/types";

export function SkillDetailDrawer({ skill }: { skill: SkillWithComments }) {
  const [actionItem, setActionItem] = useState(skill.actionItem ?? "");
  const [addressed, setAddressed] = useState(skill.addressed);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const resources = skill.resources ? JSON.parse(skill.resources) : [];

  const handleToggleAddressed = () => {
    const newValue = !addressed;
    setAddressed(newValue);
    startTransition(async () => {
      await markSkillAddressed(skill.id, newValue);
    });
  };

  const handleActionItemChange = (value: string) => {
    setActionItem(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      startTransition(async () => {
        await updateSkillActionItem(skill.id, value);
      });
    }, 500);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <div className={cn("h-2.5 w-2.5 rounded-full", SEVERITY_COLORS[skill.severity])} />
          <h2 className="text-lg font-bold">{skill.name}</h2>
        </div>
        {skill.description && <p className="text-sm text-muted-foreground leading-relaxed">{skill.description}</p>}
      </div>

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          Related Comments ({skill.comments.length})
        </h4>
        <div className="space-y-3">
          {skill.comments.map((c) => (
            <div key={c.id} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center gap-2">
                {c.reviewerAvatar ? (
                  // biome-ignore lint/performance/noImgElement: external avatar URL
                  <img src={c.reviewerAvatar} alt={c.reviewer} className="h-6 w-6 rounded-full" />
                ) : (
                  <div className="h-6 w-6 rounded-full bg-secondary flex items-center justify-center text-[10px] font-bold text-secondary-foreground">
                    {c.reviewer.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <span className="text-xs font-medium">{c.reviewer}</span>
                <Badge variant="secondary" className="text-[10px] ml-auto">
                  #{c.prNumber}
                </Badge>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{c.text}</p>
              {c.file && (
                <code className="text-[11px] font-mono text-muted-foreground">
                  {c.file}:{c.line}
                </code>
              )}
            </div>
          ))}
        </div>
      </div>

      {resources.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Resources</h4>
          <div className="space-y-1.5">
            {resources.map((r: { title: string; url: string }) => (
              <a key={r.url} href={r.url} className="flex items-center gap-2 text-sm text-primary hover:underline">
                <ExternalLink className="h-3.5 w-3.5" />
                {r.title}
              </a>
            ))}
          </div>
        </div>
      )}

      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Action Item</h4>
        <Textarea
          value={actionItem}
          onChange={(e) => handleActionItemChange(e.target.value)}
          className="text-sm"
          rows={3}
        />
      </div>

      <Button
        className={cn("w-full", addressed && "bg-status-success hover:bg-status-success/90")}
        onClick={handleToggleAddressed}
        disabled={isPending}
      >
        {addressed ? (
          <>
            <Check className="h-4 w-4 mr-2" /> Addressed
          </>
        ) : (
          "Mark as Addressed"
        )}
      </Button>
    </div>
  );
}
