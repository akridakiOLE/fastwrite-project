@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
title KOSTOMETRO - ANAMONI ENTOLIS DEPLOY
echo.
echo  ================================================================
echo   ANAMONI ENTOLIS DEPLOY
echo  ================================================================
echo.
echo   Afise afto to parathyro ANOIXTO kai fyge.
echo   O Claude grafei ena arxeio-entoli kai afto edo trexei to deploy.
echo.
echo   TI KANEI AKRIVOS:
echo     - psaxnei kathe 15 defterolepta to arxeio DEPLOY_TRIGGER.txt
echo     - diavazei mesa to onoma enos deploy_vNN.bat
echo     - to trexei. AFTO trexei mono tou ola ta test kai DEN kanei
echo       push an kokkinisei estw kai ena.
echo     - grafei to apotelesma sto DEPLOY_LOG.txt
echo.
echo   Gia na stamatisei: kleise to parathyro i pata Ctrl+C.
echo  ================================================================
echo.

:loop
if not exist "DEPLOY_TRIGGER.txt" goto wait

set "TARGET="
set /p TARGET=<DEPLOY_TRIGGER.txt
ren "DEPLOY_TRIGGER.txt" "DEPLOY_TRIGGER.running" 2>nul

echo.
echo [%date% %time%] Entoli: %TARGET%

rem --- FRAGMOS 1: mono arxeia deploy_*.bat, kanena allo ---
echo %TARGET% | findstr /b /c:"deploy_v" >nul
if errorlevel 1 (
  echo    APORRIFTHIKE - to onoma den einai deploy_vNN.bat
  echo [%date% %time%] APORRIFTHIKE onoma: %TARGET% >> DEPLOY_LOG.txt
  goto done
)
echo %TARGET% | findstr /e /c:".bat" >nul
if errorlevel 1 (
  echo    APORRIFTHIKE - den teleionei se .bat
  echo [%date% %time%] APORRIFTHIKE katalixi: %TARGET% >> DEPLOY_LOG.txt
  goto done
)

rem --- FRAGMOS 2: prepei na yparxei ---
if not exist "%TARGET%" (
  echo    DEN VRETHIKE to %TARGET%
  echo [%date% %time%] DEN VRETHIKE: %TARGET% >> DEPLOY_LOG.txt
  goto done
)

echo    Trexo %TARGET% ... ^(ta test pairnoun ligo^)
echo ================================================== >> DEPLOY_LOG.txt
echo [%date% %time%] XEKINA %TARGET% >> DEPLOY_LOG.txt
call "%TARGET%" < nul >> DEPLOY_LOG.txt 2>&1
set RC=%errorlevel%
echo [%date% %time%] TELOS %TARGET% - exit=%RC% >> DEPLOY_LOG.txt
if "%RC%"=="0" (
  echo    OK - to deploy egine. Deite DEPLOY_LOG.txt
) else (
  echo    APETYXE - exit=%RC%. TIPOTA den anevike. Deite DEPLOY_LOG.txt
)

:done
if exist "DEPLOY_TRIGGER.running" ren "DEPLOY_TRIGGER.running" "DEPLOY_TRIGGER.done" 2>nul
echo.
echo   Perimeno tin epomeni entoli...
echo.

:wait
timeout /t 15 /nobreak >nul
goto loop
