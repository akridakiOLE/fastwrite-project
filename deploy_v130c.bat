@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d C:\Users\User\fastwrite-project
echo  v130c = akrisway@gmail.com (dokimastikos logariasmos Stavros) ektos Allilografias.
echo
if exist ".git\index.lock" del /f /q ".git\index.lock"
node --check src\km.js
if errorlevel 1 goto failed
node --experimental-sqlite tests\v130.test.mjs
if errorlevel 1 goto failed
for %%N in (1 2 3 4 5 6 7 8 9) do (
  node --experimental-sqlite tests\v130.test.mjs --mutate=%%N
  if errorlevel 1 goto failed
)
node --experimental-sqlite tests\v129.test.mjs
if errorlevel 1 goto failed
git add src\km.js tools\support\mail_log.gs tests\v130.test.mjs deploy_v130c.bat commit_v130c.txt
if errorlevel 1 goto failed
git commit -F commit_v130c.txt
if errorlevel 1 goto failed
git push origin master
if errorlevel 1 goto failed
call npx --yes wrangler deploy
if errorlevel 1 goto failed
call npx --yes wrangler d1 execute DB --remote --command="DELETE FROM km_corr WHERE peer='akrisway@gmail.com'" --yes
if errorlevel 1 call npx --yes wrangler d1 execute DB --remote --command="DELETE FROM km_corr WHERE peer='akrisway@gmail.com'" --yes
echo OK - v130c
exit /b 0
:failed
echo  ******** APETYXE - tipota den anevike. ********
exit /b 1
