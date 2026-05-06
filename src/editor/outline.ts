export interface Heading {
  level: number;
  text: string;
  line: number;
}

export interface OutlineNode extends Heading {
  children: OutlineNode[];
}

const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/;
const FENCE_RE = /^(```|~~~)/;

export function parseHeadings(doc: string): Heading[] {
  const lines = doc.split('\n');
  const out: Heading[] = [];
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (FENCE_RE.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = HEADING_RE.exec(line);
    if (!m) continue;
    out.push({
      level: m[1].length,
      text: m[2].trim(),
      line: i + 1,
    });
  }
  return out;
}

export function buildOutlineTree(headings: Heading[]): OutlineNode[] {
  const root: OutlineNode[] = [];
  const stack: OutlineNode[] = [];
  for (const h of headings) {
    const node: OutlineNode = { ...h, children: [] };
    while (stack.length > 0 && stack[stack.length - 1].level >= h.level) {
      stack.pop();
    }
    if (stack.length === 0) {
      root.push(node);
    } else {
      stack[stack.length - 1].children.push(node);
    }
    stack.push(node);
  }
  return root;
}
