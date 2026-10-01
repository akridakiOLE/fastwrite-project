@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\fastwrite-project
echo.
echo  v108 SMOKE = rantevou + epanasyndesi "akouw prota" (4 senaria, ~0.10 $). DEN anevazei tipota, DEN stelnei email.
echo.
python tools\agent\build_knowledge.py
if errorlevel 1 goto failed
node --check src\km.js
if errorlevel 1 goto failed
node --experimental-sqlite tools\agent\smoke_v108.mjs
echo.
echo  Apotelesma: agent_smoke_v108_out.txt
exit /b 0
:failed
echo  ******** APETYXE. ********
exit /b 1
