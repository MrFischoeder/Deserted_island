@echo off
title Deserted Island - Multiplayer LAN Server
setlocal

set "PROJECT_DIR=F:\Codex\Deserted Island v2\01"
set "PORT=3000"
set "LAN_IP=192.168.1.162"

set "LOCAL_URL=http://localhost:%PORT%"
set "LAN_URL=http://%LAN_IP%:%PORT%"

cls
echo ======================================
echo   DESERTED ISLAND - MULTIPLAYER LAN
echo ======================================
echo.
echo Folder: %PROJECT_DIR%
echo Port:   %PORT%
echo.

:: -- Sprawdz Node.js --
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [BLAD] Node.js nie znaleziony w PATH.
    echo Pobierz ze strony: https://nodejs.org/
    echo.
    pause
    exit /b 1
)

for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VER=%%v
echo [OK] Node.js %NODE_VER%

:: -- Przejdz do folderu --
cd /d "%PROJECT_DIR%"
if %errorlevel% neq 0 (
    echo [BLAD] Nie mozna otworzyc folderu: %PROJECT_DIR%
    pause
    exit /b 1
)

:: -- npm install jesli brakuje node_modules --
if not exist "node_modules\" (
    echo.
    echo [INFO] Pierwsza instalacja - uruchamiam npm install...
    call npm install
    if %errorlevel% neq 0 (
        echo [BLAD] npm install nie powiodl sie.
        pause
        exit /b 1
    )
    echo [OK] Pakiety zainstalowane.
) else (
    echo [OK] node_modules gotowe.
)

echo.
echo ======================================
echo  URUCHAMIANIE SERWERA
echo ======================================
echo.
echo  Na TYM komputerze (host):
echo    %LOCAL_URL%
echo.
echo  Na INNYCH komputerach w sieci LAN:
echo    %LAN_URL%
echo.
echo  Ctrl+C zatrzymuje serwer.
echo ======================================
echo.

:: WAZNE: ustawiamy LAN_IP (tylko do logow w server.js), NIE HOST.
:: Gdybys ustawil HOST=192.168.1.162, Node zaczalby nasluchiwac TYLKO na tym
:: adresie i localhost:3000 przestalby dzialac na tym komputerze.
:: Serwer zawsze binduje sie na 0.0.0.0 (wszystkie interfejsy).

set "LAN_IP=%LAN_IP%"
set "PORT=%PORT%"

:: Otworz lokalnie po 2 sekundach
start /b cmd /c "timeout /t 2 >nul && start %LOCAL_URL%"

:: Uruchom serwer (blokuje terminal do Ctrl+C)
node server/server.js

echo.
echo Serwer zatrzymany.
pause
endlocal
