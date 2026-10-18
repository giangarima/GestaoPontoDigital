# CLAUDE.md

Guia para o Claude Code (claude.ai/code) trabalhar neste repositório.

## Visão Geral

**On Time** — sistema de gestão de ponto eletrônico em SvelteKit + Svelte 5 + TypeScript. Dois papéis: `admin` (gerencia colaboradores, jornadas e dashboard) e `colaborador` (registra ponto via login manual).

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
npm run db:seed      # popula a Empresa 1: 21 colaboradores (7 desligados), 6.760 marcações reais
                     # (21/03–19/09/2026) + dias reamostrados até o instante do seed
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

- Postgres em container via `docker-compose.yml` (porta 5432, user `ponto`/`ponto`, DB `ponto_digital`). **Ambientes** (detalhes em [DEPLOY.md](DEPLOY.md)): produção = branch `main`, VPS, Postgres do próprio compose, dados reais (primeira empresa via `npm run db:bootstrap`); staging = branch `dev`, mesma VPS com `docker-compose.staging.yml`, banco no Neon e seed de demonstração. Trabalho novo entra na `dev`; a `main` só recebe PR vindo dela. `APP_ENV=production` faz o seed recusar (ele começa apagando tudo).
- Schema em `prisma/schema.prisma` — modelos `Empresa`, `Usuario` (identidade de login), `Colaborador` (extensão de vínculo), `Departamento`, `Jornada`, `Registro` (batida de ponto), `RegistroAnulacao`, `Ausencia` (férias + justificativas unificadas), `Feriado`/`FeriadoEscala`, `EscalaCiclo`/`EscalaAjuste` (escala de folga). Tabelas mapeadas para plural snake_case via `@@map`; colunas em snake_case via `@map` (camelCase no Prisma), domínio em PT; timestamps de auditoria (`createdAt`/`updatedAt`) mantêm nome EN. Datas com `@db.Timestamptz(6)`.
- **Identidade × vínculo**: `Usuario` é a **única entidade de login** (admin e colaborador), com `role` (`admin` | `colaborador`) marcando acesso de gestão. `Colaborador` é uma **extensão 1:1 opcional** (`usuarioId`), sem credencial própria — sua existência é o que indica "tem vínculo / bate ponto". Uma pessoa pode ser os dois (ex.: RH que gerencia **e** bate ponto = `role='admin'` + linha em `colaboradores`).
- **Conformidade com a Portaria 671/2021**: o mapa requisito → código → teste, com as lacunas para uso real, está em [docs/PORTARIA-671.md](docs/PORTARIA-671.md). Mudou uma regra legal? Atualize-o no mesmo commit.
- **Marcação original × tratamento** (Portaria 671/2021 — "só o REP gera o AFD"): `Registro.fonte = 'O'` é a batida feita pelo trabalhador (recebe NSR + hash-chain via `criarRegistro` e entra no AFD); `fonte = 'I'` é inclusão do admin no tratamento (lançamento manual / batida corrigida de um ajuste, via `criarInclusao`): **sem NSR/hash, fora do AFD**, aparece só no AEJ com o motivo. Anulação = marcação desconsiderada (`D` no AEJ); a original segue intacta no AFD. CHECK `registros_fonte_check` garante o par fonte × NSR/hash. Leiaute oficial do AEJ: campos separados por `|`, sem CRC (`src/lib/server/aej/montar.ts`).
- **Campos de auditoria** (`Registro.criadoPor`, `RegistroAnulacao.anuladoPor`, `Ausencia.revisadoPor`) são **FK** para `Usuario` (`onDelete: Restrict`). Unicidade de `email`/`cpf` é **por empresa** (`@@unique([empresaId, ...])`).
- **Diário somente inserção** (Anexo IX, item 7): o trigger `diario_somente_insercao` recusa UPDATE/DELETE/TRUNCATE em `registros`, `eventos_*`, `registro_anulacoes` e `registro_anulacoes_revertidas`; em `empresas`, só DELETE/TRUNCATE e `ultimo_nsr` diminuindo. Reverter anulação copia a linha para `registro_anulacoes_revertidas` antes de apagá-la (única exceção do trigger). O seed desliga os triggers só durante a limpeza; teste que adultera o banco usa `adulterar()` de `tests/db/fixtures.ts`. Tabela nova no diário entra no trigger e na lista `TABELAS_DO_DIARIO` do seed.
- Singleton do client: `src/lib/server/db.ts` (usado em `+server.ts`).
- Senhas (`Usuario.senhaHash`) com `bcryptjs`. `JornadaVersao.dias` serializada como JSON (compatibilidade com `src/lib/server/jornada.ts`).
- **Multi-tenancy**: todas as entidades são escopadas por `empresaId`. Admin só enxerga dados da própria empresa.
- **Datas e fuso**: todo "dia" é de Brasília (UTC-03:00), independente do fuso do servidor (UTC no Render) — use `src/lib/server/periodo.ts`. Instante (`marcadoEm`) → `diaDe`/`instantesDoPeriodo`; data pura (`Ausencia.dataInicio/dataFim`, `vigenciaInicio`, gravadas à meia-noite UTC) → `ausenciaNoPeriodo`/`dataPura`. Nunca `T00:00:00Z` para limitar batidas.
- **Apuração de horas** (fonte única): `apuracao.ts` (pares por ordem, hora noturna reduzida 22h–5h, extras/déficit contra a jornada contratual via `horarioContratualDoDia`) e `espelho/montar.ts` → `apurarPeriodo` (todos os dias do período, faltas, abonos). Espelho e consolidado usam `apurarPeriodo`; histórico/hoje usam `buildDailySummaries` com o mesmo cálculo por dia; o painel do dia usa `apurarDia` direto (ver abaixo).
- **Tolerância da CLT** (art. 58, §1º — a Portaria 671 não trata do assunto): `toleranciaClt` em `apuracao.ts`, na leitura literal do texto ("variações de horário no registro de ponto"), valendo para **todas** as marcações do dia, não só entrada e saída. Até 5 min por marcação e 10 min somados no dia, o dia é apurado como se cumprido no horário contratual (`marcacoesPrevistas`) — sem extras nem déficit; passando de qualquer um dos dois limites, a tolerância cai inteira e conta o tempo real (Súmula 366 do TST). O realizado exibido é sempre o tempo real, e a redução da hora noturna do próprio horário contratual é preservada. Não se aplica a dia incompleto, sem jornada ou com número de marcações diferente do previsto. O espelho marca esses dias na coluna Ocorrência.
- **Feriados e pontos facultativos** (`feriado/calendario.ts` puro + `feriado/carregar.ts`): cada data tem **tipo** (`feriado` | `ponto_facultativo`), **abrangência** (`nacional` | `estadual` | `municipal`) e uma **escala** (`FeriadoEscala`) de quem trabalha — a empresa pode abrir com equipe reduzida. Fora da escala o dia é **sem expediente**: sem falta, sem déficit, fora do previsto, e o trabalhado é extra. Escalado segue a própria jornada (leva falta se não vier); no espelho vira "Feriado trabalhado" (base futura dos 100%) ou, no ponto facultativo, dia comum. Os **feriados nacionais** são fixos em lei e calculados (`feriadosNacionais`); só ganham linha em `feriados` (abrangência `nacional`) quando a empresa abre no dia, para guardar a escala — a escala vazia apaga a linha. Ponto facultativo nacional (Carnaval) é cadastrável. Tela `/admin/feriados`; `GET/POST /api/feriados`, `PUT /api/feriados/escala`, `DELETE /api/feriados/:id`. `apurarPeriodo`, `buildSummary` e o AEJ recebem o calendário **do colaborador** (`feriadosDoColaborador`: escalado ou não); o painel resolve por linha (situação `feriado` para quem está fora da escala). Pendências passa um mapa vazio de propósito: marcação ímpar é `Incompleto` em qualquer dia.
- **Escala de folga** (`escala/calendario.ts` puro + `escala/carregar.ts`): por cima do padrão semanal da jornada, um **ciclo** por colaborador (`EscalaCiclo.sequencia`, `T`/`F` por dia a partir da vigência — `TTTTTTF` = 6x1, `TF` = 12x36; versionado por vigência, `null` volta à jornada) e **ajustes** pontuais (`EscalaAjuste`, trabalha/folga num dia — trocar uma folga são dois ajustes). Prioridade: ajuste > ciclo > jornada. Com ciclo, o `ativo` da jornada é ignorado e ela só empresta o horário do dia da semana; sem horário ali, o dia fica sem expediente e a grade avisa (`sem_horario`). **`horarioDoDia(versoes, escala, dia)` é o único ponto que decide se há expediente** — espelho, AEJ, painel e histórico (`contratualPorDia`/`previstasPorDia` moraram para `escala/calendario.ts`) recebem `escala` como os feriados. Alertas (só aviso): mais de 6 dias seguidos (art. 67) e 3 domingos seguidos de trabalho (comércio, Lei 10.101/2000, art. 6º). Tela `/admin/escala` (grade do mês, ciclo e ajuste); `GET /api/escala?mes=`, `GET/PUT /api/colaboradores/:id/escala`, `PUT /api/escala/ajuste`.
- **Banco de horas** (`banco-horas/montar.ts` puro + `banco-horas/carregar.ts`): **derivado da apuração**, sem saldo gravado — nunca diverge do espelho. Regime por empresa (`Empresa.bancoHorasRegime`: `nenhum` | `mensal` | `semestral` | `anual`, art. 59 §§6º/5º/2º), ciclos fixos contados de `bancoHorasInicio`. Crédito = extras; débito = déficit dos dias trabalhados (**falta fica fora**); folga compensatória (ausência `folga`) consome o contratual do dia — no espelho o dia segue abonado. Movimentos até ontem. No vencimento, positivo = a pagar como extra; negativo = zerado ou a descontar (`bancoHorasNegativo`). `GET /api/admin/banco-horas`, `GET /api/admin/banco-horas/:colaboradorId?ciclo=`, `POST/DELETE .../folgas`, `GET /api/timesheet/banco-horas`; telas `/admin/banco-horas` e card no histórico do colaborador; config em `/admin/empresa`.
- **Painel do dia** (`painel/montar.ts` puro + `painel/carregar.ts` com Prisma): o dashboard do admin. Lidera pela **divergência** — falta, dia em aberto e atraso antes de quem cumpriu —, com `ordem` resolvida no servidor. `situacao` é presença (`trabalhando` | `cumpriu` | `ainda_nao_chegou` | `falta_provavel` | `folga` | `ferias` | `ausencia` | `sem_jornada`) e `atrasado` é booleano à parte, porque quem chega tarde e fica é as duas coisas. Atraso usa `ATRASO_MIN = 5`, o mesmo limite por marcação do art. 58, §1º, para não contradizer o espelho. `turnoDoDia` rotula abertura/fechamento/integral/meio período comparando o horário contratual **do dia** com `Empresa.horaAbertura/horaFechamento` — é heurística, e a linha leva junto o horário literal. Marcação ímpar só vira "dia em aberto" depois que o dia encerra; no dia corrente é alguém que ainda não saiu. `GET /api/admin/dashboard?data=` e `GET /api/admin/resumo` (contadores dos badges do menu, no layout). O painel **não** roda `apurarPeriodo`: era um laço mensal por colaborador que não se paga numa tela que se atualiza sozinha.
- **Dias em aberto** (`pendencias.ts`): jornadas com número ímpar de marcações — o trabalhador esqueceu uma batida. A varredura chama `apurarPeriodo` e filtra a ocorrência `Incompleto`, então a lista nunca diverge do espelho; o dia corrente não conta (ainda está em andamento). `GET /api/admin/pendencias?mes=AAAA-MM` e a tela `/admin/pendencias`, que linka para `/admin/ajustes?colaboradorId=&mes=` — o tratamento continua sendo o lançamento manual (`criarInclusao`). É a ocorrência mais comum da operação real: 10% dos dias no AFDT que originou o seed. `contarDiasEmAberto` é a versão só-contagem, numa agregação SQL, para o painel e o badge do menu não trazerem o mês inteiro a cada atualização automática — a equivalência com a lista é travada por teste em `tests/db/pendencias.test.ts`.
- **Geolocalização da batida** (`geolocalizacao.ts` puro + `utils/geolocalizacao.ts` no navegador): a tela de registro pede a posição (`getCurrentPosition`, só em HTTPS/localhost) e o servidor compara com os **locais de trabalho** da empresa (`LocalTrabalho`: ponto + raio; vale qualquer local ativo). `dentro` se a distância ao mais próximo cabe no raio mais a precisão do GPS (folga com teto de 50 m); senão `fora`; sem posição = `sem_localizacao`; sem local ativo = `sem_locais` (recurso desligado, não é divergência). **Só sinaliza, nunca bloqueia** (art. 74 da Portaria 671 veda restringir a marcação): a batida entra igual. Gravado em `Registro` como **snapshot** (`latitude`, `longitude`, `precisaoM`, `localizacao`, `localTrabalhoId`, `distanciaM`) — editar o local não reavalia o passado; local com batidas só é desativado. **Fora do AFD e do hash** (o tipo 7 não tem o campo). `null` = batida anterior ao recurso (todo o seed) ou inclusão do admin. Aparece no painel (`localizacaoAlerta`, entra em `divergencia`, chip "Local a conferir"), no espelho de Ajustes (alfinete com link para o OpenStreetMap) e no histórico do colaborador. Cadastro em `/admin/empresa`; `GET/POST /api/locais-trabalho`, `PUT/DELETE /api/locais-trabalho/:id`.
- **Perfil do colaborador** (`perfil/montar.ts` puro + `perfil/carregar.ts`): dashboard individual para o dono, em `/admin/colaboradores/[id]` (link no nome na lista e no painel), em três alturas. **O dia**: hoje, ou o último dia com expediente quando hoje não tem (domingo, férias) — as batidas contra o previsto, um chip de situação (no dia corrente sem batida segue o painel: `ATRASO_MIN`, depois `MARGEM_FALTA_MIN`) e uma leitura por regra (onde foi o atraso e se costuma compensar na saída; **sem pronome**, o sistema não sabe o gênero). **A semana**: de segunda até esse dia, com atraso, intervalo curto, batida faltando e inclusão do admin (cor sempre com texto). **O período** (30d/3m/6m/12m até **ontem**, só os que cabem no tempo de casa): Presença (dias previstos e faltas = espelho), Pontualidade (**entrada e volta do intervalo**), Onde atrasa (contagens e medianas) e Saldo de horas. Atraso na entrada = 1ª válida − 1ª prevista > `ATRASO_MIN`; **volta atrasada = intervalo realizado − previsto** > `ATRASO_MIN` (a duração, não o horário da volta); intervalo curto = abaixo do previsto − `ATRASO_MIN` (art. 71). **Dia com ajuste** (inclusão/desconsideração) fica fora da pontualidade e do saldo, e dia com batida faltando fora do saldo: por isso o **saldo do perfil não é o do espelho** — o card diz quantos dias ficaram fora (`tests/db/perfil.test.ts` trava que, sem esses dias, os dois coincidem). Uma carga de `carregarEspelho` cobre o período e a janela de 3 semanas até hoje, cada um apurado por `apurarPeriodo`. O perfil não mostra local da batida nem banco de horas (ficam no painel, no espelho de Ajustes e em `/admin/banco-horas`). Componentes em `components/perfil/` (tokens `--color-dia-*`, validados para daltonismo nos dois temas). `GET /api/admin/colaboradores/:id/perfil?periodo=` (padrão `30d`).
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

