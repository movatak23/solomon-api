// setup-db.js — roda uma vez para criar as tabelas
// Execute: node setup-db.js
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

const schema = `
CREATE TABLE IF NOT EXISTS usuarios (
  id        SERIAL PRIMARY KEY,
  email     TEXT UNIQUE NOT NULL,
  criado_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS magic_links (
  id         SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  token      TEXT UNIQUE NOT NULL,
  expira_em  TIMESTAMPTZ NOT NULL,
  usado      BOOLEAN DEFAULT FALSE,
  criado_em  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessoes_auth (
  id         SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  email      TEXT NOT NULL,
  token      TEXT UNIQUE NOT NULL,
  expira_em  TIMESTAMPTZ NOT NULL,
  criado_em  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS diario (
  id           SERIAL PRIMARY KEY,
  usuario_id   INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  dados        JSONB,
  sentimento   TEXT,
  intencao     TEXT,
  grabovoi     TEXT,
  selo         TEXT,
  freq_nome    TEXT,
  freq_hz      NUMERIC,
  solfeggio_hz NUMERIC,
  duracao_min  INTEGER,
  criado_em    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_diario_usuario  ON diario(usuario_id);
CREATE INDEX IF NOT EXISTS idx_diario_criado   ON diario(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_magic_token     ON magic_links(token);
CREATE INDEX IF NOT EXISTS idx_sessoes_token   ON sessoes_auth(token);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario ON sessoes_auth(usuario_id);
`;

async function setup() {
  const client = await pool.connect();
  try {
    console.log('Criando tabelas...');
    await client.query(schema);
    console.log('Tabelas criadas com sucesso!');
  } catch (e) {
    console.error('Erro:', e.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

setup();
