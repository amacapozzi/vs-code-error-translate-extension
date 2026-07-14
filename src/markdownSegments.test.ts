import { splitCodeAndProse } from './markdownSegments';

describe('splitCodeAndProse', () => {
  it('returns a single prose segment when there is no code fence', () => {
    const result = splitCodeAndProse('ReadDir reads the named directory.');
    expect(result).toEqual([
      { type: 'prose', text: 'ReadDir reads the named directory.' }
    ]);
  });

  it('extracts a single fenced code block with no surrounding prose', () => {
    const md = '```go\nfunc os.ReadDir(name string) ([]os.DirEntry, error)\n```';
    const result = splitCodeAndProse(md);
    expect(result).toEqual([
      { type: 'code', text: md }
    ]);
  });

  it('splits prose before and after a single code fence', () => {
    const md = 'Before text\n```go\ncode here\n```\nAfter text';
    const result = splitCodeAndProse(md);
    expect(result).toEqual([
      { type: 'prose', text: 'Before text\n' },
      { type: 'code', text: '```go\ncode here\n```' },
      { type: 'prose', text: '\nAfter text' }
    ]);
  });

  it('handles multiple fenced blocks interleaved with prose', () => {
    const md = 'A\n```\ncode1\n```\nB\n```\ncode2\n```\nC';
    const result = splitCodeAndProse(md);
    expect(result).toEqual([
      { type: 'prose', text: 'A\n' },
      { type: 'code', text: '```\ncode1\n```' },
      { type: 'prose', text: '\nB\n' },
      { type: 'code', text: '```\ncode2\n```' },
      { type: 'prose', text: '\nC' }
    ]);
  });

  it('returns an empty array for an empty string', () => {
    expect(splitCodeAndProse('')).toEqual([]);
  });

  it('treats an unterminated fence as trailing prose', () => {
    const md = 'Before\n```go\nno closing fence';
    const result = splitCodeAndProse(md);
    expect(result).toEqual([
      { type: 'prose', text: 'Before\n```go\nno closing fence' }
    ]);
  });
});
