"use client";

import { useIsMobile } from "@devkit/hooks";
import { cn } from "@devkit/ui";
import { Brain, GitBranch, LayoutDashboard, MessageSquareCode, Settings } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/skills", icon: Brain, label: "Skill Builder" },
  { href: "/splitter", icon: GitBranch, label: "PR Splitter" },
  { href: "/resolver", icon: MessageSquareCode, label: "Comment Resolver" },
  { href: "/settings", icon: Settings, label: "Settings" },
];

interface AppSidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export function AppSidebar({ collapsed, mobileOpen, onMobileClose }: AppSidebarProps) {
  const pathname = usePathname();
  const isMobile = useIsMobile();

  const navContent = (
    <nav className="flex flex-col gap-1 p-2 mt-2">
      {navItems.map((item) => {
        const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => isMobile && onMobileClose()}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              isActive ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground",
            )}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {(isMobile || !collapsed) && <span>{item.label}</span>}
          </Link>
        );
      })}
    </nav>
  );

  if (isMobile) {
    return (
      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              className="fixed inset-0 bg-foreground/10 z-30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={onMobileClose}
            />
            <motion.aside
              className="fixed left-0 top-14 bottom-0 w-[240px] bg-sidebar border-r z-40 flex flex-col"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "spring", damping: 30, stiffness: 300 }}
            >
              {navContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    );
  }

  return (
    <aside
      className={cn(
        "h-full border-r bg-sidebar shrink-0 flex flex-col transition-all duration-300 overflow-hidden",
        collapsed ? "w-[60px]" : "w-[240px]",
      )}
    >
      {navContent}
    </aside>
  );
}