**Departamentos** (4) e **jornadas** (6) são independentes, como no schema: a _Loja_ reúne 15
pessoas em três turnos (abertura 08:30–17:20, intermediário 09:30–19:00 com sábado até 13:30 e fechamento 10:00–19:00), que é o caso que dá
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
continua sendo falta injustificada** (64 no período pela apuração do sistema, já sem os feriados
nacionais e a Sexta-feira Santa — único feriado local do seed; Corpus Christi teve expediente
reduzido e ficou de fora) — zerar a falta tiraria do seed a
ocorrência que o admin mais precisa enxergar.

**Banco de horas no seed**: regime semestral desde 01/03/2026 — o ciclo de março a agosto já venceu
(com saldos a pagar e zerados) e o de setembro está aberto. **Escala de folga não entra no seed**: o
AFDT não permite inferir rodízio de folga com segurança.

**Depois de 19/09/2026** (`prisma/seed-extensao.ts`): do dia seguinte ao último real até o
instante em que o seed roda, cada dia é a **cópia de um dia real do mesmo colaborador, no mesmo
dia da semana** (horários, inclusões com motivo, desconsideradas e batida esquecida vêm juntos), e a
falta segue a taxa da própria pessoa no período real. Ficam de fora desligados, dias sem expediente
na jornada, feriados nacionais (12/10) e dias de ausência já cadastrada; ausências novas não se
inventam. O sorteio é determinístico por colaborador e dia, então rodar de novo reproduz os mesmos
dias e rodar mais tarde só acrescenta. No dia corrente entram só as marcações até agora. Os números
acima (marcações, dias em aberto, faltas) são do período real; o seed imprime o total com a extensão.
Por isso `periodo.ts` e `feriado/calendario.ts` importam de forma relativa (o tsx do seed não resolve `@/`).

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
