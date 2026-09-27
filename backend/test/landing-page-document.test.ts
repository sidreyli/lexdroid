/**
 * A landing page that publishes exactly one file.
 * MYNIC wraps the .MY dispute resolution rules in a page of menus; the rules are the PDF.
 */
import { describe, expect, it } from 'vitest';
import { parseHtml, pointedDocumentLink, soleDocumentLink } from '../src/parse/html.js';

const PAGE = 'https://mynic.my/resources/policies/my-domain-name-dispute-resolution-rules/';

const MENUS = `
<html><head><title>MYNIC | .MY DOMAIN NAME DISPUTE RESOLUTION RULES</title></head><body><main>
<p>These are the rules that govern disputes over .my domain names, published by MYNIC as the
registry operator for the .my country code top level domain, and they are set out in full in the
document linked below.</p>
<a href="/">Home</a> <a href="/about">About us</a> <a href="/resources">Resources</a>
<a href="/resources/policies">Policies</a> <a href="/support">Support</a>
<a href="/contact">Contact</a> <a href="/registrars">Accredited registrars</a>
<a href="/whois">WHOIS lookup</a> <a href="/news">Newsroom</a> <a href="/careers">Careers</a>
<a href="/resources/policies/registration-policy">.MY domain name registration policy</a>
<a href="/resources/policies/transfer-policy">.MY domain name transfer policy</a>
<a href="/resources/policies/suspension-policy">.MY domain name suspension and deletion policy</a>
<a href="/resources/policies/privacy-policy">Privacy and personal data protection notice</a>
<a href="/resources/policies/terms">Terms and conditions of domain name registration</a>
<a href="/resources/guides/registrar-handbook">Handbook for accredited registrars of .MY names</a>
<a href="/resources/guides/reseller-handbook">Handbook for resellers of .MY domain names</a>
<a href="/support/faq">Frequently asked questions about registering a .MY domain name</a>
<a href="https://mynic.my/storage/pdf/MYNIC%20.MY%20Domain%20Name%20Dispute%20Resolution%20Rule.pdf?_t=1">
  .MY Domain Name Dispute Resolution Rules</a>
</main></body></html>`;

describe('a page of menus wrapping one document', () => {
  it('is still recorded as a landing page, because it is one', () => {
    const parsed = parseHtml(MENUS, PAGE);
    expect(parsed.unread?.reason).toBe('landing-page');
  });

  it('names the single file it publishes', () => {
    expect(soleDocumentLink(MENUS, PAGE)).toBe(
      'https://mynic.my/storage/pdf/MYNIC%20.MY%20Domain%20Name%20Dispute%20Resolution%20Rule.pdf?_t=1',
    );
  });

  it('names nothing when the page publishes several, which makes it an index', () => {
    const index = MENUS.replace('</main>', '<a href="/storage/pdf/second.pdf">Second rules</a></main>');
    expect(soleDocumentLink(index, PAGE)).toBeNull();
  });

  it('does not follow a file on another host', () => {
    const offsite = MENUS.replace('https://mynic.my/storage', 'https://cdn.example.com/storage');
    expect(soleDocumentLink(offsite, PAGE)).toBeNull();
  });
});

/**
 * The page that reads perfectly well and is still not the document: one paragraph saying the
 * policy can be downloaded here. `soleDocumentLink` never runs on it, because it is not unread,
 * and `namedDocumentLink` never matches it, because "here" is not the instrument's name.
 */
const POLICY_PAGE = 'https://registry.example/policies/registrant-policy';

const ONE_PARAGRAPH = `
<html><head><title>Registrant Policy</title></head><body><main>
<h1>Registrant Policy</h1>
<p>This Policy sets out the rules and regulations governing the application and the registration
of domain names with the registry and is applicable to all domain name registrations, to every
registrar accredited by the registry and to every registrant of a domain name, whether the name
was registered directly or through an accredited registrar of the registry. It applies to every
name registered on or after the date the registry publishes it, and to every name registered
before that date on the first renewal of the registration. Nothing in this Policy limits any
obligation a registrant owes under any written law, and where this Policy and an agreement
between a registrant and an accredited registrar differ, this Policy prevails to the extent of
the difference.</p>
<p>The Registrant Policy can be downloaded <a href="/storage/pdf/Registrant_Policy.pdf?_t=1">here</a>.</p>
</main></body></html>`;

describe('a page whose one link calls the file no name', () => {
  it('reads as a document, which is why the landing-page rule never reaches it', () => {
    const parsed = parseHtml(ONE_PARAGRAPH, POLICY_PAGE);
    expect(parsed.unread ?? null).toBeNull();
    expect(parsed.sections.length).toBeGreaterThan(0);
  });

  it('names the file the page points at', () => {
    expect(pointedDocumentLink(ONE_PARAGRAPH, POLICY_PAGE)).toBe(
      'https://registry.example/storage/pdf/Registrant_Policy.pdf?_t=1',
    );
  });

  it('counts a file size and a format as pointing, because neither is a name', () => {
    for (const label of ['(340.7 KB)', 'link (660.1 KB)', 'PDF 395.77 KB', 'Download the print version', 'click here to download']) {
      const page = ONE_PARAGRAPH.replace('>here<', `>${label}<`);
      expect(pointedDocumentLink(page, POLICY_PAGE), label).not.toBeNull();
    }
  });

  it('refuses a link that names some other document, because the page is citing it', () => {
    // Nine media releases about penalties on named banks all link one enforcement policy. The
    // page is about the penalty; the file is about the policy; neither is the other.
    const cites = ONE_PARAGRAPH.replace('>here<', '>Enforcement Approach<');
    expect(pointedDocumentLink(cites, POLICY_PAGE)).toBeNull();
  });

  it('refuses a link that names an instrument by its number', () => {
    const numbered = ONE_PARAGRAPH.replace('>here<', '>P.U. (B) 76/2026<');
    expect(pointedDocumentLink(numbered, POLICY_PAGE)).toBeNull();
  });

  it('refuses a page offering more than one file, which is choosing between them', () => {
    const two = ONE_PARAGRAPH.replace(
      '</main>',
      '<p>The schedule is <a href="/storage/pdf/Schedule.pdf">here</a>.</p></main>',
    );
    expect(pointedDocumentLink(two, POLICY_PAGE)).toBeNull();
  });

  it('counts one file linked twice as one file', () => {
    const twice = ONE_PARAGRAPH.replace(
      '</main>',
      '<p>Or read it <a href="/storage/pdf/Registrant_Policy.pdf?_t=1">here</a>.</p></main>',
    );
    expect(pointedDocumentLink(twice, POLICY_PAGE)).toBe(
      'https://registry.example/storage/pdf/Registrant_Policy.pdf?_t=1',
    );
  });

  it('asks the host that served the page for the file, when the link uses the other name', () => {
    const other = ONE_PARAGRAPH.replace('/storage/pdf/', 'https://www.registry.example/storage/pdf/');
    expect(pointedDocumentLink(other, POLICY_PAGE)).toBe(
      'https://registry.example/storage/pdf/Registrant_Policy.pdf?_t=1',
    );
  });

  it('names nothing on a page that links no file at all', () => {
    expect(pointedDocumentLink(ONE_PARAGRAPH.replace(/<a [^>]*>[^<]*<\/a>/g, 'here'), POLICY_PAGE)).toBeNull();
  });
});
