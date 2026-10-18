@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\fastwrite-project
echo.
echo  K3a = Sign in with Apple ston server (ta koumpia DEN mpainoun akoma) + codemagic.yaml Apple ID
echo  Kamia allagi sti vasi. Kamia allagi stin othoni tis efarmogis.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"
set P8=C:\Users\User\kostometro-app\secrets\AuthKey_N8QC6LYTLC.p8
if not exist "%P8%" goto nokey

echo [1/7] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
echo    OK

echo [2/7] K3a tests + metallaxeis 1-9 (exit 0 = piastike)...
node --experimental-sqlite tests\k3a.test.mjs
if errorlevel 1 goto tf
for /L %%N in (1,1,9) do (
  node --experimental-sqlite tests\k3a.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
echo    OK

echo [3/7] Palia tests syndesis (legal_v21, v98, v99, v100, v102, v105, v106, v114, v116, v118, v120, v131)...
for %%T in (legal_v21 v98 v99 v100 v102 v105 v106 v114 v116 v118 v120 v131) do (
  node --experimental-sqlite tests\%%T.test.mjs >nul 2>&1
  if errorlevel 1 ( echo    APETYXE: %%T & goto tf )
)
echo    OK

echo [4/7] git add (RITI lista) + commit + push...
git add src\km.js wrangler.toml tests\k3a.test.mjs tests\legal_v21.test.mjs deploy_k3a.bat commit_k3a.txt
if errorlevel 1 goto failed
git commit -F commit_k3a.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo    OK

echo [5/7] Mystiko APPLE_PRIVATE_KEY (apo to .p8 - tipota den emfanizetai)...
type "%P8%" | npx --yes wrangler secret put APPLE_PRIVATE_KEY
if errorlevel 1 goto failed
echo    OK

echo [6/7] wrangler deploy...
call npx --yes wrangler deploy
if errorlevel 1 goto failed
echo    OK

echo [7/7] Epalithefsi stin paragogi...
timeout /t 8 /nobreak >nul
curl.exe -s -D - -o NUL https://fastwrite.tech/api/km/auth/apple/start > "%TEMP%\k3a_apple.txt"
findstr /i /c:"location: https://appleid.apple.com/auth/authorize" "%TEMP%\k3a_apple.txt" >nul
if errorlevel 1 goto vf
findstr /i /c:"response_mode=form_post" "%TEMP%\k3a_apple.txt" >nul
if errorlevel 1 goto vf
curl.exe -s -D - -o NUL https://fastwrite.tech/api/km/auth/google/start > "%TEMP%\k3a_google.txt"
findstr /i /c:"location: https://accounts.google.com" "%TEMP%\k3a_google.txt" >nul
if errorlevel 1 goto vf
echo    OK - Apple start = 302 appleid.apple.com (to .p8 ypografei) · Google ametavliti

echo.
echo [+] kostometro-app: codemagic.yaml APP_STORE_APPLE_ID = 6823712101...
cd /d C:\Users\User\kostometro-app
if exist ".git\index.lock" del /f /q ".git\index.lock"
git add codemagic.yaml commit_codemagic_appleid.txt
if errorlevel 1 goto failed2
git commit -F commit_codemagic_appleid.txt
if errorlevel 1 goto failed2
git push origin main
if errorlevel 1 goto failed2
echo    OK (to Codemagic xekina mono tou ena build ios-unsigned - kanonika)

echo.
echo ================================
echo   OK - K3a server + codemagic Apple ID
echo ================================
pause
exit /b 0

:nokey
echo. & echo  ******** LEIPEI TO %P8% - tipota den allaxe. ******** & echo.
pause
exit /b 1
:tf
echo. & echo  ******** TESTS FAILED - tipota den anevike. ******** & echo.
pause
exit /b 1
:mf
echo. & echo  ******** APODEIXI METALLAXIS APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
:vf
echo. & echo  ******** TO DEPLOY EGINE, ALLA I EPALITHEFSI APETYXE - deite %TEMP%\k3a_*.txt ******** & echo.
pause
exit /b 2
:failed2
echo. & echo  ******** O SERVER ANEVIKE OK, ALLA TO codemagic.yaml DEN ANEVIKE. ******** & echo.
pause
exit /b 1
:failed
echo. & echo  ******** APETYXE. ******** & echo.
pause
exit /b 1
