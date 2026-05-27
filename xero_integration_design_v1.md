# Xero Integration — Design Document v1

**Project:** FastWrite Desktop App  
**Module:** Xero Integration (`xero_connector.py`)  
**Date:** 25 Μαΐου 2026  
**Status:** Draft — pending review  
**Companion to:** FastWrite_Master_Project_v18.md (Google Drive)

---

## 1. Overview & Decisions

### 1.1 Στόχος

Σύνδεση του FastWrite desktop app με Xero accounting cloud για **push extracted invoices ως Bills (ACCPAY invoices)**. Επιτρέπει σε λογιστές/επιχειρήσεις που χρησιμοποιούν Xero να μεταφέρουν τιμολόγια προμηθευτών από το FastWrite OCR/AI extraction κατευθείαν στα books τους.

### 1.2 Δέσμευση από Master Doc v18

Το v18 ορίζει:
- Hybrid pricing: free download via Xero Marketplace + bespoke deployments
- Xero Integration ΠΡΩΤΕΥΟΥΣΑ προτεραιότητα
- Geographic focus: UK + IE + AU + NZ (Xero markets)
- Phase 2: QuickBooks integration (παρόμοιο pattern, μετά)

### 1.3 Νέα Δεδομένα (μετά Master Doc v18)

**Xero API Pricing (effective 2 March 2026):**
- Starter: $0/μήνα, **5 connections**, unlimited egress
- Core: ~$22 USD/μήνα, 10GB egress
- Plus: ~$155 USD/μήνα, 50GB egress
- **Data INGRESS (push) = FREE σε όλα τα tiers** ← κρίσιμο για το use case μας

**Νέα Granular Scopes (effective 2 March 2026):**
- Apps δημιουργημένα μετά τη 2 Μαρτίου 2026 (το FastWrite Dev είναι μετά) έχουν μόνο νέα granular scopes
- `accounting.transactions` έχει αντικατασταθεί από `accounting.invoices`, `accounting.payments`, κλπ.

### 1.4 Συνέπεια για Strategy

✅ Το hybrid model **παραμένει βιώσιμο**:
- Phase 1 (Dev + 1-4 bespoke): Starter tier (free)
- Phase 2 (5-50 connections): Core tier ($22/μήνα, καλύπτεται από 1 bespoke maintenance fee)
- Phase 3+ (50+ connections): Plus tier (καλύπτεται από multiple bespoke clients)

---

## 2. Architecture Overview

### 2.1 Component Diagram

```
┌─────────────────────────────────────────────────────────┐
│                  FastWrite Desktop App                  │
│                                                         │
│  ┌──────────────┐    ┌──────────────────────────────┐  │
│  │  pywebview   │◄───┤  Flask (random port, local)  │  │
│  │  (UI window) │    │  /api/xero/* endpoints       │  │
│  └──────────────┘    └────────────┬─────────────────┘  │
│                                   │                     │
│                                   ▼                     │
│                      ┌──────────────────────────────┐   │
│                      │  xero_connector.py           │   │
│                      │  - PKCE OAuth orchestration  │   │
│                      │  - Token management          │   │
│                      │  - Bills API push            │   │
│                      │  - Contacts/Settings reads   │   │
│                      └────────────┬─────────────────┘   │
│                                   │                     │
│  ┌──────────────────────────────┐ │                     │
│  │  Temp OAuth loopback server  │◄┘                     │
│  │  http://localhost:5556       │                       │
│  │  (only during OAuth flow)    │                       │
│  └──────────────┬───────────────┘                       │
│                 │                                       │
│  ┌──────────────▼───────────────┐                       │
│  │  %APPDATA%\FastWrite\        │                       │
│  │  secrets\xero_token.enc      │                       │
│  │  (Fernet encrypted)          │                       │
│  └──────────────────────────────┘                       │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼ HTTPS (TLS 1.2+)
              ┌────────────────────┐
              │  Xero API          │
              │  api.xero.com      │
              └────────────────────┘
```

