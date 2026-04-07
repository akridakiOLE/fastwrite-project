#!/usr/bin/env python3
"""
FastWrite — Stripe Setup Helper
Δημιουργεί Products + Prices στο Stripe και ενημερώνει τα plans στη βάση.

Χρήση:
  1. pip install stripe --break-system-packages
  2. Βάλε το Stripe test key στο /app/projects/secrets/stripe_secret.key
  3. python3 stripe_setup.py

Αυτό το script:
  - Δημιουργεί 4 Products στο Stripe (Starter, Professional, Business, Enterprise)
  - Δημιουργεί 4 monthly Prices (EUR)
  - Ενημερώνει τα plans στη βάση με τα stripe_price_id
"""

import sys
from pathlib import Path

# ── Load Stripe key ──
SECRET_FILE = Path("/app/projects/secrets/stripe_secret.key")
if not SECRET_FILE.exists():
    print("ERROR: Stripe secret key not found at", SECRET_FILE)
    print("Steps:")
    print("  1. Go to https://dashboard.stripe.com/test/apikeys")
    print("  2. Copy the Secret key (starts with sk_test_)")
    print("  3. Save it:")
    print(f"     echo 'sk_test_YOUR_KEY' > {SECRET_FILE}")
    sys.exit(1)

try:
    import stripe
except ImportError:
    print("ERROR: stripe package not installed.")
    print("  pip install stripe --break-system-packages")
    sys.exit(1)

stripe.api_key = SECRET_FILE.read_text().strip()

# ── Check if we're in test mode ──
if not stripe.api_key.startswith("sk_test_"):
    print("WARNING: You are using a LIVE key! This script should only be run with test keys.")
    confirm = input("Type 'LIVE' to continue with live key: ")
    if confirm != "LIVE":
        print("Aborted.")
        sys.exit(1)

print(f"Using Stripe key: {stripe.api_key[:12]}...{stripe.api_key[-4:]}")
print()

# ── Plan definitions ──
PLANS = [
    {
        "db_name": "starter",
        "stripe_name": "FastWrite Starter",
        "description": "500 documents/month, batch upload, XLSX export, 10 templates",
        "price_cents": 1900,  # €19.00
    },
    {
        "db_name": "professional",
        "stripe_name": "FastWrite Professional",
        "description": "2,000 documents/month, unlimited templates, API access, priority",
        "price_cents": 4900,  # €49.00
    },
    {
        "db_name": "business",
        "stripe_name": "FastWrite Business",
        "description": "10,000 documents/month, all features, team management",
        "price_cents": 9900,  # €99.00
    },
    {
        "db_name": "enterprise",
        "stripe_name": "FastWrite Enterprise",
        "description": "Unlimited documents, custom SLA, dedicated support",
        "price_cents": 29900,  # €299.00 (placeholder)
    },
]


def create_stripe_products():
    """Create Stripe Products + Prices and return mapping."""
    results = {}

    for plan in PLANS:
        print(f"Creating product: {plan['stripe_name']}...")

        # Check if product already exists
        existing = stripe.Product.search(
            query=f"name:'{plan['stripe_name']}'"
        )
        if existing.data:
            product = existing.data[0]
            print(f"  Product already exists: {product.id}")
        else:
            product = stripe.Product.create(
                name=plan["stripe_name"],
                description=plan["description"],
                metadata={"fastwrite_plan": plan["db_name"]},
            )
            print(f"  Created product: {product.id}")

        # Check if price exists for this product
        existing_prices = stripe.Price.list(
            product=product.id,
            active=True,
            type="recurring",
        )
        if existing_prices.data:
            price = existing_prices.data[0]
            print(f"  Price already exists: {price.id} ({price.unit_amount} cents EUR/month)")
        else:
            price = stripe.Price.create(
                product=product.id,
                unit_amount=plan["price_cents"],
                currency="eur",
                recurring={"interval": "month"},
                metadata={"fastwrite_plan": plan["db_name"]},
            )
            print(f"  Created price: {price.id} ({plan['price_cents']} cents EUR/month)")

        results[plan["db_name"]] = {
            "product_id": product.id,
            "price_id": price.id,
        }
        print()

    return results


