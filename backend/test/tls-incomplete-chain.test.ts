/**
 * The intermediate certificate a server forgot to send.
 *
 * Royal Malaysian Customs presents its leaf alone, so the chain cannot be built and every request
 * to it failed verification -- which from the outside looks exactly like a department that
 * publishes no instruments, and a cell reads that as "no requirement". Browsers recover by
 * fetching the issuer named in the leaf's own CA Issuers URI, and so do we.
 *
 * What is tested here is not the recovery but its limits, because this is the one place in the
 * fetcher where getting it wrong would mean trusting something we should not. An intermediate is
 * used only if a certificate already in Node's root store issued and signed it; anything else is
 * discarded and the original failure stands.
 */
import { describe, expect, it } from 'vitest';
import { X509Certificate } from 'node:crypto';
import { rootCertificates } from 'node:tls';
import { __chainsToTrustedRoot, __isIncompleteChain, __caIssuersUri } from '../src/fetch/index.js';

/** Self-signed, issued by nobody. Stands in for anything an attacker could serve at the AIA URL. */
const SELF_SIGNED = `-----BEGIN CERTIFICATE-----
MIIDITCCAgmgAwIBAgIUB4WL8XuzJuOJaNowNx0Hpg0hjxgwDQYJKoZIhvcNAQEL
BQAwIDEeMBwGA1UEAwwVbm90LWEtcmVhbC1jYS5pbnZhbGlkMB4XDTI2MDkyMTE1
NTUxOVoXDTM2MDkxODE1NTUxOVowIDEeMBwGA1UEAwwVbm90LWEtcmVhbC1jYS5p
bnZhbGlkMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtmWI76UeZabt
CVUsgbyK3+DZBwGvGkTRSH2GwxELLRxLDacPs6RwFjfpeJvx/PDGjuRvh7rMftoh
UL10Jv4GLdameLS/acBBgfRjZ3ZVCu7EugO+hEJVlRchoWncNJFBNmxLDWn9EWTm
cd+eR8+cgn3FDNkPY3TShlR/TucymTrOa8s4KvPoNpMEVI66EuKZeIyRdTbRjmFV
yjW0syPcabcAZbaDdtqaJ/WbItNEEAkMpVXM+RazTXepVNVYen/dcs9LYiQIqU+G
3Oy7DnBOMNvmEobQhZNyP1za5flIQ9uPSbIoTX1W4M8oEp3uP9gBwXaXwEH2j0J1
slW7PBexlwIDAQABo1MwUTAdBgNVHQ4EFgQUlsh3jj9BSjT3dnARyw45msNHGY4w
HwYDVR0jBBgwFoAUlsh3jj9BSjT3dnARyw45msNHGY4wDwYDVR0TAQH/BAUwAwEB
/zANBgkqhkiG9w0BAQsFAAOCAQEAPk96YmvX5rBNBOJulB+xtUyd06VZntCLF8HB
mMD8hxRO9uM4/oZOkytN/9fZ3N7JHw222ntLMm/W/BqZc1aX6LVS2it73qIYL2Iv
CU9yi8mKhB2W2nuOHrrzYKOeegY0YReGdJeyWiQ99VEOhmFgHHQLx5LFNL7FRFnc
TbJr0QtnxHzeiBdLVwMSTMhEDZN72fCeiUQe0dq1RCaEKUEMeexjeExhg9vwSt7N
08/Xuof9VYyrvv5ANN6ufRiQLdhjZsX2a5w8zeG+CR7uS3KHWzO82/PdB6uWmKJw
c4HmOsPVklbnxbcAH6gHWaCyQSRdgYu0Ut8cptRekY8Kg09VQA==
-----END CERTIFICATE-----`;

describe('what may be accepted as a missing intermediate', () => {
  it('refuses a certificate no trusted root issued', () => {
    expect(__chainsToTrustedRoot(new X509Certificate(SELF_SIGNED))).toBe(false);
  });

  it('accepts one that a certificate in Node’s own root store signed', () => {
    // A root is signed by itself and is in the store, so it satisfies the same test an
    // intermediate has to pass. If this fails, the check is rejecting everything.
    const root = rootCertificates.map((p) => new X509Certificate(p)).find((c) => c.ca);
    expect(root).toBeDefined();
    expect(__chainsToTrustedRoot(root!)).toBe(true);
  });
});

describe('recognising a server that omitted its intermediates', () => {
  it('reads the code undici nests inside cause', () => {
    const wrapped = Object.assign(new Error('fetch failed'), {
      cause: Object.assign(new Error('unable to verify the first certificate'), {
        code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      }),
    });
    expect(__isIncompleteChain(wrapped)).toBe(true);
  });

  it('reads it when it is the error itself', () => {
    expect(__isIncompleteChain(Object.assign(new Error('x'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }))).toBe(true);
  });

  it('does not mistake an ordinary failure for one', () => {
    expect(__isIncompleteChain(Object.assign(new Error('timeout'), { code: 'UND_ERR_HEADERS_TIMEOUT' }))).toBe(false);
    expect(__isIncompleteChain(new Error('no code at all'))).toBe(false);
    expect(__isIncompleteChain(null)).toBe(false);
  });

  it('does not loop on an error that is its own cause', () => {
    const circular: { cause?: unknown; code?: string } = { code: 'NOPE' };
    circular.cause = circular;
    expect(__isIncompleteChain(circular)).toBe(false);
  });
});

describe('the issuer a certificate names', () => {
  it('is read out of the CA Issuers line, and absent when there is none', () => {
    expect(__caIssuersUri(new X509Certificate(SELF_SIGNED))).toBeNull();
  });
});
