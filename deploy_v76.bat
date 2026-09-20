@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v76 = DYO DIORTHOSEIS PRIN TI DOKIMI iPHONE
echo.
echo        1) I ODIGIA iPHONE ITAN XEPERASMENI. Elege "anoixe to sto Safari,
echo           oxi Chrome". Apo ton iOS 16.4 (Martios 2023) KATHE browser tou
echo           iPhone bazei efarmogi stin arxiki othoni - to epiveveonei i
echo           tekmiriosi tis Google (Chrome Help, Use web apps iPhone/iPad).
echo           I pragmatiki diafora einai POU einai to Koinopoiisi: Safari
echo           KATO stin othoni, Chrome PANO DEXIA. Afto leei tora to vima 1.
echo           Idio diorthoma kai stin erotisi tou FAQ.
echo.
echo        2) OROI KAI POLITIKI PRIN TIN EGGRAFI. Metrithike: stin othoni
echo           eggrafis DEN yparxe kamia anafora - oi syndesmoi zousan MONO
echo           sto yposelido tou Menou, diladi META tin eggrafi. Tora yparxei
echo           grammi kato apo to "Synexeia" me tous dyo syndesmous.
echo           DEN einai koutaki: i Politiki einai ENIMEROSI, oxi sygkatathesi.
echo.
echo        KAMIA metavasi vasis. KAMIA allagi se logiki sygxronismou.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes pou PREPEI na yparxoun...
findstr /c:"KM-INSTALL-PROMPT" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id=\"inst-steps\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"id=\"inst-warn\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"KM-ACC-WARN-IOS" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id=\"legal-line\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"id=\"acc-warn\" hidden" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"maybeInstall(); })" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"km-v76" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"\"v\": \"v76\"" site\kostometro\version.json >nul
if errorlevel 1 goto nm
findstr /c:"id: 'install-android'," site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id: 'install-ios'," site\kostometro\app.js >nul
if errorlevel 1 goto nm
echo    OK - 11 deiktes.

echo [2/5] Deiktes pou PREPEI na leipoun...
findstr /c:"km-v75" site\kostometro\sw.js >nul
if not errorlevel 1 goto lo
findstr /c:"\"v\": \"v75\"" site\kostometro\version.json >nul
if not errorlevel 1 goto lo
findstr /c:"'inst'," site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"display-mode: minimal-ui" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"INST_AT" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"24px 32px}" site\kostometro\app.css >nul
if not errorlevel 1 goto lo
findstr /c:"instIosNotSafari" site\kostometro\app.js >nul
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

echo [4/5] Souites + 62 apodeixeis metallaxis, MIA TI FORA...
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
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 28) do (
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
git add tests\install_ui.test.mjs tests\ref_ui.test.mjs
if errorlevel 1 goto failed
git add deploy_v76.bat commit_v76.txt
if errorlevel 1 goto failed
git commit -F commit_v76.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo.
echo   O ELEGXOS, apo to KINITO:
echo   1) Anoixe fastwrite.tech/kostometro/ - i karta petagetai.
echo   2) Stin othoni pou zitaei email, kato apo to "Synexeia" prepei na
echo      yparxei i grammi: "Patontas Synexeia apodexesai tous Orous xrisis
echo      kai tin Politiki aporritou" - kai oi dyo syndesmoi na anoigoun
echo      se NEA kartela, xoris na xathei to email pou egrapses.
echo   3) Ekdosi sto Menou kato: v76
echo.
echo   To keimeno iPhone epalithevetai tin Tetarti - se Android i karta
echo   deixnei to koumpi, oxi ta vimata Koinopoiisis.
echo.
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
echo    Epezise PALIOS deiktis (km-v75, v75, 'inst', minimal-ui, INST_AT, .setup i instIosNotSafari).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
