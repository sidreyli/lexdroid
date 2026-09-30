"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookMarked,
  ClipboardCheck,
  Globe2,
  LayoutDashboard,
  Search,
  Table2,
  Waves,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar";
import { useReview } from "@/components/workbench/review-store";

const work = [
  { href: "/", label: "Overview", icon: LayoutDashboard },
  { href: "/workbench", label: "Workbench", icon: ClipboardCheck },
  { href: "/database", label: "Database", icon: Table2 },
];

const reference = [
  { href: "/corpus", label: "Corpus", icon: Search },
  { href: "/economies", label: "Economies", icon: Globe2 },
  { href: "/runs", label: "Runs", icon: Waves },
  { href: "/rubric", label: "Rubric", icon: BookMarked },
];

export function NavRail({ reviewCount = 0 }: { reviewCount?: number }) {
  const pathname = usePathname();
  const { decisions } = useReview();
  const waiting = Math.max(0, reviewCount - Object.keys(decisions).length);
  const active = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <Sidebar collapsible="icon" className="border-r-0">
      <SidebarHeader className="px-3 pt-4 pb-2">
        <Link
          href="/"
          className="flex items-center gap-2.5 rounded-xl px-1.5 py-1.5 transition-colors hover:bg-sidebar-accent"
        >
          <span className="grid size-8 shrink-0 place-items-center rounded-[11px] bg-navy text-paper shadow-[0_2px_6px_-1px_rgb(23_50_78/0.45)]">
            <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
              <path
                d="M6 5.5h7.5L18 10v8.5H6V5.5Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                strokeLinejoin="round"
              />
              <path d="M9 12.5h6M9 15.5h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </span>
          <span className="grid group-data-[collapsible=icon]:hidden">
            <span className="text-[15px] leading-tight font-semibold tracking-tight text-navy-deep">
              LexDroid
            </span>
            <span className="text-[11.5px] leading-tight text-muted-foreground">
              Regulatory evidence
            </span>
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent className="px-3">
        <SidebarMenu className="gap-0.5">
          {work.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={active(item.href)}
                tooltip={item.label}
                className="h-9 rounded-xl data-[active=true]:bg-navy data-[active=true]:text-paper data-[active=true]:font-medium data-[active=true]:shadow-[0_2px_8px_-3px_rgb(23_50_78/0.5)]"
              >
                <Link href={item.href}>
                  <item.icon className="size-[17px]" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
              {item.href === "/workbench" && waiting > 0 ? (
                <SidebarMenuBadge className="tnum rounded-full bg-ochre-soft px-2 text-[11px] font-medium text-ochre peer-data-[active=true]/menu-button:bg-paper/15 peer-data-[active=true]/menu-button:text-paper">
                  {waiting}
                </SidebarMenuBadge>
              ) : null}
            </SidebarMenuItem>
          ))}
        </SidebarMenu>

        <div className="my-3 h-px bg-sidebar-border group-data-[collapsible=icon]:mx-2" />

        <SidebarMenu className="gap-0.5">
          {reference.map((item) => (
            <SidebarMenuItem key={item.href}>
              <SidebarMenuButton
                asChild
                isActive={active(item.href)}
                tooltip={item.label}
                className="h-9 rounded-xl text-muted-foreground data-[active=true]:bg-sidebar-accent data-[active=true]:text-navy-deep data-[active=true]:font-medium"
              >
                <Link href={item.href}>
                  <item.icon className="size-[17px]" />
                  <span>{item.label}</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarContent>

      <SidebarRail />
    </Sidebar>
  );
}
