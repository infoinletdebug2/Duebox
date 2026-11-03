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
  console.log('ok');

  // Store keys the pipeline cannot install on the Worker (src/vault.ts): sealed with the service key.
  const { VAULT_NAMES, sealSecret, openSecret } = await import('./vault');
  for (const name of VAULT_NAMES) {
    const value = process.env[name]?.trim();
    if (!value) continue;
    const cur = (await client.raw<{ iv: string; ct: string }>(`SELECT iv, ciphertext AS ct FROM dx__provider_secret WHERE name = $1`, [name])).data?.[0];
    if (cur) {
      try {
        if ((await openSecret(key, name, cur.iv, cur.ct)) === value) {
          console.log(`  ${name} already in the vault`);
          continue;
        }
      } catch {
        /* re-seal below */
      }
    }
    const sealed = await sealSecret(key, name, value);
    await client.raw(
      `INSERT INTO dx__provider_secret (name, iv, ciphertext) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET iv = EXCLUDED.iv, ciphertext = EXCLUDED.ciphertext, updated_at = now()`,
      [name, sealed.iv, sealed.ct],
    );
    console.log(`  ${name} sealed into the vault`);
  }
  console.log('\ndone.');
}

main().catch((err) => {
  console.error('\nmigrate failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
