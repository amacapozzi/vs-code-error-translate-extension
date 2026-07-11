import { GoogleTranslateProvider } from './googleTranslate';

const mockFetch = jest.fn();
beforeAll(() => { (global as any).fetch = mockFetch; });
afterEach(() => mockFetch.mockReset());

describe('GoogleTranslateProvider', () => {
  it('returns translated text from Google Translate API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { translations: [{ translatedText: 'texto traducido' }] }
      })
    });

    const provider = new GoogleTranslateProvider('test-key');
    const result = await provider.translate('sample text', 'es');

    expect(result).toBe('texto traducido');
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('key=test-key'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ q: 'sample text', target: 'es', format: 'text' })
      })
    );
  });

  it('throws on non-ok response', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 403, statusText: 'Forbidden' });

    const provider = new GoogleTranslateProvider('bad-key');
    await expect(provider.translate('text', 'es')).rejects.toThrow('Google Translate error: 403');
  });
});
