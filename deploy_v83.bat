@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v83 = FRENO 13" MONO AN TO KLEIDI PEI "FTANEI" + METRISI TOKENS
echo.
echo        22/9 21:59: me pliromeno kleidi i anagnosi kratai 3,5" - to freno
echo        ton 13" (gia to dorean orio) ekane ta polla timologia arga xoris logo.
echo        Tora: freno mono meta apo 429. Kai metrisi tokens gia to kostos.
echo.
echo        KAMIA metavasi vasis. KAMIA allagi se sygxronismo i server.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes pou PREPEI na yparxoun...
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
findstr /c:"km-v83" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"\"v\": \"v83\"" site\kostometro\version.json >nul
if errorlevel 1 goto nm
findstr /c:"v83" site\kostometro\app.js >nul
if errorlevel 1 goto nm
echo    OK - 18 deiktes.

echo [2/5] Deiktes pou PREPEI na leipoun...
findstr /c:"km-v82" site\kostometro\sw.js >nul
if not errorlevel 1 goto lo
findstr /c:"\"v\": \"v82\"" site\kostometro\version.json >nul
if not errorlevel 1 goto lo
findstr /c:"ctrl.abort(); }, 30000)" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"generationConfig: { response_mime_type" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"register('/kostometro/sw.js')" site\kostometro\app.js >nul
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

echo [4/5] Souites + 96 apodeixeis metallaxis, MIA TI FORA...
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
git add site\kostometro\app.js site\kostometro\index.html
if errorlevel 1 goto failed
git add site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add tests\ai78.test.mjs
if errorlevel 1 goto failed
git add deploy_v83.bat commit_v83.txt
if errorlevel 1 goto failed
git commit -F commit_v83.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo.
echo   O ELEGXOS STO KINITO:
echo   1) Anoixe to Kostometro, Menou kato: v83
echo   2) KOKKINOY TAVERNA: pata "Dokimase xana" kai perimene ~30".
echo   3) Rythmiseis - "Diarkeia anagnosis" grafei "skepsi xamili/kanoniki".
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
echo    Epezise PALIOS deiktis (km-v82, v82, 30000, palio generationConfig i sw.js xoris ekdosi).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
exit /b 1
