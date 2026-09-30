# China: the portals, and which permit collection

The full trace behind each portal `backend/data/profiles/CHN.json` declares without an adapter. The
profile keeps a one-line summary of each and points here. Access was checked on 2026-09-09.

## State Council policy and information disclosure platform

`https://www.gov.cn` -- **PERMITTED.**

Where 行政法规 are published: the tier the laws delegate their operative detail to, and therefore
where much of what ESCAP actually scores lives. The Regulation on Protecting the Security of
Critical Information Infrastructure, which Cybersecurity Law Article 33 delegates to, is here rather
than on flk.

robots.txt, read 2026-09-09, disallows only a list of specific legacy paths (/2016*/, some photo
galleries and named articles) and advertises four search-engine sitemaps; /zhengce/ is not among the
exclusions. Checked directly the same day, /zhengce/xxgk/ answers 200 with 226 KB of server-rendered
HTML carrying real document links, so it is crawlable without a browser. No adapter written yet --
this is the strongest candidate for the next one.

## Cyberspace Administration of China

**PERMITTED.**

The central regulator for data and the internet, and the issuer of the measures that make the
cross-border transfer regime operable -- the security assessment, the standard contract and the 2024
provisions easing outbound flows. Pillar 6 cannot be answered from the laws alone, because the laws
delegate the thresholds here.

robots.txt, read 2026-09-09, disallows four specific paths (/zfz/, /wxb_zfz/, /wxzf/ and one video
URL pattern) and nothing else.

## Ministry of Industry and Information Technology

**NO STATED RESTRICTION.**

Telecommunications and ICT licensing, including the foreign-equity limits on value-added telecom
services that pillar 5 turns on, and the ICP filing regime every site operating in China is subject
to.

robots.txt returns 404 as at 2026-09-09, which expresses no exclusion. That is not the same as a
grant of permission, so its own terms of use should be read before a crawl is pointed at it.

## People's Bank of China

**CLOSED.**

Financial-sector data rules, including the localisation duties on personal financial information
that are stricter than the general regime. A sectoral rule stricter than the horizontal law is
exactly the distinction indicator 6.2 scores on.

robots.txt, read 2026-09-09, allows Baiduspider and disallows every other agent from the whole site,
so this portal is not crawlable by us and its instruments have to be sourced another way.

## General Administration of Customs

Access not yet checked. Customs procedure and the single-window electronic declaration system the
trade facilitation pillars turn on.

## State Administration for Market Regulation

Access not yet checked. Competition enforcement under the Anti-Monopoly Law and the consumer
protection regime, including the platform-economy rules relevant to pillar 9.

## China National Intellectual Property Administration

Access not yet checked. Patents and trade marks. Copyright sits with the National Copyright
Administration and trade secrets with the Anti-Unfair Competition Law, so pillar 4 is split across
three bodies here rather than concentrated in one.

## China Internet Network Information Center

Access not yet checked. The .cn registry and its eligibility rules, which are the domain name
requirements pillar 12 asks about. It operates under MIIT authority rather than independently, so
its policies carry more weight than a private registry's.