### 2.2 Why Two Servers?

**Problem:** Main Flask runs on **random free port** (από `desktop/main.py:91 find_free_port()`). Το Xero απαιτεί **σταθερό redirect URI** δηλωμένο εκ των προτέρων.

**Solution:** Temporary loopback server σε **σταθερό port 5556** που σηκώνεται **μόνο κατά τη διάρκεια του OAuth flow** και λαμβάνει το authorization code. Μετά κλείνει.

Αυτό είναι industry standard pattern (Google CLI, GitHub CLI, AWS CLI το χρησιμοποιούν).

---

## 3. PKCE OAuth 2.0 Flow

### 3.1 Sequence

```
1. User πατάει "Connect to Xero" στο UI
   └─> Flask: POST /api/xero/connect
       ├─> Generate code_verifier (random 64-char)
       ├─> Compute code_challenge = SHA256(code_verifier), base64url
       ├─> Generate state (CSRF protection, random 32-char)
       ├─> Save (code_verifier, state) σε memory (session)
       ├─> Σηκώνει loopback server στο port 5556
       └─> Επιστρέφει: { auth_url: "https://login.xero.com/identity/connect/authorize?..." }

2. UI ανοίγει το auth_url σε external browser (όχι pywebview!)
   └─> User κάνει login στο Xero, εγκρίνει permissions
       └─> Xero redirects σε: http://localhost:5556/xero/callback?code=XXX&state=YYY

3. Loopback server λαμβάνει το redirect
   ├─> Verify state == saved_state (CSRF check)
   ├─> POST https://identity.xero.com/connect/token
   │     ├─ code=XXX
   │     ├─ code_verifier=ZZZ (το saved)
   │     ├─ client_id=5E...3C (FastWrite Dev)
   │     └─ grant_type=authorization_code
   ├─> Λαμβάνει: access_token (30min) + refresh_token (60 days)
   ├─> GET https://api.xero.com/connections (λίστα authorized tenants)
   ├─> Encrypt & save στο %APPDATA%\FastWrite\secrets\xero_token.enc
   ├─> Επιστρέφει success page στον browser
   └─> Κλείνει loopback server

4. UI ελέγχει connection status periodically
   └─> Flask: GET /api/xero/status → { connected: true, tenants: [...] }
```

### 3.2 Authorization URL Format

```
https://login.xero.com/identity/connect/authorize?
  response_type=code
  &client_id=<CLIENT_ID>
  &redirect_uri=http%3A%2F%2Flocalhost%3A5556%2Fxero%2Fcallback
  &scope=offline_access+openid+email+profile+accounting.invoices+accounting.contacts.read+accounting.contacts+accounting.settings.read
  &state=<RANDOM_STATE>
  &code_challenge=<CODE_CHALLENGE>
  &code_challenge_method=S256
```

### 3.3 Scopes

| Scope | Required? | Reason |
|---|---|---|
| `offline_access` | ✅ Yes | Refresh tokens |
| `openid email profile` | ✅ Yes | Identity (Xero requirement) |
| `accounting.invoices` | ✅ Yes | POST Bills (ACCPAY invoices) |
| `accounting.contacts.read` | ✅ Yes | Lookup suppliers |
| `accounting.contacts` | ⚠ Recommended | Auto-create supplier if missing |
| `accounting.settings.read` | ✅ Yes | Chart of accounts (account codes) |
| `accounting.attachments` | 🔲 Phase 2 | Upload PDF source ως attachment |

---

## 4. Token Storage & Refresh

### 4.1 Storage Format

**Location:** `%APPDATA%\FastWrite\secrets\xero_token.enc`  
**Encryption:** Fernet symmetric (reuse pattern από `key_manager.py`)  
**Permissions:** chmod 600 (όπου εφαρμόζεται)

**Plaintext JSON structure (πριν encryption):**

