"""
Module 12: Billing & Subscription Manager
Stripe integration for checkout, webhooks, subscription lifecycle.
Pure Python — NO embedded HTML.
"""

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# ── Stripe secret key: same pattern as jwt_secret.key ──
_STRIPE_SECRET_FILE = Path("/app/projects/secrets/stripe_secret.key")
_STRIPE_WEBHOOK_FILE = Path("/app/projects/secrets/stripe_webhook.key")


def _load_key(filepath: Path) -> Optional[str]:
    """Load a secret key from file. Returns None if not found."""
    try:
        if filepath.exists():
            key = filepath.read_text().strip()
            if key:
                return key
    except Exception:
        pass
    return None


# Lazy-loaded: only import stripe when actually needed
_stripe = None
_stripe_webhook_secret = None


def _get_stripe():
    """Lazy-load and configure stripe module."""
    global _stripe
    if _stripe is not None:
        return _stripe
    try:
        import stripe
        secret = _load_key(_STRIPE_SECRET_FILE)
        if not secret:
            logger.warning("Stripe secret key not found at %s", _STRIPE_SECRET_FILE)
            return None
        stripe.api_key = secret
        _stripe = stripe
        return stripe
    except ImportError:
        logger.error("stripe package not installed. Run: pip install stripe")
        return None


def _get_webhook_secret() -> Optional[str]:
    """Load Stripe webhook signing secret."""
    global _stripe_webhook_secret
    if _stripe_webhook_secret is not None:
        return _stripe_webhook_secret
    _stripe_webhook_secret = _load_key(_STRIPE_WEBHOOK_FILE)
    return _stripe_webhook_secret


def is_stripe_configured() -> bool:
    """Check if Stripe is properly configured."""
    return _load_key(_STRIPE_SECRET_FILE) is not None


# ── Checkout Session ──────────────────────────────────────────────────────────

def create_checkout_session(db, user_id: int, plan_id: int,
                            success_url: str,
                            cancel_url: str) -> Optional[Dict[str, Any]]:
    """Create a Stripe Checkout Session for upgrading to a paid plan.
    Returns: {checkout_url: str, session_id: str} or None on error."""
    stripe = _get_stripe()
    if not stripe:
        return None

    plan = db.get_plan(plan_id)
    if not plan or not plan.get('stripe_price_id'):
        logger.error("Plan %s has no stripe_price_id", plan_id)
        return None

    user = db.get_user_by_id(user_id)
    if not user:
        return None

    # Check if user already has a Stripe customer ID
    sub = db.get_active_subscription(user_id)
    customer_id = sub.get('stripe_customer_id') if sub else None

    try:
        params = {
            'mode': 'subscription',
            'line_items': [{'price': plan['stripe_price_id'], 'quantity': 1}],
            'success_url': success_url,
            'cancel_url': cancel_url,
            'metadata': {'user_id': str(user_id), 'plan_id': str(plan_id)},
        }
        # If existing customer, reuse; otherwise let Stripe create one
        if customer_id:
            params['customer'] = customer_id
        else:
            params['customer_email'] = user.get('email', '')

        session = stripe.checkout.Session.create(**params)
        return {
            'checkout_url': session.url,
            'session_id': session.id,
        }
    except Exception as e:
        logger.error("Stripe checkout error: %s", str(e))
        return None


# ── Customer Portal ───────────────────────────────────────────────────────────

def create_portal_session(stripe_customer_id: str,
                          return_url: str) -> Optional[str]:
    """Create a Stripe Customer Portal session. Returns portal URL or None."""
    stripe = _get_stripe()
    if not stripe or not stripe_customer_id:
        return None
    try:
        session = stripe.billing_portal.Session.create(
            customer=stripe_customer_id,
            return_url=return_url,
        )
        return session.url
    except Exception as e:
        logger.error("Stripe portal error: %s", str(e))
        return None


# ── Webhook Handler ───────────────────────────────────────────────────────────

