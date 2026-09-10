# FASE 2 — Extensão mínima SketchUp

Estado: implementada e validada no SketchUp Desktop real em 10/09/2026. Entrega para revisão; FASE 3 não iniciada. A extensão captura e prepara o payload em memória, sem POST de render, jobs ou execução do Antigravity. O backend da FASE 1 não foi modificado.

## Arquivos entregues

Todos os arquivos desta fase são novos, em `sketchup-plugin/` e `docs/sketchup-phase2/`. Nenhum arquivo preexistente foi modificado nesta entrega.

| Arquivo em sketchup-plugin/ | Função |
|---|---|
| archviz_ai.rb | Registro oficial SketchupExtension, versão 0.2.0 |
| archviz_ai/main.rb | Namespace ArchVizAI, menu Extensions e controlador único |
| archviz_ai/dialog.rb | HtmlDialog, callbacks, catálogo, diagnóstico e payload em memória |
| archviz_ai/config.rb | Preferência interna de URL, loopback e limites |
| archviz_ai/api_client.rb | GET assíncrono de health/options, timeout e encerramento |
| archviz_ai/scene_reader.rb | Schema 1.0, câmera, viewport, materiais e objetos raiz |
| archviz_ai/scene_capture.rb | PNG framebuffer, verificação e limpeza do temporário próprio |
| archviz_ai/ui/index.html, app.js, styles.css | Controles vindos do catálogo e preview integrado |
| install-dev.ps1, uninstall-dev.ps1 | Instalação com junction e remoção restrita à instalação correspondente |
| README.md | Instalação, engine, uso, atualização, remoção e limites |
| dist/archviz-ai-0.2.0.rbz | Pacote de desenvolvimento, somente loader e código da extensão |
| test/real_session.rb, ruby_checks.rb | Harness explícito e verificações dentro do SketchUp real |
| test/capture-desktop.ps1 | Registro de screenshots reais, considerando DPI |
| test/verify-evidence.cjs | Validação das capturas reais pelo parser existente da FASE 1 |

Esta pasta contém o relatório e `evidence/`, com screenshots, PNGs capturados, cenas e estados antes/depois. O harness não é carregado pela extensão nem incluído no RBZ. Seus testes de mudança de câmera e criação de geometria são restritos ao documento sintético sem caminho salvo.

## Ambiente realmente testado

Windows 11 Pro, versão 10.0.26200, build 26200. SketchUp **26.2.243**, Ruby **3.2.2**, plataforma `x64-mswin64_140`, Chromium **137.0.7151.121**, CEF **137.0.19**. Registro direto: [runtime.json](evidence/runtime.json).

Modelo real: `C:\Users\nmene\Desktop\Render IA\MP_RIO_BTI_LC00SN_ARQ_3D-Enscape.skp`. O arquivo foi aberto e capturado sem salvar. SHA-256 conferido antes/depois, sem alteração; valor em [model-sha256.json](evidence/model-sha256.json). O teste registrou `modified=false` antes e depois.

## Instalar, abrir e iniciar o engine

Instruções completas: [README](../../sketchup-plugin/README.md). A instalação de desenvolvimento foi executada para SketchUp 2026: loader em `%APPDATA%\SketchUp\SketchUp 2026\SketchUp\Plugins` e junction para este checkout. Abra **Extensões → ArchViz AI**. [Screenshot do menu real](evidence/extensions-menu.png). Ruby atualizado exige reiniciar o SketchUp; HTML/CSS/JS são relidos ao fechar/reabrir o diálogo.

Com SketchUp fechado, instalação reproduzível na raiz do projeto:

```powershell
& .\sketchup-plugin\install-dev.ps1 -SketchUpVersion 2026
```

O script recusa substituir uma instalação existente. Para remover, com SketchUp fechado, execute `uninstall-dev.ps1 -SketchUpVersion 2026`. Alternativamente use o [RBZ de desenvolvimento](../../sketchup-plugin/dist/archviz-ai-0.2.0.rbz) no Gerenciador de extensões, sem misturar com a junction.

Engine padrão: `http://127.0.0.1:3000`. Quando a porta estiver livre, use `npm run dev -- --hostname 127.0.0.1 --port 3000`. Nesta validação foi usada a porta **3001**, com `npm run dev -- --hostname 127.0.0.1 --port 3001`, preservando o servidor preexistente em 3000. Configure no Ruby Console:

```ruby
Sketchup.write_default('ArchVizAI', 'engine_url', 'http://127.0.0.1:3001')
```

Clique Tentar novamente. Um build anterior à FASE 1 precisa ser atualizado para disponibilizar `/api/render/options`; health sozinho não basta. O plugin não inicia o engine automaticamente e não modifica a configuração de rede da web.

