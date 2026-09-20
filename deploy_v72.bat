@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v72 = PROTROPI EGKATASTASIS stin PROTI othoni (karta pano apo tin efarmogi)
echo        Os tin v71 i odigia zouse MONO sto FAQ, 14i-15i apo 17 erotiseis.
echo        O lead pou pataei ton syndesmo tis kampanias DEN anoigei menou:
echo        evlepe istoselida mesa ston browser kai efevge.
echo        Rythmos: 1o, 4o kai 10o anoigma - meta pote. Sto iPhone keimeno
echo        Safari/Koinopoiisi, ston Android pragmatiko koumpi otan yparxei.
echo        KAMIA metavasi vasis. KAMIA allagi se logiki sygxronismou.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes pou PREPEI na yparxoun...
findstr /c:"KM-INSTALL-PROMPT-v72" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id=\"inst-steps\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"maybeInstall(); })" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"km-v72" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"\"v\": \"v72\"" site\kostometro\version.json >nul
if errorlevel 1 goto nm
findstr /c:"id: 'install-android'," site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id: 'install-ios'," site\kostometro\app.js >nul
if errorlevel 1 goto nm
echo    OK - 7 deiktes.

echo [2/5] Deiktes pou PREPEI na leipoun...
findstr /c:"km-v71" site\kostometro\sw.js >nul
if not errorlevel 1 goto lo
findstr /c:"\"v\": \"v71\"" site\kostometro\version.json >nul
if not errorlevel 1 goto lo
findstr /c:"'inst'," site\kostometro\app.js >nul
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

echo [4/5] Souites + 43 apodeixeis metallaxis, MIA TI FORA...
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
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15) do (
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
git add site\kostometro\app.css site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add tests\install_ui.test.mjs deploy_v72.bat commit_v72.txt
if errorlevel 1 goto failed
git commit -F commit_v72.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo.
echo   O ELEGXOS, se KATHARO parathyro (idiotiki periigisi):
echo   1) Anoixe fastwrite.tech/kostometro/ apo to kinito.
echo   2) Prepei na petaxtei MONI tis i karta:
echo      "Val' to stin arxiki othoni" me arithmimena vimata.
echo   3) Android: prepei na yparxei koumpi EGKATASTASI.
echo      iPhone: KANENA koumpi - mono vimata Koinopoiisi/Afetirias.
echo   4) Pata "Oxi tora" - i karta kleinei kai DEN xanavgainei
echo      sto epomeno anoigma (xanavgainei sto 4o).
echo   5) Ekdosi sto Menou kato: v72
echo.
echo   To FAQ krataei ti DEUTERI diadromi: Menou -^> Erotiseis,
echo   erotiseis 14 kai 15 apo 17 (Android kai iPhone).
echo ================================
echo.
pause
exit /b 0

:tf
echo. & echo  ******** TESTS FAILED - tipota den anevike. ******** & echo.
pause
exit /b 1
:mf
echo. & echo  ******** APODEIXI METALLAXIS APETYXE. ******** & echo.
pause
exit /b 1
:lo
echo    Epezise PALIOS deiktis (km-v71, v71 sto version.json i 'inst' sto SCREENS).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
