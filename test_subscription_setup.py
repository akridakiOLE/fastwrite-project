#!/usr/bin/env python3
"""
Test helper για subscription enforcement.
Τρέχει στον server: python3 test_subscription_setup.py --user testuser [options]

Τι κάνει:
  1. Δημιουργεί/επιβεβαιώνει ένα test template "invoice" για τον χρήστη
     (απαραίτητο για να δουλέψει το batch extraction).
  2. Μπορεί να "σπρώξει" το pages_used κοντά στο όριο για γρήγορο enforcement test
     (χωρίς να χρειάζεται να επεξεργαστείς 500 σελίδες στα αλήθεια).
  3. Μπορεί να κάνει reset το usage για να ξαναδοκιμάσεις.

Παραδείγματα χρήσης:
  # Δημιουργία template + set pages_used ώστε να απομένουν 10 σελίδες
  python3 test_subscription_setup.py --user testuser --leave-pages 10

  # Μόνο δημιουργία template (χωρίς άγγιγμα του usage)
  python3 test_subscription_setup.py --user testuser --template-only

  # Reset usage στο 0 (για νέα δοκιμή)
  python3 test_subscription_setup.py --user testuser --reset

  # Full status χωρίς αλλαγές
  python3 test_subscription_setup.py --user testuser --status
"""
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from db_manager import DatabaseManager


DEFAULT_DB = "/app/projects/data/app.db"

# Minimal invoice template — τα πεδία ταιριάζουν στα fake δεδομένα του Faker.
TEST_INVOICE_FIELDS = [
    {"name": "invoice_number",  "type": "string"},
    {"name": "invoice_date",    "type": "string"},
    {"name": "supplier_name",   "type": "string"},
    {"name": "supplier_vat",    "type": "string"},
    {"name": "customer_name",   "type": "string"},
    {"name": "total_amount",    "type": "number"},
    {"name": "vat_amount",      "type": "number"},
    {"name": "currency",        "type": "string"},
]


def get_user(db: DatabaseManager, username: str):
    row = db.conn.execute(
        "SELECT * FROM users WHERE username = ? AND is_active = 1",
        (username,)
    ).fetchone()
    return dict(row) if row else None


def print_status(db: DatabaseManager, user: dict):
    sub = db.get_active_subscription(user["id"])
    if not sub:
        print(f"  [WARN] Ο χρήστης '{user['username']}' ΔΕΝ έχει active subscription.")
        return
    summary = db.get_usage_summary(user["id"])
    print(f"  user_id      : {user['id']}")
    print(f"  username     : {user['username']}")
    print(f"  plan         : {sub.get('plan_display_name') or sub.get('plan_name')}")
    print(f"  doc_limit    : {sub.get('doc_limit')}")
    print(f"  page_limit   : {sub.get('page_limit')}")
    if summary:
        print(f"  docs_used    : {summary.get('docs_used', 0)}")
        print(f"  pages_used   : {summary.get('pages_used', 0)}")
        docs_rem = (sub.get('doc_limit') or 0) - summary.get('docs_used', 0)
        pages_rem = (sub.get('page_limit') or 0) - summary.get('pages_used', 0)
        print(f"  docs_remain  : {docs_rem}")
        print(f"  pages_remain : {pages_rem}")
    # Templates
    tmpls = db.list_templates(user_id=user["id"])
    print(f"  templates    : {len(tmpls)} ({', '.join(t['name'] for t in tmpls) or '—'})")


def ensure_test_template(db: DatabaseManager, user_id: int,
                          name: str = "invoice") -> int:
    existing = db.get_template(name, user_id=user_id)
    if existing:
        print(f"  [OK] Template '{name}' υπάρχει ήδη (id={existing.get('id')}).")
        return existing.get("id")
    tid = db.save_template(
        name=name,
        fields=TEST_INVOICE_FIELDS,
        require_review=False,
        supplier_pattern=None,
        user_id=user_id,
    )
    print(f"  [OK] Template '{name}' δημιουργήθηκε (id={tid}) με "
          f"{len(TEST_INVOICE_FIELDS)} πεδία.")
    return tid


def force_usage(db: DatabaseManager, user_id: int,
                pages_used: int, docs_used: int = 0):
    sub = db.get_active_subscription(user_id)
    if not sub:
        print("  [ERROR] Δεν υπάρχει active subscription.")
        return
    p_start = sub["current_period_start"]
    p_end = sub["current_period_end"]
    now = datetime.utcnow().isoformat()
    # INSERT ή UPDATE στο usage_summary
    db.conn.execute(
        """INSERT INTO usage_summary
           (user_id, period_start, period_end, docs_used, pages_used, updated_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(user_id, period_start) DO UPDATE SET
           docs_used = ?, pages_used = ?, updated_at = ?""",
        (user_id, p_start, p_end, docs_used, pages_used, now,
         docs_used, pages_used, now)
    )
    db.conn.commit()
    print(f"  [OK] usage_summary: docs_used={docs_used}, pages_used={pages_used}")


def reset_usage(db: DatabaseManager, user_id: int):
    force_usage(db, user_id, pages_used=0, docs_used=0)
    print("  [OK] Usage reset στο 0.")


def main():
    parser = argparse.ArgumentParser(
        description="FastWrite subscription enforcement test helper"
    )
    parser.add_argument("--user", required=True, help="username του test user")
    parser.add_argument("--db", default=DEFAULT_DB, help="path στη βάση")
    parser.add_argument("--template-only", action="store_true",
                        help="Δημιούργησε μόνο το test template")
    parser.add_argument("--status", action="store_true",
                        help="Εμφάνισε μόνο κατάσταση (χωρίς αλλαγές)")
    parser.add_argument("--reset", action="store_true",
                        help="Reset usage στο 0")
    parser.add_argument("--leave-pages", type=int, default=None,
                        help="Ρύθμισε pages_used ώστε να απομένουν N σελίδες "
                             "πριν ξεπεραστεί το όριο")
    parser.add_argument("--leave-docs", type=int, default=None,
                        help="Ρύθμισε docs_used ώστε να απομένουν N documents")
    args = parser.parse_args()

    db = DatabaseManager(db_path=args.db)
    user = get_user(db, args.user)
    if not user:
        print(f"[ERROR] Δεν βρέθηκε χρήστης '{args.user}'.")
        sys.exit(1)

    print(f"\n=== Κατάσταση ΠΡΙΝ ===")
    print_status(db, user)

    if args.status:
        return

    # 1. Templates (πάντα εκτός αν --status)
    print(f"\n=== Templates ===")
    ensure_test_template(db, user["id"])

    if args.template_only:
        print(f"\n=== Κατάσταση ΜΕΤΑ ===")
        print_status(db, user)
        return

    # 2. Reset ή force usage
    sub = db.get_active_subscription(user["id"])
    if not sub:
        print("[ERROR] No active subscription — cannot modify usage.")
        sys.exit(1)

    if args.reset:
        print(f"\n=== Reset Usage ===")
        reset_usage(db, user["id"])
    elif args.leave_pages is not None or args.leave_docs is not None:
        print(f"\n=== Force Usage ===")
        page_limit = sub.get("page_limit") or 0
        doc_limit = sub.get("doc_limit") or 0
        pages_used = max(0, page_limit - args.leave_pages) if args.leave_pages is not None else 0
        docs_used = max(0, doc_limit - args.leave_docs) if args.leave_docs is not None else 0
        force_usage(db, user["id"], pages_used=pages_used, docs_used=docs_used)

    print(f"\n=== Κατάσταση ΜΕΤΑ ===")
    print_status(db, user)
    print()


if __name__ == "__main__":
    main()
