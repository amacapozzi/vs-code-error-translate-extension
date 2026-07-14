export interface Segment {
  type: 'code' | 'prose';
  text: string;
}

const FENCE_REGEX = /```[\s\S]*?```/g;

export function splitCodeAndProse(markdown: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  FENCE_REGEX.lastIndex = 0;
  while ((match = FENCE_REGEX.exec(markdown)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ type: 'prose', text: markdown.slice(lastIndex, match.index) });
    }
    segments.push({ type: 'code', text: match[0] });
    lastIndex = FENCE_REGEX.lastIndex;
  }

  if (lastIndex < markdown.length) {
    segments.push({ type: 'prose', text: markdown.slice(lastIndex) });
  }

  return segments;
}
