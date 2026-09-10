# Plano de implementação — ArchViz AI Plugin para SketchUp

> Atualização após revisão: a FASE 1 foi autorizada isoladamente. O schema do MVP 0.1 foi simplificado: sem hierarquia, instancePath, IDs persistentes, transformações ou bounding boxes. `origin=sketchup` é o campo canônico de entrada, `scene` é opcional e `Job.source` permanece `base.png`. O restante deste documento registra a proposta original; o contrato implementado e as evidências estão em [docs/sketchup-phase1/review.md](docs/sketchup-phase1/review.md). FASES 2 e 3 aguardam nova revisão. Inicialização automática do engine é evolução obrigatória pós-MVP, não implementada agora.

Data da auditoria: 10/09/2026. Estado: proposta para revisão; implementação não iniciada.

Este documento é o único arquivo criado nesta etapa. A auditoria considera o código atual do workspace, inclusive alterações anteriores ainda não commitadas. Nenhuma alteração de aplicação, job, configuração ou extensão é autorizada por este plano antes da revisão do usuário.

## 1. Estado atual do ArchViz AI

O projeto é uma aplicação Next.js 16.3.3, React 19.2.8 e TypeScript. A aplicação reúne interface web, API Node.js e execução local do Antigravity CLI. Não há extensão SketchUp no projeto nem serviço separado necessário para receber um segundo cliente.

O fluxo operacional encontrado é upload → configuração → POST multipart → job em disco → processo `agy` → polling → resultado PNG. Na inspeção havia 29 pastas em completed, 17 em failed e nenhuma em pending/processing. Isso é evidência de histórico persistido, não uma validação ponta a ponta do MVP proposto.

Há correções anteriores para respeitar status terminal persistido mesmo quando a pasta não foi movida no Windows, e para recuperar a imagem original ao retomar um trabalho na web. Devem ser preservadas. O teste existente `scripts/test-job-status.cjs` cobre status terminal, acesso ao resultado e filtragem da fila nessa situação.

Não foram iniciados renders, executados comandos no SketchUp nem alterados jobs nesta auditoria. A compatibilidade real com o SketchUp instalado terá de ser validada durante a implementação. O guia local `node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md` foi consultado: manter App Router, runtime Node.js e os contratos atuais com parâmetros assíncronos.

## 2. Arquitetura encontrada

| Responsabilidade | Localização e comportamento atual |
|---|---|
| Tela web | `app/page.tsx`: estado da tela, configurações iniciais, envio, polling, cancelamento, saúde e histórico |
| Upload | `components/UploadArea.tsx`: JPG, PNG e WEBP; limite de 2 MiB aplicado no cliente |
| Configurações | `components/RenderSettings.tsx`: listas de opções locais e componentes React |
| Resultado | `components/RenderResult.tsx`: comparação por slider, visualização ampliada e download |
| Entrada de render | `app/api/render/route.ts`: lê FormData, aplica defaults, verifica ocupação, monta prompt, cria job e inicia worker |
| Job manager | `lib/job-manager.ts`: `createJob`, `locateJob`, `getJob`, `getJobResultPath`, `listJobs`; UUID e persistência em disco |
| Prompt builder | `lib/render-prompt.ts`: `buildRenderPrompt(config)`; geometria, fidelidade, ambiente, restrições, formato e instruções adicionais |
| Adapter Antigravity | `lib/agy-worker.ts`: resolve `AGY_PATH`/`where.exe`, inicia `agy` com `shell: false`, registra logs e finaliza jobs |
| Tipos de configuração | `types/render.ts`: `RenderConfig`, unions de opções e `RenderResponse` |
| Tipos de job | `types/job.ts`: `Job`, `JobStatus` e dimensões/tempos |

```text
app/page.tsx → POST /api/render
                    ├─ buildRenderPrompt(config)
                    ├─ createJob(buffer, prompt, config)
                    └─ startAgyWorker(id, diretório interno)
                                ↓
jobs/pending/<uuid> → processing/<uuid> → completed/<uuid> ou failed/<uuid>
                                ↓
GET /api/render/<uuid> → GET /api/render/<uuid>/result
```

