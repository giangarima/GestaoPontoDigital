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
npm run db:seed      # popula a Empresa 1: 21 colaboradores (7 desligados), 6.760 marcações
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
- **Marcação original × tratamento** (Portaria 671/2021 — "só o REP gera o AFD"): `Registro.fonte = 'O'` é a batida feita pelo trabalhador (recebe NSR + hash-chain via `criarRegistro` e entra no AFD); `fonte = 'I'` é inclusão do admin no tratamento (lançamento manual / batida corrigida de um ajuste, via `criarInclusao`): **sem NSR/hash, fora do AFD**, aparece só no AEJ com o motivo. Anulação = marcação desconsiderada (`D` no AEJ); a original segue intacta no AFD. CHECK `registros_fonte_check` garante o par fonte × NSR/hash. Leiaute oficial do AEJ: campos separados por `|`, sem CRC (`src/lib/server/aej/montar.ts`).
- **Campos de auditoria** (`Registro.criadoPor`, `RegistroAnulacao.anuladoPor`, `Ausencia.revisadoPor`) são **FK** para `Usuario` (`onDelete: Restrict`). Unicidade de `email`/`cpf` é **por empresa** (`@@unique([empresaId, ...])`).
- Singleton do client: `src/lib/server/db.ts` (usado em `+server.ts`).
- Senhas (`Usuario.senhaHash`) com `bcryptjs`. `JornadaVersao.dias` serializada como JSON (compatibilidade com `src/lib/server/jornada.ts`).
- **Multi-tenancy**: todas as entidades são escopadas por `empresaId`. Admin só enxerga dados da própria empresa.
- **Datas e fuso**: todo "dia" é de Brasília (UTC-03:00), independente do fuso do servidor (UTC no Render) — use `src/lib/server/periodo.ts`. Instante (`marcadoEm`) → `diaDe`/`instantesDoPeriodo`; data pura (`Ausencia.dataInicio/dataFim`, `vigenciaInicio`, gravadas à meia-noite UTC) → `ausenciaNoPeriodo`/`dataPura`. Nunca `T00:00:00Z` para limitar batidas.
- **Apuração de horas** (fonte única): `apuracao.ts` (pares por ordem, hora noturna reduzida 22h–5h, extras/déficit contra a jornada contratual via `horarioContratualDoDia`) e `espelho/montar.ts` → `apurarPeriodo` (todos os dias do período, faltas, abonos). Espelho e consolidado usam `apurarPeriodo`; histórico/hoje usam `buildDailySummaries` com o mesmo cálculo por dia; o painel do dia usa `apurarDia` direto (ver abaixo).
- **Tolerância da CLT** (art. 58, §1º — a Portaria 671 não trata do assunto): `toleranciaClt` em `apuracao.ts`, na leitura literal do texto ("variações de horário no registro de ponto"), valendo para **todas** as marcações do dia, não só entrada e saída. Até 5 min por marcação e 10 min somados no dia, o dia é apurado como se cumprido no horário contratual (`marcacoesPrevistas`) — sem extras nem déficit; passando de qualquer um dos dois limites, a tolerância cai inteira e conta o tempo real (Súmula 366 do TST). O realizado exibido é sempre o tempo real, e a redução da hora noturna do próprio horário contratual é preservada. Não se aplica a dia incompleto, sem jornada ou com número de marcações diferente do previsto. O espelho marca esses dias na coluna Ocorrência.
- **Painel do dia** (`painel/montar.ts` puro + `painel/carregar.ts` com Prisma): o dashboard do admin. Lidera pela **divergência** — falta, dia em aberto e atraso antes de quem cumpriu —, com `ordem` resolvida no servidor. `situacao` é presença (`trabalhando` | `cumpriu` | `ainda_nao_chegou` | `falta_provavel` | `folga` | `ferias` | `ausencia` | `sem_jornada`) e `atrasado` é booleano à parte, porque quem chega tarde e fica é as duas coisas. Atraso usa `ATRASO_MIN = 5`, o mesmo limite por marcação do art. 58, §1º, para não contradizer o espelho. `turnoDoDia` rotula abertura/fechamento/integral/meio período comparando o horário contratual **do dia** com `Empresa.horaAbertura/horaFechamento` — é heurística, e a linha leva junto o horário literal. Marcação ímpar só vira "dia em aberto" depois que o dia encerra; no dia corrente é alguém que ainda não saiu. `GET /api/admin/dashboard?data=` e `GET /api/admin/resumo` (contadores dos badges do menu, no layout). O painel **não** roda `apurarPeriodo`: era um laço mensal por colaborador que não se paga numa tela que se atualiza sozinha.
- **Dias em aberto** (`pendencias.ts`): jornadas com número ímpar de marcações — o trabalhador esqueceu uma batida. A varredura chama `apurarPeriodo` e filtra a ocorrência `Incompleto`, então a lista nunca diverge do espelho; o dia corrente não conta (ainda está em andamento). `GET /api/admin/pendencias?mes=AAAA-MM` e a tela `/admin/pendencias`, que linka para `/admin/ajustes?colaboradorId=&mes=` — o tratamento continua sendo o lançamento manual (`criarInclusao`). É a ocorrência mais comum da operação real: 10% dos dias no AFDT que originou o seed. `contarDiasEmAberto` é a versão só-contagem, numa agregação SQL, para o painel e o badge do menu não trazerem o mês inteiro a cada atualização automática — a equivalência com a lista é travada por teste em `tests/db/pendencias.test.ts`.
- **Espelho de Ponto** (art. 84): PDF com pdf-lib (sem navegador) em `espelho/pdf.ts`, assinado em PAdES quando há certificado. Admin: `GET /api/relatorios/espelho/pdf`; colaborador (acesso mensal): `GET /api/timesheet/espelho?mes=AAAA-MM`.
- **Comprovante de marcação** (arts. 79–80): PDF A5 com pdf-lib (`comprovante/pdf.ts`), com NSR, empregador, trabalhador, data/hora, INPI e o **hash SHA-256 da marcação** (o mesmo do tipo 7 no AFD); assinado em PAdES (`assinatura/pdf.ts`, compartilhado com o espelho). Só marcações `fonte='O'`. O arquivo em `storage/` é cache: o download (`/api/timesheet/comprovantes/:id`) regera do banco se ele sumiu (disco efêmero no Render). Lista das últimas 48h na tela de registro do colaborador.
- **Atestado Técnico e Termo de Responsabilidade** (art. 89): PDF no modelo do gov.br (`atestado/`), uma página para o REP-P e outra para o PTRP, destinatária = empresa do admin. Linhas dos responsáveis em branco (assinam com e-CPF fora do sistema; o repositório é público, então nomes/CPFs não entram na config). A assinatura PAdES do sistema, quando há certificado, é só demonstração e o PDF avisa isso. `GET /api/relatorios/atestado`.
- **Eventos sensíveis do REP-P** (AFD tipo 6, `EventoSensivel`, `disponibilidade.ts`): `init` em `hooks.server.ts` grava "07" (disponível) por empresa ao subir; `sveltekit:shutdown` (SIGTERM/SIGINT) grava "08". Queda sem aviso: no próximo início, se o último evento é "07", grava o "08" pendente antes do novo "07". Só em produção (`node build`), não no `vite dev`. Consome NSR, entra no AFD (36 posições, sem CRC) e na checagem de NSRs da Auditoria.
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

