@echo off
chcp 65001 >nul
rem KM-PRO-V195 13/10/2026 - tests, deploy STAGING mono, e2e f2check, commit (choris push). TIPOTA sto Free.
cd /d C:\Users\User\fastwrite-pro
set "OUT=C:\Users\User\fastwrite-pro\Claude outputs\pro\v195_out.txt"
set "KM_PW_DIR=%LOCALAPPDATA%\km-pw"
> "%OUT%" echo PRO v195 %date% %time%
node --check site\kostometro\app.js >> "%OUT%" 2>&1
if errorlevel 1 goto failed
for %%f in (tests\*.test.mjs) do (
  node %%f > nul 2>&1
  if errorlevel 1 ( echo TEST_FAIL %%f >> "%OUT%" & goto failed )
)
for /L %%i in (1,1,20) do (
  node tests\pro_f2.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS %%i >> "%OUT%" & goto failed )
)
echo TESTS_OK >> "%OUT%"
call npx --yes wrangler deploy --env staging >> "%OUT%" 2>&1
if errorlevel 1 goto failed
echo DEPLOY_STAGING_OK >> "%OUT%"
node tools\pro\f2check.mjs >> "%OUT%" 2>&1
if errorlevel 1 ( echo F2CHECK_FAIL >> "%OUT%" & goto failed )
echo F2CHECK_OK >> "%OUT%"
git add site/kostometro/app.js site/kostometro/sw.js site/kostometro/version.json tests/pro_f2.test.mjs tools/pro/f2check.mjs deploy_v000_pro_f2check.bat deploy_v000_pro_v195.bat commit_pro_v195.txt >> "%OUT%" 2>&1
git commit -F commit_pro_v195.txt >> "%OUT%" 2>&1
git log -4 --oneline >> "%OUT%" 2>&1
git branch -vv >> "%OUT%" 2>&1
echo PRO_V195_TELOS >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b 0
:failed
echo PRO_V195_APETYXE >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b 1
