@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\fastwrite-project
echo.
echo  v133 = Politiki Aporritou v2.6 (EL+EN, T.TH. 55518) + koumpia Apple + diagrafi xoris tin efarmogi
echo         + eidopoiisi Politikis (MONO dokimi edo - i apostoli ginetai xorista) + efarmogi katastimaton = v133
echo  Vasi: 2 neoi pinakes (MONO CREATE).
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/9] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
node --check site\kostometro\app.js
if errorlevel 1 goto failed
node --check site\kostometro\sw.js
if errorlevel 1 goto failed
echo    OK

echo [2/9] v133 tests + metallaxeis 1-12, legal_v21 + metallaxeis 1-10...
node --experimental-sqlite tests\v133.test.mjs
if errorlevel 1 goto tf
for /L %%N in (1,1,12) do (
  node --experimental-sqlite tests\v133.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
node --experimental-sqlite tests\legal_v21.test.mjs
if errorlevel 1 goto tf
for /L %%N in (1,1,10) do (
  node tests\legal_v21.test.mjs --mutate=%%N
  if errorlevel 1 goto mf
)
echo    OK

echo [3/9] Palia tests (k3b, k3a, h11b, v88-v131, pinakas, ref, verify, install_ui, ref_ui, v89)...
for %%T in (k3b k3a h11b v88 v92 v93 v95 v98 v99 v100 v102 v105 v106 v112 v113 v114 v116 v118 v120 v131 pinakas ref verify install_ui ref_ui v89) do (
  node --experimental-sqlite tests\%%T.test.mjs >nul 2>&1
  if errorlevel 1 ( echo    APETYXE: %%T & goto tf )
)
echo    OK

echo [4/9] D1: pinakes v133 (PRIN to deploy)...
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --file=schema/km_v133.sql
if errorlevel 1 goto failed
call npx --yes wrangler d1 execute fastwrite-beta-downloads --remote --command "SELECT name FROM sqlite_master WHERE name IN ('km_delreq_codes','km_notice_sent') ORDER BY name;" > "%TEMP%\v133_d1.txt"
findstr /c:"km_delreq_codes" "%TEMP%\v133_d1.txt" >nul
if errorlevel 1 goto d1f
findstr /c:"km_notice_sent" "%TEMP%\v133_d1.txt" >nul
if errorlevel 1 goto d1f
echo    OK

echo [5/9] git add (RITI lista) + commit + push...
git add src\km.js schema\km_v133.sql site\legal\privacy.html site\legal\privacy-en.html site\legal\privacy-en-v1-2.html site\kostometro\index.html site\kostometro\app.js site\kostometro\sw.js site\kostometro\version.json tests\v133.test.mjs tests\legal_v21.test.mjs deploy_v133.bat commit_v133.txt
if errorlevel 1 goto failed
git commit -F commit_v133.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo    OK

echo [6/9] wrangler deploy...
call npx --yes wrangler deploy
if errorlevel 1 goto failed
echo    OK

echo [7/9] Epalithefsi stin paragogi...
timeout /t 8 /nobreak >nul
curl.exe -s "https://fastwrite.tech/kostometro/version.json?nc=%RANDOM%" > "%TEMP%\v133_ver.txt"
findstr /c:"v133" "%TEMP%\v133_ver.txt" >nul
if errorlevel 1 goto vf
curl.exe -s "https://fastwrite.tech/legal/privacy?nc=%RANDOM%" > "%TEMP%\v133_pol.txt"
findstr /c:"v2.6" "%TEMP%\v133_pol.txt" >nul
if errorlevel 1 goto vf
findstr /c:"55518" "%TEMP%\v133_pol.txt" >nul
if errorlevel 1 goto vf
curl.exe -s "https://fastwrite.tech/legal/privacy-en?nc=%RANDOM%" > "%TEMP%\v133_polen.txt"
findstr /c:"Version 2.6" "%TEMP%\v133_polen.txt" >nul
if errorlevel 1 goto vf
curl.exe -s -o NUL -w "%%{http_code}" "https://fastwrite.tech/legal/privacy-en-v1-2" > "%TEMP%\v133_v12.txt"
findstr /c:"200" "%TEMP%\v133_v12.txt" >nul
if errorlevel 1 goto vf
curl.exe -s "https://fastwrite.tech/kostometro/?nc=%RANDOM%" > "%TEMP%\v133_idx.txt"
findstr /c:"go-apple" "%TEMP%\v133_idx.txt" >nul
if errorlevel 1 goto vf
curl.exe -s -o NUL -w "%%{http_code}" -X POST -H "Content-Type: application/json" --data "{}" https://fastwrite.tech/api/km/admin/delreq > "%TEMP%\v133_adm.txt"
findstr /c:"404" "%TEMP%\v133_adm.txt" >nul
if errorlevel 1 goto vf
echo    OK - version v133 · Politiki 2.6 EL+EN · v1.2 arxeio 200 · koumpi Apple · admin xoris kleidi = 404

echo [8/9] Efarmogi katastimaton: www = v133 (antigrafa tou site, XORIS sw.js)...
set SITE=C:\Users\User\fastwrite-project\site
cd /d C:\Users\User\kostometro-app
if exist ".git\index.lock" del /f /q ".git\index.lock"
for %%f in (app.js index.html app.css qr.js qrscan.js version.json manifest.webmanifest) do copy /y "%SITE%\kostometro\%%f" www\kostometro\%%f >nul
copy /y "%SITE%\km-crypto.js" www\km-crypto.js >nul
copy /y "%SITE%\kostometro\icons\*.png" www\kostometro\icons\ >nul
if exist www\kostometro\sw.js goto swf
for %%f in (app.js index.html version.json) do (
  fc /b "%SITE%\kostometro\%%f" www\kostometro\%%f >nul
  if errorlevel 1 ( echo    DIAFORA: %%f & goto failed2 )
)
findstr /c:"v133" www\kostometro\version.json >nul
if errorlevel 1 goto failed2
echo    OK - idia bytes me to site · v133 · xoris sw.js

echo [9/9] kostometro-app: commit + push (to Codemagic DEN xekina iOS build mono tou)...
git add www\kostometro\app.js www\kostometro\index.html www\kostometro\app.css www\kostometro\qr.js www\kostometro\qrscan.js www\kostometro\version.json www\kostometro\manifest.webmanifest www\km-crypto.js www\kostometro\icons
if errorlevel 1 goto failed2
git commit -m "www = v133 (Politiki v2.6, koumpia Apple, diagrafi xoris efarmogi) - antigrafo tou site"
if errorlevel 1 goto failed2
git push origin main
if errorlevel 1 goto failed2
echo    OK

echo.
echo ================================
echo   OK - v133 ZONTANO + www v133 sto GitHub
echo   EPOMENO: Codemagic ios-testflight (neo build) - kai i eidopoiisi Politikis (xorista)
echo ================================
pause
exit /b 0

:tf
echo. & echo  ******** TESTS FAILED - tipota den anevike. ******** & echo.
pause
exit /b 1
:mf
echo. & echo  ******** APODEIXI METALLAXIS APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
:d1f
echo. & echo  ******** I VASI DEN EXEI TOUS PINAKES - TO DEPLOY DEN EGINE. Deite %TEMP%\v133_d1.txt ******** & echo.
pause
exit /b 1
:vf
echo. & echo  ******** TO DEPLOY EGINE, ALLA I EPALITHEFSI APETYXE - deite %TEMP%\v133_*.txt ******** & echo.
pause
exit /b 2
:swf
echo. & echo  ******** www\kostometro\sw.js DEN PREPEI NA YPARXEI - tipota den anevike sto kostometro-app. ******** & echo.
pause
exit /b 1
:failed2
echo. & echo  ******** O SERVER ANEVIKE OK, ALLA TO kostometro-app (www) DEN ANEVIKE. ******** & echo.
pause
exit /b 1
:failed
echo. & echo  ******** APETYXE. ******** & echo.
pause
exit /b 1
