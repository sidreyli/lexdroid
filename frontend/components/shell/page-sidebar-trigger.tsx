"use client";

import { SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * The page's own way back to the sidebar. On a phone the sidebar is a drawer, so this is always
 * shown there; on a wide screen it only appears once the sidebar has been put away, since the
 * sidebar carries its own toggle while it is open.
 */
export function PageSidebarTrigger({ className }: { className?: string }) {
  const { state } = useSidebar();
  return (
    <SidebarTrigger
      className={cn(
        "-ml-1 size-8 shrink-0 rounded-lg text-muted-foreground",
        state === "expanded" && "md:hidden",
        className,
      )}
    />
  );
}
