import { TranslationProvider } from './provider';

interface DeepLResponse {
  translations: Array<{ text: string; detected_source_language: string }>;
}

export class DeepLProvider implements TranslationProvider {
  private readonly baseUrl: string;

  constructor(private readonly apiKey: string) {
    this.baseUrl = apiKey.endsWith(':fx')
      ? 'https://api-free.deepl.com/v2/translate'
      : 'https://api.deepl.com/v2/translate';
  }

  async translate(text: string, targetLang: string): Promise<string> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: {
        'Authorization': `DeepL-Auth-Key ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: [text],
        target_lang: targetLang.toUpperCase()
      })
    });

    if (!response.ok) {
      throw new Error(`DeepL error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as DeepLResponse;
    return data.translations[0].text;
  }
}
