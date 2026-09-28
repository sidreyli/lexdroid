/**
 * A register kept as a table, whose links are captioned with a code rather than a name.
 *
 * The Communications Regulatory Commission of Mongolia lists the procedures it has approved as
 * rows -- number, name, date, resolution number, and a link captioned "3-201-1.2 /2015.12.30/" or
 * just "Журам". Read by anchor alone, the register named nothing.
 */
import { describe, expect, it } from 'vitest';
import { crawlAdapter } from '../src/discover/crawl.js';
import { instrumentWords } from '../src/discover/titles.js';
import { loadProfile } from '../src/profile/index.js';

const REGISTER = `
  <html><body><table>
    <tr><th>№</th><th>Нэр</th><th>Огноо</th><th>Дугаар</th><th>Файл</th></tr>
    <tr><td>12</td><td>Мэдээлэл, харилцаа холбооны үйлчилгээний чанарыг хянах журам</td><td>2014-07-04</td><td>36</td>
        <td><a href="/storage/PDF/2014/2014-36.pdf">3-201-1.2 /2015.12.30/</a></td></tr>
    <tr><td>15</td><td>Радио төхөөрөмж ажиллуулах, үйл ажиллагааг нь зогсоох, хориглох журам</td><td>2019.12.18</td><td>55</td>
        <td><a href="/storage/PDF/2019/012-55.pdf">Журам</a></td></tr>
    <tr><td>16</td><td>2019.12.18</td><td>56</td><td><a href="/storage/PDF/2019/012-56.pdf">2019-56 тоот</a></td></tr>
  </table>
  <a href="/storage/PDF/loose.pdf">2020-65 тоот</a>
  </body></html>`;

async function walk() {
  const vocabulary = instrumentWords(loadProfile('MNG').instrumentTypes);
  return crawlAdapter.discover({
    portal: {
      name: 'Communications Regulatory Commission',
      url: 'https://crc.gov.mn',
      kind: 'regulator',
      authority: 'CRC',
      pillars: [5],
      adapter: 'crawl',
      adapterConfig: {},
      notes: null,
    } as never,
    fetcher: { fetch: async () => ({ mediaType: 'text/html', body: Buffer.from(REGISTER) }) } as never,
    log: () => {},
    setAside: () => {},
    vocabulary,
  });
}

describe('a link whose caption is a code, in a table row that names it', () => {
  it('takes its name from the cell of the row that names an instrument', async () => {
    const found = await walk();
    expect(found.map((f) => [f.url, f.title])).toEqual([
      ['https://crc.gov.mn/storage/PDF/2014/2014-36.pdf', 'Мэдээлэл, харилцаа холбооны үйлчилгээний чанарыг хянах журам'],
      ['https://crc.gov.mn/storage/PDF/2019/012-55.pdf', 'Радио төхөөрөмж ажиллуулах, үйл ажиллагааг нь зогсоох, хориглох журам'],
    ]);
  });

  it('names nothing where neither the caption nor the row does', async () => {
    const found = await walk();
    expect(found.some((f) => f.url.endsWith('012-56.pdf') || f.url.endsWith('loose.pdf'))).toBe(false);
  });
});