```json
{
  "access_token": "eyJhbGc...",
  "refresh_token": "8L...",
  "id_token": "eyJhbGc...",
  "expires_at": "2026-05-25T18:30:00Z",
  "token_type": "Bearer",
  "scope": "offline_access openid ... accounting.invoices",
  "tenants": [
    {
      "id": "tenant-uuid-1",
      "tenant_name": "ABC Accounting Ltd",
      "tenant_type": "ORGANISATION",
      "created_at": "2026-05-25T15:00:00Z",
      "updated_at": "2026-05-25T15:00:00Z"
    }
  ],
  "active_tenant_id": "tenant-uuid-1"
}
```

### 4.2 Refresh Logic

**Trigger:** Πριν από κάθε API call, έλεγχος αν `now > expires_at - 60sec` → refresh.

```python
def _ensure_valid_token(self):
    if datetime.utcnow() > self.expires_at - timedelta(seconds=60):
        self._refresh_token()
```

**Refresh request:**

```
POST https://identity.xero.com/connect/token
Content-Type: application/x-www-form-urlencoded

grant_type=refresh_token
&refresh_token=<current_refresh_token>
&client_id=<CLIENT_ID>
```

**Response:** Νέος access_token + (πιθανώς) νέος refresh_token. Αν λάβουμε νέο refresh_token, αντικαθιστούμε το παλιό.

### 4.3 Refresh Token Expiry

Xero refresh tokens έχουν διάρκεια **60 ημέρες χωρίς χρήση** ή **lifetime indefinite με regular use**.

**Strategy:** Αν refresh αποτύχει με `invalid_grant` (token expired/revoked), pop-up UI message "Reconnect to Xero" → restart OAuth flow.

---

## 5. Multi-tenant Support

Ένας user μπορεί να έχει πρόσβαση σε **πολλούς Xero organisations** (multi-tenant). Παράδειγμα: λογιστής με 10 client books.

### 5.1 UI Pattern

- Μετά OAuth, αν `len(tenants) == 1` → auto-select
- Αν `len(tenants) > 1` → modal με dropdown "Σε ποιο Xero organisation να σταλεί;"
- Active tenant αποθηκεύεται στο `xero_token.enc` (`active_tenant_id`)
- Settings page: επιλογή για αλλαγή active tenant

### 5.2 API Calls

Όλα τα requests στέλνουν header:

```
Xero-Tenant-Id: <active_tenant_id>
Authorization: Bearer <access_token>
```

---

## 6. Field Mapping (Extracted Invoice → Xero Bill)

### 6.1 Source: FastWrite Extracted Data

Από `ai_extractor.py`, τα extracted fields εξαρτώνται από user schema. Συνήθη fields:

| FastWrite Field | Type | Example |
|---|---|---|
| `supplier_name` | string | "ACME Ltd" |
| `supplier_vat` | string | "GB123456789" |
| `invoice_number` | string | "INV-2026-001" |
| `invoice_date` | date | "2026-05-15" |
| `due_date` | date | "2026-06-15" |
| `total_amount` | number | 1230.00 |
| `vat_amount` | number | 230.00 |
| `subtotal` | number | 1000.00 |
| `currency` | string | "EUR" |
| `line_items` | array | [{description, quantity, unit_price, total}, ...] |

### 6.2 Target: Xero Bill (ACCPAY Invoice)

```json
{
  "Type": "ACCPAY",
  "Contact": {
    "ContactID": "<looked-up-or-created>",
    "Name": "ACME Ltd"
  },
  "Date": "2026-05-15",
  "DueDate": "2026-06-15",
  "InvoiceNumber": "INV-2026-001",
  "Reference": "FastWrite import",
  "CurrencyCode": "EUR",
  "LineAmountTypes": "Exclusive",
  "Status": "DRAFT",
  "LineItems": [
    {
      "Description": "...",
      "Quantity": 1,
      "UnitAmount": 1000.00,
      "AccountCode": "<from chart of accounts>",
      "TaxType": "<from tax rates>"
    }
  ]
}
```

### 6.3 Critical Mappings

