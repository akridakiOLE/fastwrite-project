# FastWrite — Data-Flow & Architecture Summary (for legal review)

*One-page technical summary so the reviewer can assess data-protection roles accurately. FastWrite's architecture is deliberately local-first and is NOT a typical cloud SaaS.*

---

## 1. What the product is

A **Windows desktop application** installed on the end user's own computer. The end users are bookkeepers / small accounting firms (B2B). The app extracts data from supplier invoices using AI and pushes them as **draft** bills into the user's accounting platform (currently Xero).

## 2. Where data lives

| Data | Location | Who can access it |
|---|---|---|
| Uploaded invoices / documents | User's computer only (`%APPDATA%\FastWrite\`) | The user only |
| Extracted data, local database (`app.db`) | User's computer only | The user only |
| Google Gemini API key (user's own) | User's computer, encrypted (Fernet) | The user only |
| Accounting-platform OAuth tokens | User's computer, encrypted (Fernet) | The user only |
| Account email, username, hashed password, license token | Our server (Hetzner, EU) | Us (operator) |

**We (the operator) never receive or store** the user's invoices, extracted financial data, API keys, or OAuth tokens.

## 3. How data moves (the three flows)

1. **AI extraction (BYOK).** The user supplies **their own** Google Gemini API key. Invoice content is sent **directly from the user's computer to Google's Gemini API**. It does **not** pass through our servers. The user has their own billing relationship with Google.

2. **Accounting push (OAuth 2.0 + PKCE).** The user connects their own accounting-platform account. Draft bills are sent **directly from the user's computer to the platform's API** (e.g. Xero). No client secret is stored in the app; tokens are stored encrypted locally. **All bills are created as DRAFT** — the user manually reviews and authorises them. We never auto-approve.

3. **Account / authentication.** The only data reaching our server is the small account dataset (email, username, hashed password, license token), used for sign-in and licensing.

## 4. Third parties involved

- **Google (Gemini API):** processes invoice content under the user's own API key and Google's terms. Acts as a processor/sub-processor of the *user*, not of us.
- **Xero (and, when released, QuickBooks):** receives the draft bills directly from the user; governed by that platform's own terms with the user.
- **Hetzner (Helsinki, Finland — EU):** hosts our server holding the small account dataset.
- **Cloudflare Email Routing + Gmail:** routes support emails sent to our support address.

## 5. Proposed data-protection characterisation (for the lawyer to confirm or correct)

- For the **account dataset**, we are the **data controller**.
- For **invoice content and pushed data**, the **user** is the controller; FastWrite is, at most, a **transient processor** (data passes through the user's own machine and goes directly to third parties chosen and authorised by the user). Please confirm whether this is correct and whether a **DPA** should be offered to customers.

## 6. Data residency

- The account dataset is hosted on Hetzner Cloud in **Helsinki, Finland (EU)**.
