"use client";

import { useState } from "react";
import { ListFilter, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { PageSidebarTrigger } from "@/components/shell/page-sidebar-trigger";
import type { QueueItem } from "@/lib/data/types";
import { QueueRail } from "./queue-rail";
import { useReview } from "./review-store";

export function WorkbenchFrame({
  items,
  children,
}: {
  items: QueueItem[];
  children: React.ReactNode;
}) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <div className="flex h-svh flex-col overflow-hidden">
      <header className="flex shrink-0 items-center gap-3 border-b border-edge px-4 py-3 sm:px-5">
        <PageSidebarTrigger />

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 shrink-0 rounded-lg px-2 text-[12.5px] text-muted-foreground lg:hidden"
            >
              <ListFilter className="size-4" />
              Queue
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[19rem] bg-paper p-0">
            <SheetTitle className="px-4 pt-4 text-[15px] font-semibold text-navy-deep">
              Findings
            </SheetTitle>
            <div className="min-h-0 flex-1">
              <QueueRail items={items} onPick={() => setSheetOpen(false)} />
            </div>
          </SheetContent>
        </Sheet>

        <div className="min-w-0">
          <h1 className="text-[16px] leading-tight font-semibold tracking-tight text-navy-deep">
            Workbench
          </h1>
          <p className="hidden truncate text-[12.5px] leading-tight text-muted-foreground sm:block">
            Every finding cites a provision. Check that the provision says it.
          </p>
        </div>

        <div className="ml-auto shrink-0">
          <ReviewerChip />
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-[17rem] shrink-0 border-r border-edge lg:block">
          <QueueRail items={items} />
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

function ReviewerChip() {
  const { reviewer, setReviewer } = useReview();
  const [draft, setDraft] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setDraft(reviewer === "Unsigned" ? "" : reviewer);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1.5 rounded-full bg-inset px-3 text-[12.5px] font-medium text-navy-deep hover:bg-edge"
        >
          <UserRound className="size-3.5 text-muted-foreground" />
          {reviewer}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 rounded-2xl p-4">
        <Label htmlFor="reviewer" className="text-[12.5px] font-medium text-navy-deep">
          Who is reviewing
        </Label>
        <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
          Recorded against every verdict you give, alongside what you attest to.
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setReviewer(draft);
            setOpen(false);
          }}
        >
          <Input
            id="reviewer"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Your name"
            className="h-9 rounded-xl bg-inset text-[13px]"
          />
          <Button type="submit" size="sm" className="h-9 rounded-xl px-3 text-[12.5px]">
            Save
          </Button>
        </form>
      </PopoverContent>
    </Popover>
  );
}
