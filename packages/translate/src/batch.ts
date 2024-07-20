import { TranslationProvider } from '@repo/base/config';
import { logger } from '@repo/base/logger';

import { LocalizationEntity } from './entity.js';
import { calEntityExpectedTokens, calEntitySourceTokens } from './utils.js';

export type TranslationBatch = {
  sourceLanguage: string;
  targetLanguages: string[];
  contents: {
    key: string;
    source: string;
    notes?: string[];
  }[];
  sourceTokens: number;
  expectedTokens: number;
};

export function createBatches(
  entities: LocalizationEntity[],
  config: {
    maxTokens: number;
    buffer: number;
    provider: TranslationProvider;
    model: string;
  },
): TranslationBatch[] {
  if (entities.length === 0) {
    return [];
  }
  let batches: TranslationBatch[] = [];
  const remainings: Set<LocalizationEntity> = new Set(entities);
  const maxSafeTokens = Math.floor(config.maxTokens * (1 - config.buffer));

  while (remainings.size > 0) {
    const entity: LocalizationEntity = remainings.values().next().value;
    remainings.delete(entity);
    const targetLanguages = entity.untranslatedLanguages;
    if (targetLanguages.length === 0) {
      logger.info(
        `Skipping ${entity.key} because all target languages are translated.`,
      );
      continue;
    }

    const expectedTokens = calEntityExpectedTokens(
      config.provider,
      config.model,
      entity,
    );
    if (expectedTokens > maxSafeTokens) {
      throw new Error(
        `${
          entity.key
        } is too long to be translated: ${entity.source.value.slice(
          0,
          20,
        )}...}`,
      );
    }

    if (expectedTokens * targetLanguages.length > maxSafeTokens) {
      logger.info(
        `Splitting ${entity.key} because it is too long to be translated`,
      );
      const maxLanguagesPerBatch = Math.floor(maxSafeTokens / expectedTokens);
      const groupCount = Math.ceil(
        targetLanguages.length / maxLanguagesPerBatch,
      );
      for (let i = 0; i < groupCount; i++) {
        const group = targetLanguages.slice(
          i * maxLanguagesPerBatch,
          (i + 1) * maxLanguagesPerBatch,
        );
        batches.push({
          sourceLanguage: entity.source.code,
          targetLanguages: group,
          contents: [
            {
              key: entity.key,
              source: entity.source.value,
              notes: [
                ...new Set(group.flatMap((t) => entity.target[t]!.notes)),
              ],
            },
          ],
          sourceTokens: calEntitySourceTokens(
            config.provider,
            config.model,
            entity,
          ),
          expectedTokens: expectedTokens * group.length,
        });
      }
    } else {
      let currentExpectedTokens = expectedTokens;
      let currentSourceTokens = calEntitySourceTokens(
        config.provider,
        config.model,
        entity,
      );
      let similarEntities = [entity];
      for (let remainingEntity of remainings) {
        const remainingTargetLanguages = remainingEntity.untranslatedLanguages;
        if (
          remainingEntity.source.code === entity.source.code &&
          remainingTargetLanguages.join(', ') === targetLanguages.join(', ')
        ) {
          const expectedTokens =
            calEntityExpectedTokens(
              config.provider,
              config.model,
              remainingEntity,
            ) * remainingTargetLanguages.length;
          if (currentExpectedTokens + expectedTokens > maxSafeTokens) {
            break;
          } else {
            similarEntities.push(remainingEntity);
            remainings.delete(remainingEntity);
            currentExpectedTokens += expectedTokens;
            currentSourceTokens += calEntitySourceTokens(
              config.provider,
              config.model,
              remainingEntity,
            );
          }
        }
      }
      batches.push({
        sourceLanguage: entity.source.code,
        targetLanguages: targetLanguages,
        contents: similarEntities.map((e) => ({
          key: e.key,
          source: e.source.value,
          notes: [
            ...new Set(targetLanguages.flatMap((t) => entity.target[t]!.notes)),
          ],
        })),
        sourceTokens: currentSourceTokens,
        expectedTokens: currentExpectedTokens,
      });
    }
  }
  return batches;
}
