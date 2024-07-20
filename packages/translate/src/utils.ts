import { TranslationProvider } from '@repo/base/config';
import { Tiktoken, TiktokenModel, encodingForModel } from 'js-tiktoken';

import { LocalizationEntity } from './entity.js';

const encodings: Record<string, Tiktoken> = {};

export function calTokens(
  provider: TranslationProvider,
  model: string,
  content: string,
) {
  if (provider === 'openai') {
    if (!encodings[model]) {
      encodings[model] = encodingForModel(model as TiktokenModel);
    }
    const enc = encodings[model];
    return enc.encode(content).length;
  } else {
    throw new Error(`Unknown translator provider: ${provider}`);
  }
}

export function calEntityExpectedTokens(
  provider: TranslationProvider,
  model: string,
  entity: LocalizationEntity,
) {
  let content = `"${entity.key}" = "${entity.source}"\n`;
  const sourceTokens = calTokens(provider, model, content);
  return sourceTokens;
}

export function calEntitySourceTokens(
  provider: TranslationProvider,
  model: string,
  entity: LocalizationEntity,
) {
  let content = '';
  for (const note of entity.allNotes) {
    content += `// ${note}\n`;
  }
  content += `"${entity.key}" = "${entity.source}"\n\n`;
  const sourceTokens = calTokens(provider, model, content);
  return sourceTokens;
}
