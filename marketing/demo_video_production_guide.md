# FastWrite — Demo Video Production Guide

Companion to `demo_video_script.md`. This is the step-by-step plan for actually recording and editing the Xero certification demo video.

- **Approach:** Live screen recording of the real app + AI voiceover (no avatar).
- **Tool:** Microsoft Clipchamp (free, 1080p, no watermark) — screen recording + AI text-to-speech + auto-captions, all in one.
- **Final video language: ENGLISH** (Xero markets: UK/IE/AU/NZ). A Greek pass is fine *only* as practice to learn Clipchamp.
- **Target:** 1920×1080, ~2:30–3:00, MP4.

---

## A. Pre-recording checklist (do ALL before hitting record)

1. **App maximised at 1920×1080.** If your screen is bigger, record the app window region only, or set display to 1080p.
2. **English UI.** Switch FastWrite to EN (the i18n cleanup is done — UI is clean English).
3. **Hide the dev license chip** (bottom-right "dev · …/… docs"). Cleanest option: temporarily hide it via CSS in the running local app (frontend-only, no restart needed), then revert after recording. Fallback: cover it with a small overlay rectangle in Clipchamp across the whole timeline.
4. **Clean demo data only.** No real client invoices. Use ONE supplier/invoice for the whole video so totals match between the push modal and the Xero draft.
5. **Xero sandbox ready & logged in** in your browser (the test organisation you used for E2E), so the "Connect to Xero" consent screen and the final draft bill both work live.
6. **Silence distractions:** close email/Slack/notifications, hide the taskbar, set Windows to Do Not Disturb, empty/clean desktop if it ever shows.
7. **Cursor:** move slowly and deliberately; pause ~1s on each key screen so the viewer (and the captions) can keep up.

---

## B. Recording strategy

**Record in SEGMENTS — one short clip per scene** (not one long take). If you fumble a scene you re-record just that clip. Clipchamp will stitch them on the timeline.

**Order of work (important):**
1. First generate the **AI voiceover clips** in Clipchamp (fast) and note each one's duration.
2. Then record each screen segment, aiming to roughly match its voiceover length (a little longer is fine — trim in the timeline).
3. Drop screen clip + matching voiceover on the timeline per scene, trim to fit.

This avoids the classic problem of screen footage that's way longer or shorter than the narration.

---

## C. Shot list (what to click, per scene)

| Scene | On screen — actions | Approx length |
|---|---|---|
| 1. Intro (0:00–0:15) | Logo/splash → land on **Dashboard**. Hold still. | ~15s |
| 2. Connect (0:15–0:35) | **Settings** → click **Connect to Xero** → Xero consent screen → allow → back to app showing green **Connected to [Org]**. | ~20s |
| 3. Upload (0:35–1:00) | **Upload & Extract** → drag in the demo PDF → click **Register Documents** → confirmation. | ~25s |
| 4. Review — the core (1:00–1:45) | Open doc on **Approval screen, Tour Mode ON**. Step through 2–3 fields (Buyer Name, Invoice No.) highlighted on the invoice → then the **line-items table**. | ~45s |
| 5. Push DRAFT (1:45–2:15) | Click Xero push → **"Push to Xero (as DRAFT)"** modal → pick an account code → **Push as DRAFT**. | ~30s |
| 6. Result in Xero (2:15–2:45) | Switch to **Xero in browser** → Bills to pay → **Drafts** → open the new draft showing supplier, line items, totals. | ~30s |
| 7. Outro (2:45–3:00) | Back to FastWrite → Settings privacy/BYOK note → end on **logo + fastwrite.tech**. | ~15s |

**Optional safety label (Xero reviewers like this):** add an on-screen text "DRAFT — you approve in Xero" during scenes 5–6.

---

## D. Voiceover scripts (ready to paste into Clipchamp Text-to-Speech)

### D1 — ENGLISH (FINAL video) — recommended voice: UK "Sonia" or "Ryan"

1. "This is FastWrite — an AI document extractor that turns your invoices and receipts into Xero bills, without the manual typing. Let me show you how it works."
2. "FastWrite connects securely to your Xero organisation using OAuth. No passwords are stored in the app, and you can disconnect any time."
3. "Start by uploading an invoice — or a batch of them. FastWrite automatically detects each invoice and its supplier."
4. "Using AI, FastWrite reads the supplier, dates, totals, and every line item. It walks you through each field, highlighted on the original document, so you can confirm everything is correct. You're always in control of the data before it goes anywhere."
5. "When you're happy, push it to Xero. Choose the account code, and FastWrite creates the bill — always as a DRAFT. It never approves or pays anything for you."
6. "Here's the draft bill inside Xero — supplier, line items, and totals, ready for your final review. You check it and authorise it in Xero, just like any other bill."
7. "Your documents stay private on your own computer, and you use your own AI key. FastWrite — less typing, more control. Learn more at fastwrite dot tech."

