import { TranslationTokenizer } from '@repo/base/config';
import { Tiktoken, TiktokenModel, encodingForModel } from 'js-tiktoken';

import { LocalizationEntity } from './entity.js';

const encodings: Record<string, Tiktoken> = {};

export function calTokens(
  tokenizer: TranslationTokenizer,
  model: string,
  content: string,
) {
  if (tokenizer === 'openai') {
    if (!encodings[model]) {
      encodings[model] = encodingForModel(model as TiktokenModel);
    }
    const enc = encodings[model];
    return enc.encode(content).length;
  } else {
    throw new Error(`Unknown translator tokenizer: ${tokenizer}`);
  }
}

export function calEntityExpectedTokens(
  tokenizer: TranslationTokenizer,
  model: string,
  entity: LocalizationEntity,
) {
  let content = `"${entity.key}" = "${entity.source}"\n`;
  const sourceTokens = calTokens(tokenizer, model, content);
  return sourceTokens;
}

export function calEntitySourceTokens(
  tokenizer: TranslationTokenizer,
  model: string,
  entity: LocalizationEntity,
) {
  let content = '';
  for (const note of entity.allNotes) {
    content += `// ${note}\n`;
  }
  content += `"${entity.key}" = "${entity.source}"\n\n`;
  const sourceTokens = calTokens(tokenizer, model, content);
  return sourceTokens;
}
