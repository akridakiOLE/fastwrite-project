@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  ================================================================
echo   EKSTRATEIA "voithos-2" - DRY RUN - DEN STELNEI TIPOTA
echo   Deixnei posoi kai poioi tha to parousan (limit 40 ana klisi).
echo  ================================================================
echo.
set /p K=<secrets\km_admin_key.txt
curl.exe -s -X POST "https://fastwrite.tech/api/km/admin/leads/send" -H "Content-Type: application/json" -H "X-Km-Admin: %K%" --data-binary "{\"campaign\":\"voithos-2\",\"dry_run\":true,\"limit\":40}" > "Claude outputs\dianomi\out_voithos2_dry.json"
set K=
echo.
echo  Egine. Apotelesma: Claude outputs\dianomi\out_voithos2_dry.json
exit /b 0
