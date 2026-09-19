# CLAUDE.md

Guia para o Claude Code (claude.ai/code) trabalhar neste repositório.

## Visão Geral

**Ponto Digital** — sistema de gestão de ponto eletrônico em SvelteKit + Svelte 5 + TypeScript. Dois papéis: `admin` (gerencia colaboradores, jornadas e dashboard) e `colaborador` (registra ponto via login manual).

## Comandos

```bash
npm run dev          # servidor de desenvolvimento
npm run build        # build de produção
npm run preview      # preview da build
npm run check        # type-check (svelte-check)
npm run lint         # ESLint
npm run format       # Prettier
npm test             # testes unitários (Vitest, funções puras — sem banco)
npm run test:db      # testes de integração: sobe postgres-test (docker, porta 55432, tmpfs),
                     # recria o schema via migrate deploy e roda tests/db/ (recusa banco não-local)
npm run test:all     # os dois
npm run db:migrate   # cria/aplica migration (após mudar schema.prisma)
npm run db:seed      # popula admin + 6 colaboradores + 2 jornadas
npm run db:studio    # abre Prisma Studio
npm run db:reset     # reseta DB e roda seed
```

## Arquitetura

Híbrida Camada + Feature:

- **`src/services/`** — camada HTTP. Todas as chamadas passam pelo `api.ts` (fetch centralizado com injeção de token e redirect em 401). Serviços de domínio (`auth.service.ts`, `timesheet.service.ts`) usam esse client.
- **`src/store/`** — estado global via stores do Svelte. `auth.store.ts` mantém o usuário e os derived `isAuthenticated`/`isAdmin`.
- **`src/hooks/`** — composables com efeitos colaterais (padrão `useCamelCase.ts`).
- **`src/utils/`** — funções puras, sem imports de framework. Formatadores e validadores.
- **`src/components/`** — Svelte components por domínio (`ui/`, `auth/`, `dashboard/`, `timesheet/`, `layout/`, `colaboradores/`).
- **`src/routes/`** — roteador filesystem do SvelteKit. `auth/` é público; `(app)/` é o group autenticado. Admin em `(app)/admin/`, colaborador em `(app)/colaborador/`.
- **`src/lib/server/`** — código exclusivo de servidor (Prisma, token, helpers).

### Aliases

| Alias  | Resolve para | Configurado em                   |
| ------ | ------------ | -------------------------------- |
| `@/`   | `./src/`     | `svelte.config.js` (`kit.alias`) |
| `$lib` | `./src/lib/` | built-in do SvelteKit            |

## Persistência (Prisma + PostgreSQL)

- Postgres em container via `docker-compose.yml` (porta 5432, user `ponto`/`ponto`, DB `ponto_digital`). Em produção: `DATABASE_URL` apontando para Postgres gerenciado (Neon/Supabase/Railway).
- Schema em `prisma/schema.prisma` — modelos `Empresa`, `Usuario` (identidade de login), `Colaborador` (extensão de vínculo), `Departamento`, `Jornada`, `Registro` (batida de ponto), `RegistroAnulacao`, `Ausencia` (férias + justificativas unificadas). Tabelas mapeadas para plural snake_case via `@@map`; colunas em snake_case via `@map` (camelCase no Prisma), domínio em PT; timestamps de auditoria (`createdAt`/`updatedAt`) mantêm nome EN. Datas com `@db.Timestamptz(6)`.
- **Identidade × vínculo**: `Usuario` é a **única entidade de login** (admin e colaborador), com `role` (`admin` | `colaborador`) marcando acesso de gestão. `Colaborador` é uma **extensão 1:1 opcional** (`usuarioId`), sem credencial própria — sua existência é o que indica "tem vínculo / bate ponto". Uma pessoa pode ser os dois (ex.: RH que gerencia **e** bate ponto = `role='admin'` + linha em `colaboradores`).
- **Campos de auditoria** (`Registro.criadoPor`, `RegistroAnulacao.anuladoPor`, `Ausencia.revisadoPor`) são **FK** para `Usuario` (`onDelete: Restrict`). Unicidade de `email`/`cpf` é **por empresa** (`@@unique([empresaId, ...])`).
- Singleton do client: `src/lib/server/db.ts` (usado em `+server.ts`).
- Senhas (`Usuario.senhaHash`) com `bcryptjs`. `JornadaVersao.dias` serializada como JSON (compatibilidade com `src/lib/server/jornada.ts`).
- **Multi-tenancy**: todas as entidades são escopadas por `empresaId`. Admin só enxerga dados da própria empresa.
- **DTOs estáveis**: os mappers (`src/lib/server/timesheet.ts`, `ausencia.ts`, `colaborador.ts`) preservam o contrato antigo da API (`type`/`timestamp`/`method`, status `pending/approved/rejected`, campo `observacao`) traduzindo dos nomes novos do schema — o frontend não mudou.