def verify_webhook(payload: bytes, sig_header: str) -> Optional[Dict]:
    """Verify and parse a Stripe webhook event.
    Returns the event dict or None if verification fails."""
    stripe = _get_stripe()
    secret = _get_webhook_secret()
    if not stripe or not secret:
        return None
    try:
        event = stripe.Webhook.construct_event(payload, sig_header, secret)
        return event
    except (stripe.error.SignatureVerificationError, ValueError) as e:
        logger.error("Webhook verification failed: %s", str(e))
        return None


def handle_webhook_event(db, event: Dict) -> bool:
    """Process a verified Stripe webhook event. Returns True on success."""
    event_type = event.get('type', '')
    data = event.get('data', {}).get('object', {})

    logger.info("Processing webhook: %s", event_type)

    if event_type == 'checkout.session.completed':
        return _handle_checkout_completed(db, data)
    elif event_type == 'invoice.paid':
        return _handle_invoice_paid(db, data)
    elif event_type == 'invoice.payment_failed':
        return _handle_invoice_failed(db, data)
    elif event_type == 'customer.subscription.updated':
        return _handle_subscription_updated(db, data)
    elif event_type == 'customer.subscription.deleted':
        return _handle_subscription_deleted(db, data)
    else:
        logger.info("Unhandled webhook event: %s", event_type)
        return True  # Not an error, just not relevant


def _handle_checkout_completed(db, session: Dict) -> bool:
    """Handle checkout.session.completed: activate subscription."""
    try:
        metadata = session.get('metadata', {})
        user_id = int(metadata.get('user_id', 0))
        plan_id = int(metadata.get('plan_id', 0))
        stripe_sub_id = session.get('subscription')
        stripe_cust_id = session.get('customer')

        if not user_id or not plan_id:
            logger.error("Checkout missing user_id/plan_id in metadata")
            return False

        # Fetch subscription details from Stripe for period dates
        stripe = _get_stripe()
        stripe_sub = stripe.Subscription.retrieve(stripe_sub_id)
        period_start = datetime.utcfromtimestamp(
            stripe_sub['current_period_start']
        ).isoformat()
        period_end = datetime.utcfromtimestamp(
            stripe_sub['current_period_end']
        ).isoformat()

        # Deactivate old subscription
        old_sub = db.get_active_subscription(user_id)
        if old_sub:
            db.update_subscription(old_sub['id'], status='canceled')

        # Create new active subscription
        db.create_subscription(
            user_id=user_id,
            plan_id=plan_id,
            period_start=period_start,
            period_end=period_end,
            status='active',
            stripe_subscription_id=stripe_sub_id,
            stripe_customer_id=stripe_cust_id,
        )

        # Create fresh usage summary for new period
        db.reset_usage_for_period(user_id, period_start, period_end)

        logger.info("Subscription activated: user=%s plan=%s", user_id, plan_id)
        return True
    except Exception as e:
        logger.error("Error handling checkout: %s", str(e))
        return False


def _handle_invoice_paid(db, invoice: Dict) -> bool:
    """Handle invoice.paid: record payment, reset usage for new period."""
    try:
        stripe_sub_id = invoice.get('subscription')
        if not stripe_sub_id:
            return True  # One-time invoice, not subscription

        sub = db.get_subscription_by_stripe_id(stripe_sub_id)
        if not sub:
            logger.warning("No subscription found for stripe_sub=%s", stripe_sub_id)
            return True

        user_id = sub['user_id']

        # Record billing history
        db.insert_billing_record(
            user_id=user_id,
            amount_cents=invoice.get('amount_paid', 0),
            status='paid',
            stripe_invoice_id=invoice.get('id'),
            period_start=datetime.utcfromtimestamp(
                invoice.get('period_start', 0)
            ).isoformat() if invoice.get('period_start') else None,
            period_end=datetime.utcfromtimestamp(
                invoice.get('period_end', 0)
            ).isoformat() if invoice.get('period_end') else None,
            invoice_url=invoice.get('hosted_invoice_url'),
        )

        # Update subscription period dates and reset usage
        stripe = _get_stripe()
        stripe_sub = stripe.Subscription.retrieve(stripe_sub_id)
        new_start = datetime.utcfromtimestamp(
            stripe_sub['current_period_start']
        ).isoformat()
        new_end = datetime.utcfromtimestamp(
            stripe_sub['current_period_end']
        ).isoformat()

        db.update_subscription(
            sub['id'],
            current_period_start=new_start,
            current_period_end=new_end,
            status='active',
        )
        db.reset_usage_for_period(user_id, new_start, new_end)

        logger.info("Invoice paid: user=%s amount=%s", user_id, invoice.get('amount_paid'))
        return True
    except Exception as e:
        logger.error("Error handling invoice.paid: %s", str(e))
        return False


