import { LLMTranslatorConfig } from '@repo/base/config';
import { StreamObjectResult } from 'ai';

interface TranslationPayload {
  context?: string;
  sourceLanguage: string;
  targetLanguages: string[];
  contents: {
    key: string;
    source: string;
    notes?: string[];
  }[];
}

export interface TranslationProvider {
  translate(
    payload: TranslationPayload,
  ): Promise<StreamObjectResult<Record<string, Record<string, string>>>>;
  config(): Promise<LLMTranslatorConfig>;
}
