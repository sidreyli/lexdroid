# The last three sources, and the two rules that were keeping them out

Asked on 22 September 2026, after the reach sweep: close the three open defects and collect the
three documents the sweep found genuinely missing. Everything below is measured against the live
store and the live sites.

The short answer is that all six are closed, that two of the three "missing documents" were kept
out by rules rather than by the sites, and that the third turned out to be a finding about ESCAP's
own citation rather than a gap in ours.

## What was asked for

Three defects from the sweep:

- gazette notices deciding individual cases taking an eighth of Malaysia's reading window;
- Singapore having no domain-registry source at all, where Australia and Malaysia both declare one;
- twelve export rows citing a document published *about* the law as the law.

And three documents ESCAP cites that the register did not hold: MYNIC's registration policies
(12.7), the Treasury Directive 1966 (2.3) and the prepaid end-user registration guidelines (8.3).

## The two rules that were keeping the sources out

Both were found by walking the sites rather than by reading the answer key, and both are about
the collector rather than about any of the three documents.

### A page budget shared between shelves makes a new shelf cost the old one

The crawl has a budget of sixty pages per portal, and a portal may declare several starting points
-- "a seed is a starting point, not a filter". The budget was the walk's, shared by all of them.

The Commission keeps its instruments on two shelves: `/en/legal/*`, where the Acts and regulations
are, and `/en/resources/guidelines/guidelines`, a library six pages deep where the guidelines are.
The three legal seeds spent all sixty pages between them. Seeding the library as a fourth reached
page one of its six and stopped, for six more instruments.

> A walk given more than one starting point gets the budget at each one, so adding a starting
> point cannot starve the ones already there.

`seen` is still shared, so a page two starting points both reach is fetched once. Measured against
the live site, the Commission's yield goes from **113 instruments to 160**, all six pages of the
guidelines library walked. Among what arrives: the access-pricing implementation guideline (cited
for 5.1), the guideline on dominant position and the one on substantial lessening of competition
(5.4, 9.4), the access-undertaking guidelines, the network-security guidelines, and the prepaid
end-user registration guidelines -- **the third of the three missing documents**, at 11 sections,
now 10th of the 61 provisions retrieved for 8.3.

Tested in `test/crawl-budget.test.ts` against a site with two paginated shelves.

### A shared list of nouns cannot carry the word a registry calls its rules by

`instrumentTitle` admits a link whose text names an instrument, and the nouns it knows are shared
by every source. "Policy" is deliberately not among them: it was taken out because it cost three
real citations to gain "monetary policy", "skills framework" and "platform list".

But a domain registry's binding rules *are* called policies. MYNIC publishes a Registrant Policy, a
Registrar Policy, a Registry Policy and an Acceptable Use Policy; SGNIC publishes an Acceptable Use
Policy, Rules of Registration and a Registration Agreement. A treasury's rules are called
Instructions. No word tells any of those from the privacy policy on the same site, because in the
word there is no difference.

What tells them apart is what the source says -- the same thing that tells a statute from a page
about a statute.

> A source may state the nouns it names its own instruments with, and the statement reaches no
> other source.

Declared per portal in the profile, checkable by opening the site, and scoped: the registry's
"policy" does not make the telecommunications regulator's privacy policy an instrument. Two small
guards go with it. The housekeeping filter now names "privacy policy" and "cookie policy", which no
site enacts and every site publishes, so a source that declares the noun does not thereby register
its own. And a declared noun must be a word: a profile typo is not a pattern the whole register
gets filtered by.

Tested in `test/instrument-titles.test.ts`, including the cost -- a source that says its
instruments are policies will register any policy on its own site, which is one site, chosen and
written down, rather than every site in the register.

## What the three sources yield

| | before | after |
| :-- | --: | --: |
| MYNIC (.my registry) | 2 instruments, 155 sections | **18 instruments, 497 sections** |
| SGNIC (.sg registry) | no source declared | **15 instruments, 282 sections** |
| Ministry of Finance (MY) | no source declared | 4 instruments |
| MCMC | 113 instruments | **160 instruments** |

