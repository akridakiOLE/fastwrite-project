@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v75 = TRIS DIORTHOSEIS PRIN TI DOKIMI iPHONE
echo.
echo        1) Ena vima DEN arithmeitai. Sti diadromi me to koumpi i karta
echo           edeixne "1." xoris "2." - arithmisi pou yposxetai synexeia.
echo.
echo        2) iPHONE - oi othones egkatastasis eixan statheri kato apostasi
echo           32px kai DEN sevontan ti grammi afetirias (34px). Stin othoni
echo           ton 12 lexeon to koumpi "Synexeia" katelige KATO apo ti grammi,
echo           kai ekei DEN yparxei alli diadromi mprosta.
echo.
echo        3) iPHONE - i bara ton promithefton (Epilexe ola / Katharise /
echo           Diagrafi) kathotan pano sti grammi afetirias.
echo.
echo        4) iPHONE - FROUROS DIPLOU LOGARIASMOU. Sto iPhone to WebKit
echo           borei na dosei stin egkatestimeni efarmogi XORISTI apothikefsi
echo           apo to Safari. Opoios grafteie prota sto Safari kai egkatastisei
echo           meta, anoigei ADEIA efarmogi kai ftiaxnei DEFTERO logariasmo
echo           xoris na to katalavei. Tora i proti othoni tou leei na patisei
echo           "Exo idi logariasmo" kai na valei tis 12 lexeis. MONO se iPhone,
echo           MONO se egkatestimeni, MONO otan den yparxei tipota topika.
echo.
echo        Ta 2, 3 kai 4 einai kathara zitimata iPhone. KAMIA metavasi vasis.
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
findstr /c:"id=\"acc-warn\" hidden" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"maybeInstall(); })" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"km-v75" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"\"v\": \"v75\"" site\kostometro\version.json >nul
if errorlevel 1 goto nm
findstr /c:"id: 'install-android'," site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id: 'install-ios'," site\kostometro\app.js >nul
if errorlevel 1 goto nm
echo    OK - 10 deiktes.

echo [2/5] Deiktes pou PREPEI na leipoun...
findstr /c:"km-v74" site\kostometro\sw.js >nul
if not errorlevel 1 goto lo
findstr /c:"\"v\": \"v74\"" site\kostometro\version.json >nul
if not errorlevel 1 goto lo
findstr /c:"'inst'," site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"display-mode: minimal-ui" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"INST_AT" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"24px 32px}" site\kostometro\app.css >nul
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

echo [4/5] Souites + 60 apodeixeis metallaxis, MIA TI FORA...
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
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26) do (
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
git add deploy_v75.bat commit_v75.txt deploy_watch.bat
if errorlevel 1 goto failed
git commit -F commit_v75.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo.
echo   O ELEGXOS, apo to KINITO:
echo   1) Anoixe fastwrite.tech/kostometro/ - i karta petagetai.
echo      Sti diadromi me to koumpi DEN prepei na yparxei "1." mprosta.
echo   2) Ekdosi sto Menou kato: v75
echo   3) O frouros diplou logariasmou DEN fainetai se Android/ypologisti -
echo      einai sosto. Epalithevetai MONO tin Tetarti, se iPhone.
echo.
echo   Ta dyo iPhone diorthomata fainontai MONO se iPhone me grammi
echo   afetirias - tha epalitheftoun tin Tetarti mazi me ti dokimi.
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
echo    Epezise PALIOS deiktis (km-v74, v74, 'inst', minimal-ui, INST_AT i .setup xoris safe-area).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
