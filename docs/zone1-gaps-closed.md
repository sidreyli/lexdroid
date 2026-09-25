# The Zone 1 gaps, diagnosed and closed

Four portals in scope were registering nothing or almost nothing, and a sixth of Malaysia's PDF
text was never reaching search. None of it needs a GPU, and all of it changes what a run can find,
so it was worth doing before the run rather than after it.

Every number below is measured against the live site or the cached corpus. Where a suspicion did
not survive measurement it is recorded here too, because the ones that failed are what makes the
ones that held worth believing.

## The portals

| Portal | was | now | cause |
| :-- | --: | --: | :-- |
| Bank Negara Malaysia | 1 | **97** | read by sitemap; the sitemap is 62 navigation pages |
| Royal Malaysian Customs | 0 | **21** | root redirects to a Malay shell, and an incomplete TLS chain |
| Australian Border Force | 0 | 0 | SharePoint shell; no crawlable navigation exists |
| Intellectual Property Corporation of Malaysia | 0 | 0 | answers 403 to any automated client |
| Singapore Government e-Gazette | 0 | 0 | deliberate: SSO carries the in-force text |

`robots_allows` is false for several of these and it is a red herring: the column records only
that a host published at least one disallow rule, and it gates nothing. Bank Negara disallows
`/view.php?*`, the Border Force `/sitesearch?`, and Customs its admin directories. All three allow
everything that matters.

### Bank Negara was reading the wrong door

The bank declares a sitemap in its robots.txt and it is real, but it is a hand-kept list of 62
pages: the board, the governors, the exchange rates. One of them names an instrument. Its policy
documents live under `/standardsandguidelines`, which the sitemap does not enumerate and
robots.txt expressly allows.

Crawled instead, the same site yields 97 instruments, among them the **Policy Document on
Electronic Money (E-Money)** -- the document cited for cells 12.4.4, 12.4.5 and 12.9, and the first
of the fourteen recorded as genuinely absent in `malaysia-corpus-readiness.md`.

Registering it was only half of it. What the corpus first held for that instrument was the
announcement page Bank Negara posted, not the policy it announces -- the difference between an
instrument being in the register and its rule being readable. Both are true now; see *The portal
registers the announcement, not the policy document* below for how, and for why the obvious way
of doing it would have damaged Australia.

This was not generalised into "crawl beats sitemap". Every portal in scope read by sitemap was
measured both ways first, and Bank Negara is the only one where crawling wins:

| portal | sitemap | crawl |
| :-- | --: | --: |
| Monetary Authority of Singapore | 376 | 56 |
| Australian Prudential Regulation Authority | 47 | 22 |
| Infocomm Media Development Authority | 42 | 8 |
| Personal Data Protection Commission | 34 | 0 |
| Australian Signals Directorate | 30 | 2 |
| IP Australia | 23 | 1 |
| Cyber Security Agency of Singapore | 6 | 1 |
| Malaysian Investment Development Authority | 5 | 3 |
| Foreign Investment Review Board | 1 | 0 |
| **Bank Negara Malaysia** | **1** | **97** |

So one portal changed, on its own evidence.

### Customs failed twice, for two unrelated reasons

`www.customs.gov.my` presents its leaf certificate and nothing above it, so every request failed
with "unable to verify the first certificate". The certificate is valid -- GlobalSign issued it and
the root it hangs from is in Node's store. The server simply does not send the intermediate.

The fetcher now recovers the way a browser does: on that specific failure it reads the certificate
the host presents, fetches the issuer named in the certificate's own CA Issuers URI, and retries.
Verification is not weakened, and the distinction is worth being explicit about:

- the intermediate is used only after checking that a certificate **already in Node's root store**
  both issued it and signed it, and that the leaf actually names it;
- it is supplied alongside the full root store, never in place of it;
- `rejectUnauthorized` is false only on the throwaway handshake that reads the server's
  certificate -- no document is read over that socket.

With the chain repaired the site still yielded nothing, for a second and unrelated reason: its
root redirects to a Malay shell whose only on-host links are the two language switchers, so the
walk ended after one page. The English index at `/en/home` carries 167 links. The crawl adapter
now accepts `seeds` in a portal's `adapterConfig`, and seeded there it finds 21 instruments -- the
Customs Duties Orders, the Prohibition of Imports and Exports Orders, and the anti-dumping and
countervailing duty orders, which are pillars 1, 2 and 12.

