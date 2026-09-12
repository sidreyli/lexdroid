import Link from "next/link";
import { ExternalLink, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RegisterFilters, RegisterPage } from "@/lib/data/corpus";

const READ_STATES = [
  { value: "read", label: "Read" },
  { value: "unread", label: "Fetched but unreadable" },
  { value: "unfetched", label: "Never fetched" },
] as const;

/** A link that adds one narrowing to whatever is already applied, or takes it away again. */
function href(current: RegisterFilters, patch: Partial<RegisterFilters>): string {
  const merged = { ...current, ...patch };
  const params = new URLSearchParams();
  if (merged.economy) params.set("economy", merged.economy);
  if (merged.kind) params.set("kind", merged.kind);
  if (merged.status) params.set("status", merged.status);
  if (merged.read) params.set("read", merged.read);
  if (merged.q) params.set("q", merged.q);
  if (merged.page && merged.page > 1) params.set("page", String(merged.page));
  const query = params.toString();
  return query ? `/corpus?${query}#register` : "/corpus#register";
}

function Chip({
  active,
  to,
  children,
}: {
  active: boolean;
  to: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={to}
      aria-pressed={active}
      className={cn(
        "rounded-full px-3 py-1.5 text-[12.5px] font-medium transition-colors",
        "focus-visible:ring-2 focus-visible:ring-navy/40 focus-visible:outline-none",
        active
          ? "bg-navy text-paper"
          : "bg-inset text-muted-foreground hover:bg-edge hover:text-navy-deep",
      )}
    >
      {children}
    </Link>
  );
}

function state(row: RegisterPage["rows"][number]): { label: string; tone: string } {
  if (row.sections > 0)
    return { label: `${row.sections.toLocaleString("en-GB")} sections`, tone: "text-navy-deep" };
  if (row.documents > 0)
    return { label: row.unreadReason ?? "unreadable", tone: "text-ochre" };
  return { label: "not fetched", tone: "text-muted-foreground" };
}

