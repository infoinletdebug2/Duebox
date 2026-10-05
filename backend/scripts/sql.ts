/**
 * Run one SQL statement with the service key — for tests that need to bend
 * time (e.g. pull a reminder into the past). Never used by the app.
 *
 *   npx tsx --env-file=.dev.vars scripts/sql.ts "UPDATE … WHERE id = $1" '["<uuid>"]'
 */
import { XenitionClient, snakeRows } from '@xenition/sdk';

const [sql, params] = process.argv.slice(2);
if (!sql) throw new Error('usage: sql.ts "<sql>" [json-params]');
const client = new XenitionClient(process.env.XENITION_API_KEY!, { baseUrl: process.env.XENITION_API_URL });
const result = await client.query.raw<Record<string, unknown>>(sql, params ? JSON.parse(params) : []);
console.log(JSON.stringify(snakeRows(result.data ?? [])));