## Evidências e resultados reais

| Caso | Resultado |
|---|---|
| A — Modelo simples, perspectiva | PNG 1920 × 839; câmera e estado preservados |
| B — Modelo real do usuário | PNG 1920 × 839, 495.426 bytes, cena `CENA 1 `, 177 materiais e 48 grupos/componentes raiz |
| C — Sem cena salva | `scene.name=null`; captura aceita, interface usa Vista atual |
| D — Câmera alterada com diálogo aberto | Nova captura contém novo eye; antes/depois de cada captura permanecem iguais |
| E — Engine desligado | Estado offline, erro HTTP 0 da API, captura desabilitada, botão Tentar novamente disponível |
| F — Engine ligado | Nove selects carregados do endpoint, captura e preview funcionam |
| Recuperação | Após religar engine e reabrir pelo menu, online e captura habilitada novamente |
| Projeção paralela adicional | `perspective=false`, `fovDegrees=null`, PNG 1920 × 839 |
| Janela única | Abrir novamente reutiliza a mesma instância visível; verificação no Ruby real |

Imagens do HtmlDialog: [modelo simples](evidence/simple-preview.png), [modelo real online](evidence/user-model-online.png), [preview real](evidence/user-model-preview.png), [engine offline](evidence/engine-offline.png). Estados do DOM extraídos do próprio HtmlDialog: [online](evidence/ui-online.json), [offline](evidence/ui-offline.json), [online após reabertura](evidence/ui-online-recovered.json).

Exemplo integral produzido pelo modelo real: [user-model-scene.json](evidence/user-model-scene.json). Captura original: [user-model.png](evidence/user-model.png). Não houve reconhecimento arquitetônico, exportação de texturas ou percurso profundo de entidades.

Comparações completas de câmera, seleção, estilo, cena, contagem de entidades e indicador de alteração: [modelo real](evidence/user-model-result.json), [perspectiva](evidence/perspective-result.json), [paralela](evidence/parallel-result.json), [câmera movida](evidence/camera-moved-result.json). Todas registram `unchanged=true`. No documento sintético, `modified=true` já existia antes da captura por causa da criação do modelo de teste.

## Particularidades da API e correspondência visual

Nesta versão, `vpwidth/vpheight` retornam dimensões lógicas (1536 × 671,2 no ambiente testado), enquanto o framebuffer é físico (1920 × 839). A extensão usa `device_width/device_height` e confere o IHDR do PNG. Não redimensiona nem recorta para mascarar diferenças de DPI.

`write_image(source: :framebuffer)` preservou o enquadramento observado. O modelo real tem câmera com `aspectRatio=2.0`, incluindo barras cinzas laterais na viewport; elas permanecem no PNG, assim como eixos e guias já visíveis. O preview reduz a imagem apenas na apresentação, mantendo a proporção. Não foi observada mudança de câmera nas capturas perspectiva ou paralela.

Callbacks adicionados depois de carregar a página não ficaram expostos ao JavaScript no primeiro ensaio do harness. O código da extensão registra os callbacks antes de `set_file`; o harness foi ajustado para usar callback previamente registrado. Requisições HTTP são retidas até completar, com timeout e cancelamento ao fechar. Engine desligado foi reportado pela API como HTTP 0, apresentado como offline.

## Verificação automatizada

- **16 verificações dentro do Ruby real** passaram: compilação de todos os Ruby, URLs permitidas/rejeitadas, Unicode, rotas de diagnóstico, instância única e catálogo. [Resultado](evidence/ruby-checks.json).
- `node sketchup-plugin/test/verify-evidence.cjs`: passou. Quatro PNGs e cenas reais aceitos pelo `parseRenderInput` existente, preservação de bytes, câmera/estado antes/depois, projeções, nova câmera e estados online/offline. Invoca apenas o parser local, sem HTTP/POST/jobs.
- `node --check sketchup-plugin/archviz_ai/ui/app.js`: passou.
- ESLint de `app.js` e `verify-evidence.cjs`: passou.
- Parser PowerShell nos três scripts: passou. Instalação de desenvolvimento executada; desinstalação não executada sobre a instalação ativa.

Nenhuma mudança Next.js/backend foi necessária, portanto não houve novo build de produção. A extensão faz somente GET health/options. Capturas temporárias próprias são removidas após leitura; evidências foram copiadas explicitamente pelo harness, fora de jobs e do diretório do modelo.

## Limite desta entrega

FASE 2 termina aqui. O payload fica em memória (`ArchVizAI.controller.last_payload`); não existe envio, polling, resultado ou cancelamento de render. O próximo marco depende de revisão desta entrega. Commit identificado na mensagem de entrega e no histórico Git deste relatório.
