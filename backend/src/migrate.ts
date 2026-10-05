import { XenitionClient } from '@xenition/sdk';
import { APP_MIGRATIONS } from './schema';
import { fromProcess, productCatalog } from './config';

/**
 * The deploy step — once per deploy, before traffic. Idempotent; an applied
 * migration's SQL can never be edited (content-addressed ledger).
 */
async function main(): Promise<void> {
  const key = process.env.XENITION_API_KEY;
  if (!key) throw new Error('migrate: XENITION_API_KEY (a service key) is required.');
  const client = new XenitionClient(key, { baseUrl: process.env.XENITION_API_URL });

  process.stdout.write(`applying ${APP_MIGRATIONS.length} migrations… `);
  const result = await client.migrations.apply(APP_MIGRATIONS);
  console.log(`${result.applied.length} applied, ${result.skipped.length} already present`);
  for (const id of result.applied) console.log(`  + ${id}`);

  process.stdout.write('enabling billing… ');
  await client.modules.enable('billing');
  console.log('ok');

  const catalog = productCatalog(fromProcess);
  process.stdout.write(`declaring ${catalog.length} products… `);
  for (const product of catalog) await client.modules.billing.defineProduct(product);
  console.log('ok\n\ndone.');
}

main().catch((err) => {
  console.error('\nmigrate failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
