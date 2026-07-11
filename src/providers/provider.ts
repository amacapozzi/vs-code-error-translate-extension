export interface TranslationProvider {
  translate(text: string, targetLang: string): Promise<string>;
}