- `admin@empresa1.com` — admin puro (sem vínculo de colaborador)
- `eduarda@empresa1.com` — **caso RH**: `role='admin'` **e** colaboradora (gerencia e bate ponto)
- demais colaboradores: `<primeironome>@empresa1.com` (ex.: `adriana@empresa1.com`)

**Departamentos** (4) e **jornadas** (5) são independentes, como no schema: a _Loja_ reúne 15
pessoas em dois turnos (abertura 08:30–17:20 e fechamento 10:00–19:00), que é o caso que dá
sentido a `PATCH /api/departamentos/:id/jornada`.

**Origem dos dados** (`prisma/seed-importada.ts` + `prisma/seed-data/marcacoes.json`):
marcações derivadas de um AFDT/ACJEF (Portaria 1510/2009) de uma empresa real, **anonimizadas
de forma irreversível** — o PIS (único identificador pessoal dos arquivos) e o cabeçalho do
empregador nunca chegaram ao banco; nomes e CPFs são sintéticos. Seis meses, 21 trabalhadores,
6.760 marcações, com o que um gerador sintético não produz: 181 dias em aberto, inclusões com
motivo real, marcações desconsideradas, três e quatro pares E/S no mesmo dia e jornada de
sábado em meio período. Serviu de conferência do cálculo: 1.728 de 1.733 dias fecharam ao
minuto (99,7%) contra a apuração do sistema de origem. Os arquivos-fonte não estão no
repositório e não são necessários.

**Vínculo e ausências são inferidos**, porque o AFDT não os registra: quem passou mais de 31
dias sem bater até o fim do período está desligado (`deletedAt`); sequências de dias sem
registro dentro do vínculo viram férias (15 dias úteis ou mais) ou atestado (2 a 14), e três
atestados ficam `pendente` para a tela de aprovação ter o que mostrar. **Dia solto sem registro
continua sendo falta injustificada** (82 no período) — zerar a falta tiraria do seed a
ocorrência que o admin mais precisa enxergar.

**O seed não cobre**: ajuste vinculado (`registroSubstitutoId`), que não existe nos arquivos
de origem. Esse caminho está coberto por testes (`tests/db/`), não por dados de seed.

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
