import { serve } from '@hono/node-server';
import worker from './index';

/** Local dev server — starts in a second; `wrangler dev` is the higher-fidelity option. */
const port = Number(process.env.PORT ?? 8787);

serve({ fetch: worker.fetch, port }, (info) => {
  console.log(`duebox backend on http://localhost:${info.port}`);
  console.log('  health   GET  /health');
  console.log('  api      ALL  /api/v1/*');
});
