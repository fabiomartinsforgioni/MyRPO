// @ts-ignore -- módulo nativo do Node 24, sem declarações na Alpha.
import { env } from 'node:process';
// @ts-ignore -- módulo nativo do Node 24, sem declarações na Alpha.
import { fileURLToPath } from 'node:url';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createApi } from './app.js';

const mode: unknown = env.MYRPO_MODE;
if (mode !== undefined && mode !== 'DEMO' && mode !== 'POSTGRES') {
  throw new Error('MYRPO_MODE deve ser DEMO ou POSTGRES.');
}
if (env.NODE_ENV === 'production' && mode !== 'POSTGRES') {
  throw new Error('Ambiente hospedado exige persistência PostgreSQL.');
}
if (mode === 'POSTGRES') {
  const origin = env.MYRPO_ORIGIN;
  if (!origin || new URL(origin).origin !== origin || !origin.startsWith('https://')) {
    throw new Error('Configure MYRPO_ORIGIN com a origem HTTPS da homologação.');
  }
  const port = Number(env.PORT ?? '10000');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT inválida.');
  const { connectPostgres } = await import('./beta/postgres-runtime.js');
  const runtime = await connectPostgres(env.MYRPO_DATABASE_URL, env.MYRPO_CSRF_KEY);
  try {
    const app = await createApi({}, { mode, origin, identity: runtime.identity }) as NestExpressApplication;
    app.useStaticAssets(fileURLToPath(new URL('../../myrpo/browser/', import.meta.url)));
    await app.listen(port, '0.0.0.0');
  } catch (error) {
    await runtime.close();
    throw error;
  }
} else {
  const app = await createApi({}, mode === undefined ? undefined : { mode, origin: env.MYRPO_ORIGIN });
  await app.listen(3000, '127.0.0.1');
}