def _handle_invoice_failed(db, invoice: Dict) -> bool:
    """Handle invoice.payment_failed: mark subscription as past_due."""
    try:
        stripe_sub_id = invoice.get('subscription')
        if not stripe_sub_id:
            return True

        sub = db.get_subscription_by_stripe_id(stripe_sub_id)
        if sub:
            db.update_subscription(sub['id'], status='past_due')
            logger.warning("Payment failed: user=%s sub=%s",
                           sub['user_id'], stripe_sub_id)
        return True
    except Exception as e:
        logger.error("Error handling invoice.payment_failed: %s", str(e))
        return False


def _handle_subscription_updated(db, stripe_sub: Dict) -> bool:
    """Handle customer.subscription.updated: sync status and dates."""
    try:
        stripe_sub_id = stripe_sub.get('id')
        sub = db.get_subscription_by_stripe_id(stripe_sub_id)
        if not sub:
            return True

        updates = {
            'status': stripe_sub.get('status', 'active'),
            'cancel_at_period_end': 1 if stripe_sub.get('cancel_at_period_end') else 0,
            'current_period_start': datetime.utcfromtimestamp(
                stripe_sub['current_period_start']
            ).isoformat(),
            'current_period_end': datetime.utcfromtimestamp(
                stripe_sub['current_period_end']
            ).isoformat(),
        }

        # Check if plan changed
        items = stripe_sub.get('items', {}).get('data', [])
        if items:
            new_price_id = items[0].get('price', {}).get('id')
            if new_price_id:
                # Find matching plan
                plans = db.list_plans(active_only=False)
                for p in plans:
                    if p.get('stripe_price_id') == new_price_id:
                        updates['plan_id'] = p['id']
                        break

        db.update_subscription(sub['id'], **updates)
        logger.info("Subscription updated: sub=%s status=%s",
                     stripe_sub_id, updates['status'])
        return True
    except Exception as e:
        logger.error("Error handling subscription.updated: %s", str(e))
        return False


def _handle_subscription_deleted(db, stripe_sub: Dict) -> bool:
    """Handle customer.subscription.deleted: downgrade to free plan."""
    try:
        stripe_sub_id = stripe_sub.get('id')
        sub = db.get_subscription_by_stripe_id(stripe_sub_id)
        if not sub:
            return True

        user_id = sub['user_id']

        # Mark old subscription as canceled
        db.update_subscription(sub['id'], status='canceled')

        # Auto-assign free plan
        db.assign_free_plan(user_id)

        logger.info("Subscription deleted, downgraded to free: user=%s", user_id)
        return True
    except Exception as e:
        logger.error("Error handling subscription.deleted: %s", str(e))
        return False


# ── Helper: Check feature access ─────────────────────────────────────────────

def check_feature(db, user_id: int, feature_name: str) -> bool:
    """Check if a user's current plan includes a specific feature.
    feature_name: batch_upload, export_xlsx, api_access, etc."""
    sub = db.get_active_subscription(user_id)
    if not sub:
        return False
    features_str = sub.get('features_json', '{}')
    try:
        features = json.loads(features_str) if features_str else {}
    except (json.JSONDecodeError, TypeError):
        features = {}
    return bool(features.get(feature_name, False))


def get_template_limit(db, user_id: int) -> int:
    """Get the template limit for user's current plan.
    Returns: -1 for unlimited, or the numeric limit."""
    sub = db.get_active_subscription(user_id)
    if not sub:
        return 1  # Free default
    features_str = sub.get('features_json', '{}')
    try:
        features = json.loads(features_str) if features_str else {}
    except (json.JSONDecodeError, TypeError):
        features = {}
    return features.get('template_limit', 1)
