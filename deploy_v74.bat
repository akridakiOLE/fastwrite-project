@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  v74 = I KARTA EGKATASTASIS VGAINEI SE KATHE ANOIGMA TIS SELIDAS
echo.
echo        Apofasi Stavros: kamia alli diadromi. Kathe "monimi porta" mesa
echo        stin efarmogi (grammi sto Menou, erotisi sto FAQ) ti vlepei mono
echo        opoios exei IDI bei - doro axristo. I odigia xreiazetai PRIN.
echo.
echo        DEN ginetai empodio: tin karta ti vlepei MONO opoios DEN exei
echo        egkatastisei. Molis to kanei, to standalone tin kleinei gia panta.
echo        To "Oxi tora" kleinei MONO afti ti fortosi - kamia eggrafi ston disko.
echo.
echo        Vgike o rythmos 1/4/10 tis v72. KAMIA metavasi vasis.
echo.
if exist ".git\index.lock" del /f /q ".git\index.lock"

echo [1/5] Deiktes pou PREPEI na yparxoun...
findstr /c:"KM-INSTALL-PROMPT" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id=\"inst-steps\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"id=\"inst-warn\"" site\kostometro\index.html >nul
if errorlevel 1 goto nm
findstr /c:"maybeInstall(); })" site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"km-v74" site\kostometro\sw.js >nul
if errorlevel 1 goto nm
findstr /c:"\"v\": \"v74\"" site\kostometro\version.json >nul
if errorlevel 1 goto nm
findstr /c:"id: 'install-android'," site\kostometro\app.js >nul
if errorlevel 1 goto nm
findstr /c:"id: 'install-ios'," site\kostometro\app.js >nul
if errorlevel 1 goto nm
echo    OK - 8 deiktes.

echo [2/5] Deiktes pou PREPEI na leipoun...
findstr /c:"km-v73" site\kostometro\sw.js >nul
if not errorlevel 1 goto lo
findstr /c:"\"v\": \"v73\"" site\kostometro\version.json >nul
if not errorlevel 1 goto lo
findstr /c:"'inst'," site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"display-mode: minimal-ui" site\kostometro\app.js >nul
if not errorlevel 1 goto lo
findstr /c:"INST_AT" site\kostometro\app.js >nul
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

echo [4/5] Souites + 47 apodeixeis metallaxis, MIA TI FORA...
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
for %%N in (1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19) do (
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
git add tests\install_ui.test.mjs deploy_v74.bat commit_v74.txt
if errorlevel 1 goto failed
git commit -F commit_v74.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
echo.
echo ================================
echo   OK - Cloudflare ~2 lepta.
echo.
echo   O ELEGXOS, apo to KINITO (oxi apo ypologisti - ekei DEN vgainei):
echo   1) Anoixe fastwrite.tech/kostometro/ - i karta petagetai moni tis.
echo   2) Pata "Oxi tora". Ksana-anoixe ti selida: PREPEI na xanavgei.
echo      Kai tin triti kai tin tetarti fora. PANTA, oso den einai egkatestimeni.
echo   3) Kane tin egkatastasi kai anoixe to APO TO EIKONIDIO:
echo      i karta DEN prepei na xanavgei pote.
echo   4) Ekdosi sto Menou kato: v74
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
echo    Epezise PALIOS deiktis (km-v73, v73 sto version.json, 'inst', minimal-ui i INST_AT).
goto failed
:nm
echo    Leipei APAITOUMENOS deiktis.
goto failed
:failed
echo. & echo  ******** APETYXE - tipota den anevike. ******** & echo.
pause
exit /b 1
