# ArchViz AI

MVP de um renderizador arquitetônico assistido por IA que utiliza Next.js e a API Gemini.

## Requisitos

- Node.js 18+
- Chave de API do Google Gemini

## Instalação

1. Clone o repositório.
2. Instale as dependências:
   ```bash
   npm install
   ```
3. Crie o arquivo `.env.local` baseado no `.env.example`:
   ```bash
   cp .env.example .env.local
   ```
4. Adicione sua chave da API Gemini no `.env.local` (`GEMINI_API_KEY`).

## Executando localmente

Inicie o servidor de desenvolvimento:

```bash
npm run dev
```

Abra [http://localhost:3000](http://localhost:3000) no seu navegador.

## Deploy na Vercel

O projeto está pronto para ser implantado na Vercel:

1. Suba este repositório para o GitHub.
2. Importe o projeto no painel da Vercel.
3. Configure a variável de ambiente `GEMINI_API_KEY` na Vercel.
4. O deploy será feito automaticamente a cada push na branch `main`.