Cada job contém `job.json`, `prompt.md`, `base.png`, depois `worker.log` e, quando gerado, `render.png`. O caminho raiz depende de `process.cwd()`. O servidor deve ser iniciado no diretório correto.

O worker Node move as pastas e atualiza o JSON; o prompt de execução proíbe o CLI de fazer isso. O README ainda atribui a movimentação ao CLI e precisa de correção documental futura.

Acoplamentos encontrados:

- A UI depende apenas das rotas HTTP para renderizar, mas suas funções de polling e apresentação são internas ao componente React. Reutilizar o contrato HTTP; não transportar esse componente inteiro para o HtmlDialog.
- As opções em runtime ficam em `RenderSettings.tsx`; os tipos ficam em `types/render.ts`; defaults se repetem na página e na rota. Ruby/JavaScript simples não consomem unions TypeScript em runtime.
- A rota de criação conhece diretamente prompt builder, job manager, Antigravity e diretórios de falha. É possível estendê-la sem criar um segundo orquestrador.
- O worker e a rota de cancelamento também escrevem `job.json` e movem pastas. O job manager não é o único escritor.
- O GET de status chama `killAgyWorker` para jobs terminais. O registro de workers é um Map em memória do módulo; não sobrevive à reinicialização e não é um supervisor persistente.
- Todos os clientes compartilham a mesma ocupação e o mesmo histórico. Não existe fila de múltiplos renders: um novo envio recebe 429 quando há job pendente/processando.
- `Job.source` significa arquivo de entrada (`base.png`), não aplicação de origem. Sobrescrevê-lo com `sketchup` quebraria o significado do contrato existente.

## 3. Componentes reutilizáveis

Reutilizar integralmente o fluxo de jobs, diretórios/status, resolução do CLI, execução, logs e endpoints de leitura. Não criar outro worker, fila, API de resultado ou motor de prompt.

O prompt web sem metadata deve permanecer exatamente igual para a mesma configuração. A imagem continua sendo a referência principal. O contexto SketchUp será adicional e limitado; não substitui as regras de câmera, geometria, proporções e elementos arquitetônicos.

Manter os nomes de `RenderConfig`: `lighting`, `weather`, `fidelity`, `people`, `vehicles`, `vegetation`, `materialCondition`, `aspectRatio`, `resolution`, `additionalInstructions`. Na UI, “Humanização” pode agrupar pessoas/veículos/vegetação; não haverá enum novo `humanization`. “Observações” corresponde a `additionalInstructions`.

Criar um catálogo central de opções/defaults em TypeScript, com os valores atuais e tipos derivados das constantes. Página, componente e rota passam a importar esses dados, sem mudança visual nem alteração dos valores. Um GET aditivo publica o mesmo catálogo para o plugin; Ruby e JavaScript não manterão cópias próprias dos enums.

## 4. Mudanças mínimas necessárias

### Contrato aditivo de criação

Estender o `POST /api/render` existente, mantendo `multipart/form-data` e todos os campos atuais:

| Campo | Web existente | Plugin |
|---|---|---|
| `image` | Arquivo atual, obrigatório | PNG capturado, obrigatório |
| Configurações | Mesmos campos e defaults atuais | Mesmos campos, alimentados pelo catálogo |
| `source` | Ausente equivale a `web`; aceitar `web` explícito | `sketchup` |
| `scene` | Ausente | String JSON com schema 1.0, obrigatória |

Não aceitar caminhos de arquivo enviados pelo cliente. O nome multipart não controla nenhum caminho interno. A resposta de sucesso mantém `{ success: true, jobId, status }` e o HTTP 200 atual. `preparing` continua sendo estado de interface, não um novo status persistido.

Em `job.json`, preservar `source: "base.png"`; adicionar `origin?: "web" | "sketchup"` e `sceneFile?: "scene.json"`. Para jobs antigos, ausência de `origin` equivale a web sem migração em massa. Em `scene.json`, `source: "sketchup"` identifica o produtor dos dados.

