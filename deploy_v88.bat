@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v88 = PINAKAS SE IMEROLOGIAKES MERES KYPROU + PATIMA STO GRAFIMA + PROELEFSI
echo.
echo        25/9: "neoi simera = 1" eno simera den egine kanenas logariasmos.
echo        TORA: simera = apo ta mesanyxta Kyprou. Grafima: patas bara = mera + arithmos.
echo        Apo pou irthan: direct / ref / leads / fasi3 anti gia "link" pantou.
echo        FastWrite: ta eggrafa se dyo theseis + koutia "ana FastWrite" (keno mexri to PRO).
echo        Kamia metavasi vasis, kamia allagi ston Hetzner.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes pou PREPEI na yparxoun...
findstr /c:"KM-PK-CALDAY" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-SRC-DIRECT" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-SRC-DIRECT" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-PK-DAYTAP" site\pinakas\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-PK-FWLINKS" site\pinakas\index.html >nul
if errorlevel 1 goto nm
findstr /c:"pk-v5" site\pinakas\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"km-v88" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"\"v\": \"v88\"" site\kostometro\version.json >nul
if errorlevel 1 goto nm
findstr /c:"v88" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-MANIFEST-REF" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"KM-KLEIDI-BACK2" site\kostometro\kleidi\index.html >nul
if errorlevel 1 goto nm
echo    OK

echo [2/5] Deiktes pou PREPEI na leipoun...
findstr /c:"km-v87" site\kostometro\sw.js >nul
if not errorlevel 1 goto lo
findstr /c:"pk-v4" site\pinakas\sw.js >nul
if not errorlevel 1 goto lo
findstr /c:"source: ref ? 'link'" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"AIza" site\kostometro\index.html >nul
if not errorlevel 1 goto lo
echo    OK

echo [3/5] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
node --check site\kostometro\app.js
if errorlevel 1 goto failed
node --check site\kostometro\sw.js
if errorlevel 1 goto failed
node --check site\pinakas\app.js
if errorlevel 1 goto failed
echo    OK

echo [4/5] Souites + apodeixeis metallaxis, MIA TI FORA...
node --experimental-sqlite tests\v88.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9) do (
  node --experimental-sqlite tests\v88.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node tests\v87.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4) do (
  node tests\v87.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node tests\v86.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4) do (
  node tests\v86.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
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
git add src\km.js
if errorlevel 1 goto failed
git add site\kostometro\app.js site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add site\pinakas\index.html site\pinakas\app.js site\pinakas\sw.js
if errorlevel 1 goto failed
git add tests\v88.test.mjs tests\v87.test.mjs tests\ref_ui.test.mjs tests\verify_ui.test.mjs tests\pinakas_ui.test.mjs
if errorlevel 1 goto failed
git add deploy_v88.bat commit_v88.txt
if errorlevel 1 goto failed
git commit -F commit_v88.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo.
echo   O ELEGXOS:
echo   1) fastwrite.tech/pinakas/ - Ananeosi: "neoi simera" = 0
echo   2) Pata mia bara sto grafima: grafei mera + arithmo
echo   3) Kostometro, Menou kato: v88
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
echo    Epezise PALIOS deiktis (km-v87, pk-v4, source link, AIza).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
exit /b 1
