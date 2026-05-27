# FastWrite — Privacy Policy

**Effective Date:** [TO BE FILLED before publication]
**Last Updated:** [TO BE FILLED before publication]

---

## 1. Introduction

This Privacy Policy describes how **FastWrite** ("we", "us", or "our") collects, uses, and protects your information when you use the FastWrite desktop application and related services (the "Service").

FastWrite is designed with **privacy by default**: your documents, extracted data, and API keys are stored locally on your computer and never transmitted to our servers. We collect the minimum information necessary to provide the Service.

This Policy is written to comply with the General Data Protection Regulation (GDPR) and the UK Data Protection Act 2018, and applies to all users worldwide.

---

## 2. Who We Are (Data Controller)

**Operator:** Stavros Kallenos, sole trader (Cyprus)
**Brand:** FastWrite
**Country of Establishment:** Republic of Cyprus
**Registered Address:** [TO BE FILLED — residential or virtual office address]
**Tax Identification Code (TIC):** [TO BE FILLED if required by lawyer]
**Contact Email for Privacy Matters:** support@fastwrite.tech

For GDPR purposes, we act as the **data controller** for the limited personal data we collect (see Section 3). For data you push to your own Xero account through FastWrite, **you remain the data controller** and FastWrite is a transient data processor.

---

## 3. Information We Collect

### 3.1 Information You Provide Directly

| Category | Examples | Purpose |
|---|---|---|
| Account information | Email, username, password (hashed) | Account creation, authentication |
| License information | License JWT, payment metadata (for paid tiers, if applicable) | License validation |
| Support communications | Emails you send to support@fastwrite.tech | Responding to your inquiries |

### 3.2 Information Stored Locally (NOT Transmitted to Us)

