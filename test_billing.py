#!/usr/bin/env python3
"""
FastWrite — Billing System Tests
Tests για licensing, telemetry, plans, subscriptions, usage limits.
Δεν χρειάζεται Stripe (τεστάρει μόνο τη λογική).

Τρέξιμο: python3 test_billing.py
"""

import json
import sys
from datetime import datetime, timedelta


def test_plan_seeding():
    """Test 1: Default plans are seeded correctly."""
    from db_manager import DatabaseManager
    db = DatabaseManager(":memory:")
    db.seed_default_plans()

    plans = db.list_plans()
    assert len(plans) == 5, f"Expected 5 plans, got {len(plans)}"

    names = [p['name'] for p in plans]
    assert names == ['free', 'starter', 'professional', 'business', 'enterprise'], \
        f"Wrong plan order: {names}"

    # Verify free plan
    free = db.get_plan_by_name('free')
    assert free['price_cents'] == 0
    assert free['doc_limit'] == 50
    assert free['page_limit'] == 500

    # Verify starter
    starter = db.get_plan_by_name('starter')
    assert starter['price_cents'] == 1900
    assert starter['doc_limit'] == 500

    # Verify enterprise (unlimited)
    enterprise = db.get_plan_by_name('enterprise')
    assert enterprise['doc_limit'] == -1
    assert enterprise['page_limit'] == -1

    # Idempotency
    db.seed_default_plans()
    assert len(db.list_plans()) == 5, "Seeding should be idempotent"

    db.close()
    print("  PASS: test_plan_seeding")


def test_plan_crud():
    """Test 2: Plan CRUD operations."""
    from db_manager import DatabaseManager
    db = DatabaseManager(":memory:")

    pid = db.create_plan("test_plan", "Test Plan", price_cents=999,
                         doc_limit=100, page_limit=1000,
                         features_json='{"batch_upload": true}',
                         sort_order=99)
    assert pid > 0

    plan = db.get_plan(pid)
    assert plan['name'] == 'test_plan'
    assert plan['price_cents'] == 999

    # Update
    db.update_plan(pid, price_cents=1499, doc_limit=200)
    plan = db.get_plan(pid)
    assert plan['price_cents'] == 1499
    assert plan['doc_limit'] == 200

    # List active only
    db.update_plan(pid, is_active=0)
    active = db.list_plans(active_only=True)
    assert all(p['id'] != pid for p in active), "Inactive plan should not appear"

    all_plans = db.list_plans(active_only=False)
    assert any(p['id'] == pid for p in all_plans), "Inactive plan should appear in full list"

    db.close()
    print("  PASS: test_plan_crud")


def test_subscription_lifecycle():
    """Test 3: Full subscription lifecycle."""
    from db_manager import DatabaseManager
    db = DatabaseManager(":memory:")
    db.seed_default_plans()

    uid = db.create_user("testuser", "hash", "user")

    # Assign free plan
    sub_id = db.assign_free_plan(uid)
    assert sub_id > 0

    sub = db.get_active_subscription(uid)
    assert sub is not None
    assert sub['plan_name'] == 'free'
    assert sub['status'] == 'active'

    # Upgrade to starter
    starter = db.get_plan_by_name('starter')
    db.update_subscription(sub_id, status='canceled')
    now = datetime.utcnow()
    new_sub_id = db.create_subscription(
        uid, starter['id'],
        now.isoformat(), (now + timedelta(days=30)).isoformat(),
        'active', stripe_subscription_id='sub_test_123',
        stripe_customer_id='cus_test_456',
    )

    new_sub = db.get_active_subscription(uid)
    assert new_sub['plan_name'] == 'starter'
    assert new_sub['status'] == 'active'

    # Find by Stripe ID
    found = db.get_subscription_by_stripe_id('sub_test_123')
    assert found is not None
    assert found['id'] == new_sub_id

    # Cancel at period end
    db.update_subscription(new_sub_id, cancel_at_period_end=1)
    updated = db.get_active_subscription(uid)
    assert updated['cancel_at_period_end'] == 1

    # Full cancel → downgrade to free
    db.update_subscription(new_sub_id, status='canceled')
    db.assign_free_plan(uid)
    final_sub = db.get_active_subscription(uid)
    assert final_sub['plan_name'] == 'free'

    db.close()
    print("  PASS: test_subscription_lifecycle")


