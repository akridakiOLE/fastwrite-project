@echo off
chcp 65001 >nul
rem KM-PRO-F2-CHECK 13/10/2026 - epalithefsi F2 sto staging me Playwright (Windows). Grafei sto Claude outputs\pro_f2check\
cd /d C:\Users\User\fastwrite-pro
set "KM_PW_DIR=%LOCALAPPDATA%\km-pw"
echo [F2CHECK] Playwright: %KM_PW_DIR%
if not exist "%KM_PW_DIR%\node_modules\playwright\package.json" (
  if not exist "%KM_PW_DIR%" mkdir "%KM_PW_DIR%"
  pushd "%KM_PW_DIR%"
  echo {"name":"km-pw","private":true}> package.json
  call npm install playwright@1.56.0 --no-audit --no-fund
  popd
)
pushd "%KM_PW_DIR%"
call npx playwright install chromium
popd
cd /d C:\Users\User\fastwrite-pro
node tools\pro\f2check.mjs
set RC=%errorlevel%
echo [F2CHECK] exit=%RC%
cd /d C:\Users\User\fastwrite-pro
exit /b %RC%
