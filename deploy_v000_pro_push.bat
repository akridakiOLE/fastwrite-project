@echo off
chcp 65001 >nul
rem KM-PRO 13/10/2026 - push tou kladou pro sto GitHub (mono pro, pote master)
cd /d C:\Users\User\fastwrite-pro
set "OUT=C:\Users\User\fastwrite-pro\Claude outputs\pro\push_out.txt"
> "%OUT%" echo PUSH pro %date% %time%
git push origin pro >> "%OUT%" 2>&1
set RC=%errorlevel%
git branch -vv >> "%OUT%" 2>&1
echo PUSH_TELOS rc=%RC% >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b %RC%
