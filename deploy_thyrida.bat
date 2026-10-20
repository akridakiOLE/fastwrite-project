@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\fastwrite-project
echo.
echo  THYRIDA = T.TH. 27452, 1645 Lefkosia (3 selides Politikis) + assetlinks.json (cert Google Play)
echo  Kanenas kodikas, kamia vasi. Mono site\legal + site\.well-known.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/4] Tests (v133 + legal_v21)...
node --experimental-sqlite tests\v133.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\legal_v21.test.mjs
if errorlevel 1 goto tf
findstr /c:"55518" site\legal\privacy.html site\legal\privacy-en.html site\legal\privacy-en-v1-2.html >nul
if not errorlevel 1 goto tf
echo    OK

echo [2/4] git add (RITI lista) + commit + push...
git add site\legal\privacy.html site\legal\privacy-en.html site\legal\privacy-en-v1-2.html site\.well-known\assetlinks.json tests\v133.test.mjs deploy_thyrida.bat commit_thyrida.txt
if errorlevel 1 goto failed
git commit -F commit_thyrida.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo    OK

echo [3/4] wrangler deploy...
call npx --yes wrangler deploy
if errorlevel 1 goto failed
echo    OK

echo [4/4] Epalithefsi stin paragogi...
timeout /t 8 /nobreak >nul
curl.exe -s "https://fastwrite.tech/legal/privacy?nc=%RANDOM%" > "%TEMP%\thy_el.txt"
findstr /c:"27452, 1645" "%TEMP%\thy_el.txt" >nul
if errorlevel 1 goto vf
findstr /c:"55518" "%TEMP%\thy_el.txt" >nul
if not errorlevel 1 goto vf
curl.exe -s "https://fastwrite.tech/legal/privacy-en?nc=%RANDOM%" > "%TEMP%\thy_en.txt"
findstr /c:"P.O. Box 27452, 1645 Nicosia" "%TEMP%\thy_en.txt" >nul
if errorlevel 1 goto vf
curl.exe -s "https://fastwrite.tech/legal/privacy-en-v1-2?nc=%RANDOM%" > "%TEMP%\thy_v12.txt"
findstr /c:"27452, 1645" "%TEMP%\thy_v12.txt" >nul
if errorlevel 1 goto vf
curl.exe -s "https://fastwrite.tech/.well-known/assetlinks.json?nc=%RANDOM%" > "%TEMP%\thy_al.txt"
findstr /c:"D6:B5:B2:BB" "%TEMP%\thy_al.txt" >nul
if errorlevel 1 goto vf
echo    OK - 3 selides me 27452, 1645 · kamia 55518 · assetlinks me cert Google

echo.
echo ================================
echo   OK - THYRIDA + ASSETLINKS ZONTANA
echo ================================
pause
exit /b 0

:tf
echo. & echo  ******** TESTS FAILED - tipota den anevike. ******** & echo.
pause
exit /b 1
:vf
echo. & echo  ******** TO DEPLOY EGINE, ALLA I EPALITHEFSI APETYXE - deite %TEMP%\thy_*.txt ******** & echo.
pause
exit /b 2
:failed
echo. & echo  ******** APETYXE. ******** & echo.
pause
exit /b 1
