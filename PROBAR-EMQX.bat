@echo off
title MARTE - prueba EMQX (http 8080)
cd /d "%~dp0"
set HTTP=1
set PORT=8080
set MQTT_TCP=0
echo   Prueba de MARTE con el broker EMQX de config.js
echo   Pantalla: http://localhost:8080/?broker=cfg
echo   Cierra esta ventana para detener.
start "" cmd /c "timeout /t 3 >nul & start http://localhost:8080/?broker=cfg"
node server.js > "%~dp0emqx-log.txt" 2>&1