## Autenticação

- **Token**: JWT assinado (HS256, `JWT_SECRET`) codificado/decodificado em `src/lib/server/token.ts`. Payload: `{ id (usuarioId), nome, email, cpf, role, empresaId, colaboradorId }`. O login faz **um** lookup em `usuarios` (por email ou CPF), lê o `role` da coluna e preenche `colaboradorId` quando há extensão de colaborador; colaborador desligado (`deletedAt`) não autentica. (Unicidade por empresa: login multi-empresa exigirá discriminador de tenant; no MVP de empresa única, `findFirst` basta.)
- **Persistência client**: gravado em `localStorage` (para `api.ts`) e `document.cookie` (para `hooks.server.ts`).
- **Servidor**: `hooks.server.ts` lê o cookie, decodifica via `token.ts` e popula `event.locals.user`. Helpers em `src/routes/api/_lib/auth-helpers.ts`.
- **Proteção de rotas**: sem token → `/auth/login`; `/admin/*` exige `role='admin'`; `/colaborador/*` exige `colaboradorId` presente (assim o RH admin+colaborador passa nos dois). Raiz `/` redireciona por papel em `+page.server.ts`.

## Setup em nova máquina

```bash
docker compose up -d postgres   # sobe Postgres
npm install                     # também roda prisma generate (postinstall) e ativa husky (prepare)
npm run db:migrate              # aplica migrations
npm run db:seed                 # popula dados de teste
```

Volume nomeado `postgres_data` (não polui o repo). `.gitattributes` força `eol=lf`. `postinstall: prisma generate` garante o binário nativo por plataforma (Windows/Linux).

**Credenciais de seed** (senha `Senha123` para todos):

- `admin@teste.com` — admin puro (sem vínculo de colaborador)
- `carlos@teste.com`, `ana@teste.com` — colaboradores
- `daniela@teste.com` — **caso RH**: `role='admin'` **e** colaborador (gerencia e bate ponto)

## Qualidade de Código

- **Pre-commit hook** ativo via `husky` + `lint-staged`: ao commitar, roda `eslint --fix` e `prettier --write` somente nos arquivos staged. Configuração em [.husky/pre-commit](.husky/pre-commit) e bloco `lint-staged` no `package.json`.
- Em colaborações onde lint já é validado pelo hook, não é necessário rodar `npm run lint` manualmente antes de cada edit — o hook é a rede de segurança.

## Convenções

- **Svelte 5 runes**: `$state`, `$derived`, `$derived.by()`, `$props()` — nunca `export let` legado.
- **Nomenclatura**:
  - Components: `PascalCase.svelte`
  - Services: `name.service.ts`
  - Stores: `name.store.ts`
  - Hooks: `useCamelCase.ts`
  - Utils: `camelCase.ts` ou `kebab-case.ts`
  - Rotas: diretórios `kebab-case/`
- **Papéis**: `'admin' | 'colaborador'` (definidos em `App.Locals` e `auth.store.ts`).
- **Variáveis de ambiente**: prefixo `VITE_` (ver `.env.example`).
- **Tipografia**: DM Sans (variable font) em `static/fonts/`, declarada via `@font-face` em `src/app.css`.
- **Idioma**: documentação, comentários e commits em português do Brasil.
