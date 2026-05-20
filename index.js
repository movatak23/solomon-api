const express = require('express');
const { Pool } = require('pg');
const crypto = require('crypto');
const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// ── CORS ──
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── DB ──
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// ── RESEND ──
async function sendEmail(to, subject, html) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
    },
    body: JSON.stringify({
      from: 'Solomon <noreply@solomonapp.com.br>',
      to,
      subject,
      html,
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Resend error: ${err}`);
  }
  return res.json();
}

// ── MIDDLEWARE AUTH ──
async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'Token ausente.' });
  try {
    const { rows } = await pool.query(
      'SELECT usuario_id, email FROM sessoes_auth WHERE token = $1 AND expira_em > NOW()',
      [token]
    );
    if (!rows.length) return res.status(401).json({ error: 'Token inválido ou expirado.' });
    req.userId = rows[0].usuario_id;
    req.userEmail = rows[0].email;
    next();
  } catch (e) {
    console.error('requireAuth error:', e.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
}

// ════════════════════════════════════════════════════════════
// HEALTH
// ════════════════════════════════════════════════════════════
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Solomon DB', version: '1.0.0' });
});

// ════════════════════════════════════════════════════════════
// AUTH — Magic Link
// ════════════════════════════════════════════════════════════

// POST /auth/login — solicita magic link
app.post('/auth/login', async (req, res) => {
  const { email } = req.body;
  if (!email || !email.includes('@')) {
    return res.status(400).json({ error: 'Email inválido.' });
  }

  try {
    // Upsert usuário
    await pool.query(
      `INSERT INTO usuarios (email, criado_em)
       VALUES ($1, NOW())
       ON CONFLICT (email) DO NOTHING`,
      [email.toLowerCase().trim()]
    );

    const { rows: [user] } = await pool.query(
      'SELECT id FROM usuarios WHERE email = $1',
      [email.toLowerCase().trim()]
    );

    // Gerar token de 32 bytes
    const token = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos

    await pool.query(
      `INSERT INTO magic_links (usuario_id, email, token, expira_em, usado)
       VALUES ($1, $2, $3, $4, false)`,
      [user.id, email.toLowerCase().trim(), token, expira]
    );

    const link = `${process.env.APP_URL || 'https://solomon-db-production.up.railway.app'}/auth/verify?token=${token}`;

    await sendEmail(
      email,
      '✦ Seu acesso ao Solomon',
      `
      <div style="font-family:Georgia,serif;background:#0a0608;color:#f0e8d8;padding:40px;border-radius:8px;max-width:480px;margin:0 auto;">
        <h1 style="color:#c9a84c;font-size:24px;letter-spacing:2px;text-align:center;">SOLOMON</h1>
        <p style="text-align:center;color:#c0b090;font-style:italic;margin-bottom:32px;">frequências de manifestação</p>
        <p>Clique no botão abaixo para acessar sua conta. O link expira em <strong>15 minutos</strong>.</p>
        <div style="text-align:center;margin:32px 0;">
          <a href="${link}" style="background:#c9a84c;color:#0a0608;padding:14px 32px;border-radius:4px;text-decoration:none;font-family:Georgia,serif;letter-spacing:2px;font-size:14px;">✦ ACESSAR SOLOMON</a>
        </div>
        <p style="font-size:12px;color:#7a6230;">Se você não solicitou este acesso, ignore este email.</p>
      </div>
      `
    );

    res.json({ ok: true, message: 'Link enviado para ' + email });
  } catch (e) {
    console.error('login error:', e.message);
    res.status(500).json({ error: 'Erro ao enviar email. Tente novamente.' });
  }
});

// GET /auth/verify?token=xxx — valida magic link e retorna session token
app.get('/auth/verify', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token ausente.' });

  try {
    const { rows } = await pool.query(
      `SELECT ml.usuario_id, ml.email, ml.expira_em, ml.usado
       FROM magic_links ml
       WHERE ml.token = $1`,
      [token]
    );

    if (!rows.length) return res.status(400).json({ error: 'Link inválido.' });
    const link = rows[0];
    if (link.usado) return res.status(400).json({ error: 'Link já utilizado.' });
    if (new Date(link.expira_em) < new Date()) return res.status(400).json({ error: 'Link expirado.' });

    // Marcar como usado
    await pool.query('UPDATE magic_links SET usado = true WHERE token = $1', [token]);

    // Criar session token (30 dias)
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expira = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

    await pool.query(
      `INSERT INTO sessoes_auth (usuario_id, email, token, expira_em)
       VALUES ($1, $2, $3, $4)`,
      [link.usuario_id, link.email, sessionToken, expira]
    );

    // Retornar token como JSON e redirecionar para o app
    const appUrl = process.env.APP_REDIRECT_URL || 'solomonapp://auth';
    res.redirect(`${appUrl}?token=${sessionToken}&email=${encodeURIComponent(link.email)}`);
  } catch (e) {
    console.error('verify error:', e.message);
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// POST /auth/logout
app.post('/auth/logout', requireAuth, async (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  await pool.query('DELETE FROM sessoes_auth WHERE token = $1', [token]);
  res.json({ ok: true });
});

// GET /auth/me — retorna dados do usuário logado
app.get('/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, email, criado_em FROM usuarios WHERE id = $1',
      [req.userId]
    );
    if (!rows.length) return res.status(404).json({ error: 'Usuário não encontrado.' });
    res.json({ ok: true, usuario: rows[0] });
  } catch (e) {
    res.status(500).json({ error: 'Erro interno.' });
  }
});

// ════════════════════════════════════════════════════════════
// DIÁRIO — Sessões
// ════════════════════════════════════════════════════════════

// POST /diario — salvar sessão
app.post('/diario', requireAuth, async (req, res) => {
  const { sessao } = req.body;
  if (!sessao || typeof sessao !== 'object') {
    return res.status(400).json({ error: 'Dados da sessão inválidos.' });
  }

  try {
    const { rows: [saved] } = await pool.query(
      `INSERT INTO diario (usuario_id, dados, sentimento, intencao, grabovoi, selo, freq_nome, freq_hz, solfeggio_hz, duracao_min, criado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id, criado_em`,
      [
        req.userId,
        JSON.stringify(sessao),
        sessao.feeling || null,
        sessao.intention || null,
        sessao.grabovoi || null,
        sessao.seal || null,
        sessao.freqName || null,
        sessao.binauralHz || null,
        sessao.solfeggioHz || null,
        sessao.durationMin || null,
        sessao.date ? new Date(sessao.date) : new Date(),
      ]
    );
    res.json({ ok: true, id: saved.id, criado_em: saved.criado_em });
  } catch (e) {
    console.error('POST /diario error:', e.message);
    res.status(500).json({ error: 'Erro ao salvar sessão.' });
  }
});

// GET /diario — listar sessões do usuário
app.get('/diario', requireAuth, async (req, res) => {
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  try {
    const { rows } = await pool.query(
      `SELECT id, dados, sentimento, intencao, grabovoi, selo, freq_nome, freq_hz, solfeggio_hz, duracao_min, criado_em
       FROM diario
       WHERE usuario_id = $1
       ORDER BY criado_em DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );
    const { rows: [{ count }] } = await pool.query(
      'SELECT COUNT(*) as count FROM diario WHERE usuario_id = $1',
      [req.userId]
    );
    res.json({ ok: true, entries: rows, total: parseInt(count), limit, offset });
  } catch (e) {
    console.error('GET /diario error:', e.message);
    res.status(500).json({ error: 'Erro ao buscar sessões.' });
  }
});

