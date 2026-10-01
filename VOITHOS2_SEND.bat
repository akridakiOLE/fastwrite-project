@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  ================================================================
echo   PRAGMATIKI APOSTOLI "voithos-2" - STELNEI EMAIL (~93 leads)
echo   Koino: osoi pirav to dianomi-1, OXI oi 3 tou voithos-1,
echo   OXI osoi exoun idi logariasmo, OXI diagrammenoi.
echo   3 gyroi ton 40. Kanenas den to pairnei dyo fores.
echo  ================================================================
echo.
set /p OK=Grapse NAI gia na fygoun ta email: 
if /i not "%OK%"=="NAI" goto stop
set /p K=<secrets\km_admin_key.txt
curl.exe -s -X POST "https://fastwrite.tech/api/km/admin/leads/send" -H "Content-Type: application/json" -H "X-Km-Admin: %K%" --data-binary "{\"campaign\":\"voithos-2\",\"dry_run\":false,\"limit\":40}" > "Claude outputs\dianomi\out_voithos2_real_1.json"
timeout /t 5 /nobreak >nul
curl.exe -s -X POST "https://fastwrite.tech/api/km/admin/leads/send" -H "Content-Type: application/json" -H "X-Km-Admin: %K%" --data-binary "{\"campaign\":\"voithos-2\",\"dry_run\":false,\"limit\":40}" > "Claude outputs\dianomi\out_voithos2_real_2.json"
timeout /t 5 /nobreak >nul
curl.exe -s -X POST "https://fastwrite.tech/api/km/admin/leads/send" -H "Content-Type: application/json" -H "X-Km-Admin: %K%" --data-binary "{\"campaign\":\"voithos-2\",\"dry_run\":false,\"limit\":40}" > "Claude outputs\dianomi\out_voithos2_real_3.json"
set K=
echo.
echo  Egine. Pes "egine" ston Claude - diavazei ta out_voithos2_real_1..3.json.
pause
exit /b 0
:stop
echo  Tipota den stalthike.
pause
exit /b 0