def test_usage_tracking():
    """Test 4: Usage event recording and summary."""
    from db_manager import DatabaseManager
    db = DatabaseManager(":memory:")
    db.seed_default_plans()

    uid = db.create_user("testuser", "hash", "user")
    db.assign_free_plan(uid)

    # Record some usage
    db.record_usage_event(uid, 'doc_processed', 1)
    db.record_usage_event(uid, 'doc_processed', 1)
    db.record_usage_event(uid, 'doc_processed', 1)
    db.record_usage_event(uid, 'page_processed', 10)
    db.record_usage_event(uid, 'page_processed', 5)

    summary = db.get_usage_summary(uid)
    assert summary['docs_used'] == 3, f"Expected 3 docs, got {summary['docs_used']}"
    assert summary['pages_used'] == 15, f"Expected 15 pages, got {summary['pages_used']}"
    assert summary['doc_limit'] == 50
    assert summary['page_limit'] == 500

    db.close()
    print("  PASS: test_usage_tracking")


def test_limit_enforcement():
    """Test 5: Usage limit enforcement."""
    from db_manager import DatabaseManager
    db = DatabaseManager(":memory:")
    db.seed_default_plans()

    uid = db.create_user("testuser", "hash", "user")
    db.assign_free_plan(uid)

    # Record 49 docs
    for _ in range(49):
        db.record_usage_event(uid, 'doc_processed', 1)

    # 49 + 1 = 50 → allowed (at limit)
    check = db.check_usage_limit(uid, 'doc_processed', 1)
    assert check['allowed'] == True, f"Should be allowed at limit: {check}"

    # 49 + 2 = 51 → denied
    check = db.check_usage_limit(uid, 'doc_processed', 2)
    assert check['allowed'] == False, f"Should be denied over limit: {check}"
    assert 'limit reached' in check['message'].lower()

    # Page limits
    for _ in range(490):
        db.record_usage_event(uid, 'page_processed', 1)

    check = db.check_usage_limit(uid, 'page_processed', 10)
    assert check['allowed'] == True  # 490 + 10 = 500, at limit

    check = db.check_usage_limit(uid, 'page_processed', 11)
    assert check['allowed'] == False  # 490 + 11 = 501, over

    db.close()
    print("  PASS: test_limit_enforcement")


def test_unlimited_plan():
    """Test 6: Enterprise (unlimited) plan has no limits."""
    from db_manager import DatabaseManager
    db = DatabaseManager(":memory:")
    db.seed_default_plans()

    uid = db.create_user("enterprise_user", "hash", "user")
    enterprise = db.get_plan_by_name('enterprise')
    now = datetime.utcnow()
    db.create_subscription(uid, enterprise['id'],
                           now.isoformat(), (now + timedelta(days=30)).isoformat(),
                           'active')

    # Record massive usage
    db.record_usage_event(uid, 'doc_processed', 100000)
    db.record_usage_event(uid, 'page_processed', 1000000)

    # Should always be allowed
    check = db.check_usage_limit(uid, 'doc_processed', 999999)
    assert check['allowed'] == True, "Unlimited plan should always allow"

    check = db.check_usage_limit(uid, 'page_processed', 999999)
    assert check['allowed'] == True, "Unlimited plan should always allow"

    db.close()
    print("  PASS: test_unlimited_plan")


