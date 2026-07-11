import { TranslationProvider } from './provider';

interface GoogleTranslateResponse {
  data: {
    translations: Array<{ translatedText: string }>;
  };
}

export class GoogleTranslateProvider implements TranslationProvider {
  constructor(private readonly apiKey: string) {}

  async translate(text: string, targetLang: string): Promise<string> {
    const url = `https://translation.googleapis.com/language/translate/v2?key=${this.apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: text, target: targetLang, format: 'text' })
    });

    if (!response.ok) {
      throw new Error(`Google Translate error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as GoogleTranslateResponse;
    return data.data.translations[0].translatedText;
  }
}