**Contact (Supplier) Lookup:**
1. Search Xero contacts where `Name == supplier_name` (case-insensitive)
2. Fallback: search by `TaxNumber == supplier_vat`
3. If not found AND `accounting.contacts` scope granted → auto-create
4. If not found AND no create scope → UI prompts user to select/create manually

**Account Code:**
- Default: pre-configured per supplier (saved σε FastWrite local DB)
- Fallback: user picks από dropdown με all available account codes (από `/api.xro/2.0/Accounts`)

**Status: DRAFT (όχι AUTHORISED):**
- **Πάντα** ξεκινάμε με DRAFT
- User μετά manually authorises στο Xero (governance + audit trail)
- ΠΟΤΕ auto-authorise — security/compliance issue

---

## 7. API Endpoints (Flask)

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/xero/connect` | POST | Start OAuth flow → return auth_url |
| `/api/xero/status` | GET | Check connection status, list tenants |
| `/api/xero/disconnect` | POST | Revoke tokens, delete `xero_token.enc` |
| `/api/xero/tenants` | GET | List authorized organisations |
| `/api/xero/tenants/active` | PUT | Set active tenant |
| `/api/xero/accounts` | GET | List chart of accounts (cached) |
| `/api/xero/contacts/search` | GET | Search suppliers (autocomplete) |
| `/api/xero/push/<doc_id>` | POST | Push single document as Bill |
| `/api/xero/push/batch` | POST | Push multiple documents (bulk) |

**Loopback callback (port 5556, ephemeral):**

| Endpoint | Method | Purpose |
|---|---|---|
| `/xero/callback` | GET | Receive OAuth authorization code |

---

## 8. Error Handling & Rate Limiting

### 8.1 Xero API Rate Limits

- **60 calls/min per tenant**
- **5,000 calls/day per tenant**
- **10,000 calls/min per app** (overall)

### 8.2 Error Codes & Actions

| HTTP | Meaning | Action |
|---|---|---|
| 200/201 | Success | Continue |
| 400 | Bad Request | Show error to user, log payload (sanitized) |
| 401 | Unauthorized | Refresh token → retry once → if fail, prompt reconnect |
| 403 | Forbidden | Missing scope or tenant access revoked → prompt reconnect |
| 429 | Too Many Requests | Read `Retry-After` header, sleep, retry (max 3 attempts) |
| 500/502/503 | Xero server issue | Exponential backoff (1s, 2s, 4s), max 3 retries |

### 8.3 Local Queue (για burst handling)

Αν user πατήσει "Push all 50 documents" → όχι 50 parallel calls. Sequential queue με 1.1 sec delay (60 calls/min cap = 1 call/sec, padding 10%).

```python
class XeroRateLimiter:
    def __init__(self, max_per_min=55):  # 55 για safety margin
        self.calls = []
    def wait_if_needed(self):
        # Sliding window 60sec
        ...
```

---

## 9. UI Integration Points

### 9.1 Settings Page

- "Xero Connection" section:
  - Status indicator: ●Connected (green) / ●Not connected (gray)
  - Tenant info: "Connected to: ABC Ltd"
  - Buttons: "Connect to Xero", "Switch organisation", "Disconnect"

### 9.2 Document View

- Νέο button: **"Push to Xero"** (ορατό μόνο όταν Xero connected)
- Modal preview πριν το push: Contact, Date, Total, Account, "Push as DRAFT" confirmation
- Μετά success: link "Open in Xero" → `https://go.xero.com/AccountsPayable/Edit.aspx?InvoiceID=<id>`

### 9.3 Batch View

- Multi-select documents → "Push selected to Xero" → progress bar
- Failed pushes: marked με ⚠ icon, "Retry" option

---

## 10. Security Considerations

### 10.1 PKCE Benefits

- ❌ No client_secret in binary (impossible to extract via reverse engineering)
- ✅ code_verifier never sent to network (only SHA256 hash)
- ✅ State parameter για CSRF protection

### 10.2 Token Storage

