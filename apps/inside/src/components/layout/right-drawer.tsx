"use client";

import { Button } from "@devkit/ui/components/button";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { SkillDetailDrawer } from "@/components/skills/skill-detail-drawer";
import { DiffPreviewDrawer } from "@/components/splitter/diff-preview-drawer";
import type { SkillWithComments } from "@/lib/types";
import type { DrawerType } from "./app-layout";

interface RightDrawerProps {
  drawer: {
    open: boolean;
    type: DrawerType;
    data: unknown;
  };
  onClose: () => void;
}

export function RightDrawer({ drawer, onClose }: RightDrawerProps) {
  return (
    <AnimatePresence>
      {drawer.open && (
        <>
          <motion.div
            className="fixed inset-0 bg-foreground/10 z-30"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            className="fixed right-0 top-0 h-full w-[400px] max-w-[90vw] bg-card border-l shadow-xl z-40 flex flex-col"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
          >
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="font-semibold text-sm">{drawer.type === "skill" ? "Skill Details" : "Diff Preview"}</h3>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              {drawer.type === "skill" && <SkillDetailDrawer skill={drawer.data as SkillWithComments} />}
              {drawer.type === "diff" && (
                <DiffPreviewDrawer
                  data={drawer.data as { filePath: string; subPRTitle: string; diffContent?: string }}
                />
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
