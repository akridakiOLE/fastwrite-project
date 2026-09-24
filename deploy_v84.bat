@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v84 = ENA EMAIL = ENAS LOGARIASMOS + KODIKOS 6 PSIFION + SYSTASI STO iPHONE
echo.
echo        23-24/9: to idio email ekane 3 logariasmous, kai i systasi xanotan
echo        sto iPhone (to eikonidio anoigei xoris ?ref=).
echo        TORA: kodikos sto email prin tin eggrafi - ena email, enas logariasmos -
echo        pedio "Kodikos prosklisis" panta orato - manifest pou kratai ref/src.
echo.
echo        METAVASI VASIS: DYO NEOI PINAKES + MONADIKO INDEX sto email (PRIN ton worker).
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes pou PREPEI na yparxoun...
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
findstr /c:"km-v84" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"\"v\": \"v84\"" site\kostometro\version.json >nul
if errorlevel 1 goto nm
findstr /c:"v84" site\kostometro\app.js >nul
if errorlevel 1 goto nm
echo    OK - 23 deiktes.

echo [2/5] Deiktes pou PREPEI na leipoun...
findstr /c:"km-v83" site\kostometro\sw.js >nul
if not errorlevel 1 goto lo
findstr /c:"\"v\": \"v83\"" site\kostometro\version.json >nul
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

echo [4/5] Souites + 117 apodeixeis metallaxis, MIA TI FORA...
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

echo [5a] METAVASI VASIS - PRIN ton worker...
rem --- 24/9: to --file (import API) apetyxe me "Authentication error 10000" eno to --command douleve.
rem --- Idio periexomeno me to schema\km_verify.sql, xoris sxolia.
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --command "CREATE TABLE IF NOT EXISTS km_email_codes ( id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, code_hash TEXT NOT NULL, created TEXT NOT NULL, expires TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, ip_h TEXT ); CREATE INDEX IF NOT EXISTS idx_km_email_codes_email ON km_email_codes (email, created); CREATE INDEX IF NOT EXISTS idx_km_email_codes_ip ON km_email_codes (ip_h, created); CREATE TABLE IF NOT EXISTS km_email_tokens ( token_hash TEXT PRIMARY KEY, email TEXT NOT NULL, created TEXT NOT NULL, expires TEXT NOT NULL, used TEXT ); CREATE INDEX IF NOT EXISTS idx_km_email_tokens_email ON km_email_tokens (email); CREATE UNIQUE INDEX IF NOT EXISTS uq_km_accounts_email_live ON km_accounts (email) WHERE deleted IS NULL AND email <> '';" > migrate_verify_out.txt 2>&1
if errorlevel 1 goto migf
type migrate_verify_out.txt
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --json --command "SELECT COUNT(*) AS n FROM sqlite_master WHERE name IN ('km_email_codes','km_email_tokens','uq_km_accounts_email_live')" > migrate_verify_check.txt 2>&1
type migrate_verify_check.txt
findstr /c:"\"n\": 3" migrate_verify_check.txt >nul
if errorlevel 1 goto migf
echo    OK - 2 pinakes + monadiko index yparxoun.

echo [5/5] Staging kai push...
git add site\kostometro\app.js site\kostometro\index.html site\kostometro\manifest.webmanifest src\km.js schema\km_verify.sql
if errorlevel 1 goto failed
git add site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add tests\ai78.test.mjs tests\verify.test.mjs tests\verify_ui.test.mjs tests\ref.test.mjs tests\pinakas.test.mjs tests\h11b.test.mjs
if errorlevel 1 goto failed
git add deploy_v84.bat commit_v84.txt
if errorlevel 1 goto failed
git commit -F commit_v84.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo.
echo   O ELEGXOS STO KINITO:
echo   1) Anoixe to Kostometro, Menou kato: v84
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
echo    Epezise PALIOS deiktis (km-v83, v83, 30000, palio generationConfig i sw.js xoris ekdosi).
goto failed
:migf
echo. & echo  ******** METAVASI VASIS APETYXE - o kodikas DEN anevike. Deite migrate_verify_*.txt ******** & echo.
exit /b 1
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
exit /b 1