- Fernet encryption με machine-specific key (από existing `key_manager.py` pattern)
- Key location: `%APPDATA%\FastWrite\secrets\.machine.key`
- Token file: `%APPDATA%\FastWrite\secrets\xero_token.enc`
- File permissions: 600 (Linux/Mac), Windows DACL equivalent

### 10.3 Network

- All Xero API calls: HTTPS με TLS 1.2+ (Python `requests` default)
- Certificate validation: enabled (NEVER `verify=False`)

### 10.4 Logging

- ✅ Log: API endpoints, HTTP status codes, tenant IDs, document IDs
- ❌ NEVER log: access_token, refresh_token, code_verifier, code_challenge, raw request bodies

### 10.5 GDPR

- User can disconnect anytime → deletes `xero_token.enc` + revokes tokens via Xero API
- Documentation στο Privacy Policy (Task #10)

---

## 11. Testing Strategy

### 11.1 Unit Tests (`test_xero_connector.py`)

- PKCE generation (code_verifier, code_challenge correctness)
- State CSRF validation (mismatch → reject)
- Token refresh logic (mocked Xero responses)
- Field mapping (extracted → Bill JSON)
- Rate limiter (sliding window correctness)

### 11.2 Integration Tests

- Live OAuth flow με Xero (requires Demo Company or trial)
- POST Bill end-to-end στο Xero sandbox
- Multi-tenant switching
- Error scenarios: 401 refresh, 429 backoff, network failure

### 11.3 Manual QA (πριν Marketplace submission)

- 20+ διαφορετικά invoices, push to Demo Company
- Verify σωστά mapping (Contact, LineItems, Tax)
- Verify DRAFT status (όχι auto-authorise)
- Reconnect flow μετά token revoke
- Disconnect → reconnect → επιβεβαίωση clean state

---

## 12. Open Questions / Decisions Needed

| # | Question | Recommendation |
|---|---|---|
| 1 | Auto-create suppliers when not found? | YES — request `accounting.contacts` scope (better UX) |
| 2 | Cache chart of accounts locally? | YES — 24h TTL, reduces egress (Core tier 10GB cap) |
| 3 | Support multi-currency? | YES — Xero handles natively, FastWrite passes `currency` field |
| 4 | PDF attachment to Bill? | Phase 2 — adds value but not blocker |
| 5 | Webhook receiver για Xero events? | NO για now — adds complexity, no use case yet |
| 6 | Production app name? | "FastWrite" (separate from "FastWrite Dev") |
| 7 | Marketplace category? | "Bills + Expenses" (primary) ή "Documents" |

---

## 13. Implementation Phases

### Phase A: Core OAuth (1 εβδομάδα)

- `xero_connector.py`: PKCE flow, loopback server, token storage
- Flask endpoints: `/api/xero/connect`, `/api/xero/status`, `/api/xero/disconnect`
- UI: Settings page Xero section
- Tests: PKCE, token refresh

### Phase B: Bills Push (1 εβδομάδα)

- Field mapping: extracted → Bill JSON
- Contacts lookup/create
- Accounts cache
- `/api/xero/push/<doc_id>` endpoint
- UI: "Push to Xero" button + preview modal

### Phase C: Polish (3-5 ημέρες)

- Multi-tenant UI
- Batch push με rate limiter
- Error handling με user-friendly messages
- Logging (without secrets)

### Phase D: Production Hardening (πριν Marketplace)

- Separate `FastWrite` production app στο Xero (όχι FastWrite Dev)
- Privacy Policy + ToS (Task #10)
- Security audit (όλα τα Xero minimum requirements)
- Manual QA με 20+ test invoices

**Total estimate: 3-4 εβδομάδες** (έναντι 2-3 του Master Doc — διορθώθηκε με βάση τη λεπτομέρεια)

---

## Document Control

- **v1** (25 May 2026) — Initial draft, για review από Stavros
- Master Doc reference: `FastWrite_Master_Project_v18.md`
- Implementation tracking: tasks #5-#9 στο Cowork session