def update_database(results):
    """Update FastWrite database plans with Stripe price IDs."""
    try:
        sys.path.insert(0, str(Path(__file__).parent))
        from db_manager import DatabaseManager

        DB_PATH = Path("/app/projects/data/app.db")
        if not DB_PATH.exists():
            print(f"WARNING: Database not found at {DB_PATH}")
            print("Stripe IDs created but not saved to DB. Save manually:")
            for name, ids in results.items():
                print(f"  Plan '{name}': stripe_price_id = '{ids['price_id']}'")
            return

        db = DatabaseManager(db_path=str(DB_PATH))
        db.seed_default_plans()  # Ensure plans exist

        for plan_name, ids in results.items():
            plan = db.get_plan_by_name(plan_name)
            if plan:
                db.update_plan(plan["id"], stripe_price_id=ids["price_id"])
                print(f"  Updated plan '{plan_name}' with stripe_price_id: {ids['price_id']}")
            else:
                print(f"  WARNING: Plan '{plan_name}' not found in database!")

        db.close()
        print("\nDatabase updated successfully.")

    except Exception as e:
        print(f"WARNING: Could not update database: {e}")
        print("Stripe IDs created. Save manually:")
        for name, ids in results.items():
            print(f"  Plan '{name}': stripe_price_id = '{ids['price_id']}'")


def setup_webhook_endpoint():
    """Create or show webhook endpoint configuration."""
    print("=" * 60)
    print("WEBHOOK SETUP")
    print("=" * 60)
    print()
    print("Option A: Stripe Dashboard (Production)")
    print("  1. Go to: https://dashboard.stripe.com/test/webhooks")
    print("  2. Click 'Add endpoint'")
    print("  3. URL: https://fastwrite.duckdns.org/api/billing/webhook")
    print("  4. Select events:")
    print("     - checkout.session.completed")
    print("     - invoice.paid")
    print("     - invoice.payment_failed")
    print("     - customer.subscription.updated")
    print("     - customer.subscription.deleted")
    print("  5. Click 'Add endpoint'")
    print("  6. Copy the Signing secret (whsec_...)")
    print("  7. Save it:")
    print("     echo 'whsec_YOUR_SECRET' > /app/projects/secrets/stripe_webhook.key")
    print()
    print("Option B: Stripe CLI (Local Testing)")
    print("  1. Install: https://stripe.com/docs/stripe-cli")
    print("  2. Login:  stripe login")
    print("  3. Listen: stripe listen --forward-to localhost:8000/api/billing/webhook")
    print("  4. The CLI prints the webhook signing secret automatically")
    print("  5. Save it to /app/projects/secrets/stripe_webhook.key")
    print()


def print_summary(results):
    """Print final summary."""
    print("=" * 60)
    print("SETUP COMPLETE — SUMMARY")
    print("=" * 60)
    print()
    print("Stripe Products & Prices:")
    for name, ids in results.items():
        print(f"  {name:15s}  product={ids['product_id']}  price={ids['price_id']}")
    print()
    print("Files needed on server:")
    print("  /app/projects/secrets/stripe_secret.key   — Stripe API secret key")
    print("  /app/projects/secrets/stripe_webhook.key  — Webhook signing secret")
    print()
    print("IMPORTANT: Both files are in .gitignore (secrets/ folder).")
    print("NEVER push these to GitHub.")
    print()


if __name__ == "__main__":
    print("=" * 60)
    print("FastWrite — Stripe Setup")
    print("=" * 60)
    print()

    results = create_stripe_products()
    update_database(results)
    print()
    setup_webhook_endpoint()
    print_summary(results)
