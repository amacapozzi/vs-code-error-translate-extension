import { TranslationProvider } from './provider';

interface OpenAIResponse {
  choices: Array<{ message: { content: string } }>;
}

export class GroqProvider implements TranslationProvider {
  private static readonly BASE_URL = 'https://api.groq.com/openai/v1/chat/completions';

  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async translate(text: string, targetLang: string): Promise<string> {
    const response = await fetch(GroqProvider.BASE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{
          role: 'user',
          content: `Translate this programming error message to ${targetLang}. Keep technical terms, variable names, and type names untouched. Return only the translated message: ${text}`
        }],
        temperature: 0
      })
    });

    if (!response.ok) {
      throw new Error(`Groq error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as OpenAIResponse;
    return data.choices[0].message.content.trim();
  }
}
