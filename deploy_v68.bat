@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v68 = DIORTHOSI: to koutaki sygkatathesis DEN emfanizotan pote
echo        + imera/ora sti lista, MONO opou yparxei sygkatathesi.
echo        KAMIA metavasi vasis.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes pou PREPEI na yparxoun...
findstr /c:"if (id === 's-email') { renderConsent(); }" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"function refWhen" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"THEN created ELSE substr(created, 1, 10)" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"km-v68" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
echo    OK - 4 deiktes.

echo [2/5] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
node --check site\kostometro\app.js
if errorlevel 1 goto failed
echo    OK

echo [3/5] Oles oi souites...
for %%T in (ref pinakas h11b mail cleanup feedback) do (
  node --experimental-sqlite tests\%%T.test.mjs
  if errorlevel 1 goto tf
)
node tests\ref_ui.test.mjs
if errorlevel 1 goto tf
echo    OK

echo [4/5] 23 apodeixeis metallaxis - MIA TI FORA...
for %%N in (1 2 3 4 5 6 7 8) do (
  node --experimental-sqlite tests\ref.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13) do (
  node tests\ref_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\pinakas.test.mjs --mutate
if errorlevel 1 goto mf
node --experimental-sqlite tests\h11b.test.mjs --mutate
if errorlevel 1 goto mf
echo    OK

echo [5/5] Staging kai push...
git add src\km.js site\kostometro\app.js site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add tests\ref.test.mjs tests\ref_ui.test.mjs deploy_v68.bat commit_v68.txt
if errorlevel 1 goto failed
git commit -F commit_v68.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo   DOKIMI (kleise OLA ta incognito prota):
echo     1. Neo incognito -^> o syndesmos sou me ?ref=
echo     2. Rythmiseis -^> Ekdosi = v68 PRIN synexiseis
echo     3. "Den exo logariasmo" -^> TORA prepei na fainetai to koutaki
echo     4. Eggrafi XORIS tsekarisma -^> Kalese: "Eggrafi #N", MONO imerominia
echo     5. Neo incognito, ME tsekarisma -^> Kalese: email + imera/ora
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
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
