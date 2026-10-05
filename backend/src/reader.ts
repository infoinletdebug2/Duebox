import type { Context } from 'hono';
import { XenitionError, type ChatContentPart } from '@xenition/sdk';
import { env, sdk, AppError } from './lib';
import { readerModel } from './config';
import { EXTRACTION_SCHEMA, coerceExtraction, extractionInstructions, parseModelJson, type Candidate } from './logic/extract';

/**
 * The document reader — the ONLY call to an AI model (ARCHITECTURE §3.1).
 *
 * It goes through the platform: `client.ai.chat` with the page images (or a
 * PDF) as content parts. The OpenRouter key is the app's own AI key stored
 * in Xenition (registered with `scripts/ai-key.ts`, or Manage → AI) — never
 * in this worker and never on the phone.
 *
 * Privacy (BR-10): `noDataRetention` — the platform routes only to providers
 * that neither retain nor train on prompts, and refuses any lane that cannot
 * promise it. Nothing from the document is logged — only model, page count,
 * duration and an error class.
 */

export interface ReaderPage {
  url: string;
  mime: 'image/jpeg' | 'application/pdf';
}

export type ReadError = 'no_date' | 'unreadable' | 'not_document' | 'timeout';

export class ReadFailed extends Error {
  constructor(readonly reason: ReadError) {
    super(reason);
    this.name = 'ReadFailed';
  }
}

/** Reading needs only the platform; whether an AI key is set up is the platform's answer (503 below). */
export function readerConfigured(c: Context): boolean {
  return Boolean(env(c)('XENITION_API_KEY'));
}

export async function readDocument(c: Context, pages: ReaderPage[], today: string): Promise<{ candidates: Candidate[]; model: string; ms: number }> {
  const model = readerModel(env(c));
  const content: ChatContentPart[] = [{ type: 'text', text: extractionInstructions(today) }];
  pages.forEach((page, i) => {
    if (page.mime === 'application/pdf') {
      content.push({ type: 'file', file: { filename: `document-${i + 1}.pdf`, file_data: page.url } });
    } else {
      content.push({ type: 'image_url', image_url: { url: page.url } });
    }
  });

  const started = Date.now();
  let text: string;
  try {
    const reply = await sdk(c).ai.chat([{ role: 'user', content }], {
      model,
      provider: 'openrouter',
      temperature: 0,
      maxTokens: 2000,
      noDataRetention: true,
      responseFormat: { type: 'json_schema', name: 'deadlines', schema: EXTRACTION_SCHEMA as unknown as Record<string, unknown> },
    });
    text = reply.message?.content ?? '';
  } catch (error) {
    const status = error instanceof XenitionError ? error.status : undefined;
    const code = error instanceof XenitionError ? error.code : (error as Error)?.name;
    console.error('reader: request failed', { model, pages: pages.length, ms: Date.now() - started, code, status });
    // No AI key on the app, a rejected key, or a lane that cannot keep the
    // no-retention promise: reading is not set up — typing a deadline in still works.
    if (status === 400 || status === 401 || status === 402 || status === 403 || status === 503) {
      throw new AppError('READER_UNAVAILABLE', 'Reading letters is not working on this server right now. You can type it in instead.', 503);
    }
    throw new ReadFailed(code === 'TIMEOUT' || code === 'AbortError' || status === 504 ? 'timeout' : 'unreadable');
  }

  const json = parseModelJson(text);
  const ms = Date.now() - started;
  console.log('reader: done', { model, pages: pages.length, ms, parsed: Boolean(json) });
  if (!json) throw new ReadFailed('unreadable');

  const candidates = coerceExtraction(json, today);
  if (candidates.length === 0) {
    const type = (json as { documentType?: string }).documentType;
    throw new ReadFailed(type === 'other' ? 'not_document' : 'no_date');
  }
  return { candidates, model, ms };
}
