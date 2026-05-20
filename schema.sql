-- ════════════════════════════════════════════════════════════
-- SOLOMON DB — Schema
-- Executar no PostgreSQL do Railway após criar o serviço
-- ════════════════════════════════════════════════════════════

-- Usuários
CREATE TABLE IF NOT EXISTS usuarios (
  id          SERIAL PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- Magic links (login sem senha)
CREATE TABLE IF NOT EXISTS magic_links (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  token       TEXT UNIQUE NOT NULL,
  expira_em   TIMESTAMPTZ NOT NULL,
  usado       BOOLEAN DEFAULT FALSE,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- Sessões de autenticação (30 dias)
CREATE TABLE IF NOT EXISTS sessoes_auth (
  id          SERIAL PRIMARY KEY,
  usuario_id  INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  token       TEXT UNIQUE NOT NULL,
  expira_em   TIMESTAMPTZ NOT NULL,
  criado_em   TIMESTAMPTZ DEFAULT NOW()
);

-- Diário de manifestações
CREATE TABLE IF NOT EXISTS diario (
  id            SERIAL PRIMARY KEY,
  usuario_id    INTEGER REFERENCES usuarios(id) ON DELETE CASCADE,
  dados         JSONB,
  sentimento    TEXT,
  intencao      TEXT,
  grabovoi      TEXT,
  selo          TEXT,
  freq_nome     TEXT,
  freq_hz       NUMERIC,
  solfeggio_hz  NUMERIC,
  duracao_min   INTEGER,
  criado_em     TIMESTAMPTZ DEFAULT NOW()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_diario_usuario    ON diario(usuario_id);
CREATE INDEX IF NOT EXISTS idx_diario_criado     ON diario(criado_em DESC);
CREATE INDEX IF NOT EXISTS idx_magic_token       ON magic_links(token);
CREATE INDEX IF NOT EXISTS idx_sessoes_token     ON sessoes_auth(token);
CREATE INDEX IF NOT EXISTS idx_sessoes_usuario   ON sessoes_auth(usuario_id);

-- Limpeza automática de tokens expirados (rodar periodicamente ou via cron)
-- DELETE FROM magic_links WHERE expira_em < NOW();
-- DELETE FROM sessoes_auth WHERE expira_em < NOW();
