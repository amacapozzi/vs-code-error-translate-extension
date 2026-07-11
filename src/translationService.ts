import { TranslationProvider } from './providers/provider';

export class TranslationService {
  private readonly cache = new Map<string, string>();

  constructor(
    private readonly provider: TranslationProvider,
    private readonly providerName: string,
    private readonly targetLang: string
  ) {}

  async translate(text: string): Promise<string> {
    const key = `${this.providerName}:${this.targetLang}:${text}`;
    const cached = this.cache.get(key);
    if (cached !== undefined) {
      return cached;
    }

    const translated = await this.provider.translate(text, this.targetLang);
    this.cache.set(key, translated);
    return translated;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
