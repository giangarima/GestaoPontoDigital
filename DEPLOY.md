# Deploy e ambientes

|                  | Produção                                     | Staging                                                              |
| ---------------- | -------------------------------------------- | -------------------------------------------------------------------- |
| Branch           | `main` (só recebe PR vindo da `dev`)         | `dev`                                                                |
| Workflow         | `.github/workflows/deploy.yml`               | `.github/workflows/deploy-dev.yml`                                   |
| Pasta na VPS     | `~/ontime`                                   | `~/ontime-dev`                                                       |
| Compose          | `docker-compose.yml`                         | `docker-compose.yml` + `docker-compose.staging.yml`, `-p ontime-dev` |
| Banco            | Postgres do compose (volume `postgres_data`) | Neon (`DATABASE_URL` no `.env` do staging)                           |
| Porta (loopback) | 3050                                         | 3051                                                                 |
| Dados            | reais; primeira empresa via `db:bootstrap`   | seed de demonstração (`db:seed`)                                     |
| `APP_ENV`        | `production` (o seed recusa)                 | `staging`                                                            |

Os dois workflows rodam "Verificar" (check, lint, testes unitários) e só então entram por SSH
(secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`), fazem `git pull` e reconstroem o container na
própria VPS. Compartilham o grupo de `concurrency` `vps-build`: um build espera o outro, porque dois
ao mesmo tempo estouram os 2 GB da máquina.

## Fluxo de branches

`feature/*` → PR para `dev` → staging publica sozinho → validado, PR `dev` → `main` → produção.
O `origin` empurra para GitHub e GitLab juntos; as Actions só rodam no GitHub.

## Staging: primeira instalação

```bash
git clone https://github.com/giangarima/GestaoPontoDigital.git ~/ontime-dev
cd ~/ontime-dev && git checkout dev
cp .env.example .env   # DATABASE_URL do Neon (?sslmode=require), PORT=3051,
                       # ORIGIN=https://dev.<domínio>, JWT_SECRET próprio, COMPROVANTE_SKIP_SIGN=true
docker compose -p ontime-dev -f docker-compose.yml -f docker-compose.staging.yml up -d --build app
docker compose -p ontime-dev -f docker-compose.yml -f docker-compose.staging.yml exec app npm run db:seed
```

No nginx, um `server` para `dev.<domínio>` com `proxy_pass http://127.0.0.1:3051;` e
`sudo certbot --nginx -d dev.<domínio>`. O `ORIGIN` precisa bater exatamente com a URL pública.

## Produção: banco novo (sem seed)

```bash
cd ~/ontime
docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > ~/backup-antes.sql.gz
docker compose stop app
# Zera o schema em vez de apagar o banco: funciona até quando POSTGRES_DB=postgres.
docker compose exec postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker compose start app            # start:prod aplica as migrations no schema vazio
docker compose exec \
  -e EMPRESA_NOME="..." -e EMPRESA_CNPJ="..." \
  -e ADMIN_NOME="..." -e ADMIN_EMAIL="..." -e ADMIN_CPF="..." -e ADMIN_SENHA="..." \
  app npm run db:bootstrap
```

(`set -a; source .env; set +a` antes, para as variáveis `$POSTGRES_*` existirem no shell.) O
bootstrap recusa se já existe empresa. Departamentos, jornadas e colaboradores entram pela interface.

## Backup da produção

`scripts/backup-db.sh` gera `~/backups/ontime-<data>.sql.gz`, mantém 14 dias e, com `BACKUP_S3_URI`
no `.env`, copia para o S3. Cron diário às 3h:

```
0 3 * * * $HOME/ontime/scripts/backup-db.sh >> $HOME/backups/backup.log 2>&1
```

Restaurar: `gunzip -c arquivo.sql.gz | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"`.
