@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v64 = I zoni FastWrite deixnei se host pou YPARXEI
echo        + i dieythynsi ginetai RYTHMISI (FW_ORIGIN), oxi karfoti statheri.
echo        Kamia metavasi vasis.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes pou PREPEI na yparxoun...
findstr /c:"function fwOrigin" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"fastwrite.duckdns.org" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"FW_ORIGIN" src\km.js >nul
if errorlevel 1 goto nm
findstr /c:"text eol=lf" .gitattributes >nul
if errorlevel 1 goto nm
findstr /c:"/root/pinakas_step.sh" deploy_hetzner.bat >nul
if errorlevel 1 goto nm
echo    OK - 5 deiktes.

echo [2/5] Deiktes pou PREPEI na leipoun...
findstr /c:"FW_PINAKAS_URL" src\km.js >nul
if not errorlevel 1 goto lo
findstr /c:"/app/projects/hetzner_pinakas.sh" deploy_hetzner.bat >nul
if not errorlevel 1 goto lo
echo    OK

echo [3/5] Syntaxi...
node --check src\km.js
if errorlevel 1 goto failed
echo    OK

echo [4/5] Oles oi souites + apodeixi metallaxis...
node --experimental-sqlite tests\pinakas.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\h11b.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\mail.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\cleanup.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\feedback.test.mjs
if errorlevel 1 goto tf
node --experimental-sqlite tests\pinakas.test.mjs --mutate
if errorlevel 1 goto mf
node --experimental-sqlite tests\h11b.test.mjs --mutate
if errorlevel 1 goto mf
echo    OK

echo [5/5] Staging...
git add src\km.js tests\pinakas.test.mjs .gitattributes
if errorlevel 1 goto failed
git add deploy_hetzner.bat hetzner_pinakas.sh deploy_v64.bat commit_v64.txt
if errorlevel 1 goto failed
git commit -F commit_v64.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo   Meta: fastwrite.tech/pinakas -^> Ananeosi.
echo   I zoni FastWrite prepei na deixnei arithmous anti gia "den apantise".
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
echo    Epezise PALIOS deiktis (karfoti dieythynsi i palio monopati scp).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