### D2 — GREEK (PRACTICE/test pass only — NOT for submission)

1. «Αυτό είναι το FastWrite — ένας AI εξαγωγέας εγγράφων που μετατρέπει τα τιμολόγια και τις αποδείξεις σας σε προσχέδια λογαριασμών στο Xero, χωρίς χειροκίνητη πληκτρολόγηση. Ας σας δείξω πώς δουλεύει.»
2. «Το FastWrite συνδέεται με ασφάλεια στον οργανισμό σας στο Xero μέσω OAuth. Δεν αποθηκεύονται κωδικοί στην εφαρμογή και μπορείτε να αποσυνδεθείτε οποιαδήποτε στιγμή.»
3. «Ξεκινήστε ανεβάζοντας ένα τιμολόγιο — ή μια ολόκληρη παρτίδα. Το FastWrite εντοπίζει αυτόματα κάθε τιμολόγιο και τον προμηθευτή του.»
4. «Με τη χρήση AI, το FastWrite διαβάζει τον προμηθευτή, τις ημερομηνίες, τα σύνολα και κάθε γραμμή του τιμολογίου. Σας καθοδηγεί σε κάθε πεδίο, επισημασμένο πάνω στο πρωτότυπο έγγραφο, ώστε να επιβεβαιώσετε ότι όλα είναι σωστά. Έχετε πάντα τον έλεγχο των δεδομένων πριν πάνε οπουδήποτε.»
5. «Όταν είστε ικανοποιημένοι, στείλτε το στο Xero. Επιλέξτε τον κωδικό λογαριασμού και το FastWrite δημιουργεί τον λογαριασμό — πάντα ως προσχέδιο (DRAFT). Δεν εγκρίνει και δεν πληρώνει ποτέ τίποτα για εσάς.»
6. «Εδώ είναι το προσχέδιο μέσα στο Xero — προμηθευτής, γραμμές τιμολογίου και σύνολα, έτοιμα για τον τελικό σας έλεγχο. Το ελέγχετε και το εγκρίνετε μέσα στο Xero, όπως κάθε άλλο τιμολόγιο.»
7. «Τα έγγραφά σας παραμένουν ιδιωτικά στον δικό σας υπολογιστή και χρησιμοποιείτε το δικό σας AI κλειδί. FastWrite — λιγότερη πληκτρολόγηση, περισσότερος έλεγχος. Μάθετε περισσότερα στο fastwrite.tech.»

---

## E. Clipchamp workflow

1. **New project** → set aspect ratio 16:9.
2. **Generate voiceover:** left toolbar → "Record & create" → **Text to speech** → language English (UK) → voice **Sonia/Ryan** → paste segment 1 → Generate → it lands on the timeline. Repeat per segment (keep them as separate audio clips). Note each clip's duration.
3. **Record screen:** "Record & create" → **Screen recording** → record screen only (no mic) → capture each scene as a separate clip per the shot list.
4. **Assemble:** place each screen clip above its voiceover clip; trim the screen clip to match the voiceover length (drag the clip edges). Add ~0.5s gaps/crossfades between scenes if needed.
5. **Captions:** Clipchamp → Captions → **auto-generate** (accessibility + silent autoplay). Review for errors, especially "FastWrite", "Xero", "OAuth", "Gemini".
6. **On-screen text:** add the title/logo at start, "DRAFT — you approve in Xero" label in scenes 5–6, and "fastwrite.tech" at the end.
7. **Export:** 1080p → MP4. Save to disk.

---

## F. After export

- **Hosting:** Xero listings typically take a **YouTube or Vimeo link** for the demo video. Upload as **Unlisted** on YouTube and use that URL. (Verify exact requirement in the Xero submission portal before submitting.)
- **Commit** the final script + this guide to git (currently uncommitted, branch `master`). Do NOT commit the video binary — host it externally and keep only the link.
- Update the Master Doc (next version) once the video is recorded.

---

*Draft v1 — companion to demo_video_script.md.*
