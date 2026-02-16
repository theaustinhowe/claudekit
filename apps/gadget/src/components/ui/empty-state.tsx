"use client";

import { Button } from "@devkit/ui/components/button";
import type { LucideIcon } from "lucide-react";
import { motion } from "motion/react";
import Link from "next/link";

interface EmptyStateAction {
  label: string;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "outline";
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actions?: EmptyStateAction[];
}

export function EmptyState({ icon: Icon, title, description, actions }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-12 px-4 text-center"
    >
      <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mb-4">
        <Icon className="w-8 h-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-sm text-muted-foreground max-w-md mb-6">{description}</p>
      {actions && actions.length > 0 && (
        <div className="flex items-center gap-3">
          {actions.map((action) =>
            action.href ? (
              <Link key={action.label} href={action.href}>
                <Button variant={action.variant || "default"}>{action.label}</Button>
              </Link>
            ) : (
              <Button key={action.label} variant={action.variant || "default"} onClick={action.onClick}>
                {action.label}
              </Button>
            ),
          )}
        </div>
      )}
    </motion.div>
  );
}
