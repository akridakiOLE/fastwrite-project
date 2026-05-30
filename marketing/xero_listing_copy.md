# FastWrite — Xero App Store Listing Copy (draft v1)

English copy for the four Xero App Store text fields. Character counts noted; Xero limits: Short description 300, the others 3,000 each. Target markets: UK, IE, AU, NZ.

---

## 1. Short description (max 300 chars)

> FastWrite uses AI to extract data from invoices and receipts, then pushes them to Xero as DRAFT bills for your review. It runs on your desktop, keeps your documents private, and uses your own Google Gemini API key. Built for accountants and bookkeepers who want to cut manual data entry.

*(~287 characters)*

---

## 2. About (max 3,000 chars)

FastWrite is an AI-powered document extractor for accountants, bookkeepers, and small businesses who are tired of typing invoices into Xero by hand.

Upload a scanned invoice or receipt (PDF or image), and FastWrite uses AI to read it — supplier, invoice number, date, totals, and individual line items — and turns it into structured data you can review and push straight into Xero as a DRAFT bill. You stay in control: every bill lands in Xero as a draft for you to check and approve. FastWrite never authorises, pays, or finalises anything on your behalf.

**Why FastWrite is different**

- **Private by design.** FastWrite is a desktop application. Your invoices and extracted data stay encrypted on your own computer. We do not store your documents or accounting data on our servers.
- **Bring your own AI key (BYOK).** FastWrite uses Google Gemini for extraction with your own API key, so you control your AI usage and costs directly — no per-document markup from us.
- **You review before anything is final.** All bills are created in DRAFT status. Nothing is approved automatically.
- **Built for batches.** Process multiple invoices per file and reuse labels/templates for recurring suppliers.

**Who it's for**

Accounting and bookkeeping practices and finance teams in the UK, Ireland, Australia, and New Zealand who want to reduce manual data entry while keeping client data private and under their own control.

**Pricing**

The core app is free to download and use through the Xero App Store (you supply your own Gemini API key). Optional bespoke deployment and support packages are available for firms that want custom configuration or onboarding.

FastWrite is an independent third-party application and is not affiliated with or endorsed by Xero.

*(~1,750 characters — room to expand with a customer quote or feature bullets before submission)*

---

## 3. Integration details (max 3,000 chars)

FastWrite connects to your Xero organisation using secure OAuth 2.0 (PKCE) — no passwords and no client secrets are stored in the application. You can connect and disconnect at any time from the app's Settings screen.

**What FastWrite reads from Xero**

- Your **contacts**, to match an extracted supplier to an existing contact (and avoid duplicates).
- Your **chart of accounts**, so you can choose the account code that line items should be coded to.

**What FastWrite writes to Xero**

- It creates **DRAFT bills** (ACCPAY invoices) from the data extracted from your documents, including supplier, invoice number, date, currency, and line items.
- If a supplier contact does not already exist, FastWrite can **create the contact** for you.

**What FastWrite never does**

- It never approves, authorises, pays, or deletes anything in Xero. Every bill is created as a **DRAFT** for you to review, edit, and authorise inside Xero.
- It does not pull your financial reports, bank data, or payroll.

**Data flow and privacy**

When you push a document, the data is sent **directly from your computer to the Xero API** — it does not pass through FastWrite servers. Your source documents, extracted data, AI key, and Xero tokens are stored encrypted locally on your machine.

**Accuracy**

AI extraction can make mistakes. Because every bill is a draft, you are always the final check before a bill is approved in Xero. We recommend reviewing extracted amounts and line items before authorising.

*(~1,650 characters)*

---

## 4. Getting started (max 3,000 chars)

Getting up and running with FastWrite takes a few minutes.

**1. Install FastWrite**
Download and install the FastWrite desktop app (Windows). No accounting data leaves your computer.

**2. Add your Google Gemini API key (BYOK)**
In Settings, paste your own Google Gemini API key. It is encrypted and stored locally. You can get a key from Google AI Studio. This is what powers the AI extraction, and you pay Google directly for usage.

**3. Connect Xero**
In Settings, click "Connect to Xero" and sign in to authorise FastWrite. Choose the organisation you want to use. You'll see a green "Connected" status when it's done.

**4. Upload an invoice**
Go to Upload & Extract and add a PDF (you can include multiple invoices per file). Click "Register Documents" — FastWrite identifies each invoice and supplier automatically.

**5. Review the extracted data**
Open the document on the Approval screen. FastWrite walks you through each extracted field and line item, highlighted on the original invoice, so you can confirm or correct the data.

**6. Push to Xero as a DRAFT bill**
Click the Xero push button, pick the account code, and push. The bill is created in your Xero organisation as a **DRAFT**.

**7. Approve in Xero**
Open the draft bill in Xero, do your final check, and authorise it when you're ready.

That's it. For recurring suppliers, save a label/template once and FastWrite will match future invoices automatically.

Need help? Contact support@fastwrite.tech.

*(~1,500 characters)*

---

## Notes before submission
- Fill in a customer quote or 2-3 extra feature bullets in "About" if available.
- Confirm supported OS at launch (Windows now; Mac later) and adjust step 1.
- Keep claims consistent with the Privacy Policy and Terms (DRAFT-only, BYOK, no server storage of documents).
