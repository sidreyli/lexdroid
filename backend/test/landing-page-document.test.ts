/**
 * A landing page that publishes exactly one file.
 * MYNIC wraps the .MY dispute resolution rules in a page of menus; the rules are the PDF.
 */
import { describe, expect, it } from 'vitest';
import { parseHtml, soleDocumentLink } from '../src/parse/html.js';

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
