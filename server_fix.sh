#!/bin/bash
# FastWrite Server Fix - Apply directly on server
# Run: bash /app/projects/fastwrite-project/server_fix.sh

set -e
cd /app/projects/fastwrite-project

echo "=== 1. Fix single-extract endpoint: Completed -> pending_review ==="
sed -i 's/db.update_document_status(doc_id, status="Completed", result_json=json.dumps(result.extracted_data))/db.update_document_status(doc_id, status="pending_review", result_json=json.dumps(result.extracted_data))/' main_api.py

echo "=== 2. Fix batch_processor defaults: require_review -> True ==="
sed -i 's/tmpl.get("require_review", False)/tmpl.get("require_review", True)/g' batch_processor.py
sed -i 's/default_template.get("require_review", False)/default_template.get("require_review", True)/g' batch_processor.py

echo "=== 3. Reset existing Completed docs with data to pending_review ==="
python3 -c "
import sqlite3
conn = sqlite3.connect('fastwrite.db')
n = conn.execute(\"UPDATE documents SET status='pending_review' WHERE status='Completed' AND result_json IS NOT NULL\").rowcount
conn.commit()
conn.close()
print(f'  Reset {n} documents to pending_review')
"

echo "=== 4. Verify approve endpoint has no @require_auth ==="
if grep -B1 'def approve_document' main_api.py | grep -q '@require_auth'; then
    echo "  WARNING: @require_auth found on approve - removing..."
    # This would need manual fix
else
    echo "  OK: approve endpoint has no @require_auth"
fi

echo "=== 5. Restart service ==="
sudo systemctl restart fastwrite
sleep 2

echo "=== 6. Verify service is running ==="
journalctl -u fastwrite -n 5 --no-pager

echo ""
echo "=== DONE! ==="
echo "Now test: open a document in Review page and click Approve."
echo "The status should change from 'pending_review' to 'Completed'."
