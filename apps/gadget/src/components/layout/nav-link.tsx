"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface NavLinkProps extends Omit<React.ComponentPropsWithoutRef<"a">, "href"> {
  href: string;
  activeClassName?: string;
}

export const NavLink = forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ href, className, activeClassName, children, ...rest }, ref) => {
    const pathname = usePathname();
    const isActive = pathname === href || (href !== "/" && pathname?.startsWith(href));

    return (
      <Link ref={ref} href={href} className={cn(className, isActive && activeClassName)} {...rest}>
        {children}
      </Link>
    );
  },
);
NavLink.displayName = "NavLink";