### Border Force and MyIPO are not fixable from here

The Border Force homepage is a SharePoint shell: 37 links, 22 off-host, and every on-host link is
either `/` or `/_layouts/15/FIXUPREDIRECT.ASPX`. There is no index to seed a crawl at. MyIPO
answers 403 to robots.txt itself. Both stay recorded as holes rather than quietly left at zero,
and in both cases the statutes are on the register that does answer -- the Federal Register of
Legislation and the Laws of Malaysia respectively.

## A robots.txt group could be captured by the empty string

Not a yield problem, and found while checking whether robots was what blocked these portals. It
was not -- but the group-matching test was inverted.

The intent is that a group naming our own product token governs us in preference to the wildcard
group. The test asked `ROBOTS_TOKEN.includes(agent)`: whether the string `"lexdroid"` contains the
site's word. That is true for any substring of it, and true for the empty string a bare
`User-agent:` line produces. A site writing such a line anywhere above its real rules had its
wildcard group discarded in favour of an empty one -- so `Disallow: /`, everyone keep out, read as
no rules at all.

No portal in scope is affected; all were re-checked after the fix and none changed. It is fixed
anyway, because the failure mode is crawling a site that asked us not to.

## A sixth of Malaysia's PDF text was never reaching search

Thirty-five Malaysian documents parsed to headings and almost nothing else. The suspicion was
scanned PDFs and a missing OCR fallback. That was wrong twice over, and both wrong turns are worth
recording.

Malaysia's Data Protection Officer Competency Guideline is the worst of them: 18 pages, and the
stored document held 13 sections totalling 1,414 characters.

- It is **not** scanned. The text layer is intact and carries 15,820 characters, 577 to 1,589 a
  page.
- OCR was **not** missing. It already runs per page below a threshold, it fired on the two pages
  that were genuinely empty, and asked directly it returns 855–1,203 characters a page at 91–93%
  confidence in about a second a page. The threshold was briefly raised on that evidence and then
  put back, because the evidence for raising it evaporated once the real cause was found, and
  widening it would have bought corpus-wide OCR cost for nothing.
- Re-parsing with today's code changed nothing, so it was not a stale parse either.

The loss is in `sectionise`, and it is 91%: 15,783 characters in, 1,414 out. Lines matching no
provision are filed onto whichever numbered entry is open. When that entry is later dropped -- as
the arrangement's copy of a provision that appears again with a body -- everything filed under it
went with it. In this document the numbered entries are the **committee of contributors** printed
on page two, so "5. Generali Life Insurance" opened an entry and the whole guideline accumulated
underneath it before being discarded. The thirteen sections that survived were the contributors'
names.

The entry's own line is the duplicate. What follows it is the document, and it is now kept -- as a
section rather than as prose, because prose reaches no search at all, which is the same reason a
Schedule already opens a section of its own. It carries no label, since the label belonged to the
dropped entry whose real copy is elsewhere, so the text is findable by its words and citable by
offset without claiming to be a provision it is not.

On that document, 13 sections and 1,414 characters become **38 sections and 11,517**.

Across a random 120-document sample of the cached corpus, re-parsed and compared against what is
stored:

| | cached PDFs sampled | gain materially | section text before | after |
| :-- | --: | --: | --: | --: |
| Malaysia | 119 | 14 | 4,314,956 | **5,018,826 (+16.3%)** |
| Australia | 1 | 1 | 27,483 | 103,489 |

Australia and Singapore barely appear because their corpora are not PDF -- Australia arrives as
EPUB from the Federal Register and Singapore as HTML from SSO -- which is why this surfaced as a
Malaysian problem. The largest single gains are customs tariff instruments: one
*Customs Duties (Goods under the Framework Agreement)* order goes from 5,986 characters to 57,002,
another from 93,293 to 274,625, and the *Pesticides Act 1974* from 185,343 to 233,917.

One exception is deliberate. The arrangement's closing SCHEDULE collects the cover pages printed
after it, and those reappear under the real Schedule further down; nothing is kept from that one,
and `parse-schedule-boundary` holds the line.

