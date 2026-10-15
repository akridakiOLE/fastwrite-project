@echo off
chcp 65001 >nul
rem KM-PRO-V200b 15/10/2026 - xana i metrisi ftinou montelou (to 1o trexsimo pire 404 amesos meta to deploy). Mono metrisi + commit. TIPOTA sto Free/paragogi.
cd /d C:\Users\User\fastwrite-pro
set "OUT=C:\Users\User\fastwrite-pro\Claude outputs\pro\v200b_out.txt"
> "%OUT%" echo PRO v200b %date% %time%
node tools\pro\measure20.mjs free >> "%OUT%" 2>&1
if errorlevel 1 ( echo MEASURE_FAIL >> "%OUT%" & goto failed )
git add src/km.js tests/pro_f5.test.mjs tools/pro/measure20.mjs deploy_v000_pro_v200.bat deploy_v000_pro_v200b.bat commit_pro_v200.txt >> "%OUT%" 2>&1
git commit -F commit_pro_v200.txt >> "%OUT%" 2>&1
git push origin pro >> "%OUT%" 2>&1
git log -2 --oneline >> "%OUT%" 2>&1
echo PRO_V200B_TELOS >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b 0
:failed
echo PRO_V200B_APETYXE >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b 1
