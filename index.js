const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// CORS — permite chamadas do app (qualquer origem por enquanto)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Health check ──
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Solomon API', version: '1.0.0' });
});

// ── Rota principal: IA monta ritual ──
app.post('/solomon/ritual', async (req, res) => {
  const { intention } = req.body;

  if (!intention || typeof intention !== 'string' || intention.trim().length < 3) {
    return res.status(400).json({ error: 'Intenção inválida ou muito curta.' });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY não configurada no servidor.' });
  }

  const PLANETS = [
    { day: 0, name: 'Domingo · Sol', desc: 'Clareza, liderança e sabedoria' },
    { day: 1, name: 'Segunda · Lua', desc: 'Intuição, emoção e sonhos' },
    { day: 2, name: 'Terça · Marte', desc: 'Força, vitória e proteção' },
    { day: 3, name: 'Quarta · Mercúrio', desc: 'Comunicação, intelecto e negócios' },
    { day: 4, name: 'Quinta · Júpiter', desc: 'Abundância, expansão e prosperidade' },
    { day: 5, name: 'Sexta · Vênus', desc: 'Amor, harmonia e atração' },
    { day: 6, name: 'Sábado · Saturno', desc: 'Estrutura, disciplina e karma' },
  ];

  const today = PLANETS[new Date().getDay()];

  const prompt = `Você é um oráculo de manifestação que domina: Pentáculos de Salomão, Números Grabovoi, Frequências Binaurais, Solfeggio e ciclos planetários.

O usuário quer manifestar: "${intention.trim()}"
Planeta do dia: ${today.name} (${today.desc})

Responda APENAS em JSON válido, sem markdown, sem texto fora do JSON:
{
  "resumo": "2-3 frases poéticas explicando por que essa configuração serve à intenção",
  "grabovoi": "número Grabovoi mais adequado dentre: 520 741 8, 318 798 444, 888 412 1289018, 1 1 8888, 444 010 888, 287 318 9017, 191 044 888, 741 741 741, 318 612 518 714, 9187948181818, 4814981, 5343168, 8 888 888, 717 41793 9, 93 811 9396 814",
  "grabovoi_nome": "nome do número escolhido",
  "selo": "um de: jupiter1, jupiter2, jupiter4, sol, lua, venus, marte, saturno",
  "selo_nome": "nome completo do selo",
  "freq": "um de: theta, alpha, beta, delta, gamma, schumann",
  "freq_hz": número inteiro (6 para theta, 10 para alpha, 20 para beta, 2 para delta, 40 para gamma, 8 para schumann),
  "solfeggio": número ou 0 (396, 417, 528, 639, 741, 852, 963, 432 ou 0),
  "solfeggio_nome": "nome do solfeggio ou null",
  "duracao": número de minutos (5, 10, 20 ou 30),
  "ritual": "instrução de como se posicionar e respirar durante a sessão (2-3 frases práticas)"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5',
        max_tokens: 1024,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Anthropic error:', response.status, err);
      return res.status(502).json({ error: 'Erro ao chamar a IA. Tente novamente.' });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const clean = text.replace(/```json|```/g, '').trim();

    let ritual;
    try {
      ritual = JSON.parse(clean);
    } catch (e) {
      console.error('JSON parse error:', clean);
      return res.status(502).json({ error: 'Resposta da IA em formato inválido.' });
    }

    // Validação mínima dos campos obrigatórios
    const required = ['resumo', 'grabovoi', 'selo', 'freq', 'freq_hz', 'duracao', 'ritual'];
    for (const field of required) {
      if (ritual[field] === undefined || ritual[field] === null) {
        return res.status(502).json({ error: `Campo obrigatório ausente na resposta: ${field}` });
      }
    }

    return res.json({ ok: true, ritual });

  } catch (err) {
    console.error('Solomon ritual error:', err.message);
    return res.status(500).json({ error: 'Erro interno no servidor.' });
  }
});

app.listen(PORT, () => {
  console.log(`Solomon API rodando na porta ${PORT}`);
});
