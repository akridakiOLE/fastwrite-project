@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v69 = SELIDOPOIISI STI LISTA SYSTASEON
echo        "Deixno N apo M" + "Ki alles N" + epilogi 10/25/50/100/200.
echo        KAMIA metavasi vasis.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes pou PREPEI na yparxoun...
findstr /c:"Math.min(Math.max(Number.isFinite(nRaw)" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"LIMIT ? OFFSET ?" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"function refMoreState" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"(total || list.length) - i" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"km-v69" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
echo    OK - 5 deiktes.

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

echo [4/5] 26 apodeixeis metallaxis - MIA TI FORA...
for %%N in (1 2 3 4 5 6 7 8 9 10) do (
  node --experimental-sqlite tests\ref.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14) do (
  node tests\ref_ui.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\pinakas.test.mjs --mutate
if errorlevel 1 goto mf
node --experimental-sqlite tests\h11b.test.mjs --mutate
if errorlevel 1 goto mf
echo    OK

echo [5/5] Staging kai push...
git add src\km.js site\kostometro\index.html site\kostometro\app.js site\kostometro\app.css
if errorlevel 1 goto failed
git add site\kostometro\sw.js site\kostometro\version.json
if errorlevel 1 goto failed
git add tests\ref.test.mjs tests\ref_ui.test.mjs deploy_v69.bat commit_v69.txt
if errorlevel 1 goto failed
git commit -F commit_v69.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo   Kinito -^> Kalese: kato apo ti lista prepei na leei
echo   "Deixno N apo M" kai to koumpi "Ki alles X".
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