The following data is stored **only on your computer** under `%APPDATA%\FastWrite\` (Windows), `~/Library/Application Support/FastWrite/` (macOS), or `~/.local/share/FastWrite/` (Linux). We do **not** have access to this data:

- Uploaded documents (invoices, receipts, PDFs)
- Extracted data and templates
- Your AI provider API keys (e.g., Google Gemini), encrypted with a machine-specific Fernet key
- Your Xero OAuth tokens, encrypted with the same machine-specific key
- Your local SQLite database (`app.db`)

### 3.3 Information We Do NOT Collect

- We do **not** collect or transmit the content of your invoices to our servers.
- We do **not** track your usage analytics (e.g., feature usage, behavior).
- We do **not** use cookies for tracking.
- We do **not** sell, rent, or share your personal data with third parties for marketing.

---

## 4. How We Use Information

We use the limited information we collect for the following purposes:

1. **Account & Authentication:** Creating your account, signing you in, securing access.
2. **License Validation:** Verifying your entitlement to use paid features (if applicable).
3. **Support:** Responding to questions, troubleshooting issues, sending service announcements.
4. **Legal Compliance:** Complying with applicable laws and responding to lawful requests from authorities.

---

## 5. Legal Bases for Processing (GDPR Article 6)

We rely on the following legal bases:

- **Contract (Art. 6(1)(b)):** To deliver the Service you have signed up for.
- **Legitimate Interests (Art. 6(1)(f)):** To secure our Service, prevent fraud, and improve reliability.
- **Consent (Art. 6(1)(a)):** Where applicable, for optional features (e.g., marketing emails — opt-in only).
- **Legal Obligation (Art. 6(1)(c)):** Where required by law (e.g., tax records, court orders).

---

## 6. Third-Party Services

FastWrite enables you to integrate with the following third-party services. These integrations are **initiated by you** and operate under the third party's own privacy policy:

### 6.1 Google Gemini (AI Document Extraction)

- You provide your **own** Google Gemini API key (BYOK — "Bring Your Own Key").
- When you process a document, its content is sent **directly from your computer to Google's Gemini API**, not through our servers.
- Google's processing of this content is governed by [Google's Privacy Policy](https://policies.google.com/privacy) and [Google AI Terms](https://policies.google.com/terms).
- We never see your Gemini API key in plain text — it is encrypted on your computer with Fernet symmetric encryption.

### 6.2 Xero Accounting

- If you choose to connect FastWrite to your Xero account, we use OAuth 2.0 with PKCE — meaning **no client secret is ever stored in the application**.
- Xero OAuth tokens are stored **locally and encrypted** on your computer.
- When you push a document as a Bill, the data is transmitted **directly from your computer to Xero's API**, not through our servers.
- Xero's handling of this data is governed by [Xero's Privacy Policy](https://www.xero.com/about/legal/privacy/).
- You can disconnect FastWrite from Xero at any time via Settings → Σύνδεση με Xero → Αποσύνδεση. This deletes the local token and revokes our access on Xero's side.

### 6.3 Email Service Providers

If you contact us at support@fastwrite.tech, your message is routed through Cloudflare Email Routing to a Gmail mailbox. Cloudflare's and Google's respective privacy policies apply.

---

## 7. Data Storage & Security

### 7.1 Where Data Is Stored

- **Account data** (the small set in Section 3.1): stored on our server hosted at Hetzner Cloud (Falkenstein, Germany — EU).
- **Everything else** (Section 3.2): stored on **your computer only**.

### 7.2 Security Measures

- All transmissions between FastWrite and external APIs (Xero, Gemini) use HTTPS with TLS 1.2 or higher.
- Server access is restricted, password-protected, and uses SSH key authentication.
- Local secrets (API keys, OAuth tokens) are encrypted using the `cryptography` Python library's Fernet implementation, with a machine-specific key generated on first run.
- Passwords are stored using bcrypt hashing.

### 7.3 Data Breach Notification

If a security incident affecting your personal data occurs, we will notify affected users within **72 hours** of becoming aware of the incident, as required by GDPR Art. 33.

---

## 8. Your Data Subject Rights (GDPR Articles 15–22)

If you are a resident of the European Economic Area (EEA), the United Kingdom, or similar jurisdictions, you have the following rights:

| Right | What it means | How to exercise |
|---|---|---|
| **Access** (Art. 15) | Receive a copy of your personal data we hold | Email support@fastwrite.tech |
| **Rectification** (Art. 16) | Correct inaccurate or incomplete data | Email or via Settings page |
| **Erasure** (Art. 17) | Request deletion of your account and data | Email support@fastwrite.tech |
| **Restriction** (Art. 18) | Limit how we process your data | Email |
| **Portability** (Art. 20) | Receive your data in a machine-readable format | Email |
| **Objection** (Art. 21) | Object to processing based on legitimate interests | Email |
| **Withdraw Consent** | Withdraw any consent you previously gave | Email or in-app settings |

We will respond to all valid requests within **one month** (GDPR Art. 12(3)).

You also have the right to lodge a complaint with a supervisory authority — for Cyprus, this is the [Office of the Commissioner for Personal Data Protection](https://www.dataprotection.gov.cy/).

---

## 9. Cookies & Similar Technologies

The FastWrite desktop application does not use cookies. The FastWrite marketing website (fastwrite.tech) may use only **strictly necessary** cookies for session management. We do **not** use analytics, advertising, or tracking cookies.

---

## 10. International Data Transfers

The account data we hold is stored in the European Union (Germany). When you use third-party integrations (Gemini, Xero), data is transferred to those providers' infrastructure, which may be located outside the EU. We rely on the following safeguards:

- **Gemini:** Google's Standard Contractual Clauses and self-certification under applicable frameworks.
- **Xero:** Xero's published data processing terms and Standard Contractual Clauses.

---

## 11. Data Retention

- **Account data:** Retained while your account is active and for a reasonable period afterwards (typically 12 months) for legal compliance and support history.
- **Local data on your computer:** You control retention. Uninstalling FastWrite or deleting the `%APPDATA%\FastWrite\` folder removes all local data.
- **Support emails:** Retained for up to 24 months for service-quality purposes.
- **Legal/tax records:** Retained for the period required by applicable law (typically 7 years in Cyprus).

---

## 12. Children's Privacy

FastWrite is a **business productivity tool** and is not directed at individuals under the age of 18. We do not knowingly collect personal data from children. If you believe we have collected such data, please contact us at support@fastwrite.tech and we will delete it.

---

## 13. Changes to This Policy

We may update this Policy from time to time. The "Last Updated" date at the top will reflect any change. For material changes, we will notify you via email or in-app announcement at least **30 days** before the changes take effect.

---

## 14. Contact

For any privacy-related question, complaint, or data subject request:

**Email:** support@fastwrite.tech
**Postal Address:** [TO BE FILLED]
**Website:** https://fastwrite.tech

---

*FastWrite — Privacy Policy v1.0 — [date]*
*Reviewed by: [TO BE FILLED — Cyprus legal counsel]*
