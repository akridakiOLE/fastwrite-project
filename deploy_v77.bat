@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v77 = TO sw.js DEN KOLLAEI PIA STIN AKRI TOU CLOUDFLARE
echo.
echo        METRITHIKE 20/9: meta to deploy tis v76 to version.json kai to
echo        app.js irthan sosta, alla to sw.js servirotan akoma os km-v75 me
echo        cf-cache-status HIT - treis metriseis se deka lepta, paroti to
echo        _headers dinei no-cache se olo to /kostometro/*.
echo.
echo        SYNEPEIA POU FANIKE: o worker tis syskevis DEN antikathistatai
echo        pote, kai i mnimi tou krataei PALIO index.html. Sto tablet tou
echo        Stavros den emfanistikan oi syndesmoi ton Oron - eno yparxoun
echo        ston server. DEN itan berdema: itan i kollimeni mnimi.
echo.
echo        I LYSI: kathe ekdosi zitaei ALLI diefthinsi (sw.js?v=v77). I akri
echo        den exei ti na kratisei gia diefthinsi pou den exei xanadei.
echo        DEN exartatai apo xeirokinito purge sto Cloudflare - aftodiorthonetai.
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
findstr /c:"KM-SW-VERSIONED-URL" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id=\"acc-warn\" hidden" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"maybeInstall(); })" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"km-v77" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"\"v\": \"v77\"" site\kostometro\version.json >nul
if errorlevel 1 goto nm
findstr /c:"id: 'install-android'," site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id: 'install-ios'," site\kostometro\app.js >nul
if errorlevel 1 goto nm
echo    OK - 12 deiktes.

echo [2/5] Deiktes pou PREPEI na leipoun...
findstr /c:"km-v76" site\kostometro\sw.js >nul
if not errorlevel 1 goto lo
findstr /c:"\"v\": \"v76\"" site\kostometro\version.json >nul
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

echo [4/5] Souites + 63 apodeixeis metallaxis, MIA TI FORA...
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
git add site\kostometro\app.css site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add tests\install_ui.test.mjs tests\ref_ui.test.mjs
if errorlevel 1 goto failed
git add deploy_v77.bat commit_v77.txt
if errorlevel 1 goto failed
git commit -F commit_v77.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo.
echo   O ELEGXOS, se KATHARO parathyro i idiotiki periigisi:
echo   1) Anoixe fastwrite.tech/kostometro/ apo to KINITO.
echo   2) Ekdosi sto Menou kato: v77
echo   3) Stin othoni tou email prepei na fainetai i grammi ton Oron.
echo      AN DEN fainetai, i syskevi trexei akoma palio kelyfos.
echo   4) Sto TABLET: kane to idio. Ekei to provlima fanike proti fora.
echo.
echo   O Claude tha metrisei apo ton server oti to sw.js zitietai pleon
echo   me ?v=v77 kai oti i akri to servirei freska.
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
echo    Epezise PALIOS deiktis (km-v76, v76, 'inst', minimal-ui, INST_AT, .setup, instIosNotSafari i sw.js xoris ekdosi).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
