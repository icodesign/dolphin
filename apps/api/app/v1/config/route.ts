import { LLMProviderConfig } from '@repo/base/config';
import { NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET() {
  const config: LLMProviderConfig = {
    provider: 'openai',
    maxOutputTokens: 16383,
    buffer: 0.3,
    maxRetry: 1,
  };
  return NextResponse.json(config);
}
