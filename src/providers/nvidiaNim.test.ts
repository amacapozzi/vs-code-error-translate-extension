import { NvidiaNimProvider } from './nvidiaNim';

const mockFetch = jest.fn();
beforeAll(() => { (global as any).fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

describe('NvidiaNimProvider', () => {
  it('returns trimmed translated text from NVIDIA NIM API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '  texto traducido  ' } }]
      })
    });

    const provider = new NvidiaNimProvider('test-key', 'meta/llama-3.1-8b-instruct');
    const result = await provider.translate('sample error', 'es');

    expect(result).toBe('texto traducido');
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe('https://integrate.api.nvidia.com/v1/chat/completions');
    expect(JSON.parse(options.body).model).toBe('meta/llama-3.1-8b-instruct');
    expect(options.headers['Authorization']).toBe('Bearer test-key');
  });

  it('prompt includes target language and original error', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ choices: [{ message: { content: 'traducción' } }] })
    });

    const provider = new NvidiaNimProvider('key', 'meta/llama-3.1-8b-instruct');
    await provider.translate('undefined is not a function', 'pt');

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.messages[0].content).toContain('pt');
    expect(body.messages[0].content).toContain('undefined is not a function');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 401, statusText: 'Unauthorized' });

    const provider = new NvidiaNimProvider('bad-key', 'meta/llama-3.1-8b-instruct');
    await expect(provider.translate('text', 'es')).rejects.toThrow('NVIDIA NIM error: 401');
  });
});