export function Register({
  filters,
  result,
  facets,
  economies,
}: {
  filters: RegisterFilters;
  result: RegisterPage;
  facets: { kinds: string[]; statuses: string[] };
  economies: { code: string; name: string }[];
}) {
  const applied = [filters.economy, filters.kind, filters.status, filters.read, filters.q].filter(
    Boolean,
  ).length;

  return (
    <section id="register" className="bg-card lift scroll-mt-6 rounded-3xl p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div>
          <h2 className="text-[18px] leading-tight font-semibold tracking-tight text-navy-deep">
            The register
          </h2>
          <p className="mt-2 max-w-[72ch] text-[13.5px] leading-relaxed text-muted-foreground">
            Every instrument this system knows of, whether or not it has been read. An entry here is
            a claim that the instrument exists and where it lives, and nothing more than that.
          </p>
        </div>
        <p className="tnum text-[13px] text-muted-foreground">
          {result.total.toLocaleString("en-GB")} matching
        </p>
      </div>

      <form action="/corpus" method="get" className="mt-5 flex flex-wrap items-center gap-2">
        {filters.economy ? <input type="hidden" name="economy" value={filters.economy} /> : null}
        {filters.kind ? <input type="hidden" name="kind" value={filters.kind} /> : null}
        {filters.status ? <input type="hidden" name="status" value={filters.status} /> : null}
        {filters.read ? <input type="hidden" name="read" value={filters.read} /> : null}
        <label className="flex h-10 min-w-[16rem] flex-1 items-center gap-2.5 rounded-xl bg-inset px-3.5">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="sr-only">Search titles and official numbers</span>
          <input
            type="search"
            name="q"
            defaultValue={filters.q ?? ""}
            placeholder="Search a title or an official number"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] text-navy-deep placeholder:text-muted-foreground focus:outline-none"
          />
        </label>
        <button
          type="submit"
          className="h-10 rounded-xl bg-navy px-4 text-[13.5px] font-medium text-paper hover:bg-navy-deep"
        >
          Search
        </button>
        {applied > 0 ? (
          <Link
            href="/corpus#register"
            className="h-10 rounded-xl px-3 text-[13px] leading-10 text-muted-foreground underline-offset-4 hover:underline"
          >
            Clear
          </Link>
        ) : null}
      </form>

      <div className="mt-3 flex flex-col gap-2">
        <div className="flex flex-wrap gap-1.5">
          {economies.map((e) => (
            <Chip
              key={e.code}
              active={filters.economy === e.code}
              to={href(filters, {
                economy: filters.economy === e.code ? undefined : e.code,
                page: 1,
              })}
            >
              {e.name}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {facets.kinds.map((kind) => (
            <Chip
              key={kind}
              active={filters.kind === kind}
              to={href(filters, { kind: filters.kind === kind ? undefined : kind, page: 1 })}
            >
              {kind}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {READ_STATES.map((s) => (
            <Chip
              key={s.value}
              active={filters.read === s.value}
              to={href(filters, { read: filters.read === s.value ? undefined : s.value, page: 1 })}
            >
              {s.label}
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {facets.statuses.map((status) => (
            <Chip
              key={status}
              active={filters.status === status}
              to={href(filters, {
                status: filters.status === status ? undefined : status,
                page: 1,
              })}
            >
              {status}
            </Chip>
          ))}
        </div>
      </div>

      {result.rows.length === 0 ? (
        <p className="mt-8 max-w-[60ch] text-[13.5px] leading-relaxed text-muted-foreground">
          Nothing in the register matches that. Widen it by clearing a filter, or search a different
          title.
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[46rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-edge">
                {["Instrument", "Kind", "Status", "Last amended", "What was read"].map((h) => (
                  <th
                    key={h}
                    scope="col"
                    className="pb-2 text-[12px] font-medium text-muted-foreground"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => {
                const read = state(row);
                return (
                  <tr key={row.id} className="border-b border-edge/70 align-baseline">
                    <td className="max-w-[34rem] py-2.5 pr-4">
                      <a
                        href={row.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-baseline gap-1.5 text-[13.5px] text-navy-deep underline-offset-4 hover:underline"
                      >
                        <span className="min-w-0">{row.title}</span>
                        <ExternalLink
                          className="size-3 shrink-0 translate-y-0.5 text-muted-foreground"
                          aria-hidden
                        />
                      </a>
                      <span className="tnum block text-[11.5px] text-muted-foreground">
                        {[row.economy, row.officialNumber].filter(Boolean).join(", ")}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-[12.5px] text-muted-foreground">
                      {row.kind ?? "unclassified"}
                    </td>
                    <td className="py-2.5 pr-4 text-[12.5px] text-muted-foreground">
                      {row.status}
                    </td>
                    <td className="tnum py-2.5 pr-4 text-[12.5px] text-muted-foreground">
                      {row.lastAmendedOn?.slice(0, 10) ?? "not recorded"}
                    </td>
                    <td className={cn("tnum py-2.5 text-[12.5px]", read.tone)}>{read.label}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {result.pages > 1 ? (
        <nav className="mt-5 flex items-center justify-between gap-4" aria-label="Register pages">
          <Link
            href={href(filters, { page: Math.max(1, result.page - 1) })}
            aria-disabled={result.page === 1}
            className={cn(
              "rounded-xl bg-inset px-3.5 py-2 text-[13px] text-navy-deep hover:bg-edge",
              result.page === 1 && "pointer-events-none opacity-40",
            )}
          >
            Previous
          </Link>
          <span className="tnum text-[12.5px] text-muted-foreground">
            Page {result.page} of {result.pages.toLocaleString("en-GB")}
          </span>
          <Link
            href={href(filters, { page: Math.min(result.pages, result.page + 1) })}
            aria-disabled={result.page === result.pages}
            className={cn(
              "rounded-xl bg-inset px-3.5 py-2 text-[13px] text-navy-deep hover:bg-edge",
              result.page === result.pages && "pointer-events-none opacity-40",
            )}
          >
            Next
          </Link>
        </nav>
      ) : null}
    </section>
  );
}
