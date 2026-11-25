// @ts-ignore -- módulo nativo do Node 24, sem declarações na Alpha.
import { env } from 'node:process';
import { createApi } from './app.js';

const mode: unknown = env.MYRPO_MODE;
if (mode !== undefined && mode !== 'DEMO' && mode !== 'POSTGRES') {
  throw new Error('MYRPO_MODE deve ser DEMO ou POSTGRES.');
}
if (env.NODE_ENV === 'production' && mode !== 'POSTGRES') {
  throw new Error('Ambiente hospedado exige persistência PostgreSQL.');
}
const app = await createApi({}, mode === undefined ? undefined : { mode, origin: env.MYRPO_ORIGIN });
await app.listen(3000, '127.0.0.1');
