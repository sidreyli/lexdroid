import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getEconomies, getReviewQueue } from "@/lib/data";
import { listOf } from "@/lib/format";
import { isReadOnlyDeployment } from "@/lib/deployment";
import { NavRail } from "./nav-rail";

export function AppShell({ children }: { children: React.ReactNode }) {
  const awaitingReview = getReviewQueue().length;
  const economies = listOf([...getEconomies()].map((e) => e.name).sort());
  const readOnly = isReadOnlyDeployment();

  return (
    <SidebarProvider
      style={
        { "--sidebar-width": "15rem", "--sidebar-width-icon": "4rem" } as React.CSSProperties
      }
    >
      <NavRail reviewCount={awaitingReview} economies={economies} />
      {/* Clipped, not hidden: hidden would make this a scroll box and strand every sticky column. */}
      <SidebarInset className="bg-paper min-h-svh overflow-x-clip">
        {readOnly ? (
          <div className="border-b border-ochre/20 bg-ochre-soft px-5 py-2 text-center text-[12.5px] text-ochre sm:px-8">
            Hosted snapshot — explore and export the recorded analysis. Starting runs and saving
            reviews requires a local LexDroid checkout.
          </div>
        ) : null}
        {children}
      </SidebarInset>
    </SidebarProvider>
  );
}
