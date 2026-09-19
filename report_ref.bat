@echo off
chcp 65001 >nul
cd /d C:\Users\User\fastwrite-project
echo.
echo  ANAFORA SYSTASEON - rotaei ti VASI, oxi tin othoni.
echo  Grafei to apotelesma sto report_ref_out.txt
echo.

set D1=npx --yes wrangler d1 execute fastwrite-beta-downloads --remote

echo [1/3] Oi 8 pio prosfates eggrafes: pote, email, apo pou, POIOS TIS SYSTISE...
call %D1% --command "SELECT substr(created,1,16) AS pote, substr(email,1,4)||'***@'||substr(email,instr(email,'@')+1) AS email, source AS apo_pou, COALESCE(ref,'(KENO)') AS systasi, COALESCE(substr(ref_code,1,10),'(KENO)') AS o_dikos_tou_kodikos FROM km_accounts WHERE deleted IS NULL ORDER BY created DESC LIMIT 8" > report_ref_out.txt 2>&1
type report_ref_out.txt

echo.
echo [2/3] Posoi irthan apo kathe kodiko systasis...
call %D1% --command "SELECT ref AS kodikos, COUNT(*) AS posoi FROM km_accounts WHERE deleted IS NULL AND ref IS NOT NULL AND ref<>'' GROUP BY ref ORDER BY posoi DESC LIMIT 10" >> report_ref_out.txt 2>&1
call %D1% --command "SELECT ref AS kodikos, COUNT(*) AS posoi FROM km_accounts WHERE deleted IS NULL AND ref IS NOT NULL AND ref<>'' GROUP BY ref ORDER BY posoi DESC LIMIT 10"

echo.
echo [3/3] Posoi logariasmoi exoun paroun dikó tous kodiko (ref_code)...
call %D1% --command "SELECT COUNT(*) AS synolo, COUNT(ref_code) AS me_kodiko, COUNT(ref) AS me_systasi FROM km_accounts WHERE deleted IS NULL" >> report_ref_out.txt 2>&1
call %D1% --command "SELECT COUNT(*) AS synolo, COUNT(ref_code) AS me_kodiko, COUNT(ref) AS me_systasi FROM km_accounts WHERE deleted IS NULL"

echo.
echo ================================
echo   Oti xreiazetai einai kai sto arxeio:
echo   C:\Users\User\fastwrite-project\report_ref_out.txt
echo ================================
echo.
pause
