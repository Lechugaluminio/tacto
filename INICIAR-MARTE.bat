@echo off
title MARTE - servidor local
cd /d "%~dp0"
set LOG=%~dp0marte-log.txt
echo [%date% %time%] inicio > "%LOG%"
echo.
echo   MARTE - servidor local
echo   =======================
where node >> "%LOG%" 2>&1
if errorlevel 1 goto sinnode
node -v >> "%LOG%" 2>&1
netstat -ano | findstr ":8443" | findstr "LISTENING" >nul
if not errorlevel 1 goto yacorre
if exist node_modules\express goto arrancar
echo   Instalando dependencias por primera vez, espera un momento...
echo [npm install] >> "%LOG%"
call npm install >> "%LOG%" 2>&1
if errorlevel 1 goto fallonpm
:arrancar
echo [arrancando] >> "%LOG%"
echo   Abriendo la experiencia en el navegador en unos segundos...
start "" cmd /c "timeout /t 5 >nul & start https://localhost:8443/"
echo   Para detener el servidor, cierra esta ventana.
node server.js
echo [servidor detenido] >> "%LOG%"
pause
exit /b
:yacorre
echo [ya estaba corriendo] >> "%LOG%"
echo   El servidor ya esta corriendo. Abriendo MARTE en el navegador...
start https://localhost:8443/
timeout /t 3 >nul
exit /b
:sinnode
echo [sin node] >> "%LOG%"
echo   No se encontro Node.js. Instalalo desde https://nodejs.org (version LTS) y vuelve a abrir este archivo.
pause
exit /b 1
:fallonpm
echo [npm fallo] >> "%LOG%"
echo   Fallo la instalacion. Revisa marte-log.txt y tu conexion a internet.
pause
exit /b 1
