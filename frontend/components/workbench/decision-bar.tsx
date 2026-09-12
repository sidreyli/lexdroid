"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, PenLine, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { relativeTime } from "@/lib/format";
import { actionLabel, diffEdit, type FindingEdit, type ReviewAction } from "@/lib/review";
import { useReview } from "./review-store";

const verdictTone: Record<ReviewAction, string> = {
  accept: "bg-navy/10 text-navy",
  edit: "bg-ochre-soft text-ochre",
  reject: "bg-brick-soft text-brick",
};

export function DecisionBar({
  rowId,
  baseline,
  draft,
  editing,
  setEditing,
  nextHref,
}: {
  rowId: number;
  baseline: FindingEdit;
  draft: FindingEdit;
  editing: boolean;
  setEditing: (v: boolean) => void;
  nextHref: string | null;
}) {
  const { decisions, reviewer, record, clear } = useReview();
  const router = useRouter();
  const [asking, setAsking] = useState<"edit" | "reject" | null>(null);
  const [attestation, setAttestation] = useState("");
  const [saving, setSaving] = useState(false);

  const decision = decisions[rowId];
  const changed = diffEdit(baseline, draft);
  const changedCount = Object.keys(changed).length;

  const advance = () => {
    if (nextHref) router.push(nextHref);
  };

  const commit = async (action: ReviewAction, text: string) => {
    const fields = action === "edit" ? changed : {};
    setSaving(true);
    try {
      const response = await fetch("/api/review", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ rowId, action, attestation: text, changedFields: fields, reviewer }),
      });
      if (!response.ok) {
        const body = (await response.json()) as { error?: string };
        throw new Error(body.error ?? "The verdict was not saved");
      }
    } catch (err) {
      setSaving(false);
      toast.error("Not saved", { description: (err as Error).message });
      return;
    }

    record({ rowId, action, attestation: text, changedFields: fields, reviewer, actedAt: new Date().toISOString() });
    setSaving(false);
    setEditing(false);
    setAsking(null);
    setAttestation("");
    toast(`${actionLabel[action]}, recorded in the store`, {
      description: nextHref ? "Moving to the next finding." : "That was the last one.",
    });
    router.refresh();
    advance();
  };

  if (decision) {
    return (
      <Bar>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-[12px] font-medium",
            verdictTone[decision.action],
          )}
        >
          {actionLabel[decision.action]}
        </span>
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-muted-foreground">
          {decision.reviewer}, {relativeTime(decision.actedAt, new Date())}
          {decision.attestation ? `, "${decision.attestation}"` : ""}
        </p>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => clear(rowId)}
          className="h-9 shrink-0 rounded-xl px-3 text-[12.5px]"
        >
          <RotateCcw className="size-3.5" />
          Record another
        </Button>
      </Bar>
    );
  }

  if (editing) {
    return (
      <>
        <Bar>
          <p className="min-w-0 flex-1 text-[12.5px] text-muted-foreground">
            {changedCount === 0
              ? "Change the band, the quoted words or the wording, then save."
              : `${changedCount} ${changedCount === 1 ? "field" : "fields"} changed.`}
          </p>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(false)}
            className="h-9 shrink-0 rounded-xl px-3 text-[12.5px]"
          >
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={changedCount === 0}
            onClick={() => setAsking("edit")}
            className="h-9 shrink-0 rounded-xl bg-navy px-4 text-[12.5px] text-paper hover:bg-navy-deep"
          >
            Save correction
          </Button>
        </Bar>
        <AttestDialog
          open={asking === "edit"}
          onOpenChange={(v) => setAsking(v ? "edit" : null)}
          title="Attest to the correction"
          description="Say what you checked in the source. This is stored with your name against the finding."
          placeholder="Read section 35 in the SSO current version and matched the wording."
          value={attestation}
          onValue={setAttestation}
          confirmLabel="Save correction"
          onConfirm={() => void commit("edit", attestation.trim())}
          summary={
            <div className="rounded-xl bg-inset px-4 py-3">
              <p className="text-[12px] font-medium text-navy-deep">What changes</p>
              <ul className="mt-1.5 flex flex-col gap-0.5">
                {summarise(changed).map((line) => (
                  <li key={line} className="text-[12.5px] text-muted-foreground">
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          }
        />
      </>
    );
  }

  return (
    <>
      <Bar note="Every verdict is recorded beside the answer it judges, and the export follows it.">
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setAsking("reject")}
          className="h-9 shrink-0 rounded-xl px-3 text-[12.5px] text-brick hover:bg-brick-soft hover:text-brick"
        >
          <X className="size-3.5" />
          Reject
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setEditing(true)}
          className="h-9 shrink-0 rounded-xl bg-inset px-3 text-[12.5px] font-medium text-navy-deep hover:bg-edge"
        >
          <PenLine className="size-3.5" />
          Correct
        </Button>
        <Button
          size="sm"
          disabled={saving}
          onClick={() => void commit("accept", "")}
          className="h-9 shrink-0 rounded-xl bg-navy px-4 text-[12.5px] font-medium text-paper hover:bg-navy-deep"
        >
          <Check className="size-3.5" />
          Approve
        </Button>
      </Bar>
      <AttestDialog
        open={asking === "reject"}
        onOpenChange={(v) => setAsking(v ? "reject" : null)}
        title="Reject this finding"
        description="Say why the citation does not support the score. The finding stays in the record with your reason attached."
        placeholder="The quoted words describe a permit application, not a storage requirement."
        value={attestation}
        onValue={setAttestation}
        confirmLabel="Reject finding"
        destructive
        onConfirm={() => void commit("reject", attestation.trim())}
      />
    </>
  );
}