MYNIC's walk is seeded at `/resources`, which is where its thirteen policies are linked from; its
front page links only the dispute-resolution rules. SGNIC's is seeded at its policies-and-
agreements page, where Rules of Registration, the Acceptable Use Policy, the Registration
Agreement, the Registrar Accreditation Agreement, the Code of Practice and the WHOIS policy are all
PDFs on one page.

**Both registry cells now rest on the registry.** Retrieval run against the live corpus:

- **MYS 12.7**: 38 of 56 provisions retrieved come from MYNIC's policies, at ranks 1, 2 and 3.
- **SGP 12.7**: 20 of 47 come from SGNIC, at ranks 1, 2, 3 and 6. Before this there was no
  Singaporean registry source to retrieve from at all.

## The Treasury Directive is a finding, not a gap

The Ministry of Finance is now a declared source, seeded at its Treasury Instructions page --
Malaysia has no procurement Act in ESCAP's account of it, and what limits bidding is the Arahan
Perbendaharaan, first issued in 1966 and revised in 1970, 1997, 2008 and 2023.

Except that it does have one now. **Government Procurement Act 2026, Act 882, in force, current to
26 May 2026, 105 sections**, with a Part on the administration of government procurement, a Part on
compliance monitoring and a Government Procurement Appeal Tribunal. It was already in the register
from the statute book, and it comes back **first** of the 65 provisions retrieved for 2.3.

So ESCAP's 2.3 rests on a 1966 Treasury Directive and the economy has since legislated. That is the
fourth thing on the list to report back, beside the 3.1 scope contradiction, indicator 5.3 answered
from financial statements in two economies, and the repeated "Copyright **Right** Act" typo. One
caveat to state with it: section 1(2) of the Act says it comes into operation on a date the
Minister appoints by notification, and the register does not hold that notification.

## The three defects

### A decision is not a rule -- reader-batch row 19

An agency that adjudicates publishes its adjudications, and where the gazette is the statute book
they are filed with the law. "Notice of Affirmative Final Determination of an Anti-Dumping Duty
Investigation with regard to Imports of Cold Rolled Coils" is numbered like an instrument, sits in
the same register, and is written in the Act's own vocabulary because it is applying the Act -- so
it answers the questions the Act answers and outranks it, being short and dense where a statute is
long and general. Its sections are tariff codes and the margins found against named exporters.

> A document that announces a step in a named proceeding about a particular thing decides a case
> and does not state a rule.

Three things have to hold together, because each alone is ordinary in a real title: the step, the
proceeding, and the particular thing. A rule made generally -- "Countervailing and Anti-Dumping
Duties (Expedited Review) Determination 2000" -- names no case and is kept. Written as a category:
no word in it is about dumping, customs or trade, and across the three registers it matches 177
documents in one and none in the other two.

Retrieval stops spending seats on them and Zone 3 holds one a past run already banked, held for the
reason an outline is held. **752 sections, 0.6% of the Malaysian corpus, and none of the other
two.** In the trade-defence cell it takes four findings out of the count; the cell scored zero
before and after, which is the point -- what the rule buys is 248 reading seats that only a run can
spend.

### A publication is not the law -- reader-batch row 20

`mayGovern` already refuses a publication a governing seat and `absenceFor` already refuses it the
role of witness to a silence. Neither covers the third thing it can be made to do, which is to be
quoted as the requirement itself. Twelve export rows cite "Privacy policy | ACMA", a consultation
paper and a commencement announcement as the law, each with a verbatim snippet lifted out of it,
and twenty-one zero rows name one as the instrument the absence was found in.

The line is one line and now runs at all three places. The evidence carries the register's kind,
and a finding read in a publication is **held**, not ruled out -- a page describing a requirement is
evidence the requirement exists in some instrument nobody has cited yet.

