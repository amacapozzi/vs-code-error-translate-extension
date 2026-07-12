import { DeepLProvider } from './deepl';

const mockFetch = jest.fn();
beforeAll(() => { (global as any).fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

describe('DeepLProvider', () => {
  it('uses free API endpoint for keys ending with :fx', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ translations: [{ text: 'texto', detected_source_language: 'EN' }] })
    });
    const provider = new DeepLProvider('test-key:fx');
    await provider.translate('text', 'es');
    expect(mockFetch).toHaveBeenCalledWith('https://api-free.deepl.com/v2/translate', expect.any(Object));
  });

  it('uses paid API endpoint for keys not ending with :fx', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ translations: [{ text: 'texto', detected_source_language: 'EN' }] })
    });
    const provider = new DeepLProvider('test-paid-key');
    await provider.translate('text', 'es');
    expect(mockFetch).toHaveBeenCalledWith('https://api.deepl.com/v2/translate', expect.any(Object));
  });

  it('returns translated text', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ translations: [{ text: 'variable no utilizada', detected_source_language: 'EN' }] })
    });
    const provider = new DeepLProvider('test-key:fx');
    const result = await provider.translate('variable not used', 'es');
    expect(result).toBe('variable no utilizada');
  });

  it('sends target_lang as uppercase and text as array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ translations: [{ text: 'traducido', detected_source_language: 'EN' }] })
    });
    const provider = new DeepLProvider('test-key:fx');
    await provider.translate('error text', 'es');
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.target_lang).toBe('ES');
    expect(body.text).toEqual(['error text']);
  });

  it('sends DeepL-Auth-Key authorization header', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ translations: [{ text: 'traducido', detected_source_language: 'EN' }] })
    });
    const provider = new DeepLProvider('my-key:fx');
    await provider.translate('text', 'es');
    expect(mockFetch.mock.calls[0][1].headers['Authorization']).toBe('DeepL-Auth-Key my-key:fx');
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });
    const provider = new DeepLProvider('bad-key:fx');
    await expect(provider.translate('text', 'es')).rejects.toThrow('DeepL error: 403');
  });
});
