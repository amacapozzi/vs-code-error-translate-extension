import { GroqProvider } from './groq';

const mockFetch = jest.fn();
beforeAll(() => { (global as any).fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

describe('GroqProvider', () => {
  it('returns trimmed translated text from Groq API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '  texto traducido  ' } }]
      })
    });

    const provider = new GroqProvider('test-key', 'llama-3.1-8b-instant');
    const result = await provider.translate('sample error', 'es');

    expect(result).toBe('texto traducido');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(JSON.parse(options.body).model).toBe('llama-3.1-8b-instant');
    expect(options.headers['Authorization']).toBe('Bearer test-key');
  });

  it('prompt includes target language and original error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'traducción' } }] })
    });

    const provider = new GroqProvider('key', 'llama-3.1-8b-instant');
    await provider.translate('variable not used', 'fr');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('fr');
    expect(body.messages[0].content).toContain('variable not used');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 429, statusText: 'Too Many Requests' });

    const provider = new GroqProvider('bad-key', 'llama-3.1-8b-instant');
    await expect(provider.translate('text', 'es')).rejects.toThrow('Groq error: 429');
  });
});
