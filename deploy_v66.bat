@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v66 = I SYSTASI GRAFETAI TI STIGMI TIS EGGRAFIS, OXI TOU PROTOU ANOIGMATOS
echo        Diorthosi tou evrimatos tou Stavros sti zontani v65.
echo        KAMIA metavasi vasis - mono kodikas.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes pou PREPEI na yparxoun...
findstr /c:"function refCaptureSrc" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"refCaptureSrc(location.search" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"km-v66" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"v66" site\kostometro\version.json >nul
if errorlevel 1 goto nm
echo    OK - 4 deiktes.

echo [2/5] Deiktes pou PREPEI na leipoun (to sfalma tis 17/9)...
findstr /c:"if (!localStorage.getItem(LS.src)) {" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
echo    OK

echo [3/5] Syntaxi...
node --check site\kostometro\app.js
if errorlevel 1 goto failed
node --check site\kostometro\sw.js
if errorlevel 1 goto failed
node --check src\km.js
if errorlevel 1 goto failed
echo    OK

echo [4/5] Oles oi souites + apodeixi metallaxis MIA TI FORA...
for %%T in (ref pinakas h11b mail cleanup feedback) do (
  node --experimental-sqlite tests\%%T.test.mjs
  if errorlevel 1 goto tf
)
node tests\ref_ui.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5) do (
  node --experimental-sqlite tests\ref.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6 7 8 9) do (
  node tests\ref_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\pinakas.test.mjs --mutate
if errorlevel 1 goto mf
node --experimental-sqlite tests\h11b.test.mjs --mutate
if errorlevel 1 goto mf
echo    OK

echo [5/5] Staging kai push...
git add site\kostometro\app.js site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add tests\ref_ui.test.mjs deploy_v66.bat commit_v66.txt
if errorlevel 1 goto failed
git commit -F commit_v66.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo   I DOKIMI, me PARATHYRO INCOGNITO (katharo localStorage):
echo     1. Anoixe INCOGNITO -^> fastwrite.tech/kostometro/ -^> KLEISE to
echo        (etsi to km_source grafetai "link", opos ston ypologisti sou)
echo     2. Sto IDIO incognito anoixe ton syndesmo sou me ?ref=...
echo     3. Kane EGGRAFI me neo email
echo     4. Sto kinito sou: Menou -^> Kalese -^> "Eggrafes pou irthan" = 1
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
echo    Epezise o PALIOS frouros "if (!LS.src)" - to sfalma tis 17/9.
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