// DELETE /diario/:id — deletar uma sessão
app.delete('/diario/:id', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM diario WHERE id = $1 AND usuario_id = $2',
      [req.params.id, req.userId]
    );
    if (!rowCount) return res.status(404).json({ error: 'Sessão não encontrada.' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao deletar sessão.' });
  }
});

// DELETE /diario — limpar todo o diário do usuário
app.delete('/diario', requireAuth, async (req, res) => {
  try {
    const { rowCount } = await pool.query(
      'DELETE FROM diario WHERE usuario_id = $1',
      [req.userId]
    );
    res.json({ ok: true, deleted: rowCount });
  } catch (e) {
    res.status(500).json({ error: 'Erro ao limpar diário.' });
  }
});

// ════════════════════════════════════════════════════════════
// STATS — Estatísticas do usuário
// ════════════════════════════════════════════════════════════
app.get('/stats', requireAuth, async (req, res) => {
  try {
    const { rows: [totals] } = await pool.query(
      `SELECT
        COUNT(*) as total_sessoes,
        COALESCE(SUM(duracao_min), 0) as total_minutos,
        COALESCE(AVG(duracao_min), 0) as media_minutos
       FROM diario WHERE usuario_id = $1`,
      [req.userId]
    );

    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const { rows: [week] } = await pool.query(
      'SELECT COUNT(*) as esta_semana FROM diario WHERE usuario_id = $1 AND criado_em > $2',
      [req.userId, weekAgo]
    );

    const { rows: freqs } = await pool.query(
      `SELECT freq_nome, COUNT(*) as total
       FROM diario WHERE usuario_id = $1 AND freq_nome IS NOT NULL
       GROUP BY freq_nome ORDER BY total DESC LIMIT 6`,
      [req.userId]
    );

    const { rows: seals } = await pool.query(
      `SELECT selo, COUNT(*) as total
       FROM diario WHERE usuario_id = $1 AND selo IS NOT NULL
       GROUP BY selo ORDER BY total DESC LIMIT 6`,
      [req.userId]
    );

    // Streak — dias consecutivos
    const { rows: days } = await pool.query(
      `SELECT DISTINCT DATE(criado_em AT TIME ZONE 'America/Recife') as dia
       FROM diario WHERE usuario_id = $1
       ORDER BY dia DESC LIMIT 90`,
      [req.userId]
    );

    let streak = 0;
    let check = new Date();
    check.setHours(0, 0, 0, 0);
    for (const { dia } of days) {
      const d = new Date(dia);
      const diff = Math.floor((check - d) / 86400000);
      if (diff <= 1) { streak++; check = d; }
      else break;
    }

    res.json({
      ok: true,
      stats: {
        total_sessoes: parseInt(totals.total_sessoes),
        total_minutos: parseInt(totals.total_minutos),
        media_minutos: Math.round(parseFloat(totals.media_minutos)),
        esta_semana: parseInt(week.esta_semana),
        streak,
        frequencias: freqs,
        selos: seals,
      }
    });
  } catch (e) {
    console.error('GET /stats error:', e.message);
    res.status(500).json({ error: 'Erro ao calcular estatísticas.' });
  }
});

