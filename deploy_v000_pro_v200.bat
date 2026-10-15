@echo off
chcp 65001 >nul
rem KM-PRO-V200 15/10/2026 - metrisi ftinou montelou (synola) sta IDIA 20 tim. gia tin timi PRO.mini: admin read-test (mono me kleidi). Tests + metallaxeis F5, deploy STAGING mono, metrisi, commit+push pro. TIPOTA sto Free/paragogi.
cd /d C:\Users\User\fastwrite-pro
set "OUT=C:\Users\User\fastwrite-pro\Claude outputs\pro\v200_out.txt"
> "%OUT%" echo PRO v200 %date% %time%
for %%f in (src\km.js src\km_pro.js src\km_paddle.js tools\pro\measure20.mjs) do (
  node --check %%f >> "%OUT%" 2>&1
  if errorlevel 1 ( echo SYNTAX_FAIL %%f >> "%OUT%" & goto failed )
)
for %%f in (tests\*.test.mjs) do (
  node %%f > nul 2>&1
  if errorlevel 1 ( echo TEST_FAIL %%f >> "%OUT%" & goto failed )
)
for /L %%i in (1,1,48) do (
  node tests\pro_f5.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_F5 %%i >> "%OUT%" & goto failed )
)
echo TESTS_OK >> "%OUT%"
call npx --yes wrangler deploy --env staging >> "%OUT%" 2>&1
if errorlevel 1 goto failed
echo DEPLOY_STAGING_OK >> "%OUT%"
node tools\pro\measure20.mjs free >> "%OUT%" 2>&1
if errorlevel 1 ( echo MEASURE_FAIL >> "%OUT%" & goto failed )
git add src/km.js tests/pro_f5.test.mjs tools/pro/measure20.mjs deploy_v000_pro_v200.bat commit_pro_v200.txt >> "%OUT%" 2>&1
git commit -F commit_pro_v200.txt >> "%OUT%" 2>&1
git push origin pro >> "%OUT%" 2>&1
git log -2 --oneline >> "%OUT%" 2>&1
echo PRO_V200_TELOS >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b 0
:failed
echo PRO_V200_APETYXE >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b 1