## The portal registers the announcement, not the policy document

Found while checking that Bank Negara's 97 were worth what they looked like. They are not all
worth it, and the headline claim in the first draft of this document was half wrong.

Bank Negara publishes a policy document by posting an announcement page that links the PDF. The
crawl registers the announcement, and the announcement parses successfully -- it has an embargo
notice and a paragraph of prose, so nothing marks it as a page of menus. The **Policy Document on
Electronic Money (E-Money)**, cited for 12.4.4, 12.4.5 and 12.9, was in the corpus as 2,044
characters of press release. The policy itself is at
`/documents/20124/943361/27012025_Revised_E-Money_PD_v2.pdf` and had never been fetched.

There was already a resolver for this -- `soleDocumentLink` in `src/parse/html.ts` -- and it cannot
fire here for two separate reasons: it runs only when the page parsed as `landing-page` or `empty`,
and it requires the page to link exactly one file. Bank Negara's links five: the policy, its FAQs, a
financial-stability paper and two P.U.(A)s.

The question that does separate them is which linked file *names the same instrument as the page*.

### The identity check said yes to everything

Asking it exposed a defect in the check itself. `namesMatch` answers whether two names contradict
each other, and a name carrying no identifying words cannot contradict anything, so it returns
true. A link reading "P.U.(A) 123/2025" reduces to nothing -- no word survives the stop-list and
the bare numbers are dropped -- and therefore matched every title put to it. A page linking two
P.U.(A)s looked like a page naming its instrument three times, and was skipped as ambiguous.

That is correct for the question `namesMatch` was written for and wrong for this one, so the
question is now asked separately. `namesTheSame` requires both names to carry identifying words
before it compares them. Nothing else changed; `identityMismatch` still uses `namesMatch`.

### The rule needs a guard, and the guard is measured

A page that is the instrument links its own PDF under its own name, exactly as an announcement
links the document it announces. The name cannot tell them apart. What tells them apart is how much
the file says, and the separation is not close:

| | pages naming one file | adopted | kept |
| :-- | --: | --: | --: |
| Australia | 25 | 4 | **21** |
| Singapore | 54 | 45 | 9 |
| Malaysia | 38 | 36 | 2 |

On Australia, every page that publishes itself as a PDF came back between **0.02 and 1.63** times
its own length -- the ASD's cyber security guidelines at 1.02 to 1.22, a 210,437-character APRA
guide for directors at 0.89, the Freedom of Information scope page at 0.87. Every announcement came
back between **13.97 and 582**. Nothing landed in between, in any of the three economies.

So `materialise` adopts the linked file only when it says at least three times more than the page
does. Three, because a page publishing itself cannot be under a third of its own length and an
announcement always is; the constant sits in the middle of an empty gap rather than on the edge of
a cluster. It is the same shape as the acceptance test OCR already uses, which takes a recovered
page only when it beats the original.

Without that guard the rule would have overwritten the APRA guide, three ASD guidelines and a
threat abatement plan with whatever PDF each page links. That is the version this document recorded
as unsafe rather than applying, and the measurement is why it is now applied.

### Applied to Malaysia, and what it actually did

The file is stored **beside** the announcement, not in place of it. The announcement is real -- it
carries the effective date and the policy documents superseded -- so the instrument ends up holding
both, and the rule is now findable where before only the notice was.

Thirty-six of Malaysia's 38 now carry their document: **2,057,091 characters** of policy text that
the corpus did not have. The Policy Document on Electronic Money is 2,044 characters of press
release plus **128,106** characters of policy. Product Transparency and Disclosure went from 1,183
to **215,746**. Malaysia is now 1,791 documents and 123,386 sections, all embedded.

Two of the 36 failed on the first pass, for the same reason, and it is worth recording because the
fault was ours and not the site's. Bank Negara serves from `www.bnm.gov.my`, and two of its
pages link their own policy at `bnm.gov.my`, which answers HTTP 202 to everything. The fetcher
treated it as a host throttling us and spent the full 30s, 90s and 240s backoff on each before
giving up -- twelve minutes to fail twice. A link to the same site under its other name is a link
to the same site, so the resolver now asks the host that served the page. Both came back.