// ════════════════════════════════════════════════════════════
// SINCRONIZAÇÃO — importar diário local para nuvem
// ════════════════════════════════════════════════════════════
app.post('/diario/sync', requireAuth, async (req, res) => {
  const { entries } = req.body;
  if (!Array.isArray(entries) || !entries.length) {
    return res.status(400).json({ error: 'Nenhuma entrada para sincronizar.' });
  }

  let imported = 0;
  let skipped = 0;

  for (const e of entries.slice(0, 200)) {
    try {
      const date = e.date ? new Date(e.date) : new Date();
      // Verificar se já existe (por data + grabovoi)
      const { rows } = await pool.query(
        `SELECT id FROM diario
         WHERE usuario_id = $1
         AND ABS(EXTRACT(EPOCH FROM (criado_em - $2::timestamp))) < 60
         AND grabovoi = $3`,
        [req.userId, date, e.grabovoi || '']
      );
      if (rows.length) { skipped++; continue; }

      await pool.query(
        `INSERT INTO diario (usuario_id, dados, sentimento, intencao, grabovoi, selo, freq_nome, freq_hz, solfeggio_hz, duracao_min, criado_em)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          req.userId, JSON.stringify(e), e.feeling || null,
          e.intention || null, e.grabovoi || null, e.seal || null,
          e.freqName || null, e.binauralHz || null, e.solfeggioHz || null,
          e.durationMin || null, date,
        ]
      );
      imported++;
    } catch (err) {
      console.error('sync entry error:', err.message);
      skipped++;
    }
  }

  res.json({ ok: true, imported, skipped });
});

app.listen(PORT, () => {
  console.log(`Solomon DB rodando na porta ${PORT}`);
});
