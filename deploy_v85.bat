@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v85 = ODIGOS KLEIDIOU + PROPLIROMI (402)
echo.
echo        24/9: i Google pernaei OLOUS se prepay stis 12/10 - otan teleiosoun
echo        ta credits, kathe kleidi apantaei 402 kai i efarmogi elege mono
echo        "I anagnosi stamatise". TORA: katharo minyma + syndesmos gia gemisma,
echo        xanadokimazei mono tou ana 10'. Odigos me eikones sto /kostometro/kleidi/.
echo        Kamia metavasi vasis, kamia allagi ston server.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes pou PREPEI na yparxoun...
findstr /c:"KM-AI-PREPAY-402" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-KLEIDI-GUIDE" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"KM-SW-KLEIDI" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
if not exist site\kostometro\kleidi\index.html goto nm
if not exist site\kostometro\kleidi\c1.png goto nm
findstr /c:"KM-SERVER-V84-VERIFY" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-EMAIL-CODE" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-MANIFEST-REF" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-REF-FIELD" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"uq_km_accounts_email_live" schema\km_verify.sql >nul
if errorlevel 1 goto nm
findstr /c:"KM-AI-ADAPTIVE" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-AI-TOKENS" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-AI-QUOTA-FALLOVER" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-AI-ERRMSG" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-AI-RAW" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id=\"st-airaw\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"KM-AI-DEEP" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-AI-FALLOVER" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-AI-TRANSIENT" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-AI-THINK" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"thinking_level: 'low'" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id=\"st-aierr\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"id=\"st-aims\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"KM-INSTALL-PROMPT" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-SW-VERSIONED-URL" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"km-v85" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"\"v\": \"v85\"" site\kostometro\version.json >nul
if errorlevel 1 goto nm
findstr /c:"v85" site\kostometro\app.js >nul
if errorlevel 1 goto nm
echo    OK - 28 deiktes.

echo [2/5] Deiktes pou PREPEI na leipoun...
findstr /c:"km-v84" site\kostometro\sw.js >nul
if not errorlevel 1 goto lo
findstr /c:"\"v\": \"v84\"" site\kostometro\version.json >nul
if not errorlevel 1 goto lo
findstr /c:"ctrl.abort(); }, 30000)" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"generationConfig: { response_mime_type" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"register('/kostometro/sw.js')" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"AIza" site\kostometro\index.html >nul
if not errorlevel 1 goto lo
findstr /c:"AQ.Ab8RN6" site\kostometro\kleidi\index.html >nul
if not errorlevel 1 goto lo
echo    OK

echo [3/5] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
node --check site\kostometro\app.js
if errorlevel 1 goto failed
node --check site\kostometro\sw.js
if errorlevel 1 goto failed
echo    OK

echo [4/5] Souites + 133 apodeixeis metallaxis, MIA TI FORA...
node tests\v85.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16) do (
  node tests\v85.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\verify.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13) do (
  node --experimental-sqlite tests\verify.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node tests\verify_ui.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8) do (
  node tests\verify_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node tests\ai78.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29 30 31 32 33) do (
  node tests\ai78.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%T in (ref pinakas h11b mail cleanup feedback) do (
  node --experimental-sqlite tests\%%T.test.mjs
  if errorlevel 1 goto tf
)
node tests\ref_ui.test.mjs
if errorlevel 1 goto tf
node tests\pinakas_ui.test.mjs
if errorlevel 1 goto tf
node tests\install_ui.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10) do (
  node --experimental-sqlite tests\ref.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16) do (
  node tests\ref_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6) do (
  node tests\pinakas_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28 29) do (
  node tests\install_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\pinakas.test.mjs --mutate
if errorlevel 1 goto mf
node --experimental-sqlite tests\h11b.test.mjs --mutate
if errorlevel 1 goto mf
echo    OK

echo [5/5] Staging kai push...
git add site\kostometro\app.js site\kostometro\app.css site\kostometro\index.html
if errorlevel 1 goto failed
git add site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add site\kostometro\kleidi
if errorlevel 1 goto failed
git add tests\v85.test.mjs
if errorlevel 1 goto failed
git add deploy_v85.bat commit_v85.txt
if errorlevel 1 goto failed
git commit -F commit_v85.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo.
echo   O ELEGXOS STO KINITO:
echo   1) Anoixe to Kostometro, Menou kato: v85
echo   2) Rythmiseis: to koumpi grafei "Kleidi Gemini".
echo   3) Anoixe fastwrite.tech/kostometro/kleidi/ - o odigos me tis eikones.
echo.
echo ================================
echo.
exit /b 0

:tf
echo. & echo  ******** TESTS FAILED - tipota den anevike. ******** & echo.
exit /b 1
:mf
echo. & echo  ******** APODEIXI METALLAXIS APETYXE. ******** & echo.
exit /b 1
:lo
echo    Epezise PALIOS deiktis (km-v84, v84, AIza, diarroi kleidiou, 30000, palio generationConfig i sw.js xoris ekdosi).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
exit /b 1
