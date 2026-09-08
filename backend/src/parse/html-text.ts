/**
 * HTML to readable text.
 *
 * cheerio's .text() concatenates every text node with nothing between them, which turns
 * legislative markup into nonsense: "(a)may be granted subject to..." from a two-cell table row,
 * or "26.—(1)An organisation must not transfer...". A quoted snippet built out of that cannot be
 * matched back to the source, and a model reading it draws the paragraph boundaries in the wrong
 * places.
 *
 * So this walks the tree and puts a separator where the markup implies one. It is deterministic:
 * the same HTML always yields the same string, which is what lets a stored character offset stay
 * meaningful across re-parses.
 */
import type { AnyNode, Element } from 'domhandler';

const BLOCK = new Set([
  'p', 'div', 'tr', 'li', 'blockquote', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'table', 'ul', 'ol', 'dl', 'dt', 'dd', 'header', 'footer', 'main', 'nav', 'aside', 'figure',
]);
/**
 * Cells get a space around them; inline emphasis does not. Legislative markup puts the letter of
 * a paragraph in its own <em>, so "(<em>a</em>)" has to come out as "(a)" and not "( a )".
 */
const SPACED = new Set(['td', 'th', 'label']);
const SKIP = new Set(['script', 'style', 'noscript', 'template', 'svg', 'head']);

function isElement(n: AnyNode): n is Element {
  return n.type === 'tag' || n.type === 'script' || n.type === 'style';
}

/**
 * Non-breaking spaces become ordinary ones. SSO uses runs of &#xA0; for the gap after a subsection
 * number; keeping them makes every quote fail an exact-match check made by a human who typed a
 * normal space.
 */
function normalise(s: string): string {
  return s.replace(/[   ]/g, ' ');
}

export function nodeText(nodes: AnyNode[]): string {
  const out: string[] = [];

  const walk = (node: AnyNode): void => {
    if (node.type === 'text') {
      const t = normalise((node as unknown as { data: string }).data);
      if (t) out.push(t);
      return;
    }
    if (!isElement(node)) return;
    const tag = node.tagName?.toLowerCase();
    if (!tag || SKIP.has(tag)) return;

    if (tag === 'br') {
      out.push('\n');
      return;
    }
    const block = BLOCK.has(tag);
    if (block) out.push('\n');
    else if (SPACED.has(tag)) out.push(' ');

    for (const child of node.children) walk(child);

    if (block) out.push('\n');
    else if (SPACED.has(tag)) out.push(' ');
  };

  for (const n of nodes) walk(n);

  return out
    .join('')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
