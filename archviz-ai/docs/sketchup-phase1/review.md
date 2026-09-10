# FASE 1 — Contrato backend para SketchUp

Estado: implementada e validada em testes de contrato, HTTP e build. Aguardando revisão antes da FASE 2. Nenhuma pasta `sketchup-plugin` foi criada; nenhum render real do Antigravity foi iniciado nesta fase.

## Contrato entregue

O mesmo `POST /api/render` aceita `multipart/form-data` com `image` e todas as configurações web existentes. Os campos novos são:

- `origin`: `web` ou `sketchup`. Ausência significa web. `source` é aceito como alias de entrada da proposta original; valores conflitantes são rejeitados.
- `scene`: string JSON opcional, aceita para origin=sketchup. Ausência não adiciona contexto nem arquivo de cena, mesmo com origem SketchUp.

`Job.source` continua `base.png`. Novos jobs têm `origin`; os antigos sem origin continuam legíveis e são interpretados como web. `sceneFile: "scene.json"` aparece somente quando houve metadata. A resposta de criação continua HTTP 200 com `{ success, jobId, status }`, retornando pending como antes; polling informa processing/completed/failed.

`GET /api/render/options` publica `{ success, contractVersion, options, defaults }`. Tipos, selects web e defaults passam a compartilhar o catálogo; não foram acrescentados enums de humanização ou observações. A página e os componentes continuam usando os mesmos valores, controles e callbacks.

## Arquivos criados nesta fase

| Arquivo | Função |
|---|---|
| `types/scene.ts` | Schema simples, origem e câmera |
| `lib/scene-validation.ts` | Validação e projeção dos campos conhecidos |
| `lib/scene-prompt-context.ts` | Contexto adicional limitado e filtrado |
| `lib/render-options.ts` | Opções e defaults comuns |
| `lib/render-input.ts` | Multipart com limite de leitura, origem, configuração e imagem |
| `lib/render-admission.ts` | Trava mínima após reprodução da corrida |
| `app/api/render/options/route.ts` | Catálogo HTTP |
| `scripts/test-support/loader.cjs` | Carregador de módulos reais para testes isolados |
| `scripts/test-render-concurrency.cjs` | Dois POSTs HTTP simultâneos |
| `scripts/test-sketchup-contract.cjs` | Regressão web e contrato SketchUp pelo mesmo pipeline |
| `scripts/test-web-http.cjs` | Comparação HTTP dos selects com a web em execução e leitura de resultado histórico |
| `scripts/fixtures/web-prompts-before.json` | 45 expectativas capturadas antes da implementação |
| `scripts/fixtures/sketchup-scene.json` | Cena mínima para a imagem de teste 1×1 |
| `scripts/fixtures/pixel.png`, `pixel.jpeg`, `pixel.webp` | Imagens válidas mínimas para regressão de upload |
| `docs/sketchup-phase1/*` | Este relatório, exemplo de cena e prompts antes/depois |

## Arquivos modificados nesta fase

- `app/api/render/route.ts`: entrada aditiva e admissão protegida; mesmas chamadas ao manager/worker.
- `lib/job-manager.ts`: origem, arquivo opcional e tratamento de falha na persistência antes de iniciar o worker.
- `lib/render-prompt.ts`: argumento opcional de cena e append do contexto; texto web original preservado.
- `types/job.ts`: campos opcionais origin/sceneFile.
- `types/render.ts`: tipos derivados das mesmas opções existentes.
- `components/RenderSettings.tsx`: importa listas do catálogo; sem mudança de layout/controles.
- `app/page.tsx`: importa defaults do catálogo; nenhuma mudança no fluxo de upload/polling/resultado nesta fase.
- `implementation_plan_sketchup_plugin.md`: aviso de que os ajustes aprovados substituem o schema mais complexo da proposta original.

Worker Antigravity, endpoints de status/logs/base/result/cancel, health/histórico, componente de upload, componente de comparação e jobs históricos não foram alterados nesta fase. Mudanças preexistentes da migração local foram registradas separadamente nos commits `32e660f` e `91c889f`, antes do commit da FASE 1. Arquivos de ambiente e alterações de outros projetos não foram incluídos.

## Schema e uso

Exemplo completo: [scene.example.json](scene.example.json). Para enviar esse exemplo, a imagem deve ter 1600×900. A fixture dos testes usa 1×1, correspondente à imagem mínima; não representa uma captura real do SketchUp.

```json
{
  "schemaVersion": "1.0",
  "source": "sketchup",
  "units": "inch",
  "viewport": { "width": 1600, "height": 900 },
  "camera": {
    "eye": [300, -500, 200],
    "target": [0, 0, 80],
    "up": [0, 0, 1],
    "perspective": true,
    "fovDegrees": 47.2
  },
  "scene": { "name": "Cena 04" },
  "model": { "name": "Estudo", "materialCount": 0, "objectCount": 0 },
  "materials": [],
  "objects": []
}
```

Coordenadas em polegadas internas do SketchUp; units ausente é normalizado para inch. Projeção paralela usa fovDegrees=null. `aspectRatio` é opcional. Materiais podem trazer nome, cor hexadecimal, opacidade e descrição básica da textura. Objetos têm apenas nome, definitionName, tipo group/component, material, tag e hidden. Sem hierarquia ou interpretação arquitetônica. A coleta futura do MVP 0.1 será de grupos/componentes no nível raiz; contagens são totais desse escopo, e arrays podem ser parciais quando explicitamente menores que os totais.

