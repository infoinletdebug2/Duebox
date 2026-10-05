import type { Context } from 'hono';
import { env, readEnvVar, AppError } from './lib';
import { openRouterBaseUrl, readerModel, readerTimeoutMs } from './config';
import { EXTRACTION_SCHEMA, coerceExtraction, extractionInstructions, parseModelJson, type Candidate } from './logic/extract';

/**
 * The document reader — the ONLY call to the AI provider (ARCHITECTURE §3.1).
 *
 * Privacy (BR-10): `provider.data_collection = 'deny'` restricts OpenRouter
 * to providers that neither retain nor train on prompts. Nothing from the
 * document is logged — only model, page count, duration and an error class.
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

export function readerConfigured(c: Context): boolean {
  return Boolean(readEnvVar(c, 'OPENROUTER_API_KEY'));
}

export async function readDocument(c: Context, pages: ReaderPage[], today: string): Promise<{ candidates: Candidate[]; model: string; ms: number }> {
  const key = readEnvVar(c, 'OPENROUTER_API_KEY');
  if (!key) throw new AppError('READER_UNAVAILABLE', 'Reading letters is not set up on this server yet. You can type it in instead.', 503);

  const model = readerModel(env(c));
  const content: unknown[] = [{ type: 'text', text: extractionInstructions(today) }];
  pages.forEach((page, i) => {
    if (page.mime === 'application/pdf') {
      content.push({ type: 'file', file: { filename: `document-${i + 1}.pdf`, file_data: page.url } });
    } else {
      content.push({ type: 'image_url', image_url: { url: page.url } });
    }
  });

  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), readerTimeoutMs(env(c)));
  let response: Response;
  try {
    response = await fetch(`${openRouterBaseUrl(env(c))}/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', 'x-title': 'Duebox' },
      body: JSON.stringify({
        model,
        temperature: 0,
        max_tokens: 2000,
        provider: { data_collection: 'deny' },
        response_format: { type: 'json_schema', json_schema: { name: 'deadlines', strict: true, schema: EXTRACTION_SCHEMA } },
        messages: [{ role: 'user', content }],
      }),
    });
  } catch (error) {
    console.error('reader: request failed', { model, pages: pages.length, ms: Date.now() - started, kind: (error as Error)?.name });
    throw new ReadFailed((error as Error)?.name === 'AbortError' ? 'timeout' : 'unreadable');
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    console.error('reader: provider error', { model, status: response.status, ms: Date.now() - started });
    if (response.status === 401 || response.status === 402 || response.status === 403) {
      throw new AppError('READER_UNAVAILABLE', 'Reading letters is not working on this server right now. You can type it in instead.', 503);
    }
    throw new ReadFailed('unreadable');
  }

  const body = (await response.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
  const raw = body?.choices?.[0]?.message?.content;
  const text = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw.map((p) => (p as { text?: string }).text ?? '').join('') : '';
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
