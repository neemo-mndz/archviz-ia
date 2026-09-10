# ArchViz AI — extensão SketchUp, FASE 2

Extensão de captura e diagnóstico. Abre um HtmlDialog, lê a cena corrente, consulta o engine local e prepara em memória os campos de um futuro render. **Não envia POST, não inicia Antigravity e não cria jobs.**

## Instalação para desenvolvimento (Windows)

Feche o SketchUp. No PowerShell, a partir da raiz deste projeto:

```powershell
& .\sketchup-plugin\install-dev.ps1 -SketchUpVersion 2026
```

O script instala `archviz_ai.rb` em `%APPDATA%\SketchUp\SketchUp 2026\SketchUp\Plugins` e cria uma junction `archviz_ai` apontando para os arquivos deste checkout. Não substitui extensões existentes. A pasta do projeto precisa permanecer neste caminho.

Inicie o SketchUp e abra **Extensões / Extensions → ArchViz AI**. Se a janela já estiver aberta, o comando traz a mesma janela à frente. Se a política de carregamento do SketchUp bloquear extensões locais não assinadas, a instalação precisa ser permitida no Gerenciador de extensões; o plugin não muda essa política automaticamente.

Alternativa: instalar o pacote de desenvolvimento `dist/archviz-ai-0.2.0.rbz` pelo Gerenciador de extensões. Não misture a instalação RBZ com a junction de desenvolvimento; remova uma antes de usar a outra.

## Iniciar o engine

Use o backend já aprovado na FASE 1, sem alterações. Porta padrão do plugin: `http://127.0.0.1:3000`.

Se não houver servidor nessa porta:

```powershell
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Se usa produção, pare o servidor existente, execute `npm run build` e depois `npm run start -- --hostname 127.0.0.1 --port 3000`. Um build anterior à FASE 1 não contém `/api/render/options`; nesse caso o plugin informa catálogo indisponível, mesmo que health responda.

Para testar sem parar uma web existente na porta 3000, inicie o engine de desenvolvimento na porta 3001. No Ruby Console do SketchUp, configure:

```ruby
Sketchup.write_default('ArchVizAI', 'engine_url', 'http://127.0.0.1:3001')
```

Clique **Tentar novamente**. Para voltar ao padrão, grave `http://127.0.0.1:3000` da mesma forma. São aceitos somente HTTP e os hosts `localhost`, `127.0.0.1` e `::1`; sem paths extras, usuário/senha, query ou fragmento. Para IPv6, use `http://[::1]:3000`.

As consultas são GET assíncronas via `Sketchup::Http::Request`, com timeout de 10 segundos e cancelamento no fechamento. HTML/JS não fazem fetch ao localhost. Health indica somente que o engine respondeu; não comprova autenticação/quota do Antigravity. Não há início automático do engine nesta fase; ele permanece uma evolução obrigatória pós-MVP.

## Uso

1. Abra um modelo e o menu ArchViz AI.
2. Confira engine, cena, dimensões físicas da viewport e contagens de primeiro nível.
3. Escolha as opções carregadas do catálogo do backend. Nenhum enum é duplicado localmente.
4. Clique **CAPTURAR CENA**. A extensão relê a cena no clique, captura o framebuffer PNG, mostra o preview e prepara o payload em memória.
5. Após mover a câmera ou alterar o modelo, clique novamente para obter uma captura atual. Alterar configurações invalida o payload anterior e pede nova captura.

Capturas não mudam câmera, cena, estilo, seleção, geometria ou visibilidade. O PNG inclui o que o SketchUp desenha na viewport, inclusive eixos/seleção visíveis; a extensão não oculta esses elementos. Não aplica recorte, upscale ou resolução independente. O preview é reduzido apenas para caber no HtmlDialog, mantendo o aspecto; os bytes originais permanecem no payload.

Usa `device_width/device_height` quando disponíveis (SketchUp 2025+), pois `vpwidth/vpheight` passaram a ser medidas lógicas. O PNG é obtido por `View#write_image(source: :framebuffer)` e suas dimensões reais são verificadas antes de aceitar o payload. Viewports acima de 16 milhões de pixels/16.000 por lado ou PNG acima de 20 MiB geram erro, sem redimensionamento silencioso.

O arquivo temporário é criado em uma pasta exclusiva em `%TEMP%`, lido para memória e removido após a captura. Nunca é salvo junto ao modelo nem em jobs. O JSON usa somente o schema 1.0 aprovado: câmera, viewport, cena, modelo, até 200 materiais e 1.000 grupos/componentes raiz. Arrays parciais são informados na interface. Sem hierarquia, bounding boxes, transformação, export de texturas ou interpretação semântica.

## Diagnóstico e atualização

Logs curtos vão ao Ruby Console, com prefixo `ArchVizAI:`. O botão **Registrar JSON no Ruby Console** imprime a cena quando ela tem até 12 KB. Para cenas maiores, informa como inspecionar explicitamente o payload, sem despejar milhares de linhas automaticamente:

```ruby
ArchVizAI.controller.last_payload[:fields]['scene']
```

Estrutura em memória: `last_payload[:image]` contém bytes PNG, filename e content_type; `last_payload[:fields]` contém origin, scene serializado e as configurações. Não existem método de envio, polling, cancelamento ou resultado de render nesta versão.

Alterações Ruby exigem **reiniciar o SketchUp** para recarregar com segurança; não use `load` repetido sobre classes já abertas. HTML/CSS/JS são relidos ao fechar e reabrir o diálogo. Se alterar o registrador `archviz_ai.rb`, reinstale o loader ou copie apenas esse arquivo com o SketchUp fechado.

Para remover a instalação de desenvolvimento, feche o SketchUp e execute:

```powershell
& .\sketchup-plugin\uninstall-dev.ps1 -SketchUpVersion 2026
```

O script só remove a junction apontando para este checkout e o loader correspondente. Não remove arquivos do repositório. Para instalação RBZ, use o Gerenciador de extensões.

## Testes

O diretório `test/` não é carregado pela extensão nem incluído no RBZ. `real_session.rb` é um harness explícito para `-RubyStartup`: executa ações de diagnóstico fixas em uma sessão real do SketchUp e grava evidências na pasta informada por `ARCHVIZ_TEST_OUTPUT`. Não usa eval ou POST. A ação synthetic só permite criar seu modelo de teste em um documento sem caminho salvo; nunca em um arquivo do usuário. `ruby_checks.rb` verifica sintaxe, configuração de URL, limites Unicode, catálogo e instância única dentro do Ruby real do SketchUp.

Relatório e evidências: [FASE 2](../docs/sketchup-phase2/review.md). Não use mocks como substituto desses testes reais.

## Referências da API

- [Registro de extensão](https://ruby.sketchup.com/SketchupExtension.html)
- [HtmlDialog e callbacks](https://ruby.sketchup.com/UI/HtmlDialog.html)
- [View: framebuffer e dimensões físicas](https://ruby.sketchup.com/Sketchup/View.html)
- [HTTP assíncrono](https://ruby.sketchup.com/Sketchup/Http/Request.html)

A FASE 3 depende de nova revisão. IArq, render real, auto-start, passes auxiliares e edição do modelo permanecem fora desta entrega.
