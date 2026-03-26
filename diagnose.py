#!/usr/bin/env python3
"""
FastWrite Diagnostic Script — Τρέξε στον server:
  cd /app/projects/fastwrite-project
  python3 diagnose.py
"""
import sqlite3, json, sys

DB = "/app/projects/data/app.db"

print("=" * 60)
print("  FastWrite — Διαγνωστικό Script")
print("=" * 60)

# 1. Σύνδεση στη βάση
try:
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    print(f"\n[OK] Σύνδεση στη βάση: {DB}")
except Exception as e:
    print(f"\n[ΣΦΑΛΜΑ] Δεν μπορώ να συνδεθώ: {e}")
    sys.exit(1)

# 2. Δείξε ΟΛΑ τα documents με status
print("\n--- ΟΛΑ τα documents (τελευταία 20) ---")
rows = conn.execute(
    "SELECT id, filename, status, updated_at FROM documents ORDER BY id DESC LIMIT 20"
).fetchall()
for r in rows:
    print(f"  #{r['id']:4d} | {r['status']:20s} | {r['updated_at']} | {r['filename']}")

# 3. Μέτρα ανά status
print("\n--- Σύνοψη status ---")
counts = conn.execute(
    "SELECT status, COUNT(*) as cnt FROM documents GROUP BY status ORDER BY cnt DESC"
).fetchall()
for c in counts:
    print(f"  {c['status']:20s} : {c['cnt']}")

# 4. Βρες ένα pending_review document για test
pending = conn.execute(
    "SELECT id, filename, status FROM documents WHERE status='pending_review' ORDER BY id DESC LIMIT 1"
).fetchone()

if pending:
    doc_id = pending['id']
    print(f"\n--- TEST: Approve doc #{doc_id} ({pending['filename']}) ---")

    # Πριν
    before = conn.execute("SELECT status FROM documents WHERE id=?", (doc_id,)).fetchone()
    print(f"  ΠΡΙΝ:  status = '{before['status']}'")

    # Κάνε approve
    conn.execute("UPDATE documents SET status='Completed', updated_at=datetime('now') WHERE id=?", (doc_id,))
    conn.commit()

    # Μετά — ίδια σύνδεση
    after = conn.execute("SELECT status FROM documents WHERE id=?", (doc_id,)).fetchone()
    print(f"  ΜΕΤΑ:  status = '{after['status']}'")

    # Μετά — ΝΕΑ σύνδεση (σαν άλλος worker)
    conn2 = sqlite3.connect(DB)
    conn2.row_factory = sqlite3.Row
    after2 = conn2.execute("SELECT status FROM documents WHERE id=?", (doc_id,)).fetchone()
    print(f"  ΜΕΤΑ (νέα σύνδεση): status = '{after2['status']}'")
    conn2.close()

    if after['status'] == 'Completed' and after2['status'] == 'Completed':
        print("  [OK] Η βάση δουλεύει σωστά!")
    else:
        print("  [ΠΡΟΒΛΗΜΑ] Η βάση ΔΕΝ ενημερώνεται σωστά!")

    # Επαναφορά
    conn.execute("UPDATE documents SET status='pending_review' WHERE id=?", (doc_id,))
    conn.commit()
    print(f"  (Επαναφορά doc #{doc_id} σε pending_review)")
else:
    print("\n[!] Δεν βρέθηκε document σε pending_review για test.")

