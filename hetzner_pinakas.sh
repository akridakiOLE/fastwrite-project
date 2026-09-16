#!/bin/bash
# ΠΙΝΑΚΑΣ ΕΛΕΓΧΟΥ — βήμα Hetzner (16/9/2026, v63)
#
# 🔴 ΜΑΘΗΜΑ 16/9: η ρίζα του αποθετηρίου στον server ΕΙΝΑΙ το /app/projects,
#    ΟΧΙ το /app/projects/fastwrite-project (αυτό είναι untracked φάκελος).
#    Το script έρχεται με scp, ΟΧΙ με git — αλλιώς ζητάει pull για να φέρει
#    τον ίδιο του τον εαυτό.
#
# Τρέχει ΣΤΟΝ SERVER:  bash /app/projects/hetzner_pinakas.sh
set -e
ROOT=/app/projects
cd "$ROOT"

echo "=== 1. git pull ==="
git rev-parse --show-toplevel
git pull --ff-only

echo "=== 2. Κώδικας ==="
grep -q 'def admin_pinakas' main_api.py   || { echo "!! λείπει το admin_pinakas"; exit 1; }
grep -q 'accounts_total'    main_api.py   || { echo "!! παλιό main_api.py — χωρίς accounts_total (θα κόβει σιωπηλά)"; exit 1; }
grep -q 'idx_documents_user' db_manager.py || { echo "!! παλιό db_manager.py — χωρίς index"; exit 1; }
python3 -m py_compile main_api.py db_manager.py && echo "   py_compile OK"

echo "=== 3. Κλειδί ==="
KEYF="$ROOT/secrets/km_admin_key.txt"
[ -s "$KEYF" ] || { echo "!! ΛΕΙΠΕΙ το $KEYF — στείλ' το με scp και ξανατρέξε."; exit 1; }
chmod 600 "$KEYF"
KEY=$(tr -d '\r\n' < "$KEYF")
[ ${#KEY} -ge 32 ] || { echo "!! κλειδί < 32 χαρακτήρες — η διαδρομή θα μένει 404."; exit 1; }
echo "   βρέθηκε, ${#KEY} χαρακτήρες"

echo "=== 4. restart ==="
systemctl restart fastwrite
sleep 4
systemctl is-active fastwrite

echo "=== 5. Index στη βάση ==="
# Τα index φτιάχνονται στην εκκίνηση (db_manager). Τα ΜΕΤΡΑΜΕ, δεν τα υποθέτουμε.
DB=$(ls -1 "$ROOT"/fastwrite.db "$ROOT"/*/fastwrite.db 2>/dev/null | head -1)
if [ -n "$DB" ]; then
  NIX=$(sqlite3 "$DB" "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'" 2>/dev/null || echo "?")
  echo "   $DB → $NIX index"
  [ "$NIX" = "?" ] || [ "$NIX" -ge 10 ] || echo "   ⚠ λιγότερα από 10 — δες αν η βάση είναι αλλού"
else
  echo "   (δεν βρέθηκε αρχείο βάσης για μέτρηση — δεν μπλοκάρει)"
fi

echo "=== 6. Δοκιμή διαδρομής ==="
PORT=$(ss -lntp 2>/dev/null | grep -i fastwrite | grep -oE ':[0-9]+' | head -1 | tr -d ':')
[ -z "$PORT" ] && PORT=8000
U="http://127.0.0.1:$PORT/api/admin/pinakas"
NOKEY=$(curl -s -o /dev/null -w '%{http_code}' "$U" || echo ERR)
WITH=$(curl -s -o /dev/null -w '%{http_code}' -H "X-Km-Admin: $KEY" "$U" || echo ERR)
PAGE=$(curl -s -H "X-Km-Admin: $KEY" "$U?only=accounts&n=2" || echo "")
echo "   θύρα $PORT · χωρίς κλειδί: $NOKEY (πρέπει 404) · με κλειδί: $WITH (πρέπει 200)"
if [ "$NOKEY" = "404" ] && [ "$WITH" = "200" ]; then
  echo "   σελίδα 2 γραμμών + σύνολο:"
  echo "$PAGE" | head -c 300; echo
  echo "$PAGE" | grep -q 'accounts_total' || { echo "!! λείπει το accounts_total στην απάντηση"; exit 1; }
  echo "=== ΟΛΑ ΚΑΛΑ — άνοιξε fastwrite.tech/pinakas και πάτα Ανανέωση ==="
else
  echo "!! Δεν ταιριάζει. Δες: journalctl -u fastwrite -n 30 --no-pager"
  exit 1
fi
