@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  ================================================================
echo   ALLAGI KM_SUPPORT_KEY (27/9) - to kleidi Apps Script ^<-^> server
echo   PRIN to trexeis: exe HDH anoixto to Apps Script (admin@) sto
echo   Project Settings -^> Script Properties -^> KM_SUPPORT_KEY
echo  ================================================================
echo.
pause
copy /y "secrets\km_support_key.txt" "secrets\km_support_key_OLD_27-09.txt" >nul
if errorlevel 1 goto failed
powershell -NoProfile -Command "([guid]::NewGuid().ToString('N') + [guid]::NewGuid().ToString('N')) | Set-Content -NoNewline -Encoding ascii 'secrets\km_support_key.txt'"
if errorlevel 1 goto restore
echo [1/2] Neo kleidi sti Cloudflare...
type secrets\km_support_key.txt | npx --yes wrangler secret put KM_SUPPORT_KEY
if not errorlevel 1 goto ok
echo    Proti prospatheia apetyxe - xana mia fora...
type secrets\km_support_key.txt | npx --yes wrangler secret put KM_SUPPORT_KEY
if errorlevel 1 goto restore
:ok
echo [2/2] Antigrafi sto proxeiro...
powershell -NoProfile -Command "Get-Content -Raw 'secrets\km_support_key.txt' | ForEach-Object { $_.Trim() } | Set-Clipboard"
echo.
echo  ================================================================
echo   OK - TO NEO KLEIDI EINAI STO PROXEIRO.
echo   TORA, AMESOS: sto Apps Script, timi tou KM_SUPPORT_KEY:
echo   diegrapse tin palia, Ctrl+V, "Save script properties".
echo   MIN to epikolliseis pouthena allou.
echo  ================================================================
echo.
pause
exit /b 0
:restore
copy /y "secrets\km_support_key_OLD_27-09.txt" "secrets\km_support_key.txt" >nul
echo.
echo  ******** APETYXE - TIPOTA DEN ALLAXE (to palio kleidi isxyei). ********
echo.
pause
exit /b 1
:failed
echo  ******** APETYXE - TIPOTA DEN ALLAXE. ********
pause
exit /b 1