Limites: corpo multipart 22 MiB medidos durante a leitura; imagem SketchUp PNG até 20 MiB/16 milhões de pixels; web mantém os formatos da UI e 2 MiB. Metadata até 1 MiB, 200 materiais, 1.000 objetos, 256 caracteres por nome; observações SketchUp até 4.000 caracteres. JSON/tipos/números/versão/opções inválidos retornam 400; limites retornam 413. Validação da imagem usa identificação de formato/dimensões, não decodificação integral dos pixels. JPEG/WEBP web continuam gravados sem conversão, conforme comportamento anterior.

O resumo do prompt tem até 6.000 caracteres, até 20 materiais nomeados e 30 objetos com nome/definitionName/material/tag útil. Group#1, Component#38, Untagged e nomes genéricos equivalentes permanecem no JSON, mas não entram no resumo. Não há reconhecimento semântico: a seleção é apenas textual. Dados são serializados/escapados e declarados não autoritativos; a imagem e as regras existentes continuam prevalecendo.

## Testes executados e resultados

| Verificação | Resultado |
|---|---|
| Concorrência antes da correção: `node scripts/test-render-concurrency.cjs --expect-race` | Reproduzida: `[200,200]`, dois jobs e duas chamadas ao worker |
| Mesmo teste após correção, sem `--expect-race` | Passou: `[200,429]`, um job e uma chamada ao worker |
| `node scripts/test-sketchup-contract.cjs` | Passou: 45 prompts idênticos, configurações, PNG/JPEG/WEBP, job legado, origem/cena opcionais, alias, validações, filtragem, orçamento e escape do contexto |
| Pipeline nos testes de contrato | Manager, prompt builder, adapter Antigravity e rotas reais; apenas o processo externo é substituído por um emissor simulado, produzindo render.png controlado |
| Falha de escrita de scene.json injetada | HTTP 500, nenhum worker iniciado, nenhum job ativo abandonado e próximo POST admitido |
| `node scripts/test-job-status.cjs` | Passou; preservada a regressão de status terminal em pasta processing |
| `npx tsc --noEmit` | Passou |
| ESLint dos módulos novos, tipos e novos testes | Passou; não é declaração de lint global limpo do projeto preexistente |
| `next build --webpack` em cópia temporária isolada | Passou, incluindo TypeScript, página web e todas as rotas; build em uso na porta 3000 não foi substituído |
| HTTP na versão de desenvolvimento, porta 3001 | Página, options, health e recent responderam 200; nove selects e opções/defaults renderizados idênticos aos da web em execução na porta 3000 |
| Leitura de job histórico real via servidor Next | Status, base, result e logs responderam 200, sem modificar o job |

Os testes gravam apenas diretórios temporários próprios e os removem com caminho verificado. A mensagem `Injected scene write failure` é a falha proposital do teste, não um erro de render real.

## Evidência da preservação da web

O POST sem origin/source/scene continua passando, mantém formato de resposta e defaults e não cria scene.json. Uploads válidos dos três formatos preservam os bytes. A comparação HTTP do HTML verificou os nove selects, incluindo ordem das opções e valor selecionado. Leitura dos resultados anteriores continuou funcionando. A alteração da página nesta fase está limitada à importação de defaults compartilhados.

Limite da validação: nenhum navegador estava conectado ao runtime disponível. Por isso não houve teste interativo de clicar/upload/polling/download nem inspeção visual nesta sessão. Os testes de contrato cobrem essas APIs, mas não substituem o teste visual. Também não houve render de IA real: isso permanece para o marco posterior aprovado, dentro do SketchUp.

## Prompt web antes/depois

- [Prompt antes](prompt-web-before.md): capturado antes das alterações, configuração padrão.
- [Prompt depois](prompt-web-after.md): gerado pelo builder implementado, sem scene.
- [Prompt SketchUp](prompt-sketchup.example.md): preserva o prefixo web e acrescenta apenas o contexto.

Exemplo de trecho, igual antes e depois:

```text
The supplied base image is the single authoritative source of truth.
PRESERVE EXACTLY:
- Camera position, viewpoint, and perspective
- Building geometry, volumetry, and facade proportions
```

O teste compara a string inteira, não apenas este trecho, para todas as 45 fixtures de configuração. Os dois arquivos de exemplo web são idênticos byte a byte.

## Limites e próxima revisão

Engine único local: a trava é de processo, não um coordenador distribuído. As limitações anteriores de supervisão do worker, cancelamento e reinicialização não foram refatoradas. Nenhum endpoint de path/comando ou CORS amplo foi adicionado. A configuração de rede/túneis atual não foi alterada; esta fase não declara a instalação automaticamente restrita a loopback.

Para desenvolvimento, engine iniciado previamente continua sendo pré-requisito. Detectar e iniciar automaticamente o engine é evolução obrigatória pós-MVP, registrada e não implementada. FASE 2 (extensão/captura) e FASE 3 (primeiro render real no HtmlDialog) aguardam revisão desta entrega. IArq e demais recursos excluídos permanecem fora do escopo.
