#!/usr/bin/env python3
"""
FastWrite Server Fix — Apply directly on server.
Run: cd /app/projects/fastwrite-project && python3 apply_fix.py
"""
import re, sqlite3, subprocess, sys, os

BASE = os.path.dirname(os.path.abspath(__file__))

def patch_file(filepath, old, new, description):
    path = os.path.join(BASE, filepath)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    if old not in content:
        if new in content:
            print(f"  [SKIP] {description} — already applied")
            return True
        print(f"  [WARN] {description} — pattern not found!")
        return False
    content = content.replace(old, new)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f"  [OK]   {description}")
    return True

print("=" * 60)
print("FastWrite Fix — Approve Flow")
print("=" * 60)

# ── 1. Fix single-extract endpoint ──
print("\n1. Fix single-extract: status='Completed' → 'pending_review'")
patch_file('main_api.py',
    'db.update_document_status(doc_id, status="Completed", result_json=json.dumps(result.extracted_data))',
    'db.update_document_status(doc_id, status="pending_review", result_json=json.dumps(result.extracted_data))',
    "Single-extract → pending_review")

# ── 2. Fix batch_processor defaults ──
print("\n2. Fix batch_processor: require_review default False → True")
patch_file('batch_processor.py',
    'tmpl.get("require_review", False)',
    'tmpl.get("require_review", True)',
    "Template require_review default")
patch_file('batch_processor.py',
    'default_template.get("require_review", False)',
    'default_template.get("require_review", True)',
    "Default template require_review")

# ── 3. Fix doApprove JavaScript — remove credentials:include, add try/catch ──
print("\n3. Fix doApprove JavaScript in Review page")
# The old doApprove in the deployed code
old_approve = """async function doApprove() {
  if (dirty) {
    const r = await fetch('/api/documents/' + DOC_ID + '/data', {
      method:'PATCH', credentials:'include',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify(collectData())
    });
    if (!r.ok) { showToast('Σφάλμα αποθήκευσης', '#ff4444'); return; }
  }
  const r = await fetch('/api/documents/' + DOC_ID + '/approve', {method:'POST', credentials:'include'});
  const j = await r.json();
  if (j.success) { showToast('Εγκρίθηκε!', '#00e5a0'); setTimeout(function(){ %(after_action)s; }, 1200); }
  else showToast('Σφάλμα: ' + j.error, '#ff4444');
}"""

new_approve = """async function doApprove() {
  try {
    if (dirty) {
      const sr = await fetch('/api/documents/' + DOC_ID + '/data', {
        method:'PATCH', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(collectData())
      });
      if (!sr.ok) { showToast('Σφάλμα αποθήκευσης: ' + sr.status, '#ff4444'); return; }
    }
    const r = await fetch('/api/documents/' + DOC_ID + '/approve', {method:'POST'});
    if (!r.ok) { showToast('HTTP Error: ' + r.status, '#ff4444'); return; }
    const j = await r.json();
    if (j.success) {
      showToast('Εγκρίθηκε! (' + j.status + ')', '#00e5a0');
      setTimeout(function(){ %(after_action)s; }, 1200);
    } else {
      showToast('Σφάλμα: ' + (j.error || 'Unknown'), '#ff4444');
    }
  } catch(err) {
    showToast('JS Error: ' + err.message, '#ff4444');
  }
}"""

patch_file('main_api.py', old_approve, new_approve, "doApprove with try/catch")

# ── 4. Fix doReject JavaScript ──
print("\n4. Fix doReject JavaScript")
old_reject = """async function doReject() {
  if (!confirm('Απόρριψη εγγράφου;')) return;
  const r = await fetch('/api/documents/' + DOC_ID + '/reject', {method:'POST', credentials:'include'});
  const j = await r.json();
  if (j.success) { showToast('Απορρίφθηκε', '#ff4444'); setTimeout(function(){ %(after_action)s; }, 1200); }
  else showToast('Σφάλμα: ' + j.error, '#ff4444');
}"""

new_reject = """async function doReject() {
  if (!confirm('Απόρριψη εγγράφου;')) return;
  try {
    const r = await fetch('/api/documents/' + DOC_ID + '/reject', {method:'POST'});
    if (!r.ok) { showToast('HTTP Error: ' + r.status, '#ff4444'); return; }
    const j = await r.json();
    if (j.success) { showToast('Απορρίφθηκε', '#ff4444'); setTimeout(function(){ %(after_action)s; }, 1200); }
    else showToast('Σφάλμα: ' + (j.error || 'Unknown'), '#ff4444');
  } catch(err) {
    showToast('JS Error: ' + err.message, '#ff4444');
  }
}"""

patch_file('main_api.py', old_reject, new_reject, "doReject with try/catch")

# ── 5. Reset database: all Completed docs with data → pending_review ──
print("\n5. Reset database: Completed → pending_review")
db_path = os.path.join(BASE, 'fastwrite.db')
try:
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # Show current status distribution
    cur.execute("SELECT status, COUNT(*) FROM documents GROUP BY status")
    print("  Current status distribution:")
    for row in cur.fetchall():
        print(f"    {row[0]}: {row[1]}")

    # Reset Completed docs with result_json to pending_review
    n = cur.execute(
        "UPDATE documents SET status='pending_review' WHERE status='Completed' AND result_json IS NOT NULL"
    ).rowcount
    conn.commit()
    print(f"\n  [OK] Reset {n} documents: Completed → pending_review")

    # Show new distribution
    cur.execute("SELECT status, COUNT(*) FROM documents GROUP BY status")
    print("  New status distribution:")
    for row in cur.fetchall():
        print(f"    {row[0]}: {row[1]}")

    conn.close()
except Exception as e:
    print(f"  [ERROR] Database: {e}")

# ── 6. Quick curl test ──
print("\n6. Quick API test...")
# Find a pending_review doc
try:
    conn = sqlite3.connect(db_path)
    row = conn.execute("SELECT id, status FROM documents WHERE status='pending_review' LIMIT 1").fetchone()
    conn.close()
    if row:
        test_id = row[0]
        print(f"  Testing approve on doc #{test_id} (status: {row[1]})...")
        import urllib.request, json
        req = urllib.request.Request(
            f'http://127.0.0.1:5000/api/documents/{test_id}/approve',
            method='POST'
        )
        try:
            resp = urllib.request.urlopen(req)
            data = json.loads(resp.read())
            print(f"  API Response: {data}")

            # Check database after approve
            conn = sqlite3.connect(db_path)
            updated = conn.execute("SELECT status FROM documents WHERE id=?", (test_id,)).fetchone()
            conn.close()
            if updated:
                print(f"  Database status after approve: {updated[0]}")
                if updated[0] == "Completed":
                    print("  ✓ APPROVE WORKS! Status changed to Completed.")
                else:
                    print(f"  ✗ PROBLEM! Status is {updated[0]} instead of Completed.")

            # Reset it back for user testing
            conn = sqlite3.connect(db_path)
            conn.execute("UPDATE documents SET status='pending_review' WHERE id=?", (test_id,))
            conn.commit()
            conn.close()
            print(f"  (Reset doc #{test_id} back to pending_review for your testing)")
        except Exception as e:
            print(f"  API test error: {e}")
            print("  (Service might not be running yet — restart it manually)")
    else:
        print("  No pending_review documents found to test")
except Exception as e:
    print(f"  [ERROR] {e}")

print("\n" + "=" * 60)
print("DONE! Now restart the service:")
print("  sudo systemctl restart fastwrite")
print("  journalctl -u fastwrite -n 10 --no-pager")
print("=" * 60)
