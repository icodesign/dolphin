import { ApiError, ApiErrorCode, withApiHandler } from '@/lib/response';
import { openai } from '@ai-sdk/openai';
import { ObjectStreamPart, StreamingTextResponse, streamObject } from 'ai';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fromZodError } from 'zod-validation-error';

export const runtime = 'edge';

export const dynamic = 'force-dynamic';

const RequestPayloadSchema = z.object({
  provider: z.enum(['openai']),
  model: z.optional(z.string()),
  context: z.optional(z.string()),
  sourceLanguage: z.string(),
  targetLanguages: z.array(z.string()),
  contents: z.array(
    z.object({
      key: z.string(),
      source: z.string(),
      notes: z.optional(z.array(z.string())),
    }),
  ),
});

type RequestPayload = z.infer<typeof RequestPayloadSchema>;

export async function POST(...params: any): Promise<any> {
  return withApiHandler(handlePOSTRequest)(...params);
}

async function handlePOSTRequest(request: NextRequest): Promise<any> {
  let requestJSON;
  try {
    requestJSON = await request.json();
  } catch (error) {
    throw new ApiError(
      ApiErrorCode.BAD_REQUEST,
      'Failed to parse request JSON',
    );
  }
  const requestBody = await RequestPayloadSchema.safeParseAsync(requestJSON);
  if (!requestBody.success) {
    const validationError = fromZodError(requestBody.error);
    throw new ApiError(ApiErrorCode.BAD_REQUEST, validationError.message);
  }
  const payload: RequestPayload = requestBody.data;
  const model = openai('gpt-4o-mini');
  let instructions = `As an app/website translator, your task is to translate texts to target languages, considering context and developer notes for accuracy and cultural appropriateness. It's essential to preserve original format, including line breaks, separators, escaping characters and localization symbols, otherwise, user interface may break.\nSource texts are in key=value format. Translate only the 'value', keeping the 'key' as is. Lines starting with "//" are developer notes for translation guidance.\nFor example, 'key=Hello "%@"\\nWelcome!' can be translate to 'key=你好 "%@"\\n欢迎!' in Chinese. \nOutput should be in JSON format: each source key links to an object with target languages as keys and translated texts as values. \n`;
  if (payload.context) {
    instructions += `\nTranslation context: \n${payload.context}\n`;
  }
  let userContent = `Translate from ${
    payload.sourceLanguage
  } to target languages: [${payload.targetLanguages.join(', ')}].\n\n`;
  userContent += '=====\n\n';
  for (const content of payload.contents) {
    if (content.notes) {
      for (const note of content.notes) {
        userContent += `// ${note}\n`;
      }
    }
    userContent += `${content.key}=${content.source}\n\n`;
  }
  const TranslationReponseSchema = z.record(
    z.string(),
    z.record(
      z.enum([payload.targetLanguages[0], ...payload.targetLanguages.slice(1)]),
      z.string(),
    ),
  );
  const result = await streamObject({
    model,
    mode: 'json',
    schema: TranslationReponseSchema,
    system: instructions,
    prompt: userContent,
    onFinish: (e) => {
      console.log(`Finished translating, usage: ${e.usage}`);
    },
  });
  /**
   * Technically we can just wait for full response and return it as a single JSON,
   * but it may time out since it may take some time to process which may exceed some platform's (like Vecel) limit
   * Example of waiting for full response:
   * const object = await result.object;
   * const usage = await result.usage;
   */
  const stream = new ReadableStream({
    async start(controller) {
      for await (const streamObject of result.fullStream) {
        const chunk = JSON.stringify(streamObject) + '\n'; // Format each chunk
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });

  return new StreamingTextResponse(stream, {
    headers: { 'Content-Type': 'application/json' },
  });
}