Adicionar um quarto argumento opcional a `createJob` com origem/metadata validadas. Salvar `scene.json` antes de iniciar o worker; erros de escrita não podem disparar o CLI nem deixar um pending bloqueando indefinidamente. A web continua chamável com os três argumentos existentes.

Adicionar contexto opcional a `buildRenderPrompt`. Um helper deve selecionar câmera, nome da cena, contagens e até 20 materiais/30 objetos, com orçamento total inicial de 6.000 caracteres. Não enviar matrizes, bounding boxes completos ou caminhos de textura ao prompt. Campos textuais são dados não confiáveis: serializar/escapar, truncar nomes e explicar que não são instruções. Metadata nunca concede autoridade para executar comandos. O JSON completo validado fica no job, mas o worker continua recebendo apenas o caminho interno e as instruções atuais.

### Concorrência e validação

A leitura de `listJobs` seguida de `createJob` não é atômica: web e plugin podem enviar ao mesmo tempo. Adicionar exclusão mútua pequena ao trecho de admissão/criação/início, compartilhada no processo Node e liberada em `finally`; manter 429 para o segundo envio. MVP suportado com uma única instância do engine, sem cluster ou múltiplos servidores sobre o mesmo `jobs`. Testar envios simultâneos. Isso não implica implementar uma fila nova.

Validar source, JSON, versão, números finitos, enums e limites antes de criar job. Preservar defaults de campos web ausentes. Proposta inicial: web mantém 2 MiB e JPG/PNG/WEBP; captura SketchUp permite PNG de até 20 MiB e 16 milhões de pixels; metadata até 1 MiB, 256 caracteres por nome, 200 materiais, 1.000 instâncias e profundidade 20. Observações do plugin até 4.000 caracteres. Retornar 400 para payload inválido, 413 para limites e 429 para ocupado. Confirmar limites com capturas reais; nunca mudar o enquadramento silenciosamente para caber no limite.

Checar assinatura/tipo real, não só extensão/MIME. A web hoje só verifica tamanho/tipo no cliente e grava bytes JPEG/WEBP como `base.png`; não converter formatos nem mudar esse comportamento nesta evolução. O reforço de validação deve aceitar todos os arquivos válidos que a UI atual aceita. Limite de corpo precisa ser efetivo na leitura, não depender apenas de `Content-Length` fornecido pelo cliente.

### Comunicação local

HtmlDialog carrega arquivos empacotados com a extensão. Seu JS chama callbacks Ruby de ações específicas. `api_client.rb` usa HTTP assíncrono para o engine; não há requisições fetch cross-origin saindo de `file://`, CORS global ou `Access-Control-Allow-Origin: *`.

URL padrão `http://127.0.0.1:3000`, porta configurável e host restrito a loopback (`localhost`, `127.0.0.1`, `[::1]`). Bloquear credenciais na URL, destinos externos, redirects externos e rotas arbitrárias nos callbacks. O plugin constrói as rotas permitidas usando UUID validado.

Adicionar um iniciador próprio do engine para SketchUp com bind explícito em `127.0.0.1`, diretório de trabalho fixado e sem abrir navegador. Manter os iniciadores atuais, inclusive o modo remoto existente. Não assumir que usar localhost na URL restringe o bind do servidor. O MVP local é validado sem túnel ativo; um túnel pode expor até um serviço vinculado a loopback. Autenticação remota não faz parte desta entrega e o modo remoto existente não será removido.

Não usar `source` nem cabeçalho Host como prova de autorização. Não adicionar um endpoint de execução de shell ou leitura de caminho. Ruby não inicia `agy`. Nesta primeira versão o engine deve estar iniciado previamente pelo atalho local; se estiver offline, o HtmlDialog informa isso e permite tentar de novo. Inicialização automática do engine pelo SketchUp fica fora do MVP, evitando acoplamento à instalação do Node/projeto.

## 5. Arquitetura do plugin