Decision-side and free: it moves no cell in either banked run. The twelve rows belong to runs
before the two live ones, which already produce none; what the rule adds is that they cannot recur.

## Two things found on the way

### A page's title is the website's name for the page

`ownName` falls back to a document's own `<title>` where it states no name in its opening
provisions, and a site template writes "<what this page is> | <who we are>". **197 register
entries carried one**, 89 of them holding text, one of them an Act at 1,822 sections: "Strategic
Goods (Control) Act | Singapore Customs", "Cybersecurity Act | Cyber Security Agency of Singapore",
"Guidelines on Use of Telecommunication Riser Ducts | IMDA". A row citing one shows a reviewer the
agency where the provision should be.

The publisher's name comes off, and the part kept is held to the same bar every title is: it has to
name an instrument by itself. Where none of it does, nothing is recovered -- "Privacy policy |
ACMA" is a page about a site and stays visibly that. Only the pipe, which is a separator a template
uses and a drafter does not; a dash is inside real titles. Only the front, because a bilingual site
names itself on both sides and taking the back exchanged one site's name for the same site's other
name -- measured, then withdrawn.

`scripts/repair-page-titles.ts` brought the register to it: **109 renamed, 71 in Australia, 33 in
Singapore, 5 in Malaysia, 3,378 sections behind them.**

### A crawl was renaming good titles after the website

The same fallback was reached whenever a crawl had marked a title provisional, which is every title
a crawl produces. Walking the Commission's guidelines library registered twenty guidelines, each
correctly named by the link it was listed under, and renamed every one of them after the site.

> A document takes the name it gives itself only where the name it was filed under names no
> instrument.

The templates and upload slugs the rule was built for -- "Compilations—Agency prepared template",
"250312-LI-TSY_47_0757-Mergers-general th" -- name no instrument either way, so all 48 of those
renames stand.

And a listing's pagination URL is not an instrument: on some templates an item's link is the pager
rather than a page of its own, and fifteen registrations of `?page=4` went in that way. Fetched,
they are recognised as landing pages and hold no text, so they can be neither read nor cited, but
they still carry a name in the title index the shortlist ranks.
`scripts/repair-pager-registrations.ts` removes one only where it holds no section, bore no reading
and was cited by no answer.

## What is still open

- ~~**MYNIC's Registrant Policy is a landing page linking one PDF.**~~ **Closed** -- see
  [A pointer is not a name](a-pointer-is-not-a-name.md). Two things stated here were wrong. The
  rule was not unimplemented: `soleDocumentLink` and `namedDocumentLink` both shipped, and what
  was missing was a third case neither covers -- a page that reads perfectly well and offers its
  one file under the word "here". And it was not a small rule with a small return: 493 sections
  came in, four more of the registry's policies among them, and it turned up three further
  defects of the same shape. The page is also not a landing page; it was never unread.
- **Twenty-three MCMC listing pages** sit in the register named after the site, holding no text.
  They are inert -- nothing with no sections can be read or cited -- and they are the same state as
  the seven landing pages that were there before.
- The Government Procurement Act's commencement notification.

## What held

- 130 test files, 1,270 tests, typecheck clean.
- `grade` on both banked runs is unchanged by all of this: Australia and Singapore 36 -> 37 with
  the same five fixed and four broken. Two new rules that move no banked cell are two rules that
  cost nothing to carry into the run.
- **Correction, 22 September 2026.** This said "Malaysia 40 -> 30 with the same one fixed and eleven
  broken" as though the eleven measured the rules. They measure the re-parse: the readings under
  that run's citations were cascaded away with the sections they were made about, 3,356 of 19,785
  survive, and the emptied cells come back broken whatever the rules say. See
  [Grade was scoring Malaysia on a remnant](grade-on-a-remnant.md).
- Every section in all three economies is embedded: AUS 77,403, MYS 123,854, SGP 35,106, none
  outstanding.
