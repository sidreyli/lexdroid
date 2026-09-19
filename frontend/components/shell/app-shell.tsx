import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getEconomies, getReviewQueue } from "@/lib/data";
import { listOf } from "@/lib/format";
import { NavRail } from "./nav-rail";

export function AppShell({ children }: { children: React.ReactNode }) {
  const awaitingReview = getReviewQueue().length;
  const economies = listOf([...getEconomies()].map((e) => e.name).sort());

  return (
    <SidebarProvider
      style={
        { "--sidebar-width": "15rem", "--sidebar-width-icon": "4rem" } as React.CSSProperties
      }
    >
      <NavRail reviewCount={awaitingReview} economies={economies} />
      {/* Clipped, not hidden: hidden would make this a scroll box and strand every sticky column. */}
      <SidebarInset className="bg-paper min-h-svh overflow-x-clip">{children}</SidebarInset>
    </SidebarProvider>
  );
}
