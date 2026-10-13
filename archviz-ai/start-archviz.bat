@echo off
echo ====================================
echo      ARCHVIZ AI - START
echo ====================================

echo Checking dependencies...
if not exist "node_modules" (
    echo Instalando dependencias...
    call npm install
)

if not exist ".next" (
    echo Compilando projeto...
    call npm run build
)

echo Iniciando servidor na porta 3000...
start "ArchViz Server" cmd /k "title ArchViz Server && npm start"

echo Aguardando inicializacao...
timeout /t 4 > nul

echo Abrindo navegador...
start http://localhost:3000

echo.
echo ====================================
echo ArchViz AI esta rodando em background.
echo Pode fechar esta janela. 
echo Para encerrar completamente, feche a janela "ArchViz Server" ou rode stop-archviz.bat.
echo ====================================
timeout /t 5 > nul
