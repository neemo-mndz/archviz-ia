# ArchViz AI

MVP de um renderizador arquitetônico assistido por IA. Esta versão utiliza um pipeline de renderização local baseado no Antigravity CLI (`agy`), isolando o processamento pesado do frontend.

## Requisitos

- Node.js 18+
- Antigravity CLI instalado (`agy`) e configurado na máquina local.

## Instalação

1. Clone o repositório.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Crie o arquivo `.env` baseado no `.env.example`:
   ```bash
   cp .env.example .env
   ```
4. Se o comando `agy` não estiver disponível globalmente no seu `PATH`, adicione o caminho absoluto do executável na variável `AGY_PATH` no arquivo `.env`. Exemplo:
   ```
   AGY_PATH=C:\Users\SEU_USUARIO\AppData\Local\agy\bin\agy.exe
   ```
   *Nota: Não utilize aspas na declaração do caminho no arquivo `.env` para evitar que barras invertidas sejam tratadas como caracteres de escape (ex: \n).*

## Executando localmente

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no seu navegador. O frontend enviará os jobs para o backend, que iniciará o worker do Antigravity CLI em background de forma assíncrona.

## Arquitetura (MVP Local)

Este projeto foi migrado de uma chamada direta síncrona de API (Vercel Edge Functions) para um **Job Manager local assíncrono**.
1. O backend salva a imagem e um arquivo `prompt.md` na pasta `jobs/pending/`.
2. O Node executa o CLI `agy` em background via `child_process`.
3. O CLI se encarrega de realizar o processamento com IA e move o diretório para `jobs/completed/` (ou `jobs/failed/`).
4. O frontend faz o polling (consulta) periódica do status do Job até obter a imagem `render.png`.

## Deploy (Aviso)

Como o MVP agora depende da execução do `agy` no sistema de arquivos local para spawns em Node.js (bypassando limitação de tempo de execução), o deploy padrão em plataformas Serverless (como Vercel) **não é mais suportado**. O projeto deve ser executado em uma VPS, máquina local dedicada ou container que permita o uso de `child_process` e escrita em disco.
