@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\fastwrite-project
echo.
echo  K3b = fylaxi + anaklisi token tis Apple sti diagrafi logariasmou (Apple TN3194)
echo  Nea: pinakes km_apple_tokens + km_apple_revoke (MONO CREATE, kanena DROP) + mystiko APPLE_TOKEN_KEY
echo  Ta koumpia Apple DEN mpainoun akoma (mazi me tin Politiki v2.6).
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/8] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
node --check src\worker.js
if errorlevel 1 goto failed
echo    OK

echo [2/8] K3b tests + metallaxeis 1-14 (exit 0 = piastike)...
node --experimental-sqlite tests\k3b.test.mjs
if errorlevel 1 goto tf
for /L %%N in (1,1,14) do (
  node --experimental-sqlite tests\k3b.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
echo    OK

echo [3/8] Palia tests (k3a, h11b, legal_v21, v88-v131, pinakas, ref, verify)...
for %%T in (k3a h11b legal_v21 v88 v92 v93 v95 v98 v99 v100 v102 v105 v106 v112 v113 v114 v116 v118 v120 v131 pinakas ref verify) do (
  node --experimental-sqlite tests\%%T.test.mjs >nul 2>&1
  if errorlevel 1 ( echo    APETYXE: %%T & goto tf )
)
echo    OK

echo [4/8] D1: pinakes Apple (PRIN to deploy - o neos kodikas tous xreiazetai)...
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --file=schema/km_apple.sql
if errorlevel 1 goto failed
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --command "SELECT name FROM sqlite_master WHERE name IN ('km_apple_tokens','km_apple_revoke') ORDER BY name;" > "%TEMP%\k3b_d1.txt"
findstr /c:"km_apple_revoke" "%TEMP%\k3b_d1.txt" >nul
if errorlevel 1 goto d1f
findstr /c:"km_apple_tokens" "%TEMP%\k3b_d1.txt" >nul
if errorlevel 1 goto d1f
echo    OK - kai oi dyo pinakes yparxoun stin apomakrysmeni vasi

echo [5/8] Mystiko APPLE_TOKEN_KEY (32 bytes, tipota den emfanizetai)...
if exist "secrets\apple_token_key.txt" (
  echo    yparxei idi - xrisimopoieitai to idio
) else (
  powershell -NoProfile -Command "$b=New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [IO.File]::WriteAllText('secrets\apple_token_key.txt', [Convert]::ToBase64String($b).TrimEnd('=').Replace('+','-').Replace('/','_'))"
  if errorlevel 1 goto failed
  echo    neo kleidi -^> secrets\apple_token_key.txt
)
for %%A in ("secrets\apple_token_key.txt") do if not "%%~zA"=="43" goto keyf
type "secrets\apple_token_key.txt" | npx --yes wrangler secret put APPLE_TOKEN_KEY
if errorlevel 1 goto failed
echo    OK

echo [6/8] git add (RITI lista) + commit + push...
git add src\km.js src\worker.js schema\km_apple.sql tests\k3b.test.mjs tests\k3a.test.mjs tests\h11b.test.mjs tests\pinakas.test.mjs tests\ref.test.mjs tests\v112.test.mjs tests\v113.test.mjs tests\v88.test.mjs tests\v92.test.mjs tests\v93.test.mjs tests\v95.test.mjs tests\verify.test.mjs deploy_k3b.bat commit_k3b.txt
if errorlevel 1 goto failed
git commit -F commit_k3b.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo    OK

echo [7/8] wrangler deploy...
call npx --yes wrangler deploy
if errorlevel 1 goto failed
echo    OK

echo [8/8] Epalithefsi stin paragogi...
timeout /t 8 /nobreak >nul
curl.exe -s -D - -o NUL https://fastwrite.tech/api/km/auth/apple/start > "%TEMP%\k3b_apple.txt"
findstr /i /c:"location: https://appleid.apple.com/auth/authorize" "%TEMP%\k3b_apple.txt" >nul
if errorlevel 1 goto vf
curl.exe -s -D - -o NUL https://fastwrite.tech/api/km/auth/google/start > "%TEMP%\k3b_google.txt"
findstr /i /c:"location: https://accounts.google.com" "%TEMP%\k3b_google.txt" >nul
if errorlevel 1 goto vf
curl.exe -s -o NUL -w "%%{http_code}" -X POST -H "Content-Type: application/json" --data "{\"payload\":\"x.y.z\"}" https://fastwrite.tech/api/km/auth/apple/notify > "%TEMP%\k3b_notify.txt"
findstr /c:"400" "%TEMP%\k3b_notify.txt" >nul
if errorlevel 1 goto vf
echo    OK - Apple start = 302 (to kleidi APPLE_TOKEN_KEY diavazetai) · Google ametavliti · notify me skoupidia = 400

echo.
echo ================================
echo   OK - K3b ZONTANO
echo   SIMANTIKO: valte to secrets\apple_token_key.txt kai sto NordPass
echo   (Secure Note "Kostometro APPLE_TOKEN_KEY") - xoris afto ta token den anakalountai.
echo ================================
pause
exit /b 0

:tf
echo. & echo  ******** TESTS FAILED - tipota den anevike. ******** & echo.
pause
exit /b 1
:mf
echo. & echo  ******** APODEIXI METALLAXIS APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
:d1f
echo. & echo  ******** I VASI DEN EXEI TOUS PINAKES - TO DEPLOY DEN EGINE. Deite %TEMP%\k3b_d1.txt ******** & echo.
pause
exit /b 1
:keyf
echo. & echo  ******** TO KLEIDI DEN EINAI 43 XARAKTIRES - TO DEPLOY DEN EGINE. ******** & echo.
pause
exit /b 1
:vf
echo. & echo  ******** TO DEPLOY EGINE, ALLA I EPALITHEFSI APETYXE - deite %TEMP%\k3b_*.txt ******** & echo.
pause
exit /b 2
:failed
echo. & echo  ******** APETYXE. ******** & echo.
pause
exit /b 1
