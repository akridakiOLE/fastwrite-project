@echo off
chcp 65001 >nul
rem KM-PRO-V201a 18/10/2026 - METRISI kostous mias synomilias Kosta sto STAGING (6 minymata). TIPOTA allo, kanena deploy.
cd /d C:\Users\User\fastwrite-pro
set "OUT=C:\Users\User\fastwrite-pro\Claude outputs\pro\v201a_out.txt"
> "%OUT%" echo PRO v201a %date% %time%
node tools\pro\kostas_measure.mjs >> "%OUT%" 2>&1
if errorlevel 1 ( echo V201A_APETYXE >> "%OUT%" & exit /b 1 )
echo V201A_TELOS >> "%OUT%"
exit /b 0
