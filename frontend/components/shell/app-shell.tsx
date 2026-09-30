import { cookies } from "next/headers";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { getReviewQueue } from "@/lib/data";
import { isReadOnlyDeployment } from "@/lib/deployment";
import { NavRail } from "./nav-rail";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const awaitingReview = getReviewQueue().length;
  const readOnly = isReadOnlyDeployment();
  // The sidebar records whether it was put away; read it here so a reload does not reopen it.
  const sidebarOpen = (await cookies()).get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider
      defaultOpen={sidebarOpen}
      style={
        { "--sidebar-width": "15rem" } as React.CSSProperties
      }
    >
      <NavRail reviewCount={awaitingReview} />
      {/* Clipped, not hidden: hidden would make this a scroll box and strand every sticky column. */}
      <SidebarInset className="bg-paper min-h-svh min-w-0 overflow-x-clip">
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
