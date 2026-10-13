@echo off
echo ====================================
echo      ARCHVIZ AI - STOP
echo ====================================

echo Procurando servidor Node.js na porta 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| find ":3000" ^| find "LISTENING"') do (
    echo Encerrando PID %%a...
    taskkill /F /PID %%a
)

echo.
echo O ArchViz AI foi encerrado.
timeout /t 3 > nul