def test_usage_reset():
    """Test 7: Usage resets for new billing period."""
    from db_manager import DatabaseManager
    db = DatabaseManager(":memory:")
    db.seed_default_plans()

    uid = db.create_user("testuser", "hash", "user")
    db.assign_free_plan(uid)

    # Use some docs
    for _ in range(30):
        db.record_usage_event(uid, 'doc_processed', 1)

    summary = db.get_usage_summary(uid)
    assert summary['docs_used'] == 30

    # Simulate new period (like invoice.paid webhook)
    new_start = (datetime.utcnow() + timedelta(days=30)).isoformat()
    new_end = (datetime.utcnow() + timedelta(days=60)).isoformat()

    sub = db.get_active_subscription(uid)
    db.update_subscription(sub['id'],
                           current_period_start=new_start,
                           current_period_end=new_end)
    db.reset_usage_for_period(uid, new_start, new_end)

    # Now summary should be 0
    summary = db.get_usage_summary(uid)
    assert summary['docs_used'] == 0, f"Expected 0 after reset, got {summary['docs_used']}"

    # Old period should still have data
    history = db.get_usage_history(uid)
    assert len(history) >= 2, "Should have 2 periods"

    db.close()
    print("  PASS: test_usage_reset")


def test_feature_access():
    """Test 8: Feature flag checking per plan."""
    from db_manager import DatabaseManager
    from billing_manager import check_feature, get_template_limit
    db = DatabaseManager(":memory:")
    db.seed_default_plans()

    # Free user
    uid_free = db.create_user("free_user", "hash", "user")
    db.assign_free_plan(uid_free)

    assert check_feature(db, uid_free, 'batch_upload') == False
    assert check_feature(db, uid_free, 'export_csv') == True
    assert check_feature(db, uid_free, 'export_xlsx') == False
    assert check_feature(db, uid_free, 'api_access') == False
    assert check_feature(db, uid_free, 'approval_workflow') == False
    assert get_template_limit(db, uid_free) == 1

    # Professional user
    uid_pro = db.create_user("pro_user", "hash", "user")
    pro = db.get_plan_by_name('professional')
    now = datetime.utcnow()
    db.create_subscription(uid_pro, pro['id'],
                           now.isoformat(), (now + timedelta(days=30)).isoformat(),
                           'active')

    assert check_feature(db, uid_pro, 'batch_upload') == True
    assert check_feature(db, uid_pro, 'export_xlsx') == True
    assert check_feature(db, uid_pro, 'api_access') == True
    assert check_feature(db, uid_pro, 'priority_processing') == True
    assert get_template_limit(db, uid_pro) == -1  # Unlimited

    db.close()
    print("  PASS: test_feature_access")


def test_billing_history():
    """Test 9: Billing history recording."""
    from db_manager import DatabaseManager
    db = DatabaseManager(":memory:")

    uid = db.create_user("testuser", "hash", "user")

    # Insert records
    db.insert_billing_record(uid, 1900, 'paid', stripe_invoice_id='inv_001',
                             invoice_url='https://invoice.stripe.com/inv_001')
    db.insert_billing_record(uid, 4900, 'paid', stripe_invoice_id='inv_002')
    db.insert_billing_record(uid, 4900, 'open', stripe_invoice_id='inv_003')

    history = db.list_billing_history(uid)
    assert len(history) == 3

    # Update by Stripe ID
    db.update_billing_record_by_stripe_id('inv_003', status='paid')
    history = db.list_billing_history(uid)
    paid = [h for h in history if h['status'] == 'paid']
    assert len(paid) == 3, "All should be paid now"

    db.close()
    print("  PASS: test_billing_history")


def test_no_subscription_behavior():
    """Test 10: Graceful handling when user has no subscription."""
    from db_manager import DatabaseManager
    from billing_manager import check_feature, get_template_limit
    db = DatabaseManager(":memory:")

    uid = db.create_user("orphan", "hash", "user")
    # No subscription assigned

    sub = db.get_active_subscription(uid)
    assert sub is None

    summary = db.get_usage_summary(uid)
    assert summary is None

    check = db.check_usage_limit(uid, 'doc_processed', 1)
    assert check['allowed'] == False
    assert 'No active subscription' in check['message']

    assert check_feature(db, uid, 'batch_upload') == False
    assert get_template_limit(db, uid) == 1

    db.close()
    print("  PASS: test_no_subscription_behavior")