# 5. Έλεγξε τι κάνει ο Flask approve endpoint — δες τον κώδικα
print("\n--- Έλεγχος main_api.py approve endpoint ---")
try:
    with open("main_api.py", "r") as f:
        code = f.read()

    # Ψάξε τον approve endpoint
    import re
    # Βρες τη γραμμή approve
    lines = code.split('\n')
    found_approve = False
    for i, line in enumerate(lines):
        if '/approve' in line and ('post' in line.lower() or 'route' in line.lower()):
            found_approve = True
            print(f"  Βρέθηκε approve endpoint στη γραμμή {i+1}:")
            # Δείξε 15 γραμμές
            for j in range(i, min(i+15, len(lines))):
                print(f"    {j+1}: {lines[j]}")
            break

    if not found_approve:
        print("  [ΠΡΟΕΙΔΟΠΟΙΗΣΗ] ΔΕΝ βρέθηκε approve endpoint!")

    # Ψάξε πώς δημιουργείται το db object
    print("\n--- Πώς δημιουργείται το db object ---")
    for i, line in enumerate(lines):
        if 'db ' in line and ('get_db' in line or 'DatabaseManager' in line) and not line.strip().startswith('#'):
            print(f"  Γραμμή {i+1}: {line.strip()}")

    # Ψάξε αν υπάρχει κάτι που επαναφέρει το status
    print("\n--- Ψάχνω για πιθανή επαναφορά status ---")
    for i, line in enumerate(lines):
        if 'pending_review' in line and 'status' in line.lower():
            print(f"  Γραμμή {i+1}: {line.strip()}")

except Exception as e:
    print(f"  [ΣΦΑΛΜΑ] {e}")

# 6. TEST μέσω HTTP — αν τρέχει ο server
print("\n--- HTTP Test (αν τρέχει ο server) ---")
try:
    import urllib.request

    # Πάρε τη λίστα documents
    req = urllib.request.Request("http://127.0.0.1:5000/api/documents")
    resp = urllib.request.urlopen(req, timeout=5)
    data = json.loads(resp.read())

    if isinstance(data, list) and len(data) > 0:
        print(f"  GET /api/documents → {len(data)} documents")
        # Δείξε τα πρώτα 5
        for d in data[:5]:
            print(f"    #{d.get('id'):4d} | {d.get('status'):20s} | {d.get('filename','?')}")

        # Βρες ένα pending_review
        pr = [d for d in data if d.get('status') == 'pending_review']
        if pr:
            test_id = pr[0]['id']
            print(f"\n  HTTP TEST: POST /api/documents/{test_id}/approve")
            req2 = urllib.request.Request(
                f"http://127.0.0.1:5000/api/documents/{test_id}/approve",
                method="POST",
                data=b"",
                headers={"Content-Type": "application/json"}
            )
            resp2 = urllib.request.urlopen(req2, timeout=5)
            result = json.loads(resp2.read())
            print(f"  Approve response: {result}")

            # Τώρα ξαναδιάβασε
            req3 = urllib.request.Request("http://127.0.0.1:5000/api/documents")
            resp3 = urllib.request.urlopen(req3, timeout=5)
            data3 = json.loads(resp3.read())
            doc_after = [d for d in data3 if d.get('id') == test_id]
            if doc_after:
                print(f"  GET μετά approve: #{test_id} → status = '{doc_after[0].get('status')}'")
                if doc_after[0].get('status') == 'Completed':
                    print("  [OK] Το API δουλεύει σωστά!")
                else:
                    print("  [ΠΡΟΒΛΗΜΑ] Το status ΔΕΝ άλλαξε μέσω API!")

            # ΜΗΝ κάνεις rollback — άσε το Completed για να δει ο χρήστης
            print(f"\n  Doc #{test_id} είναι τώρα Completed — έλεγξε στο Dashboard!")
    else:
        print(f"  GET /api/documents → κενή λίστα ή error: {data}")

except Exception as e:
    print(f"  [!] Server δεν απαντά ή error: {e}")
    print("      (Αυτό είναι OK αν δεν τρέχει στο port 5000)")

# 7. Gunicorn config
print("\n--- Gunicorn / Service config ---")
try:
    import subprocess
    out = subprocess.check_output(
        ["systemctl", "cat", "fastwrite.service"],
        stderr=subprocess.STDOUT, text=True
    )
    print(out[:500])
except Exception as e:
    print(f"  [!] {e}")

print("\n" + "=" * 60)
print("  Τέλος διαγνωστικού")
print("=" * 60)
