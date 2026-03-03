@echo off
REM Script para iniciar desenvolvimento local com React + Backend (Windows)
REM Uso: start-dev.bat

color 0A
echo.
echo ======================================================
echo   Iniciando Cerebrum (React + Backend)
echo ======================================================
echo.

REM Verificar se Node está instalado
where node >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERRO] Node.js nao esta instalado
    pause
    exit /b 1
)

REM Instalar dependências frontend se necessário
if not exist "node_modules" (
    echo [INFO] Instalando dependenciais frontend...
    call npm install
)

REM Instalar dependências backend se necessário
if not exist "backend\node_modules" (
    echo [INFO] Instalando dependencias backend...
    cd backend
    call npm install
    cd ..
)

REM Iniciar Backend em nova janela
echo [INFO] Iniciando Backend em http://localhost:3001
start "Backend - Cerebrum" cmd /k "cd backend && npm run dev"

REM Aguardar um pouco
timeout /t 3 /nobreak

REM Iniciar Frontend em nova janela
echo [INFO] Iniciando Frontend em http://localhost:5173
start "Frontend - Cerebrum" cmd /k "npm run dev"

echo.
echo ======================================================
echo   Ambos os servidores foram iniciados
echo   Backend:  http://localhost:3001
echo   Frontend: http://localhost:5173
echo.
echo   Feche as janelas para parar os servidores
echo ======================================================
echo.
pause