def test_multi_user_isolation():
    """Test 11: Usage isolation between users."""
    from db_manager import DatabaseManager
    db = DatabaseManager(":memory:")
    db.seed_default_plans()

    uid1 = db.create_user("user1", "hash", "user")
    uid2 = db.create_user("user2", "hash", "user")
    db.assign_free_plan(uid1)
    db.assign_free_plan(uid2)

    # User1 uses 40 docs
    for _ in range(40):
        db.record_usage_event(uid1, 'doc_processed', 1)

    # User2 uses 10 docs
    for _ in range(10):
        db.record_usage_event(uid2, 'doc_processed', 1)

    s1 = db.get_usage_summary(uid1)
    s2 = db.get_usage_summary(uid2)

    assert s1['docs_used'] == 40, f"User1 should have 40, got {s1['docs_used']}"
    assert s2['docs_used'] == 10, f"User2 should have 10, got {s2['docs_used']}"

    # User1 check limit: 40+11=51 > 50
    check = db.check_usage_limit(uid1, 'doc_processed', 11)
    assert check['allowed'] == False

    # User2 check limit: 10+11=21 < 50
    check = db.check_usage_limit(uid2, 'doc_processed', 11)
    assert check['allowed'] == True

    db.close()
    print("  PASS: test_multi_user_isolation")


def test_stripe_not_required():
    """Test 12: System works without Stripe package installed."""
    from billing_manager import is_stripe_configured
    # In test environment, Stripe key file doesn't exist
    assert is_stripe_configured() == False
    print("  PASS: test_stripe_not_required")


def test_admin_queries():
    """Test 13: Admin subscription and usage queries."""
    from db_manager import DatabaseManager
    db = DatabaseManager(":memory:")
    db.seed_default_plans()

    # Create multiple users with different plans
    uid1 = db.create_user("admin", "hash", "admin")
    uid2 = db.create_user("starter_user", "hash", "user")
    uid3 = db.create_user("pro_user", "hash", "user")
    db.assign_free_plan(uid1)
    db.assign_free_plan(uid2)
    db.assign_free_plan(uid3)

    # Upgrade user2 to starter
    starter = db.get_plan_by_name('starter')
    sub2 = db.get_active_subscription(uid2)
    db.update_subscription(sub2['id'], status='canceled')
    now = datetime.utcnow()
    db.create_subscription(uid2, starter['id'],
                           now.isoformat(), (now + timedelta(days=30)).isoformat(),
                           'active')

    # List all subscriptions
    all_subs = db.list_subscriptions()
    assert len(all_subs) >= 3

    # Filter by status
    active = db.list_subscriptions(status='active')
    canceled = db.list_subscriptions(status='canceled')
    assert len(active) >= 2
    assert len(canceled) >= 1

    db.close()
    print("  PASS: test_admin_queries")


if __name__ == "__main__":
    print("=" * 60)
    print("FastWrite — Billing System Tests")
    print("=" * 60)
    print()

    tests = [
        test_plan_seeding,
        test_plan_crud,
        test_subscription_lifecycle,
        test_usage_tracking,
        test_limit_enforcement,
        test_unlimited_plan,
        test_usage_reset,
        test_feature_access,
        test_billing_history,
        test_no_subscription_behavior,
        test_multi_user_isolation,
        test_stripe_not_required,
        test_admin_queries,
    ]

    passed = 0
    failed = 0
    for test in tests:
        try:
            test()
            passed += 1
        except Exception as e:
            print(f"  FAIL: {test.__name__}: {e}")
            failed += 1

    print()
    print("=" * 60)
    total = passed + failed
    if failed == 0:
        print(f"ALL {total} TESTS PASSED")
    else:
        print(f"{passed}/{total} passed, {failed} FAILED")
    print("=" * 60)
    sys.exit(0 if failed == 0 else 1)
