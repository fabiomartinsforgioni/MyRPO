// @ts-ignore -- o contrato local de conexão cobre as operações usadas do driver.
import pg from 'pg';
import { PostgresIdentity } from './postgres-identity.js';
import { transaction } from './postgres.js';
import type { Pool } from './postgres.js';

type RuntimePool = Pool & { end(): Promise<void> };

export async function connectPostgres(connectionUrl: string | undefined, csrfSecret: string | undefined) {
  if (!connectionUrl || !csrfSecret || !/^[a-f0-9]{64}$/i.test(csrfSecret)) {
    throw new Error('Configure MYRPO_DATABASE_URL e MYRPO_CSRF_KEY para a homologação.');
  }
  let address: URL;
  try {
    address = new URL(connectionUrl);
  } catch {
    throw new Error('A URL da conexão PostgreSQL é inválida.');
  }
  if (!['postgresql:', 'postgres:'].includes(address.protocol) || !address.username || !address.password) {
    throw new Error('A URL da conexão PostgreSQL é inválida.');
  }
  // O TLS é configurado pelo driver. Evita que opções da URL substituam essa configuração.
  address.search = '';
  const key = Uint8Array.from(csrfSecret.match(/.{2}/g)!, pair => Number.parseInt(pair, 16));
  const pool: RuntimePool = new pg.Pool({
    connectionString: address.toString(),
    ssl: { rejectUnauthorized: true },
    enableChannelBinding: true,
    max: 4,
    connectionTimeoutMillis: 8_000,
    options: '-c statement_timeout=8000',
  });
  try {
    await transaction(pool, async db => {
      const result = await db.query<{ privileged: boolean; latest: number }>(
        `SELECT EXISTS (
            SELECT 1 FROM pg_catalog.pg_roles AS r
             WHERE pg_has_role(current_user, r.oid, 'MEMBER')
               AND (r.rolsuper OR r.rolbypassrls OR r.rolcreaterole OR r.rolcreatedb
                 OR EXISTS (SELECT 1 FROM pg_catalog.pg_class AS c
                             JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
                            WHERE c.relowner = r.oid AND n.nspname = 'myrpo'))
          ) AS privileged, (SELECT max(version) FROM myrpo.schema_migrations) AS latest`,
      );
      if (result.rows[0]?.privileged || result.rows[0]?.latest !== 5) {
        throw new Error('O banco deve ter as migrations 001–005 e um papel de execução restrito.');
      }
    });
    return { identity: new PostgresIdentity(pool, key), close: () => pool.end() };
  } catch {
    await pool.end();
    throw new Error('Falha na conexão ou na verificação do papel e das migrations do PostgreSQL.');
  }
}
