import { TranslationService } from './translationService';
import { TranslationProvider } from './providers/provider';

describe('TranslationService', () => {
  let mockProvider: jest.Mocked<TranslationProvider>;

  beforeEach(() => {
    mockProvider = { translate: jest.fn() };
  });

  it('calls provider and returns translation', async () => {
    mockProvider.translate.mockResolvedValueOnce('texto de error');
    const service = new TranslationService(mockProvider, 'groq', 'es');

    const result = await service.translate('error text');

    expect(result).toBe('texto de error');
    expect(mockProvider.translate).toHaveBeenCalledWith('error text', 'es');
  });

  it('returns cached result on second call with same text', async () => {
    mockProvider.translate.mockResolvedValueOnce('texto de error');
    const service = new TranslationService(mockProvider, 'groq', 'es');

    await service.translate('error text');
    const result = await service.translate('error text');

    expect(result).toBe('texto de error');
    expect(mockProvider.translate).toHaveBeenCalledTimes(1);
  });

  it('calls provider again for different text', async () => {
    mockProvider.translate
      .mockResolvedValueOnce('primer resultado')
      .mockResolvedValueOnce('segundo resultado');
    const service = new TranslationService(mockProvider, 'groq', 'es');

    const r1 = await service.translate('first error');
    const r2 = await service.translate('second error');

    expect(r1).toBe('primer resultado');
    expect(r2).toBe('segundo resultado');
    expect(mockProvider.translate).toHaveBeenCalledTimes(2);
  });

  it('clearCache forces provider to be called again', async () => {
    mockProvider.translate
      .mockResolvedValueOnce('primera traducción')
      .mockResolvedValueOnce('segunda traducción');
    const service = new TranslationService(mockProvider, 'groq', 'es');

    await service.translate('error text');
    service.clearCache();
    const result = await service.translate('error text');

    expect(result).toBe('segunda traducción');
    expect(mockProvider.translate).toHaveBeenCalledTimes(2);
  });

  it('cache is keyed by provider name and language', async () => {
    const service1 = new TranslationService(mockProvider, 'groq', 'es');
    const service2 = new TranslationService(mockProvider, 'google', 'es');
    mockProvider.translate
      .mockResolvedValueOnce('desde groq')
      .mockResolvedValueOnce('desde google');

    const r1 = await service1.translate('error');
    const r2 = await service2.translate('error');

    expect(r1).toBe('desde groq');
    expect(r2).toBe('desde google');
    expect(mockProvider.translate).toHaveBeenCalledTimes(2);
  });
});
