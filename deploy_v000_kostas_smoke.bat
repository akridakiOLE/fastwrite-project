@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\fastwrite-project
echo.
echo  v105 SMOKE = pragmatiki dokimi tou Kosta-politi (5 senaria, ~0.10 $). DEN anevazei tipota, DEN aggizei ton server.
echo.
python tools\agent\build_knowledge.py
if errorlevel 1 goto failed
node --check src\km.js
if errorlevel 1 goto failed
node --experimental-sqlite tools\agent\smoke_v105.mjs
echo.
echo  Apotelesma: agent_smoke_v105_out.txt
exit /b 0
:failed
echo  ******** APETYXE. ********
exit /b 1
