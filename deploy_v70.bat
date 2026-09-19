@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v70 = "Na xerei poion efxaristei" + imera/imerominia/ora se KATHE grammi
echo        To keimeno sygkatathesis LEEI oti i stigmi fainetai panta.
echo        KAMIA metavasi vasis.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes pou PREPEI na yparxoun...
findstr /c:"data-consent=\"time-always\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"SELECT created AS pote" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"CASE WHEN ref_share = 1 THEN email ELSE NULL END" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"km-v70" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
echo    OK - 4 deiktes.

echo [2/5] Deiktes pou PREPEI na leipoun...
findstr /c:"ref-today" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"id=\"ref-consent-ok\" checked" site\kostometro\index.html >nul
if not errorlevel 1 goto lo
echo    OK

echo [3/5] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
node --check site\kostometro\app.js
if errorlevel 1 goto failed
echo    OK

echo [4/5] Souites + 27 apodeixeis metallaxis, MIA TI FORA...
for %%T in (ref pinakas h11b mail cleanup feedback) do (
  node --experimental-sqlite tests\%%T.test.mjs
  if errorlevel 1 goto tf
)
node tests\ref_ui.test.mjs
if errorlevel 1 goto tf
for %%N in (1 2 3 4 5 6 7 8 9 10) do (
  node --experimental-sqlite tests\ref.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15) do (
  node tests\ref_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\pinakas.test.mjs --mutate
if errorlevel 1 goto mf
node --experimental-sqlite tests\h11b.test.mjs --mutate
if errorlevel 1 goto mf
echo    OK

echo [5/5] Staging kai push...
git add src\km.js site\kostometro\index.html site\kostometro\app.js
if errorlevel 1 goto failed
git add site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add tests\ref.test.mjs tests\ref_ui.test.mjs deploy_v70.bat commit_v70.txt
if errorlevel 1 goto failed
git commit -F commit_v70.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo   Kinito -^> Kalese: KATHE grammi prepei na exei imera + ora.
echo   Nea eggrafi: to koutaki leei "Na xerei poion efxaristei",
echo   ASYMPLIROTO, kai apo kato oti i imera/ora fainetai panta.
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
echo    Epezise PALIOS deiktis (ref-today i proepilegmeno koutaki).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
