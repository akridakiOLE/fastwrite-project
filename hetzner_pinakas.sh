#!/bin/bash
# ΠΙΝΑΚΑΣ ΕΛΕΓΧΟΥ — βήμα Hetzner (16/9/2026)
# Τρέχει ΣΤΟΝ SERVER, μετά το deploy_v62.bat:
#   bash /app/projects/fastwrite-project/hetzner_pinakas.sh
# Τι κάνει: git pull → ελέγχει ότι υπάρχει το km_admin_key.txt → restart →
# δοκιμάζει τη διαδρομή /api/admin/pinakas με ΚΑΙ χωρίς κλειδί.
set -e
cd /app/projects/fastwrite-project

echo "=== 1. git pull ==="
git pull --ff-only
grep -q 'def admin_pinakas' main_api.py || { echo "!! Το main_api.py ΔΕΝ έχει το admin_pinakas — δεν ήρθε ο κώδικας."; exit 1; }
python3 -m py_compile main_api.py && echo "   py_compile OK"

echo "=== 2. Κλειδί ==="
KEYF=/app/projects/secrets/km_admin_key.txt
if [ ! -s "$KEYF" ]; then
  echo "!! ΛΕΙΠΕΙ το $KEYF"
  echo "   Από τον υπολογιστή σου (PowerShell):"
  echo "   scp C:\\Users\\User\\fastwrite-project\\secrets\\km_admin_key.txt <χρήστης>@46.62.255.91:$KEYF"
  echo "   και ξανατρέξε αυτό το script."
  exit 1
fi
chmod 600 "$KEYF"
KEY=$(tr -d '\r\n' < "$KEYF")
echo "   βρέθηκε, ${#KEY} χαρακτήρες"

echo "=== 3. restart ==="
sudo systemctl restart fastwrite
sleep 3
systemctl is-active fastwrite

echo "=== 4. Δοκιμή ==="
PORT=$(grep -oE 'port=[0-9]+' main_api.py | head -1 | cut -d= -f2); PORT=${PORT:-5000}
NOKEY=$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/admin/pinakas")
WITH=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Km-Admin: $KEY" "http://127.0.0.1:$PORT/api/admin/pinakas")
echo "   χωρίς κλειδί: $NOKEY (πρέπει 404)"
echo "   με κλειδί:    $WITH (πρέπει 200)"
[ "$NOKEY" = "404" ] && [ "$WITH" = "200" ] && echo "=== ΟΚ — άνοιξε fastwrite.tech/pinakas στο κινητό: η ζώνη FastWrite γεμίζει ===" || { echo "!! Κάτι δεν ταιριάζει — δες: journalctl -u fastwrite -n 30 --no-pager"; exit 1; }
