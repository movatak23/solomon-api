# Solomon API

Backend da aplicação Solomon — Frequências de Manifestação.

## Rota principal

```
POST /solomon/ritual
Content-Type: application/json

{ "intention": "Quero atrair abundância financeira..." }
```

**Resposta:**
```json
{
  "ok": true,
  "ritual": {
    "resumo": "...",
    "grabovoi": "520 741 8",
    "grabovoi_nome": "Abundância financeira",
    "selo": "jupiter1",
    "selo_nome": "1º Pentáculo de Júpiter",
    "freq": "theta",
    "freq_hz": 6,
    "solfeggio": 528,
    "solfeggio_nome": "Milagres/DNA (528 Hz)",
    "duracao": 10,
    "ritual": "..."
  }
}
```

## Deploy no Railway

1. Crie um novo projeto no Railway
2. Conecte este repositório GitHub
3. Adicione a variável de ambiente:
   - `ANTHROPIC_API_KEY` = sua chave da Anthropic (https://console.anthropic.com)
4. Railway detecta o `package.json` automaticamente e faz o deploy

## Health check

```
GET /
```
Retorna `{ "status": "ok" }` — use para confirmar que o serviço está no ar.
