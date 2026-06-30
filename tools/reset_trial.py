"""
reset_trial.py - Reset the local desktop trial counter (TEST helper).

Default (safe): clears ONLY the trial markers + license_usage counter, so the
"Trial X/Y" badge goes back to a fresh state. Documents & labels are kept.

--full (clean slate): ALSO clears `documents`, `templates` (labels) and
`usage_events`, simulating a FRESH install / brand-new tester. Use this to test
auto-label honestly: a new user with zero labels registers and the system
creates their labels from scratch. This does NOT add anything - it only clears.

Trial data lives in the desktop store %APPDATA%\\FastWrite (FASTWRITE_BASE_DIR),
NOT the project folder. Consumed is read from `license_usage` (key: ent.jti).

CLOSE the FastWrite app COMPLETELY first (incl. the backend process), else the
markers get recreated immediately.

Run:
  python tools/reset_trial.py            # trial only, asks confirmation
  python tools/reset_trial.py --full     # clean slate (docs + labels + usage)
  python tools/reset_trial.py --yes      # no confirmation prompt
  python tools/reset_trial.py --base-dir "D:\\some\\FastWrite"
"""
import argparse
import os
import sqlite3
import sys
from pathlib import Path


def _default_base_dir() -> Path:
    env = os.environ.get("FASTWRITE_BASE_DIR")
    if env:
        return Path(env)
    appdata = os.environ.get("APPDATA")           # Windows
    if appdata:
        return Path(appdata) / "FastWrite"
    return Path.home() / ".local" / "share" / "FastWrite"


def _count(con, table):
    try:
        return con.execute("SELECT COUNT(*) FROM %s" % table).fetchone()[0]
    except sqlite3.OperationalError:
        return "n/a"


def main() -> int:
    ap = argparse.ArgumentParser(description="Reset the local desktop trial counter (TEST helper).")
    ap.add_argument("--base-dir", help="Override the FastWrite store (default: %%APPDATA%%\\FastWrite).")
    ap.add_argument("--yes", action="store_true", help="Skip the confirmation prompt.")
    ap.add_argument("--full", action="store_true",
                    help="Clean slate: also clear documents + templates + usage_events.")
    args = ap.parse_args()

    base = Path(args.base_dir) if args.base_dir else _default_base_dir()
    secrets = base / "secrets"
    db_path = base / "data" / "app.db"
    markers = [secrets / ".trial_id", secrets / ".trial_started"]

    print("FastWrite store : %s" % base)
    print("  secrets       : %s" % secrets)
    print("  database      : %s" % db_path)
    if not base.exists():
        print("\n[!] Store folder does NOT exist. Correct path? (use --base-dir)")
        return 1

    con = sqlite3.connect(str(db_path)) if db_path.exists() else None

    # Preview
    print("\nWill do:")
    for m in markers:
        print("  - delete  %-16s %s" % (m.name, "(exists)" if m.exists() else "(missing - skip)"))
    if con is not None:
        print("  - clear   license_usage    (%s rows)" % _count(con, "license_usage"))
        if args.full:
            print("  --full also clears:")
            print("  - clear   documents        (%s rows)" % _count(con, "documents"))
            print("  - clear   templates/labels (%s rows)" % _count(con, "templates"))
            print("  - clear   usage_events     (%s rows)" % _count(con, "usage_events"))

    if not args.yes:
        print("\n*** Have you FULLY closed FastWrite (backend process too)? ***")
        if args.full:
            print("*** --full will DELETE all documents and labels in this store. ***")
        ans = input("Continue? [y/N] ").strip().lower()
        if ans not in ("y", "yes"):
            print("Cancelled.")
            return 1

    # 1+2: markers
    for m in markers:
        if m.exists():
            try:
                m.unlink()
                print("  deleted   %s" % m.name)
            except OSError as e:
                print("  [!] failed to delete %s: %s" % (m, e))
                return 1

    # 3: DB tables
    if con is not None:
        tables = ["license_usage"]
        if args.full:
            tables += ["documents", "templates", "usage_events"]
        for tbl in tables:
            try:
                cur = con.execute("DELETE FROM %s" % tbl)
                con.commit()
                print("  cleared   %-14s (%s rows deleted)" % (tbl, cur.rowcount))
            except sqlite3.OperationalError as e:
                print("  [i] %s skip (%s)" % (tbl, e))
        con.close()

    print("\nOK. Open FastWrite -> badge should read 'Trial 1/1 docs' (1 remaining).")
    if args.full:
        print("Clean slate: Labels page is empty. Register -> labels auto-created from scratch.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
