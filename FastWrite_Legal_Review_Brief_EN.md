# FastWrite — Legal Review Engagement (Privacy Policy + Terms of Service)

**Engagement type:** Fixed-price review of two existing draft documents (Privacy Policy + Terms of Service), plus a short written advice note.
**Documents are already drafted in English.** This is a review, mark-up, and advice job — not a write-from-scratch job.

---

## 1. Who we are

FastWrite is a one-person software business operated by a sole trader established in **Cyprus (EU)**. The product is a **Windows desktop application** that uses AI to extract data from supplier invoices and push them as **draft** bills into the user's accounting platform (currently **Xero**).

Target customers: **B2B only** — bookkeepers and small accounting firms in the **UK, Ireland, Australia, and New Zealand**. No consumers, no minors, not targeting Cyprus/Greece at this stage.

---

## 2. Who we need

A qualified lawyer / solicitor with demonstrable expertise in:

- **UK GDPR and EU GDPR** (data protection) — primary.
- **B2B SaaS / software commercial terms** (liability caps, warranty disclaimers, indemnities, IP licensing).
- Ideally familiar with **SaaS apps that use third-party AI APIs** and **OAuth integrations** (e.g. accounting marketplaces).

> Note on jurisdiction: because we actively target data subjects/customers in the UK, **UK GDPR applies to us extraterritorially** (Art. 3(2)), so UK data-protection expertise is directly relevant even though the operator is established in Cyprus. See Section 6 for the governing-law question we want your view on.

**Out of scope for this engagement** (handled separately by a Cyprus professional): Cyprus tax/VAT registration, Cyprus social insurance, Cyprus sole-trader registration, and any opinion that depends specifically on **Cypriot** law. Please do **not** price these in.

---

## 3. Critical context — our architecture is NOT a typical cloud SaaS

Please read the attached **Data-Flow Summary** before reviewing. The key point: most of the sensitive data **never reaches our servers**.

- The app is **installed on the user's own computer**. Invoices, extracted data, API keys and OAuth tokens are stored **encrypted locally** on that machine.
- AI extraction uses **the user's own Google Gemini API key (BYOK)** — invoice content goes **directly from the user's computer to Google**, not through us.
- Pushing to Xero goes **directly from the user's computer to Xero** via OAuth 2.0 (PKCE), not through us.
- The **only** personal data we hold on a server (Hetzner, EU) is: account email, username, hashed password, and a license token.

A generic "cloud SaaS" privacy template would describe server-side collection/storage of user content that **does not happen here**. We need the documents to accurately reflect the local/BYOK model, and the correct **controller vs processor** characterisation.

---

## 4. Scope of work / deliverables

1. **Privacy Policy review** — mark-up (tracked changes or comments) for UK GDPR + EU GDPR compliance, including:
   - Accuracy of the controller/processor analysis given the local/BYOK architecture (Section 3).
   - Lawful bases, data-subject rights, retention, international transfers, third-party processors (Google Gemini, Xero), breach notification.
   - Whether any required disclosures are missing.

2. **Terms of Service review** — mark-up for a B2B software product, including:
   - Enforceability/reasonableness of the **liability cap** (greater of €100 or last 12 months' fees), **"AS IS" warranty disclaimer**, and **indemnity**.
   - Whether the **B2B-only eligibility gating** is sufficient to keep us outside consumer-protection regimes in the target markets.
   - The **DRAFT-only / "we never auto-authorise"** risk allocation and AI-error disclaimers.
   - IP licence grant and feedback clause.

3. **Short written advice note** answering the questions in Section 6.

4. **Confirmation** of whether the documents are fit to publish (with your required changes applied) for: (a) direct download from our website, and (b) submission to the Xero App Marketplace.

---

## 5. Background facts (for your review)

- Distribution channels: free basic tier via **Xero App Marketplace** AND **direct download from fastwrite.tech**. The documents must bind users obtained through **either** channel.
- Future: a **QuickBooks** integration is *planned but not yet released*; the documents describe it as forthcoming under the same model.
- Future: optional **bespoke deployments** under a separate signed service agreement (not part of this review).
- We hold **no** analytics/tracking; no advertising cookies.

---

## 6. Specific questions we want answered

1. **Governing law / jurisdiction.** The current draft uses **Cyprus law + Nicosia courts**. Given our customers are in UK/IE/AU/NZ, is this appropriate and credible for B2B customers, or would **English law + courts** (or another choice) be more enforceable/marketable? Please flag any clause that a UK business customer or the Xero marketplace might view as unfair or unenforceable.
2. **Controller vs processor.** Is our characterisation correct — that we are the controller only for the small account dataset, and (at most) a transient processor for data pushed to the user's own accounting platform? Do we need a **Data Processing Addendum (DPA)** offered to customers, and if so, a short template?
3. **Liability cap & disclaimers.** Are the cap and "AS IS" disclaimer enforceable in a B2B context in the target markets? Any wording changes needed?
4. **AI-specific risk.** Is our disclaimer of AI-extraction errors adequate, given the user reviews data before approving? Anything to add (e.g. EU AI Act transparency, if relevant)?
5. **B2B gating.** Is our eligibility clause (18+, business use only) sufficient to avoid consumer-law exposure in UK/IE/AU/NZ?
6. **Marketing claims.** We will publish marketing copy. Are there any privacy/security claims we must avoid or qualify until something is in place (e.g. "GDPR compliant", "bank-level security")?
7. **Registered/postal address.** We currently operate from a home address. Is a virtual office address acceptable in the Privacy Policy / Terms for the target markets?

---

## 7. What we will provide

- `FastWrite_Privacy Policy` (draft, English)
- `FastWrite_Terms of Service` (draft, English)
- `FastWrite_DataFlow_Summary_EN` (one-page technical/architecture summary)

## 8. Please include in your proposal

- Confirmation you are qualified in **UK/EU data protection** and B2B software terms.
- **Fixed price** for Sections 4.1–4.4 (and, optionally separately, a DPA template).
- **Turnaround time** (we are aiming to move quickly).
- Any assumptions or additional information you need from us.
