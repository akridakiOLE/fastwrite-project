# FastWrite — Pre-Tester Punchlist

**Σκοπός:** οριστική λίστα ΟΛΩΝ των εκκρεμοτήτων πριν στείλουμε προσκλήσεις σε testers.
Πηγές: v33 §6/§8, bug list v31/v32 (B5-B9), και το **πρώτο πραγματικό desktop test (19/6, 200 τιμολόγια)**.
**Κατάσταση: ΔΕΝ είμαστε έτοιμοι** — βλ. P0.

---

## Definition of Ready for Testers (το gate)

Στέλνουμε πρόσκληση ΜΟΝΟ όταν, με το **δικό μας 200-invoice demo file** σε καθαρό build:
1. Register documents: **200/200**, **0 Failed**, **0 κενά** Προμηθευτή/Ετικέτας.
2. Η μπάρα προόδου κινείται **από την αρχή** (όχι «νεκρή»).
3. Batch: όλα extracted, money/invoice_number 100%.
4. Smoke test με **AQ key** καθαρό (Register + Batch end-to-end).
5. Ενδεικτικοί χρόνοι (Register + Batch) μετρημένοι και γραμμένοι στον οδηγό.

---

## P0 — BLOCKER (μπλοκάρει κάθε πρόσκληση)

- [ ] **B10 (ΝΕΟ) — Registration correctness στα 200.** Docs «Failed» + κενά Προμηθευτής/Ετικέτα (screenshots 2753-2759). Το diag δοκίμασε ΜΟΝΟ extraction (Pass 2)· το registration (Pass 1: segmentation + auto-match) δεν δοκιμάστηκε ποτέ μετρημένα. **Root-cause next:** (α) retry coverage σε transient 429/503/timeout στο registration path (το B8 κάλυψε extraction), (β) auto-match εξάρτηση από supplier detection — αν αποτύχει, δεν μπαίνει label.
- [ ] **Beta artifact rebuild → release `beta-v2` → redeploy.** Το διανεμόμενο .exe (9 Ιουν) δεν έχει το AQ fix. **ΣΗΜΑΝΤΙΚΟ:** να γίνει ΜΙΑ φορά, ΑΦΟΥ μπουν ΟΛΕΣ οι P0/P1 διορθώσεις (όχι τώρα — μη σπαταλήσουμε rebuild).
- [ ] **Clean smoke test** με AQ key: Register + Batch χωρίς Failed/κενά.

## P1 — Πρώτη εντύπωση (fix πριν την πρόσκληση)

- [ ] **B6 — Progress bar «νεκρή» ~1'10''.** Το v32 παραλληλοποίησε το segmentation αλλά το «live progress από την αρχή» δεν ολοκληρώθηκε. Σε 3λεπτη διαδικασία = «κόλλησε». Live counts («Detected 47/200»).
- [ ] **Demo 200-file ως μέρος του test** (η εισήγησή σου). Bundle `samples/FastWrite_Benchmark_200_Invoices.pdf` στο build + προτροπή στον οδηγό. **Εξαρτάται από B10** (κάθε tester θα το τρέξει → πρέπει να δουλεύει άψογα). Θέση: «δείγμα εικονικών τιμολογίων».

## P2 — Σημαντικά, όχι first-impression-fatal

- [ ] **UI polish — scrollbar + στήλη #** (v33 §6.7, screenshot 2746 σημεία 1/2 «δεν είναι εμφανή»).
- [ ] **Registration speed ~3'.** Κυρίως οι AI κλήσεις του segmentation (render @150 DPI ~27s· τα υπόλοιπα ~150s = Pass 1). Optimize ΜΕΤΑ τη σωστότητα (B10).
- [ ] **Setup guide:** billing note (paid key, όχι free — rate-limited) + ενδεικτικοί χρόνοι (περιμένουν τη μέτρηση Batch).

## P3 — Deferred (όχι για πρώτους testers / μετά Α' Μέρους)

- [ ] **Multi-invoice N=5 wiring** στο batch path (phase 2· θέλει fallback: αν matched<N ή truncation → re-extract single).
- [ ] **Usage tier check** (Tier 2/3 RPM).
- [ ] **Code signing / Inno Setup** (SmartScreen) — ο οδηγός το καλύπτει προσωρινά.
- [ ] **B5 — License vs subscription counter** (billing leak σε paid tiers). Admin-exempt τώρα· μετράει πριν **paid** πελάτες, όχι free beta.
- [ ] **Test suite cleanup** — 4 known failures (test_aq live key, test_xero expectation, 2× Windows perm).
- [ ] Mac build, QuickBooks, AI assistant Phase 1.
- [ ] **Commit pending:** `worker.js` (beta-v2) + τα 4 αρχεία της προηγ. συνεδρίας (setup guide, version_info, fastwrite.spec, build_desktop.bat).

---

## Προτεινόμενη σειρά (ΕΝΑΣ καθαρός κύκλος)

1. Root-cause **B10** (διάβασμα registration/auto-match κώδικα) → διόρθωση.
2. Διόρθωση **B6** (live progress).
3. Διόρθωση **P2 UI** (scrollbar + #).
4. Bundle demo file + setup guide (billing note).
5. `build_desktop.bat` → **clean smoke + 200-file test** (το gate παραπάνω) → μέτρηση χρόνων.
6. Χρόνοι στον οδηγό → rebuild final → release `beta-v2` → `wrangler deploy`.
7. Commit (specific files) → πρώτες προσκλήσεις.

**Επόμενο βήμα:** root-cause του B10 (γιατί Failed + κενά labels) — διαβάζω `batch_processor.py` + `main_api.py` registration path.
