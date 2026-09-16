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
# 🔴 ΜΑΘΗΜΑ 16/9 (δεύτερο): αυτό το script ΕΙΝΑΙ αρχείο του repo. Οσο το scp
#    το έγραφε μέσα στο /app/projects, το git το έβλεπε ως τοπική αλλαγή και
#    αρνιόταν το pull. Τώρα έρχεται στο /root και τρέχει από εκεί. Αν έχει
#    μείνει παλιό αποτύπωμα μέσα στο worktree, το πετάμε — ΜΟΝΟ αυτό το ένα
#    αρχείο, ΠΟΤΕ reset --hard.
git checkout -- hetzner_pinakas.sh 2>/dev/null || true
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
# 🔴 ΜΑΘΗΜΑ 16/9 (τρίτο): μετρούσα με το εργαλείο sqlite3 που ΔΕΝ υπάρχει εδώ,
#    και τύπωνα «?» σαν να ήταν εντάξει.
# 🔴 ΜΑΘΗΜΑ 16/9 (τέταρτο): μετά μάντεψα το όνομα «fastwrite.db» και μέτρησα
#    ΛΑΘΟΣ ΑΡΧΕΙΟ — δίπλα στο σωστό κάθεται παλιό αρχείο με μηδέν index, και
#    ο έλεγχος «απέτυχε» για βάση που δεν χρησιμοποιεί κανείς.
#    Τώρα η διαδρομή διαβάζεται ΑΠΟ ΤΟΝ ΚΩΔΙΚΑ και από το systemd.
FWBASE=$(systemctl show -p Environment fastwrite 2>/dev/null | tr ' ' '\n' | sed -n 's/^FASTWRITE_BASE_DIR=//p' | head -1)
python3 - "$ROOT" "$FWBASE" <<'PY'
import os, re, sys, sqlite3
from pathlib import Path
root, envbase = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else "")
src = open(os.path.join(root, "main_api.py"), encoding="utf-8").read()
mb = re.search(r'BASE_DIR\s*=\s*Path\(os\.environ\.get\(\s*"FASTWRITE_BASE_DIR"\s*,\s*"([^"]+)"', src)
md = re.search(r'DB_PATH\s*=\s*BASE_DIR\s*/\s*"([^"]+)"\s*/\s*"([^"]+)"', src)
if not md:
    print("!! Δεν βρήκα το DB_PATH μέσα στο main_api.py — σταματώ αντί να μαντέψω.")
    sys.exit(1)
base = Path(envbase or (mb.group(1) if mb else root))
db = base / md.group(1) / md.group(2)
print("   η εφαρμογή γράφει στο: %s" % db)
if not db.exists():
    print("!! Το αρχείο δεν υπάρχει."); sys.exit(1)
want = ["idx_documents_user", "idx_installs_user", "idx_installs_email",
        "idx_users_created", "idx_subs_user", "idx_feedback_created"]
have = {r[0] for r in sqlite3.connect("file:%s?mode=ro" % db, uri=True)
        .execute("SELECT name FROM sqlite_master WHERE type='index'")}
mine = sorted(n for n in have if n.startswith("idx_"))
print("   βρέθηκαν %d index: %s" % (len(mine), ", ".join(mine) if mine else "ΚΑΝΕΝΑ"))
missing = [w for w in want if w not in have]
if missing:
    print("!! ΛΕΙΠΟΥΝ: " + ", ".join(missing)); sys.exit(1)
print("   όλα τα κρίσιμα index υπάρχουν.")
PY
[ $? -eq 0 ] || { echo "!! Η βάση δεν έχει τα index — ο πίνακας θα αργεί στα 1000+."; exit 1; }

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
