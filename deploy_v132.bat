@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\fastwrite-project
echo.
echo  v132 = Diagrafi selidas xoris fantasmata (ekdosi selidon) + K4 (adrano ston browser)
echo         + App Links / Universal Links (.well-known). Kamia allagi sti vasi.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/6] Syntaxi...
node --check site\kostometro\app.js
if errorlevel 1 goto failed
node --check site\kostometro\sw.js
if errorlevel 1 goto failed
echo    OK

echo [2/6] v132 + metallaxeis 1-25 (exit 0 = piastike)...
node tests\v132.test.mjs
if errorlevel 1 goto tf
for /L %%N in (1,1,25) do (
  node tests\v132.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
echo    OK

echo [3/6] Palia tests pou agizei i v132 (ref_ui, v89, v98, v118, install_ui, v106, v126)...
node --experimental-sqlite tests\ref_ui.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\v89.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\v98.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\v118.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\install_ui.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\v106.test.mjs
if errorlevel 1 goto tf
echo    OK

echo [4/6] git add (RITI lista) + commit + push...
git add site\kostometro\app.js site\kostometro\sw.js site\kostometro\version.json site\_headers site\.well-known\apple-app-site-association site\.well-known\assetlinks.json tests\v132.test.mjs tests\v132_pages.spec.js tests\ref_ui.test.mjs tests\v89.test.mjs tests\v98.test.mjs tests\v118.test.mjs deploy_v132.bat commit_v132.txt
if errorlevel 1 goto failed
git commit -F commit_v132.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo    OK

echo [5/6] wrangler deploy...
call npx --yes wrangler deploy
if errorlevel 1 goto failed
echo    OK

echo [6/6] Epalithefsi stin paragogi...
curl.exe -s https://fastwrite.tech/kostometro/version.json > "%TEMP%\v132_ver.txt"
findstr /c:"v132" "%TEMP%\v132_ver.txt" >nul
if errorlevel 1 goto vf
curl.exe -s -D - -o NUL https://fastwrite.tech/.well-known/assetlinks.json > "%TEMP%\v132_al.txt"
findstr /i /c:"200" "%TEMP%\v132_al.txt" >nul
if errorlevel 1 goto vf
findstr /i /c:"application/json" "%TEMP%\v132_al.txt" >nul
if errorlevel 1 goto vf
curl.exe -s -D - -o NUL https://fastwrite.tech/.well-known/apple-app-site-association > "%TEMP%\v132_aasa.txt"
findstr /i /c:"application/json" "%TEMP%\v132_aasa.txt" >nul
if errorlevel 1 goto vf
echo    OK - version.json = v132 · assetlinks + AASA = 200 application/json

echo.
echo  Teleftaies ekdoseis:
call npx --yes wrangler deployments list
echo.
echo ================================
echo   OK - v132 - ekdosi selidon + K4 + .well-known
echo ================================
exit /b 0

:tf
echo. & echo  ******** TESTS FAILED - tipota den anevike. ******** & echo.
exit /b 1
:mf
echo. & echo  ******** APODEIXI METALLAXIS APETYXE - tipota den anevike. ******** & echo.
exit /b 1
:vf
echo. & echo  ******** TO DEPLOY EGINE, ALLA I EPALITHEFSI STIN PARAGOGI APETYXE - deite %TEMP%\v132_*.txt ******** & echo.
exit /b 2
:failed
echo. & echo  ******** APETYXE. ******** & echo.
exit /b 1