```text
sketchup-plugin/
├── archviz_ai.rb                 # registro SketchupExtension
├── README.md                    # instalar, iniciar engine e validar
└── archviz_ai/
    ├── main.rb                  # namespace, menu Extensions → ArchViz AI
    ├── dialog.rb                # HtmlDialog único, callbacks e ciclo de vida
    ├── scene_capture.rb         # PNG da viewport; temporários próprios
    ├── scene_reader.rb          # leitura objetiva e serialização
    ├── api_client.rb            # HTTP assíncrono, multipart e rotas fixas
    ├── config.rb                # URL local, preferências e último jobId
    └── ui/
        ├── index.html
        ├── app.js
        └── styles.css
```

Namespace Ruby exclusivo `ArchVizAI`, carregamento idempotente, sem símbolos globais genéricos. Manter referência ao diálogo e trazer a janela existente à frente. Registrar callbacks novamente quando o diálogo for recriado. Menu é obrigatório; toolbar é opcional e pode aguardar para evitar assets extras.

UI simples com resumo da cena, controles atuais, observações, estado, erros e original/render lado a lado. As configurações escolhidas ficam no plugin e são enviadas diretamente, sem preenchimento na web. Carregar catálogo antes de habilitar o envio. Sem catálogo disponível, mostrar engine offline em vez de usar enums locais desatualizados.

