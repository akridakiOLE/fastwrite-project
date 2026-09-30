@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  PRAGMATIKI DOKIMI TOU VOITHOU - 3 erotiseis, ~0,02 $, DEN aggizei ton server
echo.
python tools\agent\build_knowledge.py
if errorlevel 1 echo    (python den trexei - xrisimopoieitai i etoimi gnosi)
node --experimental-sqlite tools\agent\smoke.mjs
if errorlevel 1 goto failed
echo.
echo  OK - oi apantiseis einai kai sto agent_smoke_out.txt. Pes "egine" ston Claude.
pause
exit /b 0
:failed
echo. & echo  ******** APETYXE - pes "egine" ston Claude, diavazei to agent_smoke_out.txt ******** & echo.
pause
exit /b 1
