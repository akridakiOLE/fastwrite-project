@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  BHMA G - HETZNER. Anoigei ti zoni FastWrite ston Pinaka Elegxou.
echo  Stelnei kleidi + script apeytheias me scp. Kamia exartisi apo git.
echo.

if not exist "secrets\km_admin_key.txt" goto nokey
if not exist "hetzner_pinakas.sh" goto noscript

set SSHUSER=
set /p SSHUSER=SSH user gia ton 46.62.255.91 (Enter = root): 
if "%SSHUSER%"=="" set SSHUSER=root
echo.

echo [1/3] Stelno to kleidi...
scp secrets\km_admin_key.txt %SSHUSER%@46.62.255.91:/app/projects/secrets/km_admin_key.txt
if errorlevel 1 goto scpfail

echo [2/3] Stelno to script se /root - EXO apo to worktree tou git...
scp hetzner_pinakas.sh %SSHUSER%@46.62.255.91:/root/pinakas_step.sh
if errorlevel 1 goto scpfail

echo [3/3] Restart + autoelegxos...
ssh %SSHUSER%@46.62.255.91 "sed -i 's/\r$//' /root/pinakas_step.sh; bash /root/pinakas_step.sh"
if errorlevel 1 goto shfail

echo.
echo ================================
echo   TELOS. Anoixe fastwrite.tech/pinakas kai pata Ananeosi.
echo   I zoni FastWrite prepei na deixnei arithmous.
echo ================================
echo.
pause
exit /b 0

:nokey
echo  ******** Den brika to secrets\km_admin_key.txt. ********
pause
exit /b 1
:noscript
echo  ******** Den brika to hetzner_pinakas.sh se ayton ton fakelo. ********
pause
exit /b 1
:scpfail
echo.
echo  ******** To scp apetyxe. Grapse mou ti eipe. ********
echo.
pause
exit /b 1
:shfail
echo.
echo  ******** O autoelegxos stamatise. Grapse mou tis teleytaies grammes. ********
echo.
pause
exit /b 1
