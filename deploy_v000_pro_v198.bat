@echo off
chcp 65001 >nul
rem KM-PRO-V198 14/10/2026 - F4 FastWrite grammatokivotio: tests+metallaxeis (node+python), schema+deploy STAGING mono, e2e f4check (Boss+logistis) + f3check + f2check, commit+push pro. TIPOTA sto Free, TIPOTA stin paragogi.
cd /d C:\Users\User\fastwrite-pro
set "OUT=C:\Users\User\fastwrite-pro\Claude outputs\pro\v198_out.txt"
set "KM_PW_DIR=%LOCALAPPDATA%\km-pw"
set "PYTHONIOENCODING=utf-8"
> "%OUT%" echo PRO v198 %date% %time%
for %%f in (src\km.js src\km_pro.js src\km_team.js src\km_acct.js site\kostometro\app.js site\km-crypto.js static\km_mailbox.js tools\pro\f4check.mjs tools\pro\f4local.mjs) do (
  node --check %%f >> "%OUT%" 2>&1
  if errorlevel 1 ( echo SYNTAX_FAIL %%f >> "%OUT%" & goto failed )
)
rem --- Python venv tou fastwrite-pro (ektos git) ---
if not exist "venv\Scripts\python.exe" (
  echo VENV_NEW >> "%OUT%"
  py -3 -m venv venv >> "%OUT%" 2>&1 || python -m venv venv >> "%OUT%" 2>&1
)
if not exist "venv\Scripts\python.exe" ( echo VENV_FAIL >> "%OUT%" & goto failed )
venv\Scripts\python.exe -c "import flask, jwt, bcrypt, cryptography, requests, pdfplumber, pypdfium2, pypdf, PIL, openpyxl, pandas, google.genai" > nul 2>&1
if errorlevel 1 (
  venv\Scripts\python.exe -m pip install -q flask PyJWT bcrypt "cryptography>=42" requests "google-genai>=2.8.0" pdfplumber pypdfium2 pypdf Pillow openpyxl pandas >> "%OUT%" 2>&1
  if errorlevel 1 ( echo PIP_FAIL >> "%OUT%" & goto failed )
)
set "KM_PY=C:\Users\User\fastwrite-pro\venv\Scripts\python.exe"
"%KM_PY%" -m py_compile km_mailbox.py main_api.py >> "%OUT%" 2>&1
if errorlevel 1 ( echo PY_SYNTAX_FAIL >> "%OUT%" & goto failed )
for %%f in (tests\*.test.mjs) do (
  node %%f > nul 2>&1
  if errorlevel 1 ( echo TEST_FAIL %%f >> "%OUT%" & goto failed )
)
"%KM_PY%" tests\test_km_mailbox.py > "Claude outputs\pro\v198_pytest.txt" 2>&1
if errorlevel 1 ( echo TEST_FAIL test_km_mailbox.py >> "%OUT%" & goto failed )
for /L %%i in (1,1,20) do (
  node tests\pro_f2.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_F2 %%i >> "%OUT%" & goto failed )
  node tests\pro_f3.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_F3 %%i >> "%OUT%" & goto failed )
)
for /L %%i in (1,1,25) do (
  node tests\pro_f4.test.mjs --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_F4 %%i >> "%OUT%" & goto failed )
)
for /L %%i in (1,1,23) do (
  "%KM_PY%" tests\test_km_mailbox.py --mutate=%%i > nul 2>&1
  if errorlevel 1 ( echo MUT_MISS_PY %%i >> "%OUT%" & goto failed )
)
echo TESTS_OK >> "%OUT%"
node tools\pro\d1apply.mjs schema\km_acct.sql >> "%OUT%" 2>&1
if errorlevel 1 goto failed
call npx --yes wrangler deploy --env staging >> "%OUT%" 2>&1
if errorlevel 1 goto failed
echo DEPLOY_STAGING_OK >> "%OUT%"
set "KM_F4_MODE=staging"
node tools\pro\f4check.mjs >> "%OUT%" 2>&1
if errorlevel 1 ( echo F4CHECK_FAIL >> "%OUT%" & goto failed )
echo F4CHECK_OK >> "%OUT%"
node tools\pro\f3check.mjs >> "%OUT%" 2>&1
if errorlevel 1 ( echo F3CHECK_FAIL >> "%OUT%" & goto failed )
echo F3CHECK_OK >> "%OUT%"
node tools\pro\f2check.mjs >> "%OUT%" 2>&1
if errorlevel 1 ( echo F2CHECK_FAIL >> "%OUT%" & goto failed )
echo F2CHECK_OK >> "%OUT%"
git add src/km.js src/km_pro.js src/km_team.js src/km_acct.js schema/km_acct.sql site/kostometro/app.js site/kostometro/app.css site/kostometro/sw.js site/kostometro/version.json km_mailbox.py main_api.py fastwrite.spec static/index.html static/km_mailbox.js tests/pro_f3.test.mjs tests/pro_f4.test.mjs tests/test_km_mailbox.py tools/pro/f4check.mjs tools/pro/f4local.mjs deploy_v000_pro_v198.bat commit_pro_v198.txt >> "%OUT%" 2>&1
git commit -F commit_pro_v198.txt >> "%OUT%" 2>&1
git push origin pro >> "%OUT%" 2>&1
git log -3 --oneline >> "%OUT%" 2>&1
git branch -vv >> "%OUT%" 2>&1
echo PRO_V198_TELOS >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b 0
:failed
echo PRO_V198_APETYXE >> "%OUT%"
cd /d C:\Users\User\fastwrite-pro
exit /b 1