/** Offsets and band ordinals move together with the thing they describe, so say it once. */
const fieldGroups: [keys: string[], label: string][] = [
  [["verbatimSnippet", "quoteCharStart", "quoteCharEnd"], "The quoted words and their offsets"],
  [["score", "bandOrdinal", "bandCriterion"], "The score and its band"],
  [["article"], "The provision cited"],
  [["locationReference"], "Where the provision sits"],
  [["mappingRationale"], "Why it maps to the indicator"],
  [["notes"], "The notes"],
];

function summarise(changed: Record<string, unknown>): string[] {
  const keys = Object.keys(changed);
  return fieldGroups
    .filter(([group]) => group.some((k) => keys.includes(k)))
    .map(([, label]) => label);
}

function Bar({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <div className="shrink-0 border-t border-edge bg-card px-5 py-3 sm:px-8">
      {note ? <p className="mb-2 text-[12px] text-muted-foreground">{note}</p> : null}
      <div className="flex items-center justify-end gap-2">{children}</div>
    </div>
  );
}

function AttestDialog({
  open,
  onOpenChange,
  title,
  description,
  placeholder,
  value,
  onValue,
  confirmLabel,
  onConfirm,
  destructive,
  summary,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  placeholder: string;
  value: string;
  onValue: (v: string) => void;
  confirmLabel: string;
  onConfirm: () => void;
  destructive?: boolean;
  summary?: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[17px] tracking-tight text-navy-deep">{title}</DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed">
            {description}
          </DialogDescription>
        </DialogHeader>
        {summary}
        <div className="flex flex-col gap-2">
          <Label htmlFor="attestation" className="text-[12.5px] font-medium text-navy-deep">
            What you checked
          </Label>
          <Textarea
            id="attestation"
            value={value}
            onChange={(e) => onValue(e.target.value)}
            placeholder={placeholder}
            rows={3}
            className="rounded-xl bg-inset text-[13px] leading-relaxed"
          />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="h-9 rounded-xl px-3 text-[12.5px]"
          >
            Cancel
          </Button>
          <Button
            disabled={value.trim().length < 8}
            onClick={onConfirm}
            className={cn(
              "h-9 rounded-xl px-4 text-[12.5px] font-medium text-paper",
              destructive ? "bg-brick hover:bg-brick/90" : "bg-navy hover:bg-navy-deep",
            )}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
