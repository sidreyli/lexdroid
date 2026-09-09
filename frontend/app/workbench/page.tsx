import { redirect } from "next/navigation";
import { getQueueItems } from "@/lib/data";

export default function WorkbenchIndex() {
  const first = getQueueItems()[0];
  if (first) redirect(`/workbench/${first.id}`);
  return (
    <div className="grid h-full place-items-center p-8">
      <p className="text-[13.5px] text-muted-foreground">
        No findings yet. Start a run from the overview.
      </p>
    </div>
  );
}
