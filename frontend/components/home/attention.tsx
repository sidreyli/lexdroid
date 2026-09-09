import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AttentionItem {
  count: number;
  label: string;
  detail: string;
  href: string;
  warm: boolean;
}

export function Attention({ items }: { items: AttentionItem[] }) {
  return (
    <section className="bg-card lift rounded-3xl p-6 sm:p-7">
      <h2 className="text-[17px] font-semibold tracking-tight text-navy-deep">
        Waiting on a reviewer
      </h2>

      <ul className="mt-5 flex flex-col">
        {items.map((item, i) => (
          <li key={item.label}>
            <Link
              href={item.href}
              className="group -mx-2 flex items-center gap-4 rounded-xl px-2 py-3 transition-colors hover:bg-inset"
            >
              <span
                className={cn(
                  "tnum grid h-11 min-w-11 shrink-0 place-items-center rounded-xl px-2 text-[17px] font-semibold",
                  item.count === 0
                    ? "bg-inset text-muted-foreground"
                    : item.warm
                      ? "bg-ochre-soft text-ochre"
                      : "bg-navy/8 text-navy",
                )}
              >
                {item.count}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[13.5px] leading-tight font-medium text-navy-deep">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[12.5px] leading-snug text-muted-foreground">
                  {item.detail}
                </span>
              </span>
              <ArrowUpRight className="size-4 shrink-0 text-edge transition-colors group-hover:text-navy" />
            </Link>
            {i < items.length - 1 ? <div className="h-px bg-edge/70" /> : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
