import { getQueueItems } from "@/lib/data";
import { WorkbenchFrame } from "@/components/workbench/frame";

export default function WorkbenchLayout({ children }: LayoutProps<"/workbench">) {
  return (
    <WorkbenchFrame items={getQueueItems()}>{children}</WorkbenchFrame>
  );
}
