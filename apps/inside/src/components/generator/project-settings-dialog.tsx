"use client";

import { Badge } from "@claudekit/ui/components/badge";
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from "@claudekit/ui/components/dialog";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@claudekit/ui/components/tooltip";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  ANALYTICS_OPTIONS,
  AUTH_OPTIONS,
  BACKEND_OPTIONS,
  CONSTRAINT_OPTIONS,
  DESIGN_VIBES,
  EMAIL_OPTIONS,
  FEATURE_OPTIONS,
  PAYMENT_OPTIONS,
  PLATFORMS,
} from "@/lib/constants";
import type { GeneratorProject } from "@/lib/types";

const ALL_OPTIONS = new Map<string, string>();
for (const list of [
  BACKEND_OPTIONS,
  AUTH_OPTIONS,
  EMAIL_OPTIONS,
  ANALYTICS_OPTIONS,
  PAYMENT_OPTIONS,
  FEATURE_OPTIONS,
] as { id: string; label: string }[][]) {
  for (const o of list) {
    ALL_OPTIONS.set(o.id, o.label);
  }
}

interface ProjectSettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: GeneratorProject;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1.5">{title}</h3>
      {children}
    </div>
  );
}

function ColorSwatch({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-5 h-5 rounded border" style={{ backgroundColor: color }} />
      <span className="text-sm">{label}</span>
      <span className="text-xs text-muted-foreground font-mono">{color}</span>
    </div>
  );
}

function DescriptionSection({ description }: { description: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(description);
      setCopied(true);
      toast.success("Copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy");
    }
  }

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1.5">
        <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Description</h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={handleCopy}
                className="p-0.5 rounded text-muted-foreground hover:text-foreground transition-colors"
              >
                {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              </button>
            </TooltipTrigger>
            <TooltipContent>Copy description</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
      <pre className="text-sm leading-relaxed whitespace-pre-wrap font-sans max-h-48 overflow-y-auto">
        {description}
      </pre>
    </div>
  );
}

export function ProjectSettingsDialog({ open, onOpenChange, project }: ProjectSettingsDialogProps) {
  const framework = PLATFORMS.find((f) => f.id === project.platform);
  const vibes = DESIGN_VIBES.filter((v) => project.design_vibes.includes(v.id));
  const constraints = [...CONSTRAINT_OPTIONS].filter((c) => project.constraints.includes(c.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[70vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-3 shrink-0">
          <DialogTitle>Project Settings</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex-1 overflow-y-auto px-6 pb-6 space-y-5">
            {/* Description */}
            {project.idea_description && <DescriptionSection description={project.idea_description} />}

            {/* Design Vibes */}
            {vibes.length > 0 && (
              <Section title="Design Vibes">
                <div className="flex flex-wrap gap-1.5">
                  {vibes.map((v) => (
                    <Badge key={v.id} variant="secondary" className="text-xs">
                      {v.label}
                      <span className="text-muted-foreground ml-1">{v.description}</span>
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            {/* Color Scheme */}
            {(project.color_scheme?.primary || project.color_scheme?.accent) && (
              <Section title="Color Scheme">
                <div className="flex gap-4">
                  {project.color_scheme.primary && <ColorSwatch color={project.color_scheme.primary} label="Primary" />}
                  {project.color_scheme.accent && <ColorSwatch color={project.color_scheme.accent} label="Accent" />}
                </div>
              </Section>
            )}

            {/* Inspiration URLs */}
            {project.inspiration_urls.length > 0 && (
              <Section title="Inspiration URLs">
                <ul className="space-y-1">
                  {project.inspiration_urls.map((url) => (
                    <li key={url}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                      >
                        {url}
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </li>
                  ))}
                </ul>
              </Section>
            )}

            {/* Framework */}
            <Section title="Framework">
              <p className="text-sm">{framework ? framework.label : project.platform}</p>
            </Section>

            {/* Services */}
            {project.services.length > 0 && (
              <Section title="Services">
                <div className="flex flex-wrap gap-1.5">
                  {project.services.map((id) => (
                    <Badge key={id} variant="secondary" className="text-xs">
                      {ALL_OPTIONS.get(id) ?? id}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            {/* Constraints */}
            {constraints.length > 0 && (
              <Section title="Constraints">
                <div className="flex flex-wrap gap-1.5">
                  {constraints.map((c) => (
                    <Badge key={c.id} variant="secondary" className="text-xs">
                      {c.label}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            {/* Custom Features */}
            {project.custom_features.length > 0 && (
              <Section title="Custom Features">
                <div className="flex flex-wrap gap-1.5">
                  {project.custom_features.map((f) => (
                    <Badge key={f} variant="outline" className="text-xs">
                      {f}
                    </Badge>
                  ))}
                </div>
              </Section>
            )}

            {/* Package Manager */}
            <Section title="Package Manager">
              <p className="text-sm">{project.package_manager}</p>
            </Section>

            {/* Project Path */}
            <Section title="Project Path">
              <p className="text-sm font-mono text-muted-foreground">
                {project.project_path}/{project.project_name}
              </p>
            </Section>
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