Usar `UI::HtmlDialog#set_file`, callbacks e retorno serializado via `execute_script`, conforme a [documentação oficial de HtmlDialog](https://ruby.sketchup.com/UI/HtmlDialog.html). Manter nomes/metadados fora de HTML executável: usar `textContent` e serialização JSON segura.

Usar `Sketchup::Http::Request` para requests assíncronas, com referências enquanto estiverem ativas, timeout e tratamento de erros; não bloquear a UI com Net::HTTP síncrono. Validar multipart binário na versão instalada. Referência: [API HTTP oficial](https://ruby.sketchup.com/Sketchup/Http/Request.html).

Priorizar SketchUp Desktop Windows; alvo inicial de testes 2024–2026, começando pela versão disponível na máquina. Isso é uma meta de validação, não uma declaração de compatibilidade já comprovada. Não usar callbacks novos exclusivos do SketchUp 2026.1.

## 6. Fluxo completo SketchUp → ArchViz

1. Engine local iniciado. Usuário abre Extensions → ArchViz AI dentro do SketchUp.
2. Diálogo consulta health e catálogo pelo Ruby; lê resumo do modelo aberto e mostra o nome da cena selecionada, ou “Vista atual”.
3. Usuário escolhe configurações. Ao renderizar, desabilitar envio duplicado e entrar em Preparing.
4. Em uma operação no thread do SketchUp, obter modelo/view/câmera atuais, coletar metadata e capturar PNG, sem `camera=`, mudança de cena, estilo, seleção ou geometria. Usar dimensões da viewport, fundo atual e verificar retorno/arquivo da captura. Ler/capturar novamente no clique, pois a cena pode ter mudado desde a abertura do diálogo.
5. Guardar PNG em diretório temporário exclusivo da extensão. Enviar bytes + JSON + configurações para o POST existente. Nenhum caminho local entra no payload.
6. Engine valida, admite o job, monta prompt e grava base/scene/prompt/job na estrutura atual; o mesmo worker Antigravity processa.
7. Persistir o UUID devolvido nas preferências do plugin. Exibir Pending/Processing conforme o GET de status; não derivar conclusão de tempo decorrido ou log textual.
8. JS agenda polling a cada 3 segundos através do callback Ruby, sem requests sobrepostas. Logs opcionais a cada 2 segundos; health a cada 10 segundos. Parar timers ao concluir, falhar ou fechar o diálogo.
9. Completed: baixar `/base` e `/result` via Ruby e entregar ao HTML como imagens locais controladas ou data URLs limitadas. Escolha inicial: data URLs, respeitando limite de resposta; não expor paths arbitrários ao JS. Validar tamanho e tipo do download. Falha no download permite tentar novamente sem criar outro job.
10. Ao reabrir, consultar o UUID salvo e recuperar status/imagens; usar active apenas como indicação de ocupação global. Não assumir que o job ativo pertence ao plugin. Fechar o diálogo não cancela o render.
11. Erros HTTP/rede têm retry limitado e ação de retomar consulta. Nunca repetir POST automaticamente após timeout, pois o job pode já ter sido criado; consultar active/recent para oferecer recuperação. Job failed mostra a mensagem do engine. Cancelamento, se exposto, reutiliza POST cancel e só confirma sucesso após verificar a resposta.
12. Remover apenas temporários criados pela extensão, com caminho verificado, depois de concluída a transferência; nunca limpar `jobs` pelo Ruby.

Captura baseada em `active_model.active_view.write_image`, documentada na [API de View](https://ruby.sketchup.com/Sketchup/View.html#write_image-instance_method). Testar viewport com câmera paralela, perspectiva, aspect ratio fixo e escala DPI para garantir ausência de corte/esticamento. Não prometer fidelidade pixel a pixel sem esse teste real.

## 7. Schema da cena

Proposta final para revisão: schema `1.0`, dados objetivos, sem entidades semânticas arquitetônicas. Exemplo válido de estrutura com uma instância:

```json
{
  "schemaVersion": "1.0",
  "source": "sketchup",
  "capturedAt": "2026-09-10T14:00:00.000Z",
  "units": "inch",
  "viewport": { "width": 1600, "height": 900 },
  "camera": {
    "eye": [300, -500, 200],
    "target": [0, 0, 80],
    "up": [0, 0, 1],
    "perspective": true,
    "fovDegrees": 47.2,
    "fovIsHeight": true,
    "aspectRatio": 0,
    "parallelHeight": null
  },
  "scene": { "name": "Cena 04" },
  "model": {
    "name": "Estudo de fachada",
    "materialCount": 1,
    "objectCount": 1,
    "countsComplete": true
  },
  "materials": [
    {
      "id": "material-1",
      "name": "ACM vermelho",
      "color": "#B41E24",
      "opacity": 1,
      "texture": {
        "name": "acm.png",
        "width": 40,
        "height": 40,
        "pixelWidth": 1024,
        "pixelHeight": 1024
      }
    }
  ],
  "objects": [
    {
      "instancePath": [12345],
      "name": "FACHADA_ACM",
      "definitionName": null,
      "type": "group",
      "materialId": "material-1",
      "tag": "Fachada",
      "visibility": {
        "hidden": false,
        "tagVisible": true,
        "effectiveVisible": true
      },
      "boundingBox": {
        "space": "world",
        "min": [0, 0, 0],
        "max": [100, 10, 120]
      },
      "worldTransform": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    }
  ],
  "collection": {
    "scope": "group-and-component-instances",
    "materialsTruncated": false,
    "objectsTruncated": false,
    "maxDepthReached": false
  }
}
```

Semântica e regras:

- `units: inch` vale para posições, bounding boxes, translações e dimensões físicas das texturas/câmera. Usar a unidade interna, não strings formatadas conforme a preferência do usuário. Vetor up é adimensional, FOV em graus e dimensões da imagem em pixels.
- Câmera é a vista corrente, não a câmera salva da página selecionada. `scene.name` é informativo e pode ser null. `fovDegrees`/`fovIsHeight` são null quando não aplicáveis; `parallelHeight` é preenchido na projeção paralela. `aspectRatio: 0` preserva o valor que significa ratio automático da viewport; o ratio efetivo pode ser calculado de width/height. Referência: [Camera](https://ruby.sketchup.com/Sketchup/Camera.html).
- `materials` lista materiais do modelo, sem exportar arquivos de textura. `texture` pode ser null; `name` é apenas basename, nunca caminho absoluto. `opacity` entre 0 e 1 evita ambiguidade de transparência (1 = opaco). IDs são referências locais a esta captura.
- Percorrer grupos e instâncias de componentes a partir de `model.entities`, incluindo instâncias aninhadas e respeitando limites. Não exportar faces/arestas individualmente nem analisar arquitetura. Preservar nomes vazios e nomes das definições separadamente.
- `instancePath` contém IDs persistentes de cada ancestral e da instância, distinguindo instâncias repetidas. Transformação mundial é a composição das transformações ancestrais, serializada na ordem de `Geom::Transformation#to_a`, sem transpor. Bounding box mundial deve ser calculada transformando os oito cantos dos limites locais; não aplicar a transformação duas vezes.
- `materialId` é o material diretamente atribuído à instância, ou null. Não inferir material herdado, material das faces ou categoria arquitetônica.
- Visibilidade efetiva é de exibição conforme hierarquia/tags/opções do modelo, não teste de oclusão ou inclusão no campo de visão. Usar a API de visibilidade por caminho quando suportada; caso não seja possível calcular corretamente, enviar null, nunca inventar true. Referência: [Model e drawing_element_visible?](https://ruby.sketchup.com/Sketchup/Model.html#drawing_element_visible%3F-instance_method).
- `materialCount` é o total disponível no modelo. `objectCount` é o total de instâncias visitadas; se a coleta parar no limite, `countsComplete: false` e a UI o apresenta como parcial. Arrays são limitados e a truncagem é explícita.
- Falta de informação opcional usa null; câmera/viewport/source/schemaVersion são obrigatórios. Rejeitar versões incompatíveis e payload malformado antes da persistência. Não salvar o JSON bruto sem validação/projeção para campos conhecidos. Campos novos exigem revisão do contrato versionado; não há dependência da futura IArq.

## 8. Endpoints envolvidos

| Método/rota | Hoje | Proposta |
|---|---|---|
| POST `/api/render` | Multipart, cria job, retorna UUID/status; 400 sem imagem, 429 ocupado, 500 erro | Extensão aditiva de source/scene e validação; mesma resposta de sucesso |
| GET `/api/render/[jobId]` | JSON status, erro, createdAt/completedAt e dimensões; 404 inexistente | Reutilizar sem alteração |
| GET `/api/render/[jobId]/base` | Bytes da imagem base, Content-Type image/png, cache immutable | Reutilizar; plugin sempre envia PNG |
| GET `/api/render/[jobId]/result` | PNG quando concluído; 404 se indisponível; cache immutable | Reutilizar |
| GET `/api/render/[jobId]/logs` | JSON com worker.log | Reutilizar opcionalmente |
| POST `/api/render/[jobId]/cancel` | Interrompe worker e marca failed; 400 estado terminal | Reutilizar; testar limitações existentes de cancelamento |
| GET `/api/jobs/active` | Primeiro pending/processing ou null | Reutilizar para ocupação/recuperação, sem assumir propriedade |
| GET `/api/jobs/recent` | Até 20 jobs, mais recentes primeiro | Reutilizar; jobs das duas interfaces compartilham histórico |
| GET `/api/health` | Estado, caminho do agy e contagens; não comprova autenticação/quota do CLI | Reutilizar para diagnóstico básico |
| GET `/api/render/options` | Não existe | Novo: `{ success, contractVersion: '1.0', options, defaults }` do catálogo comum |

Não criar POST `/api/jobs`, namespace de render SketchUp, endpoint que aceite filesystem paths nem endpoint de cena: `scene.json` é artefato interno neste MVP. A rota estática `options` deve ser testada ao lado de `[jobId]`.

## 9. Arquivos a criar

Nesta etapa: somente `implementation_plan_sketchup_plugin.md`.

Após revisão:

| Arquivo(s) | Finalidade |
|---|---|
| Todos os arquivos da árvore `sketchup-plugin/` da seção 5 | Extensão isolada, UI e documentação |
| `types/scene.ts` | Contrato de cena 1.0 e origem da captura |
| `lib/scene-validation.ts` | Validação/projeção e limites da metadata |
| `lib/scene-prompt-context.ts` | Resumo determinístico e limitado para o prompt |
| `lib/render-options.ts` | Constantes/defaults compartilhados e base dos tipos |
| `lib/render-admission.ts` | Exclusão mútua mínima para admissão no engine único |
| `app/api/render/options/route.ts` | Publicar catálogo sem duplicar enums |
| `start-sketchup-engine.bat` | Inicialização local sem navegador, bind loopback e cwd correto |
| `scripts/test-sketchup-contract.cjs` | Regressão web, metadata, limites, prompt e admissão concorrente |
| `sketchup-plugin/test/scene_reader_test.rb` | Casos de coleta/serialização com doubles; não substitui teste no SketchUp |
| `sketchup-plugin/test/api_client_test.rb` | Multipart binário, URLs permitidas e tratamento de respostas |

Empacotamento em `.rbz` pode ser feito a partir da pasta da extensão, sem distribuir node_modules, jobs, credenciais ou o engine dentro do plugin. A geração do pacote é parte da entrega posterior, não desta auditoria.

## 10. Arquivos a modificar

| Arquivo | Mudança localizada proposta |
|---|---|
| `app/api/render/route.ts` | Source/scene opcionais, validação, catálogo de defaults e admissão protegida; chamadas existentes preservadas |
| `lib/job-manager.ts` | Contexto opcional na criação e escrita de scene.json; sem mudar diretórios ou leitores |
| `lib/render-prompt.ts` | Contexto opcional via helper; saída sem contexto idêntica à atual |
| `types/job.ts` | `origin` e `sceneFile` opcionais; preservar `source` |
| `types/render.ts` | Derivar unions do catálogo; manter nomes, valores e interfaces públicas |
| `components/RenderSettings.tsx` | Importar listas do catálogo; manter controles, layout e callbacks |
| `app/page.tsx` | Importar apenas defaults comuns; preservar upload, polling, histórico e resultado |
| `README.md` | Explicar cliente SketchUp, pré-requisito do engine e corrigir quem move os jobs |

Preservados sem alteração planejada: `lib/agy-worker.ts`; todos os endpoints existentes de status/base/result/logs/cancel/health/active/recent; `components/UploadArea.tsx`; `components/RenderResult.tsx`; `app/layout.tsx`; `app/globals.css`; `next.config.ts`; `package.json` e lockfile; scripts atuais de início/parada/remoto; teste de status atual; arquivos históricos em `jobs`; variáveis locais e configurações do Antigravity. Nenhuma migração, remoção ou reescrita ampla.

Se testes reproduzirem um defeito anterior que impeça o fluxo, documentar o caso e corrigir pontualmente; não expandir silenciosamente esta lista para uma refatoração de arquitetura.

## 11. Riscos

| Risco/evidência | Tratamento e limite do MVP |
|---|---|
| Concorrência: check seguido de awaits permite dois envios | Exclusão mútua na admissão e teste web/plugin simultâneos; uma instância do engine |
| Worker sem timeout/supervisão persistente | Erros de conexão não significam failed; testar encerramento/reinício, não prometer retomada automática de processo |
| Windows bloqueia rename | Preservar status terminal autoritativo e teste existente; verificar resultado independente da pasta |
| Movimento inicial usa retry com timer e o spawn pode prosseguir cedo | Testar falha de movimentação; se reproduzida, correção localizada antes de aprovar o MVP |
| Cancelamento escreve diretamente em processing, usa Map volátil e pode reportar sucesso após erro de escrita | Não assumir cancelamento pelo retorno visual; testar pending/processing/terminal e registrar necessidade de correção pontual |
| Health só encontra o CLI | Validar render real com instalação/autenticação/quota existentes; não marcar pipeline comprovado só pelo health |
| Captura grande e multipart/data URLs | Limites explícitos, envio binário por Ruby e teste em viewport real; erro claro sem recorte silencioso |
| Componentes aninhados, tags e câmera paralela | Unidades/espaços definidos, IDs por caminho e fixtures reais; nenhum reconhecimento semântico |
| CEF e APIs variam entre versões | Testar versão instalada e depois matriz Windows alvo; não reivindicar versões não testadas |
| Payload textual pode entrar no prompt/JS | Validação, escape, resumo limitado e renderização de texto; sem comandos fornecidos pelo plugin |
| Bind/túnel atual pode expor API | Iniciador local separado e sessão sem túnel para este MVP; preservar funcionalidade remota atual sem declarar que ficou protegida |
| Reiniciar com `.next` existente pode usar build antigo | Documentar rebuild após instalação/atualização do engine; não considerar mera existência de `.next` como build atualizado |
| Jobs misturados no histórico | Comportamento compartilhado intencional; identificar origem em metadata, sem dividir fila/histórico |
| Captura objetiva não garante fidelidade da IA | Validar resultado visual; não implementar análise arquitetônica ou prometer preservação matemática |

Fora de escopo: IArq e qualquer reconhecimento semântico/normativo; DWG/PDF; depth/normal/material/object passes; segmentation/ControlNet; export GLB/OBJ; integração V-Ray/Enscape/Corona; alteração de materiais/geometria; overlay/Match Photo; lote de cenas; novo processamento remoto/cloud; tempo real; WebSockets. O plugin não muda o comportamento interno nem os serviços usados pelo Antigravity atual.

## 12. Critérios de aceite do MVP

Antes de implementar, usuário revisa este documento, especialmente schema, comunicação Ruby/HTTP e campos aditivos. Depois, executar em etapas pequenas: contrato backend → extensão/captura → comunicação/polling/resultado → validação web e SketchUp. A aprovação deste plano não equivale a comprovação de funcionamento.

| Critério | Evidência exigida na implementação |
|---|---|
| Web preservada | Upload JPG/PNG/WEBP dentro dos limites atuais, todas as configurações, novo render, status/logs, recuperação ao recarregar, histórico, comparação e download funcionando |
| Contrato legado | POST sem source/scene continua aceito; defaults e resposta mantidos; fixtures de jobs antigos continuam legíveis |
| Prompt preservado | Comparação exata do prompt sem contexto para configurações representativas, incluindo todos os níveis de fidelidade |
| Mesmo pipeline | Job SketchUp aparece nos diretórios atuais e usa o mesmo worker/status/result; nenhum segundo motor |
| Origem segura para compatibilidade | `source` de job continua base.png; `origin` identifica web/sketchup; scene.json só aparece quando fornecido validamente |
| Captura automática | Render iniciado no HtmlDialog sem export/upload manual e sem abrir navegador; câmera, cena, estilo, seleção e geometria não modificados |
| Leitura objetiva | Modelo sem cena salva, câmera paralela/perspectiva, material sem textura, componentes repetidos/aninhados, ocultação por ancestral/tag e nomes Unicode testados |
| Interface responsiva | Upload/polling HTTP não bloqueiam SketchUp; um envio e uma consulta de status por vez |
| Resultado interno | Original e render exibidos no HtmlDialog; falha de download recuperável sem gerar outro trabalho |
| Retomada | Fechar/reabrir diálogo acompanha o UUID salvo, inclusive quando o job termina enquanto fechado |
| Clientes em paralelo | Web e plugin abertos juntos; dois POST simultâneos admitem apenas um job e o outro recebe 429; ambos podem consultar resultados |
| Robustez | Testes de payload inválido, JSON grande, origem/versão inválidas, traversal/URL externa, engine offline, erro CLI e status terminal em pasta processing |
| Segurança local | Engine do MVP escuta loopback; sem CORS amplo, endpoint de shell ou leitura arbitrária de paths; nenhum túnel na sessão de aceite |
| Entrega verificável | Checagem TypeScript, testes de contrato/Ruby, build e teste manual no SketchUp com versões registradas; separar resultados simulados dos reais |

Resposta à pergunta fundamental nesta primeira tarefa: a arquitetura encontrada permite adicionar o SketchUp como nova interface do ArchViz AI com mudanças aditivas e localizadas. O plugin ainda não foi adicionado, portanto não é possível afirmar que sua integração já preserva operacionalmente a web. Essa afirmação dependerá da aprovação do plano e das evidências de regressão acima. Nesta etapa, apenas o documento foi criado; a aplicação permanece como estava no início da auditoria.
