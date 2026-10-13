@echo off
echo ========================================
echo         ARCHVIZ AI - MODO REMOTO
echo ========================================

echo 1. Verificando dependencias...
if not exist "node_modules" (
    echo Instalando dependencias...
    call npm install
)

if not exist ".next" (
    echo Compilando projeto...
    call npm run build
)

echo.
echo 2. Iniciando servidor local na porta 3000...
start "ArchViz Server" cmd /k "title ArchViz Server && npm start"

echo Aguardando inicializacao do servidor...
timeout /t 5 > nul

echo.
echo ========================================
echo 3. Abrindo Tunel Cloudflare...
echo ========================================
echo A URL PUBLICA TERA FINAL trycloudflare.com
echo Mantenha esta janela aberta para o tunel continuar funcionando.
echo.
echo Para acessar do celular, copie o endereco https listado abaixo:
echo.
cloudflared tunnel --url http://localhost:3000
