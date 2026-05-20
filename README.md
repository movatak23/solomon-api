# Solomon DB

Backend de autenticação e diário em nuvem do Solomon.

## Variáveis de ambiente (Railway)

| Variável | Valor |
|---|---|
| `DATABASE_URL` | Gerado automaticamente pelo Railway ao adicionar PostgreSQL |
| `RESEND_API_KEY` | Sua chave do Resend (resend.com) |
| `APP_REDIRECT_URL` | URL do app para redirecionar após login (ex: `https://seusite.com/auth`) |
| `NODE_ENV` | `production` |

## Deploy no Railway

### 1. Criar o projeto
- New Project → Deploy from GitHub → selecionar `solomon-db`

### 2. Adicionar PostgreSQL
- No projeto → New → Database → PostgreSQL
- O Railway injeta `DATABASE_URL` automaticamente

### 3. Adicionar variáveis de ambiente
- Settings → Variables → adicionar as variáveis da tabela acima

### 4. Rodar o setup do banco
Após o primeiro deploy, no painel do Railway:
- Settings → Deploy → Start Command
- Alterar temporariamente para: `node setup-db.js`
- Fazer redeploy, aguardar as tabelas serem criadas
- Voltar o Start Command para: `node index.js`
- Fazer redeploy novamente

### 5. Domínio
- Settings → Networking → Generate Domain
- Anotar a URL gerada (ex: `solomon-db-production.up.railway.app`)

## Rotas

### Auth
```
POST /auth/login          { email } → envia magic link
GET  /auth/verify?token=  → valida link, redireciona com session token
GET  /auth/me             → dados do usuário (requer Bearer token)
POST /auth/logout         → invalida session (requer Bearer token)
```

### Diário
```
POST   /diario            { sessao } → salvar sessão
GET    /diario            → listar sessões
DELETE /diario/:id        → deletar uma sessão
DELETE /diario            → limpar todo o diário
POST   /diario/sync       { entries: [] } → importar diário local
```

### Stats
```
GET /stats                → estatísticas completas do usuário
```

## Fluxo de autenticação

1. Usuário digita email no app
2. App chama `POST /auth/login`
3. Usuário recebe email com link
4. Usuário clica → `GET /auth/verify?token=xxx`
5. Backend valida e redireciona para o app com session token
6. App armazena o token e usa como `Authorization: Bearer <token>` em todas as chamadas

## Resend

- Criar conta em resend.com (gratuito até 3.000 emails/mês)
- Verificar o domínio `solomonapp.com.br` (ou usar o domínio que tiver)
- Copiar a API key para a variável `RESEND_API_KEY`