The two of the 38 still unresolved are a second copy of the E-Money page, whose policy the first
copy already holds, and one MIDA page whose linked file turned out to be an FAQ -- caught
downstream by the check that refuses a document published *about* an instrument, which is the
layered part working.

### Applied to Australia and Singapore as well

The same defect is in the other two corpora and is larger in one of them: the Monetary Authority
publishes nearly all of its guidelines this way. Seventy-nine instruments were re-read -- a scoped
refresh of exactly the pages that name a file, not a second pass over 2,442 of them.

Australia gained four documents and **205,094 characters**, and the other twenty-one pages were
kept unchanged. That is the guard earning its place: the ASD guidelines, the 210,437-character APRA
guide for directors and the threat abatement plan all still hold their own text. Three of the four
were taken by the new rule. The fourth, APRA's review of the 2013 superannuation prudential
framework, was taken by `soleDocumentLink` instead, because its page parses to no text at all and
so trips the older branch before the new one is reached -- the two rules cover different pages, and
between them they cover this one.

Singapore gained **1,783,787 characters** across 39 instruments. Forty-five pages offered their
file; six of those were then refused on the way in, and the refusals are the layered part working
rather than a loss. Every one is a consultation paper or a set of FAQs published *about* an
instrument, and five of the six were caught not by their page title but by the opening words of the
PDF itself -- "CONSULTATION PAPER P012 - 2006", filed under the page name "Consultation on Proposed
MAS Notice 639". That is the exact case `publishedAbout` was written for. The largest single gain is
not a guideline at all: the Strategic Goods (Control) Act page at Singapore Customs was 1,068
characters and is now **622,876**.

Nothing shrank in either economy, and nothing that had been cited was lost -- the number of
answer-basis rows pointing at a section that no longer exists is zero, both before this work and
after it. All three corpora are fully embedded again: Australia 77,403 sections, Malaysia 123,386,
Singapore 34,824, every one of them in the index.

## The framework gate is right, and the reason written beside it was not

The 118 instruments the two repaired portals registered all carry `status = 'unknown'`, because
standing is read from the register's own words and Bank Negara publishes none -- its heading is the
Liferay portlet name "Asset Publisher" and its table carries only dates. `frameworkCandidates` in
`src/cell/index.ts` admits only `in-force`, so none of them can be named as the framework for 7.1,
7.2, 8.1, 8.2 or 12.9. The question was whether that gate is costing a cell.

The justification written next to the gate said "'in-force' is the only status a row may cite".
That is not what the store does. `currentLaw` in `src/decide/index.ts` excludes repealed, draft and
amending evidence and deliberately keeps unknown -- "it means the register did not tell us, not
that it told us no" -- and ordinary retrieval filters on no status at all. So the gate is stricter
than citation is, and the sentence defending it was quoting a rule that says the opposite.

It has a better reason, and it is in the band text. All five ask for a **legal** framework: 7.1
"comprehensive data protection framework", 7.2 "dedicated cybersecurity legal framework", 8.1 and
8.2 "framework in place that limits liability", 12.9 "consumer protection law applicable to online
commerce". A status is what a legislative register records. A regulator's website publishes no
legislation and therefore carries none, so gating on status is gating on provenance -- which is
what the question is about.

That argument would be worth nothing if it cost a statute, so it was measured twice.

**Is any law reachable only at unknown?** Of the instruments that are read, named like an Act and
left at unknown -- 38 Malaysian, 36 Singaporean, 20 Australian -- most turn out to be the same Act
the legislative register already holds in force, filed a second time under a regulator's page
title. The 76 that are not are almost all documents *about* an Act: guidelines on applying one, FAQs, charge
and penalty announcements, consultation papers, commencement-date notices, a code of practice, and
two sections of the Customs Act filed as though each were an instrument.

Two are genuinely Acts -- Malaysia's Money Services Business (Amendment) Act 2024 and Singapore's
Securities and Futures (Amendment) Act 2017 saving provisions -- and both are amending instruments,
which `currentLaw` excludes from citation whatever their status, because an amending act is spent
once its words have taken effect and the law it made lives in the principal act. So the gate costs
nothing that could have been cited: no principal statute is reachable only at unknown.

