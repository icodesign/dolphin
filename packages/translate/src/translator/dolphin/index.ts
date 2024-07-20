import { Config, TranslationProvider } from '@repo/base/config';
import { logger } from '@repo/base/logger';
import { ObjectStreamPart } from 'ai';
import fetch from 'node-fetch';
import z from 'zod';

import { TranslationBatch, createBatches } from '../../batch.js';
import { LocalizationEntity } from '../../entity.js';
import { calTokens } from '../../utils.js';
import { Translator } from '../index.js';

export type DolphinTokenUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export class DolphinAPITranslator implements Translator {
  usage: DolphinTokenUsage;
  maxRetry: number;
  baseModel = 'gpt-4'; // this is not the real model used for translation, but for token calculation when creating batches

  constructor(
    private apiBaseUrl: string,
    private provider: TranslationProvider,
    private maxTokens: number,
    private buffer: number,
    maxRetry: number = 1,
  ) {
    this.usage = {
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
    };
    this.maxRetry = maxRetry;
  }

  async translate(
    entities: LocalizationEntity[],
    config: Config,
    onProgress?: (progress: number) => void,
  ): Promise<LocalizationEntity[]> {
    if (entities.length === 0) {
      logger.info(`No entity to translate`);
      return [];
    }

    const batches = createBatches(entities, {
      maxTokens: this.maxTokens,
      buffer: this.buffer,
      provider: this.provider,
      model: this.baseModel,
    });

    let totalCount = batches.reduce(
      (total, batch) =>
        total + batch.contents.length * batch.targetLanguages.length,
      0,
    );
    let translatedCount = 0;
    const maxPercentage = 0.92 + Math.random() * 0.08;

    logger.info(
      `Translating ${batches.length} batches with dolphin api agent <${this.provider}>...`,
    );
    let failedBatches: TranslationBatch[] = [];
    for (let [batchIndex, batch] of batches.entries()) {
      logger.info(
        `Translating batch<${batchIndex}>: ${
          batch.sourceLanguage
        } -> ${batch.targetLanguages.join(', ')}`,
      );
      const firstTargetLanguage = batch.targetLanguages[0];
      if (!firstTargetLanguage) {
        continue;
      }
      let currentRetry = 1;
      let translatedContents: Record<string, Record<string, string>> = {};
      let latestError: Error | undefined;
      while (currentRetry <= this.maxRetry) {
        try {
          translatedContents = await this.translateBatch({
            batch,
            config,
            translatedCount,
            totalCount,
            maxPercentage,
            onProgress,
          });
          break;
        } catch (error) {
          logger.error(
            `Failed to translate, retrying ${currentRetry}/${this.maxRetry}, error: ${error}`,
          );
          latestError = error as Error;
        }
        currentRetry += 1;
      }
      if (currentRetry > this.maxRetry) {
        logger.error(
          `Failed to translate batch<${batchIndex}> after ${
            this.maxRetry
          } retries. Latest error: ${JSON.stringify(
            latestError,
          )}. Skip to next batch. Please view the logs for more details.`,
        );
        failedBatches.push(batch);
        continue;
      }
      for (const key in translatedContents) {
        const translated = translatedContents[key]!;
        for (const entity of entities) {
          if (entity.key === key) {
            for (const lang in translated) {
              if (!entity.target) {
                entity.target = {};
              }
              entity.target[lang] = {
                value: translated[lang]!,
                state: 'translated',
                notes: entity.target[lang]?.notes || [],
              };
            }
          }
        }
      }
      translatedCount += batch.targetLanguages.length * batch.contents.length;

      if (onProgress) {
        onProgress(translatedCount / totalCount);
      }
    }

    if (failedBatches.length > 0) {
      logger.warn(`Failed to translate ${failedBatches.length} batches`);
      for (const batch of failedBatches) {
        logger.warn(
          `Failed batch: ${batch.sourceLanguage} -> ${batch.targetLanguages.join(
            ', ',
          )}`,
        );
      }
    }
    return entities;
  }

  additionalInfo() {
    return {
      usage: this.usage,
    };
  }

  private async translateBatch({
    batch,
    config,
    translatedCount,
    totalCount,
    maxPercentage,
    onProgress,
  }: {
    batch: TranslationBatch;
    config: Config;
    translatedCount: number;
    totalCount: number;
    maxPercentage: number;
    onProgress?: (progress: number) => void;
  }) {
    const url = new URL(this.apiBaseUrl);
    url.pathname += url.pathname.endsWith('/') ? 'localize' : '/localize';
    logger.info(`Sending localize request to ${url}`);
    const response = await fetch(url, {
      method: 'POST',
      body: JSON.stringify({
        provider: this.provider,
        context: config.globalContext,
        sourceLanguage: batch.sourceLanguage,
        targetLanguages: batch.targetLanguages,
        contents: batch.contents.map((e) => ({
          key: e.key,
          source: e.source,
          notes: e.notes || [],
        })),
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (response.status < 200 || response.status >= 400 || !response.body) {
      try {
        const body = await response.text();
        throw new Error(
          `Failed to translate: ${response.status}, body: ${body}`,
        );
      } catch (error) {
        throw new Error(
          `Failed to translate: ${response.status}, error: ${error}`,
        );
      }
    }
    const expectedChunkTokenCount = batch.expectedTokens * (1 + this.buffer);
    let receivedChunkTokenCount = 0;
    const TranslationReponseSchema = z.record(
      z.string(),
      z.record(
        z.enum([batch.targetLanguages[0], ...batch.targetLanguages.slice(1)]),
        z.string(),
      ),
    );
    let translationResponse:
      | z.infer<typeof TranslationReponseSchema>
      | undefined;
    let latestObjectChunk: string | undefined; // for error logging only
    try {
      for await (const chunk of response.body) {
        const objectChunks = chunk
          .toString()
          .split('\n')
          .filter((s) => s.trim().length > 0);
        for (const objectChunkString of objectChunks) {
          const object = JSON.parse(objectChunkString) as ObjectStreamPart<
            z.infer<typeof TranslationReponseSchema>
          >;
          if (object.type === 'error') {
            throw new Error(
              `Failed to translate: ${object.error}, error: ${object.error}, response object: ${objectChunkString}`,
            );
          } else if (object.type === 'finish') {
            this.usage = {
              promptTokens: this.usage.promptTokens + object.usage.promptTokens,
              completionTokens:
                this.usage.completionTokens + object.usage.completionTokens,
              totalTokens: this.usage.totalTokens + object.usage.totalTokens,
            };
          } else if (object.type === 'object') {
            latestObjectChunk = objectChunkString;
            const parseResult = await TranslationReponseSchema.safeParseAsync(
              object.object,
            );
            if (!parseResult.success) {
              // we didn't get expected object for now, wait for more chunks
              logger.warn(
                `Failed to parse object chunk: ${objectChunkString}, error: ${parseResult.error}`,
              );
              continue;
            } else {
              translationResponse = parseResult.data;
              receivedChunkTokenCount += calTokens(
                this.provider,
                this.baseModel,
                JSON.stringify(object.object),
              );
              if (onProgress) {
                onProgress(
                  translatedCount / totalCount +
                    Math.min(
                      receivedChunkTokenCount / expectedChunkTokenCount,
                      ((batch.contents.length * batch.targetLanguages.length) /
                        totalCount) *
                        maxPercentage,
                    ),
                );
              }
            }
          }
        }
      }
    } catch (err) {
      throw new Error(`Failed to load streaming api response: ${err}`);
    }
    if (!translationResponse) {
      throw new Error(
        `Failed to receive translation response object, latest object chunk: ${latestObjectChunk}`,
      );
    }
    return translationResponse;
  }
}
