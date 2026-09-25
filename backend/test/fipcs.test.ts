/**
 * The Bank of Thailand's notifications database: an ASP.NET form, paged through server-side session
 * state, whose rows link each notification's PDF in Thai and, for many, in English.
 */
import { createServer, type Server } from 'node:http';
import { afterAll, describe, expect, it } from 'vitest';
import { openDb } from '../src/db/index.js';
import { Fetcher } from '../src/fetch/index.js';
import { fipcsRows } from '../src/discover/fipcs.js';

const servers: Server[] = [];
afterAll(() => {
  for (const s of servers) s.close();
});

const DOCS = 'https://www.bot.or.th/content/dam/bot/fipcs/documents/FPG/2561';

function row(title: string, links: string): string {
  return `<tr class="nonebgnewsWhite"><td class="namenews">ประกาศ ธปท.</td><td class="datenews"> 1 ม.ค. 2561 </td>` +
    `<td class="tx-news"><div class="tx-news1"><a href='#' onclick="OpenWindow('PFIPCS_summary.aspx?packId=1','summary')">` +
    `<table border="0"><tr><p class='setrow'>${title} </p><p class='setrow'></p></tr></table></a></div></td>` +
    `<td class="tx-news">${links}</td></tr>`;
}

describe('a results page of the notifications database', () => {
  it('reads each notification with its Thai and English PDFs', () => {
    const html = `<table>${row('ประกาศ ธปท. ที่ สนส. 12/2561 เรื่อง หลักเกณฑ์',
      `<a href='${DOCS}/ThaiPDF/25610156.pdf' target='_blank'>TH</a> <a href='${DOCS}/EngPDF/25610156.pdf' target='_blank'>EN</a>`)}` +
      `${row('ประกาศ ธปท. ที่ 38/2569 เรื่อง KYC', `<a href='${DOCS}/ThaiPDF/25690173.pdf' target='_blank' >TH</a>`)}</table>`;
    expect(fipcsRows(html)).toEqual([
      { title: 'ประกาศ ธปท. ที่ สนส. 12/2561 เรื่อง หลักเกณฑ์', thai: `${DOCS}/ThaiPDF/25610156.pdf`, english: `${DOCS}/EngPDF/25610156.pdf` },
      { title: 'ประกาศ ธปท. ที่ 38/2569 เรื่อง KYC', thai: `${DOCS}/ThaiPDF/25690173.pdf`, english: null },
    ]);
  });
});

describe('a session the fetcher is asked to hold', () => {
  it('sends back the cookie the host set, to that host only when asked', async () => {
    const cookies: (string | undefined)[] = [];
    const server = createServer((req, res) => {
      if (req.url === '/robots.txt') {
        res.writeHead(404);
        res.end();
        return;
      }
      cookies.push(req.headers.cookie);
      res.writeHead(200, { 'content-type': 'text/html', 'set-cookie': 'ASP.NET_SessionId=abc123; path=/; HttpOnly' });
      res.end('<html>page</html>');
    });
    servers.push(server);
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const { port } = server.address() as { port: number };
    const origin = `http://127.0.0.1:${port}`;

    const plain = new Fetcher({ db: openDb(':memory:'), sourceMode: 'fetch', minDelayMs: 0 });
    await plain.fetch(`${origin}/a`, { refresh: true });
    await plain.fetch(`${origin}/b`, { refresh: true });

    const held = new Fetcher({ db: openDb(':memory:'), sourceMode: 'fetch', minDelayMs: 0 });
    await held.fetch(`${origin}/c`, { refresh: true, session: true });
    await held.fetch(`${origin}/d`, { refresh: true, session: true, post: { body: 'x=1', contentType: 'application/x-www-form-urlencoded' } });

    expect(cookies).toEqual([undefined, undefined, undefined, 'ASP.NET_SessionId=abc123']);
  });
});