**What would widening it admit?** The five candidates each framework indicator would examine, with
the gate and without it, over all fifteen economy-indicator pairs:

| | list unchanged | list changed | leading instrument changed |
| :-- | --: | --: | --: |
| Australia | 7.1 | 7.2, 8.1, 8.2, 12.9 | **none** |
| Singapore | 7.1, 8.1, 8.2 | 7.2, 12.9 | **none** |
| Malaysia | 7.2, 12.9 | 7.1, 8.1, 8.2 | **none** |

That last column is the finding. Widening changes the tail of the list and never the head: in all
fifteen pairs the instrument ranked first is the same one, and it is a statute. What widening does
is displace the fourth or fifth statute with a document *about* a statute -- two CCCS guidelines
into Singapore's 12.9 in place of the Sale of Goods Act and the Gas Act, a report on a public
inquiry into Malaysia's 8.1 and 8.2, an OAIC explainer into Australia's 12.9 in place of the Trade
Marks Act, and a web page titled "Cybersecurity Act | Cyber Security Agency of Singapore" into 7.2
beside the Cybersecurity Act 2018 itself. It never adds a statute that was not already there.

The table was measured a second time after Australia and Singapore gained the two million
characters described above, because what a corpus ranks is only worth what the corpus was when the
ranking was taken. Every cell of it held: no pair changed column, and no leading instrument
changed. Members of the tails did move, as they should have. Singapore's 12.9 had been displaced by
the CCCS market study that *announced* the price transparency guidelines, and is now displaced by
the guidelines themselves -- the wrapper fix showing up in a ranking, and an improvement even
though the verdict it feeds is unchanged.

Malaysia's 12.9, the cell that prompted the question, is identical either way: the Consumer
Protection Act 1999 leads and the Consumer Protection (Electronic Trade Transactions) Regulations
2012 follow it, both in force. Nothing Bank Negara registered was being kept out of an answer it
could have given.

Two of the changes are arguably improvements -- Australia's 7.2 would gain two ASD cyber-security
guidelines, Malaysia's 7.1 two data protection codes of practice -- and they are still refused,
because the band text asks which *law* establishes the framework and a code of practice is not one.
That is a judgement about the question, not about the documents.

So the gate stays. Its real cost is that a regulator's policy document can never be named as a
framework, which is correct for these five and would be wrong for any indicator asking what an
economy does rather than what its law says.

One thing the measurement turned up that is worth recording separately: of Bank Negara's 97, ten
are the bank's own navigation pages -- `/regulations`, `/prudential-regulation`, `/sandbox`,
`/legislation` -- and seventeen are enforcement penalty notices. They are gated out of framework
candidacy, but ordinary retrieval has no status filter and will see them. They are 27 rows against
Malaysia's 16,980 and are left alone rather than fixed in front of a run.

## What this does not do

Nothing here is verified against a cell. These are corpus fixes: they change what a run can find,
not what the reader makes of it. Bank Negara's 97 and Customs' 21 are now discovered, fetched,
parsed and embedded; the sectioniser change has reached the corpus on a re-parse; and all three
economies now hold the policy documents their regulators' pages were only announcing -- but no run
has read any of it. The numbers above measure the portals, the parser and the store. None of them
measures agreement, and the next thing that can move agreement either way is the run, not another
fix.

One number deserves suspicion rather than celebration. Customs' 21 instruments carry 5.4M
characters, most of it Harmonised System tariff schedules whose code rows section cleanly and count
as provisions. The last time Malaysia's section count jumped this way the retrieval budget filled
with schedule rows and agreement fell. What to check after the run is characters read per cell, not
sections held.

## Tests

| what | where |
| :-- | :-- |
| the robots group our token names, and the ones it does not | `test/robots-group-token.test.ts` |
| a crawl seeded past a front page that is not a way in | `test/crawl-seeds.test.ts` |
| what may be accepted as a server's missing intermediate | `test/tls-incomplete-chain.test.ts` |
| the text kept from under a dropped duplicate entry | `test/parse-dropped-entry-body.test.ts` |
| a page that announces a document, and a page that is one | `test/announcement-wrapper.test.ts` |
