# FastWrite — Tester Guide & Invitation

Thank you for agreeing to test **FastWrite** — an AI-powered Windows desktop app that extracts data from invoice PDFs and (optionally) pushes it straight into Xero as draft bills. This short guide walks you through everything. The whole test takes about **15–20 minutes**.

---

## What FastWrite does

FastWrite reads invoice PDFs **on your own computer**, uses Google's Gemini AI to extract the key data (supplier, buyer, dates, amounts, VAT, line items), lets you review and approve it, and exports it to CSV/Excel — or sends it directly to **Xero as a draft bill**. Your files stay on your machine; only the AI extraction call leaves it.

We also give you a **ready-made test file of 100 sample invoices**, so you don't need your own documents — you can test the full flow in minutes.

---

## What you'll need

1. A **Windows** PC.
2. The **FastWrite** desktop app — download link: `__________`
3. A free **Google Gemini API key** (Step 1 below). For best results we strongly recommend **enabling billing** on your Google account.
4. *(Optional)* A **Xero** account — only if you want to test the Xero integration. Create a free trial at **https://www.xero.com** (a Xero trial or demo company is fine).

---

## Step 1 — Get your Google Gemini API key

1. Go to **Google AI Studio** — **https://aistudio.google.com** — and sign in with your Google account.
2. Click **Get API key → Create API key**.
3. **Restrict the key (required, 1 click):** in **Google Cloud Console** (**https://console.cloud.google.com**) → *Credentials* → your key → *API restrictions* → **Restrict key → select only "Generative Language API" (Gemini)**. This is a basic security step.
4. **Strongly recommended — enable billing:** the free tier is rate-limited and can fail on larger batches (you may see *"503 / overloaded"* errors). A pay-as-you-go (billing-enabled) key is far more reliable, and the cost is tiny (see **Costs** below). In **Google Cloud Console** → *Billing* → link a payment method.

Copy the key — you'll paste it into FastWrite next.

---

## Step 2 — Open FastWrite and enter your key

1. Install and open **FastWrite**.
2. Go to **Settings → API Keys**, paste your Gemini key, and **Save**.

---

## Step 3 — Look around first *(please don't skip this)*

Before uploading anything, click through **every page** and get comfortable with each function:

- **Dashboard** — overview of your documents.
- **Upload & Extract** — where you load a file.
- **Documents** — the list of detected invoices, with filters, approve, and export.
- **Labels** — supplier categories. **Open this page and confirm it is empty** — there are no labels yet. That's intentional: FastWrite **creates them automatically** for each supplier when you register a file. *(Zero manual setup — this is one of the things we'd most like your feedback on.)*
- **Settings** — API key + Xero connection.
- **Help** — pricing and FAQ.

---

## Step 4 — Run your first extraction

1. Go to **Upload & Extract** and upload the test file. **Limit: up to 100 invoices per file/batch.**
2. Click **Register Documents** — FastWrite detects each invoice and auto-creates a label per supplier *(~30–60 seconds)*.
3. Go to **Documents**, select the invoices, and click **Batch** to extract the data.
4. Watch it run — 100 invoices finish in about a minute.

---

## Step 5 — Review & approve

1. In **Documents**, click **Approve** to open the review screen: the original invoice on the left, the extracted data on the right.
2. Check the fields, correct anything if needed, and click **Approve Invoice**.
3. Export via **CSV**, **XLSX**, or **Line Items XLSX** for your accounting software.

---

## Step 6 — *(Optional)* Connect Xero and push a bill

Only if you want to test the Xero integration:

1. **Settings → Connect to Xero** → a browser window opens → log in to Xero, **authorize FastWrite**, then **choose your organisation**.
2. Back in **Documents**, on an approved invoice click the **🔗** button → **Push to Xero**.
3. Choose the **Account Code** (from your Xero Chart of Accounts) and click **Push as DRAFT**.
4. The bill appears in Xero as a **DRAFT** — you review and authorize it inside Xero. **Nothing is finalised automatically.**

---

## Costs — full transparency, no hidden fees

**1. The AI cost — you pay Google directly ("bring your own key").**
FastWrite uses *your own* Gemini API key, so you pay Google for the AI, not us. It is very small:

- ≈ **$0.002 per invoice** (roughly **$15–30 per 10,000 invoices**). With Google's Batch API, about half that.

You are always in full control of your own spend.

**2. The FastWrite license.**

- One-time license: **€2,500–€5,000** (depending on scope / customisation).
- Maintenance & support: **€150–€400 / month**.
- **Early-tester Partner Credit: €500 off**, as a thank-you for helping us test.

No subscriptions and no per-invoice fees from us — **you own the app**.

---

## Using a different accounting system (not Xero)

- **Exports work with everything, today:** CSV / Excel / Line Items Excel import into any accounting software manually — no setup required.
- **Automated push** (like the Xero integration) is possible **only if** your software has an **API** and you authorise FastWrite to use it — your software's developer grants access, exactly as Xero does. We then build a connector for it.
- We **never** need access to your computer. It is a direct, authorised **app-to-app** connection from your own machine.

---

## What we'd love you to tell us

- Did the extraction get your invoices right? Any wrong or missing fields?
- Was anything confusing, slow, or unclear?
- How did the **auto-created Labels** feel?
- *(If you tested Xero)* did the draft bill come through correctly?
- What would you want fixed or added before you'd use this for real work?

Thank you — your feedback directly shapes FastWrite. 🙏

**— Stavros, FastWrite**
