import { notFound } from "next/navigation";
import { FindingView } from "@/components/workbench/finding-view";
import { getEconomy, getExportRow, getIndicator, getQueueItems } from "@/lib/data";
import { isReadOnlyDeployment } from "@/lib/deployment";

export default async function FindingPage({ params }: PageProps<"/workbench/[id]">) {
  const { id } = await params;
  const row = getExportRow(Number(id));
  if (!row) notFound();

  const queue = getQueueItems();
  const at = queue.findIndex((q) => q.id === row.id);

  return (
    <FindingView
      key={row.id}
      row={row}
      indicator={getIndicator(row.indicatorId)}
      economyName={getEconomy(row.economy)?.name ?? row.economy}
      position={at + 1}
      total={queue.length}
      prevId={at > 0 ? queue[at - 1].id : null}
      nextId={at >= 0 && at < queue.length - 1 ? queue[at + 1].id : null}
      readOnly={isReadOnlyDeployment()}
    />
  );
}
