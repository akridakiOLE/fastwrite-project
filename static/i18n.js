/**
 * FastWrite i18n — Lightweight translation engine
 * Supports: el (Greek, default), en (English) + extensible
 * Detection: URL ?lang= > localStorage > browser language > el
 */

const I18N = {
  currentLang: 'el',
  translations: {
    el: {
      // ── Sidebar ──
      sidebar_main_menu: 'ΚΥΡΙΟ ΜΕΝΟΥ',
      sidebar_dashboard: 'Dashboard',
      sidebar_upload: 'Upload & Extract',
      sidebar_documents: 'Έγγραφα',
      sidebar_settings_group: 'ΡΥΘΜΙΣΕΙΣ',
      sidebar_labels: 'Ετικέτες',
      sidebar_settings: 'Ρυθμίσεις',
      sidebar_help: 'Βοήθεια',
      sidebar_connecting: 'Σύνδεση...',
      sidebar_connected: 'Διαθέσιμο',
      sidebar_logout: '⏻ Έξοδος',
      legal_link: 'Όροι & Απόρρητο',

      // ── Dashboard ──
      page_dashboard: 'Dashboard',
      stat_total: 'Σύνολο Εγγράφων',
      stat_completed: 'Ολοκληρωμένα',
      stat_pending: 'Σε Αναμονή',
      stat_failed: 'Αποτυχημένα',
      dashboard_refresh: '↻ Ανανέωση',
      dashboard_refresh_hint: 'Ανανέωση στατιστικών Dashboard σε πραγματικό χρόνο',
      donut_title: 'Κατανομή Εγγράφων',
      donut_total: 'Σύνολο',
      donut_completed: 'Ολοκληρωμένα',
      donut_pending: 'Σε Αναμονή',
      donut_failed: 'Αποτυχημένα',
      activity_title: 'Πρόσφατη Δραστηριότητα',
      activity_empty: 'Δεν υπάρχει πρόσφατη δραστηριότητα',
      activity_loading: 'Φόρτωση...',

      // ── Upload ──
      page_upload: 'Upload & Extract',
      upload_step1: 'Ανεβάστε PDF',
      upload_step2: 'Ορίστε Ετικέτες',
      upload_step3: 'Εξαγωγή Batch',
      upload_batch_title: '📦 Batch (Πολλαπλά Τιμολόγια)',
      upload_zone_title: 'PDF με πολλαπλά τιμολόγια',
      upload_zone_sub: 'Έως 200 τιμολόγια ανά αρχείο',
      upload_register_btn: 'Καταγραφή Εγγράφων',
      upload_register_hint: 'Ανεβάστε PDF και ξεκινήστε αυτόματη εξαγωγή δεδομένων με AI',
      upload_processing: 'Επεξεργασία...',
      upload_automatch_hint: 'ℹ Χρησιμοποιείται μόνο αν το Auto Match δεν βρει ετικέτα',

      // ── Documents ──
      page_documents: 'Έγγραφα',
      docs_labels_btn: '🏷 Ετικέτες',
      docs_labels_hint: 'Άνοιγμα επεξεργαστή ετικετών για ταξινόμηση και ομαδοποίηση εγγράφων',
      docs_batch_btn: '⚡ Batch',
      docs_batch_hint: 'Μαζική επεξεργασία πολλαπλών εγγράφων ταυτόχρονα (Batch Processing)',
      docs_approval_btn: '✓ Έγκριση',
      docs_approval_hint: 'Έλεγχος και έγκριση εξαγόμενων δεδομένων πριν την εξαγωγή',
      docs_csv_hint: 'Εξαγωγή επιλεγμένων εγγράφων σε μορφή CSV',
      docs_xlsx_hint: 'Εξαγωγή επιλεγμένων εγγράφων σε μορφή Excel (XLSX)',
      docs_lineitems_hint: 'Εξαγωγή αναλυτικών γραμμών (line items) σε Excel για λογιστική χρήση',
      docs_search_placeholder: '🔍 Αναζήτηση σε όλα τα πεδία...',
      docs_clear_filters: '✕ Καθαρισμός Φίλτρων',
      docs_clear_filters_hint: 'Καθαρίστε όλα τα φίλτρα αναζήτησης και εμφανίστε όλα τα έγγραφα',
      docs_delete_hint: 'Διαγραφή επιλεγμένων',
      docs_th_file: 'ΑΡΧΕΙΟ',
      docs_th_labels: 'ΕΤΙΚΕΤΕΣ',
      docs_th_supplier: 'ΠΡΟΜΗΘΕΥΤΗΣ / ΠΩΛΗΤΗΣ',
      docs_th_pct: 'ΠΟΣΟΣΤΟ',
      docs_th_status: 'ΚΑΤΑΣΤΑΣΗ',
      docs_th_batch: 'BATCH',
      docs_th_date: 'ΚΑΤΑΧΩΡΗΣΗ',
      docs_filter_all: 'ΟΛΑ',
      docs_filter_pending: 'Εκκρεμεί',
      docs_filter_approved: 'Εγκρίθηκε',
      docs_filter_completed: 'Ολοκληρώθηκε',
      docs_filter_from: 'Από',
      docs_filter_to: 'Μέχρι',
      docs_pct_placeholder: 'Ποσοστό...',

      // ── Templates ──
      page_templates: 'Ετικέτες',
      tpl_new_btn: '+ Νέα Ετικέτα',
      tpl_new_hint: 'Δημιουργία νέας ετικέτας για εξαγωγή δεδομένων από συγκεκριμένο τύπο εγγράφου',
      tpl_search_name: '🔍 Ετικέτα...',
      tpl_search_supplier: '🏢 Προμηθευτής Πωλητής...',
      tpl_clear_btn: '✕ Καθαρισμός',
      tpl_clear_hint: 'Καθαρισμός φίλτρων αναζήτησης ετικετών',

      // ── Template Modal ──
      tpl_modal_title: 'Νέα Ετικέτα',
      tpl_modal_name: 'Ετικέτα',
      tpl_modal_name_placeholder: 'π.χ. invoice_dei, cosmote_receipt...',
      tpl_modal_supplier: '🏢 Προμηθευτής Πωλητής',
      tpl_modal_supplier_note: '(λέξεις-κλειδιά προμηθευτή, π.χ. ΔΕΗ, DEI, δεη)',
      tpl_modal_supplier_placeholder: 'π.χ. cosmote, ote, κοσμοτε — πολλαπλές με κόμμα',
      tpl_modal_add_field: '+ Προσθήκη Πεδίου',
      tpl_modal_add_field_hint: 'Προσθήκη νέου πεδίου εξαγωγής στην ετικέτα',
      tpl_modal_add_array: '+ Array Line Items',
      tpl_modal_add_array_hint: 'Προσθήκη πίνακα γραμμών (line items) στην ετικέτα — για τιμολόγια με πολλές γραμμές',
      tpl_modal_add_column: '+ Προσθήκη στήλης',
      tpl_modal_paste: 'Επικόλληση',
      tpl_modal_paste_hint: 'Επικόλληση ετικέτας από clipboard',

      // ── Settings ──
      page_settings: 'Ρυθμίσεις',
      settings_account_title: '👤 Λογαριασμός',
      settings_change_username: '👤 Αλλαγή Username',
      settings_new_username: 'Νέο username',
      settings_new_username_placeholder: 'Τουλάχιστον 3 χαρακτήρες...',
      settings_password_confirm: 'Κωδικός (για επιβεβαίωση)',
      settings_password_placeholder: 'Εισήγαγε τον κωδικό σου...',
      settings_show_hide: 'Εμφάνιση/Απόκρυψη',
      settings_change_username_btn: 'Αλλαγή Username',
      settings_change_username_hint: 'Αποθήκευση νέου username — απαιτείται κωδικός επιβεβαίωσης',
      settings_change_password: '🔒 Αλλαγή Κωδικού',
      settings_current_password: 'Τρέχων κωδικός',
      settings_current_password_placeholder: 'Εισήγαγε τον τρέχοντα κωδικό...',
      settings_new_password: 'Νέος κωδικός',
      settings_new_password_placeholder: 'Τουλάχιστον 6 χαρακτήρες...',
      settings_confirm_password: 'Επιβεβαίωση νέου κωδικού',
      settings_confirm_password_placeholder: 'Επανάλαβε τον νέο κωδικό...',
      settings_change_password_btn: 'Αλλαγή Κωδικού',
      settings_change_password_hint: 'Αποθήκευση νέου κωδικού — ελάχιστοι 6 χαρακτήρες',
      settings_change_email: '📧 Αλλαγή Email',
      settings_new_email: 'Νέο email',
      settings_new_email_placeholder: 'π.χ. user@example.com',
      settings_change_email_btn: 'Αλλαγή Email',
      settings_change_email_hint: 'Αποθήκευση νέου email επικοινωνίας',
      settings_2fa_title: '🛡️ Ταυτοποίηση 2 Βημάτων (2FA)',
      settings_2fa_desc: 'Προσθέστε ένα επιπλέον επίπεδο ασφάλειας στον λογαριασμό σας. Θα χρειάζεστε μια εφαρμογή Authenticator (π.χ. Google Authenticator, Authy).',
      settings_2fa_enable: 'Ενεργοποίηση 2FA',
      settings_2fa_enable_hint: 'Ξεκινήστε ρύθμιση 2FA — θα χρειαστείτε εφαρμογή Authenticator',
      settings_2fa_step1: '1. Σαρώστε το QR code με την εφαρμογή Authenticator σας:',
      settings_2fa_manual: 'Ή εισάγετε χειροκίνητα:',
      settings_2fa_step2: '2. Εισάγετε τον 6ψήφιο κωδικό από την εφαρμογή:',
      settings_2fa_verify: 'Επαλήθευση & Ενεργοποίηση',
      settings_2fa_verify_hint: 'Επιβεβαίωση κωδικού και ενεργοποίηση 2FA',
      settings_2fa_cancel: 'Ακύρωση',
      settings_2fa_cancel_hint: 'Ακύρωση ρύθμισης 2FA',
      settings_2fa_active: '✅ Το 2FA είναι ενεργοποιημένο. Ο λογαριασμός σας είναι προστατευμένος.',
      settings_2fa_disable_label: 'Για απενεργοποίηση, εισάγετε τον κωδικό σας:',
      settings_2fa_password_placeholder: 'Κωδικός λογαριασμού...',
      settings_2fa_disable: 'Απενεργοποίηση 2FA',
      settings_2fa_disable_hint: 'Απενεργοποίηση 2FA — θα χρειαστεί εκ νέου ρύθμιση αν ξαναενεργοποιηθεί',
      settings_api_title: '🔑 API Keys',
      settings_api_provider: 'Παροχέας',
      settings_api_provider_gemini: 'Gemini (Google)',
      settings_api_provider_openai: 'OpenAI',
      settings_api_provider_claude: 'Claude (Anthropic)',
      settings_api_provider_mistral: 'Mistral',
      settings_api_key_label: 'API Key',
      settings_api_key_placeholder: 'Εισήγαγε το API key...',
      settings_api_save: 'Αποθήκευση Key',
      settings_api_save_hint: 'Αποθήκευση κλειδιού AI — κρυπτογραφείται με Fernet encryption',
      settings_system_title: '⚙️ Πληροφορίες Συστήματος',
      settings_users_title: '👥 Διαχείριση Χρηστών',
      settings_users_search: 'Αναζήτηση χρήστη (username ή email)...',

      // ── Help / FAQ ──
      page_help: 'Βοήθεια & Συχνές Ερωτήσεις',
      help_system_title: '📋 Περιγραφή Συστήματος',
      help_system_desc1: 'Το FastWrite είναι ένα τοπικό εργαλείο αυτόματης εξαγωγής δεδομένων από έγγραφα (τιμολόγια, αποδείξεις, παραστατικά) με χρήση τεχνητής νοημοσύνης (AI). Λειτουργεί αποκλειστικά στον δικό σας υπολογιστή — τα δεδομένα σας δεν κοινοποιούνται σε κανέναν, ούτε στον διαχειριστή της πλατφόρμας.',
      help_system_desc2: 'Τι κάνει: Ανεβάζετε ένα PDF με ένα ή πολλαπλά τιμολόγια. Το σύστημα αναγνωρίζει αυτόματα κάθε ξεχωριστό τιμολόγιο, εντοπίζει τον προμηθευτή, αντιστοιχεί την κατάλληλη ετικέτα και εξάγει τα δεδομένα που εσείς ορίσατε (αριθμός τιμολογίου, ημερομηνία, ποσά, γραμμές ειδών κ.λπ.). Τέλος, εξάγετε τα αποτελέσματα σε CSV ή Excel.',
      help_workflow_title: '🔄 Ροή Εργασίας — Βήμα προς Βήμα',
      help_step1_title: 'Ρύθμιση API Key',
      help_step1_desc: 'Πηγαίνετε στις Ρυθμίσεις → API Keys και εισάγετε το δικό σας κλειδί AI (π.χ. Google Gemini). Αυτό είναι υποχρεωτικό — η πλατφόρμα δεν παρέχει δικό της κλειδί. Η χρέωση γίνεται απευθείας στον δικό σας λογαριασμό AI.',
      help_step2_title: 'Ανέβασμα Εγγράφων',
      help_step2_desc: 'Πηγαίνετε στο Upload & Extract. Σύρετε ή επιλέξτε ένα PDF αρχείο (μέχρι 200 τιμολόγια ανά αρχείο) και πατήστε "Καταγραφή Εγγράφων". Το σύστημα αναγνωρίζει αυτόματα τα ξεχωριστά τιμολόγια και τους προμηθευτές.',
      help_step3_title: 'Δημιουργία Ετικετών',
      help_step3_desc: 'Από τη σελίδα Έγγραφα, επιλέξτε ένα ή περισσότερα έγγραφα και πατήστε "Ετικέτες". Θα μεταφερθείτε σε ειδική σελίδα όπου βλέπετε το πραγματικό τιμολόγιο αριστερά και τη φόρμα ετικέτας δεξιά. Ορίστε τα πεδία που θέλετε να εξαχθούν (π.χ. αριθμός τιμολογίου, ημερομηνία, σύνολο, ΦΠΑ) και τις γραμμές ειδών (line items). Εναλλακτικά, δημιουργήστε ετικέτα από τη σελίδα Ετικέτες → + Νέα Ετικέτα.',
      help_step4_title: 'Εξαγωγή Δεδομένων (Batch)',
      help_step4_desc: 'Από τη σελίδα Έγγραφα, επιλέξτε τα έγγραφα και πατήστε "Batch". Το σύστημα χρησιμοποιεί AI για να εξάγει τα δεδομένα βάσει της ετικέτας κάθε εγγράφου. Τα αποτελέσματα εμφανίζονται στον πίνακα εγγράφων.',
      help_step5_title: 'Έλεγχος & Έγκριση',
      help_step5_desc: 'Από τη σελίδα Έγγραφα, επιλέξτε τα έγγραφα και πατήστε "Έγκριση". Βλέπετε το τιμολόγιο αριστερά και τα εξαγόμενα δεδομένα δεξιά. Διορθώστε τυχόν λάθη και πατήστε "Έγκριση Τιμολογίου". Η highlight sync τονίζει στο έγγραφο κάθε γραμμή που περνάτε τον κέρσορα.',
      help_step6_title: 'Εξαγωγή Αρχείων',
      help_step6_desc: 'Αφού εγκρίνετε τα έγγραφα, επιστρέψτε στη σελίδα Έγγραφα. Επιλέξτε τα εγκεκριμένα έγγραφα και πατήστε "CSV", "XLSX" ή "Line Items XLSX" για εξαγωγή σε αρχείο. Αν δεν επιλέξετε κανένα, εξάγονται όλα τα εγκεκριμένα.',
      help_tip_title: '💡 Συμβουλή',
      help_tip_text: 'Η σωστή σειρά είναι: Ανέβασμα → Ετικέτες → Batch → Έγκριση → Εξαγωγή. Δημιουργήστε πρώτα ετικέτες για κάθε τύπο τιμολογίου (π.χ. ΔΕΗ, COSMOTE, VODAFONE) και μετά ξεκινήστε τη μαζική εξαγωγή. Μόλις δημιουργήσετε μια ετικέτα, το σύστημα αντιστοιχεί αυτόματα τα νέα τιμολόγια του ίδιου προμηθευτή.',
      help_faq_title: '❓ Συχνές Ερωτήσεις',
      help_faq_search: '🔍 Αναζήτηση ερώτησης...',

      // FAQ categories
      faq_cat_dashboard: '📊 Dashboard',
      faq_cat_upload: '📤 Upload & Extract (Καταγραφή Τιμολογίων)',
      faq_cat_docs: '📄 Έγγραφα',
      faq_cat_labels: '🏷 Ετικέτες (Templates)',
      faq_cat_approval: '✅ Έγκριση',
      faq_cat_settings: '⚙️ Ρυθμίσεις & Λογαριασμός',
      faq_cat_security: '🔒 Ασφάλεια & Ιδιωτικότητα',
      faq_cat_general: '❓ Γενικά',

      // ── Label Editor ──
      le_page_title: 'Καταγραφή Εγγράφων',
      le_back: '← Πίσω',
      le_back_hint: 'Επιστροφή στη σελίδα Εγγράφων',
      le_docs_hint: 'Εμφάνιση λίστας επιλεγμένων εγγράφων για επεξεργασία',
      le_docs_header: 'ΕΠΙΛΕΓΜΕΝΑ ΕΓΓΡΑΦΑ',
      le_labels_btn: '🏷 Ετικέτες ▼',
      le_labels_hint: 'Εμφάνιση υφιστάμενων ετικετών — επιλέξτε ή διαγράψτε',
      le_labels_header: 'ΥΦΙΣΤΑΜΕΝΕΣ ΕΤΙΚΕΤΕΣ',
      le_panel_btn: '🏷 Πίνακας',
      le_panel_hint: 'Εμφάνιση/Απόκρυψη πλαϊνού πίνακα ετικέτας',
      le_prev: '← Προηγ.',
      le_prev_hint: 'Μετάβαση στο προηγούμενο έγγραφο',
      le_next: 'Επόμ. →',
      le_next_hint: 'Μετάβαση στο επόμενο έγγραφο',
      le_clear: 'Καθαρισμός',
      le_clear_hint: 'Καθαρισμός φόρμας — ξεκινήστε νέα ετικέτα από την αρχή',
      le_new_label: '🏷 Νέα Ετικέτα',
      le_add_array: '+ Array Line Items',
      le_add_array_hint: 'Προσθήκη πίνακα γραμμών (line items) στην ετικέτα — για τιμολόγια με πολλές γραμμές',

      // ── Approval ──
      ap_page_title: 'Έγκριση Εγγράφων',
      ap_back: '← Πίσω',
      ap_back_hint: 'Επιστροφή στη σελίδα Εγγράφων',
      ap_docs_hint: 'Εμφάνιση λίστας εγγράφων προς έγκριση',
      ap_docs_header: 'ΕΓΓΡΑΦΑ ΠΡΟΣ ΕΓΚΡΙΣΗ',
      ap_prev: '← Προηγ.',
      ap_prev_hint: 'Μετάβαση στο προηγούμενο έγγραφο προς έγκριση',
      ap_next: 'Επόμ. →',
      ap_next_hint: 'Μετάβαση στο επόμενο έγγραφο προς έγκριση',
      ap_sidebar_toggle: 'Εμφάνιση/Απόκρυψη μενού',
      ap_scalar_title: 'Γενικά Στοιχεία',
      ap_scalar_hide: '▲ Απόκρυψη',
      ap_scalar_show: '▼ Εμφάνιση',
      ap_line_items: 'LINE ITEMS',

      // ── Template Builder ──
      tb_page_title: 'Template Builder',
      tb_back: '← Πίσω',
      tb_back_hint: 'Επιστροφή στη σελίδα Εγγράφων',
      tb_doc_info: '📄 Πληροφορίες Εγγράφου',
      tb_extracted: '📊 Εξαγόμενα Δεδομένα',
      tb_select_extract: '🔧 Επιλογή Template & Εξαγωγή',
      tb_template_label: 'Template',
      tb_extract_btn: 'Εξαγωγή Δεδομένων',
      tb_extract_hint: 'Εκτέλεση AI εξαγωγής δεδομένων με το επιλεγμένο template',
      tb_new_template: '+ Δημιουργία Νέου Template',
      tb_label: 'Ετικέτα',
      tb_label_placeholder: 'π.χ. invoice, receipt...',
      tb_supplier: '🏢 Προμηθευτής Πωλητής',
      tb_supplier_placeholder: 'π.χ. cosmote, ote — πολλαπλές με κόμμα',
      tb_add_field: '+ Προσθήκη Πεδίου',
      tb_add_field_hint: 'Προσθήκη νέου πεδίου εξαγωγής στο template',
      tb_save: 'Αποθήκευση Template',
      tb_save_hint: 'Αποθήκευση template — θα χρησιμοποιηθεί για μελλοντικές εξαγωγές',

      // ── Document Modal ──
      modal_doc_title: 'Λεπτομέρειες Εγγράφου',

      // ── Time expressions ──
      time_just_now: 'Μόλις τώρα',
      time_minutes_ago: '{n} λεπτά πριν',
      time_hour_ago: '{n} ώρα πριν',
      time_hours_ago: '{n} ώρες πριν',
      time_day_ago: '{n} ημέρα πριν',
      time_days_ago: '{n} ημέρες πριν',

      // ── JS Dynamic content ──
      js_uploading: 'Ανέβασμα...',
      js_batch_upload: '📤 Batch Upload',
      js_upload_menu: '📤 Ανέβασμα',
      js_registration_done: 'Ολοκληρώθηκε η καταγραφή των εγγράφων. Παρακαλώ μετακινηθείτε στην σελίδα **Έγγραφα** για να ολοκληρώσετε τη διαδικασία.',
      js_continue_docs: 'Για να ολοκληρώσετε τις διαδικασίες συνεχίστε στην σελίδα **Έγγραφα**',
      js_continue_extraction: 'Αν θέλετε να συνεχίσετε την διαδικασία και να ολοκληρώσετε την εξαγωγή δεδομένων από το σύστημα παρακαλώ μετακινηθείτε στην σελίδα **Έγγραφα**',
      js_docs_label: 'Έγγραφα:',
      js_no_template: 'Έγγραφα χωρίς ετικέτα',
      js_no_approval: 'Έγγραφα χωρίς έγκριση',
      js_with_approval: 'Έγγραφα με έγκριση',
      js_upload_preview: 'Ανέβασμα για προεπισκόπηση...',
      js_upload_file: 'Ανέβασμα αρχείου...',
      js_invoices: 'τιμολόγια',

      // ── JS Messages (toast, confirm, dynamic) ──
      js_no_recent_activity: 'Δεν υπάρχει πρόσφατη δραστηριότητα',
      js_all: 'ΟΛΑ',
      js_no_docs_found: 'Δεν βρέθηκαν έγγραφα',
      js_delete_doc_confirm: 'Διαγραφή εγγράφου #{id};',
      js_doc_deleted: 'Έγγραφο διαγράφηκε',
      js_select_docs_first: 'Επιλέξτε έγγραφα πρώτα',
      js_delete_selected_confirm: 'Διαγραφή {n} επιλεγμένων εγγράφων;',
      js_docs_deleted: '{n} έγγραφα διαγράφηκαν',
      js_n_selected: '{n} επιλεγμένα',
      js_exporting: 'Εξαγωγή {label}...',
      js_download_success: '✓ {name} κατεβαίνει!',
      js_export_error: 'Σφάλμα εξαγωγής: ',
      js_template_fallback: 'Template Fallback (για Auto Match)',
      js_select_pdf_first: 'Επίλεξε PDF πρώτα',
      js_registration_progress: '<span class="spinner"></span> Καταγραφή σε εξέλιξη...',
      js_register_documents: 'Καταγραφή Εγγράφων',
      js_registration_started: 'Καταγραφή ξεκίνησε!',
      js_check_required: 'Απαιτείται Έλεγχος',
      js_follow_register_first: 'Ακολουθήστε πρώτα την διαδικασία <b>Καταγραφή Εγγράφων</b>',
      js_ok: 'Εντάξει',
      js_template_required: 'Απαιτείται Δημιουργία Template',
      js_no_template_for_supplier: 'Δεν βρέθηκε template για τον προμηθευτή αυτού του τιμολογίου',
      js_select_file_first: 'Επίλεξε αρχείο πρώτα',
      js_select_label: 'Επίλεξε ετικέτα',
      js_uploading_spinner: '<span class="spinner"></span> Ανέβασμα...',
      js_extract_data_btn: 'Εξαγωγή Δεδομένων',
      js_extracting_ai: '<span class="spinner"></span> Εξαγωγή AI...',
      js_extraction_success: '✓ Επιτυχής Εξαγωγή',
      js_extraction_done: 'Εξαγωγή ολοκληρώθηκε!',
      js_extraction_error: 'Σφάλμα εξαγωγής',
      js_select_label_or_auto: 'Επίλεξε ετικέτα ή ενεργοποίησε το Auto Template Matching',
      js_no_labels_create: 'Δεν υπάρχουν ετικέτες. Δημιούργησε πρώτα μια ετικέτα.',
      js_analyzing_file: '<span class="spinner"></span> Ανάλυση αρχείου...',
      js_start_batch: 'Έναρξη Batch',
      js_file_analysis_error: 'Σφάλμα ανάλυσης αρχείου',
      js_batch_started: 'Batch ξεκίνησε!',
      js_register_done: '✓ Καταγραφή ολοκληρώθηκε: {n} έγγραφα',
      js_batch_done: '✓ Batch ολοκληρώθηκε: {n} έγγραφα',
      js_process_failed: '✕ Η διαδικασία απέτυχε',
      js_process_complete: 'Ολοκλήρωση Διαδικασίας',
      js_register_complete: 'Καταγραφή Εγγράφων',
      js_batch_complete: 'Ολοκλήρωση Batch',
      js_no_results_found: 'Δεν βρέθηκαν αποτελέσματα',
      js_loading_error: 'Σφάλμα φόρτωσης',
      js_results_title: 'Αποτελέσματα — ',
      js_select_docs_checkbox: 'Επιλέξτε έγγραφα πρώτα (checkbox ή φίλτρα)',
      js_batch_export_title: 'Εξαγωγή Δεδομένων (Batch)',
      js_export_progress: 'Εξαγωγή σε εξέλιξη...',
      js_no_fields: 'Δεν υπάρχουν πεδία',
      js_no_rows: 'Δεν υπάρχουν γραμμές',
      js_rows: ' γραμμές',
      js_row_of: 'Γραμμή {current} / {total}',
      js_hide: '▲ Απόκρυψη',
      js_show: '▼ Εμφάνιση',
      js_save_error: 'Σφάλμα αποθήκευσης: ',
      js_approved: 'Εγκρίθηκε!',
      js_approve_done: '✓ Εγκρίθηκε',
      js_approving: 'Έγκριση...',
      js_approve_invoice: '✓ Έγκριση Τιμολογίου',
      js_no_labels: 'Δεν υπάρχουν ετικέτες',
      js_label_loaded: 'Ετικέτα "{name}" φορτώθηκε',
      js_enter_label_name: 'Γράψε ένα όνομα ετικέτας',
      js_add_at_least_one_field: 'Πρόσθεσε τουλάχιστον ένα πεδίο',
      js_fill_required: 'Συμπλήρωσε τα υποχρεωτικά πεδία',
      js_label_saved: 'Ετικέτα "{name}" αποθηκεύτηκε!',
      js_saved_continue: 'Αποθηκεύτηκε! Μπορείτε να συνεχίσετε ή να πατήσετε Πίσω.',
      js_no_labels_found: 'Δεν βρέθηκαν ετικέτες',
      js_create_first_label: 'Δημιούργησε την πρώτη σου ετικέτα',
      js_new_template: 'Νέο Template',
      js_save_template: 'Αποθήκευση Template',
      js_template_load_error: 'Σφάλμα φόρτωσης template',
      js_edit_template: '✏️ Επεξεργασία: ',
      js_save_changes: 'Αποθήκευση Αλλαγών',
      js_copied: '📋 Αντιγράφηκε: ',
      js_no_copied_template: 'Δεν υπάρχει αντιγραμμένο template',
      js_pasted: '📋 Επικολλήθηκε: ',
      js_enter_template_name: 'Εισήγαγε όνομα template',
      js_template_renamed: 'Template μετονομάστηκε σε "{name}"!',
      js_template_updated: 'Template ενημερώθηκε!',
      js_template_saved: 'Template αποθηκεύτηκε!',
      js_delete_template_confirm: 'Διαγραφή template "{name}"; Θα ενημερωθούν τα αποτελέσματα του ιστορικού.',
      js_template_deleted: 'Template διαγράφηκε',
      js_history_updated: 'Ενημερώθηκαν {n} εγγραφές ιστορικού',
      js_delete_error: 'Σφάλμα κατά τη διαγραφή',
      js_fill_username_pass: 'Συμπλήρωσε username και κωδικό',
      js_username_min: 'Το username πρέπει να έχει τουλάχιστον 3 χαρακτήρες',
      js_username_changed: 'Το username άλλαξε επιτυχώς!',
      js_username_error: 'Σφάλμα αλλαγής username',
      js_fill_all_fields: 'Συμπλήρωσε όλα τα πεδία',
      js_passwords_mismatch: 'Οι κωδικοί δεν ταιριάζουν',
      js_password_min: 'Ο κωδικός πρέπει να έχει τουλάχιστον 6 χαρακτήρες',
      js_password_changed: 'Ο κωδικός άλλαξε επιτυχώς!',
      js_password_error: 'Σφάλμα αλλαγής κωδικού',
      js_fill_email_pass: 'Συμπλήρωσε email και κωδικό',
      js_invalid_email: 'Μη έγκυρη μορφή email',
      js_email_updated: 'Το email ενημερώθηκε!',
      js_email_error: 'Σφάλμα αλλαγής email',
      js_2fa_status_active: 'Κατάσταση: Ενεργό',
      js_2fa_status_inactive: 'Κατάσταση: Ανενεργό',
      js_enter_6digit: 'Εισάγετε 6ψήφιο κωδικό',
      js_2fa_enabled: '2FA ενεργοποιήθηκε!',
      js_2fa_verify_error: 'Σφάλμα επαλήθευσης',
      js_enter_password: 'Εισάγετε τον κωδικό σας',
      js_2fa_disabled: '2FA απενεργοποιήθηκε',
      js_users_total: 'χρήστες συνολικά',
      js_users_active: 'ενεργοί',
      js_active: 'Ενεργός',
      js_inactive: 'Ανενεργός',
      js_you: '(εσύ)',
      js_deactivate: 'Απενεργ.',
      js_activate: 'Ενεργοπ.',
      js_no_email: 'Χωρίς email',
      js_user_activated: 'Ο χρήστης ενεργοποιήθηκε',
      js_user_deactivated: 'Ο χρήστης απενεργοποιήθηκε',
      js_role_changed: 'Ο ρόλος άλλαξε σε {role}',
      js_enter_api_key: 'Εισήγαγε API key',
      js_key_saved: 'Key αποθηκεύτηκε!',
      js_page_of: 'Σελίδα {current} / {total}',
      js_file_analysis_title: 'Ανάλυση Αρχείου',
      js_file_analysis_progress: 'Ανάλυση αρχείου σε εξέλιξη...',
      js_segmentation: 'Segmentation & ανίχνευση προμηθευτών',
      js_unknown_error: 'Άγνωστο σφάλμα',
      js_template_builder_title: 'Template Builder — ',
      js_doc_hash: 'Έγγραφο #',
      js_no_labels_available: '— Δεν υπάρχουν ετικέτες —',
      js_doc_not_found: 'Δεν βρέθηκε έγγραφο',
      js_template_saved_history: 'Template αποθηκεύτηκε! Ενημερώθηκαν {n} εγγραφές ιστορικού',
      js_upload_error: 'Σφάλμα ανεβάσματος',
      js_view: 'Προβολή',
      js_delete: 'Διαγραφή',
      js_extracted_data: 'Εξαγόμενα Δεδομένα',
      js_no_extracted_data: 'Δεν υπάρχουν εξαγόμενα δεδομένα.',
      js_doc_image_not_found: 'Δεν βρέθηκε εικόνα εγγράφου',
      js_doc_label: 'Έγγραφο',
      js_activity_upload: '📤 Ανέβασμα',
      js_activity_register: '📝 Καταγραφή',
      js_activity_approve: '✅ Έγκριση',
      js_activity_delete: '🗑 Διαγραφή',
      js_already_completed: 'Ήδη ολοκληρωμένα: ',
      js_without_label: 'Χωρίς ετικέτα: ',
      js_failures: 'Αποτυχίες: ',

      // ── Status labels ──
      status_pending: 'Εκκρεμεί',
      status_completed: 'Εγκρίθηκε',
      status_failed: 'Αποτυχία',

      // ── Batch phases ──
      phase_analyzing: 'Ανάλυση σελίδων...',
      phase_detecting: 'Εντοπισμός τιμολογίων...',
      phase_registering: 'Καταγραφή εγγράφων...',
      phase_completed: 'Ολοκληρώθηκε',
      phase_finalizing: 'Οριστικοποίηση...',
      phase_extracting: 'Εξαγωγή δεδομένων...',

      // ── Extra dynamic ──
      js_no_fallback: '— Χωρίς Fallback (μόνο Auto Match) —',
      js_activity_export: '📊 Εξαγωγή',
      js_field: 'Πεδίο',
      js_type: 'Τύπος',
      js_column: 'Στήλη',
      js_field_name_placeholder: 'Όνομα πεδίου',
      js_column_name_placeholder: 'Όνομα στήλης',
      js_total_docs_file: 'Συνολικά έγγραφα αρχείου',
      js_docs_without_label: 'Έγγραφα χωρίς ετικέτα',
      js_docs_without_approval: 'Έγγραφα χωρίς έγκριση',
      js_docs_with_approval: 'Έγγραφα με έγκριση',
      js_pages: 'Σελίδες',
      js_documents: 'έγγραφα',
      js_skipped: 'παραλείφθηκαν',
      js_incomplete_batch: 'Μη Ολοκληρωμένα Batch',
      js_last_update: 'τελευταία ενημέρωση',
      js_all_completed_msg: 'Όλα τα επιλεγμένα έγγραφα έχουν ήδη ολοκληρωθεί.',
      js_no_label_msg: 'Τα επιλεγμένα έγγραφα δεν έχουν ετικέτα. Δημιουργήστε πρώτα ετικέτα.',
      js_no_docs_to_export: 'Δεν υπάρχουν έγγραφα για εξαγωγή. Ελέγξτε ότι έχουν ετικέτα και δεν έχουν ήδη ολοκληρωθεί.',
      js_completed_count: 'Ολοκληρωμένα',
      js_register_label: 'Καταγραφή Εγγράφων',
      js_start_batch_label: 'Έναρξη Batch',
      js_page_abbr: 'σελ.',
      js_fields: 'πεδία',
      js_label_colon: 'Ετικέτα:',
      js_supplier_colon: 'Προμηθευτής:',
      js_edit: '✏️ Επεξεργασία',
      js_copy: '📋 Αντιγραφή',
      js_copy_hint: 'Αντιγραφή template',
      js_unknown_supplier: 'Άγνωστος προμηθευτής',
      js_batch_not_ready: '{n} έγγραφα δεν έχουν ολοκληρώσει Batch. Εκτελέστε πρώτα Batch.',
      js_line_items_cols: '📋 Στήλες Line Items',
      js_add_column: '+ Προσθήκη στήλης',
      js_user_label: 'Χρήστης',
      js_role_label: 'Ρόλος',
      js_email_label_info: 'Email',
      js_registration_date: 'Εγγραφή',
      js_no_email_set: 'Δεν έχει οριστεί',
      js_no_saved_keys: 'Δεν υπάρχουν αποθηκευμένα keys',
      js_file_label: 'Αρχείο:',

      // ── Common ──
      btn_save: 'Αποθήκευση',
      btn_cancel: 'Ακύρωση',
      btn_delete: 'Διαγραφή',
      btn_close: 'Κλείσιμο',
      btn_export: 'Εξαγωγή',
      btn_search: 'Αναζήτηση',
      loading: 'Φόρτωση...',
      error: 'Σφάλμα',
      success: 'Επιτυχία',
      confirm: 'Επιβεβαίωση',
      no_data: 'Δεν υπάρχουν δεδομένα',
      lang_label: 'Γλώσσα',
      lang_el: 'Ελληνικά',
      lang_en: 'English',
    },

    en: {
      // ── Sidebar ──
      sidebar_main_menu: 'MAIN MENU',
      sidebar_dashboard: 'Dashboard',
      sidebar_upload: 'Upload & Extract',
      sidebar_documents: 'Documents',
      sidebar_settings_group: 'SETTINGS',
      sidebar_labels: 'Labels',
      sidebar_settings: 'Settings',
      sidebar_help: 'Help',
      sidebar_connecting: 'Connecting...',
      sidebar_connected: 'Connected',
      sidebar_logout: '⏻ Sign Out',
      legal_link: 'Terms & Privacy',

      // ── Dashboard ──
      page_dashboard: 'Dashboard',
      stat_total: 'Total Documents',
      stat_completed: 'Completed',
      stat_pending: 'Pending',
      stat_failed: 'Failed',
      dashboard_refresh: '↻ Refresh',
      dashboard_refresh_hint: 'Refresh Dashboard statistics in real time',
      donut_title: 'Document Distribution',
      donut_total: 'Total',
      donut_completed: 'Completed',
      donut_pending: 'Pending',
      donut_failed: 'Failed',
      activity_title: 'Recent Activity',
      activity_empty: 'No recent activity',
      activity_loading: 'Loading...',

      // ── Upload ──
      page_upload: 'Upload & Extract',
      upload_step1: 'Upload PDF',
      upload_step2: 'Set Labels',
      upload_step3: 'Batch Export',
      upload_batch_title: '📦 Batch (Multiple Invoices)',
      upload_zone_title: 'PDF with multiple invoices',
      upload_zone_sub: 'Up to 200 invoices per file',
      upload_register_btn: 'Register Documents',
      upload_register_hint: 'Upload PDF and start automatic AI data extraction',
      upload_processing: 'Processing...',
      upload_automatch_hint: 'ℹ Used only if Auto Match does not find a label',

      // ── Documents ──
      page_documents: 'Documents',
      docs_labels_btn: '🏷 Labels',
      docs_labels_hint: 'Open label editor to classify and group documents',
      docs_batch_btn: '⚡ Batch',
      docs_batch_hint: 'Bulk process multiple documents at once (Batch Processing)',
      docs_approval_btn: '✓ Approve',
      docs_approval_hint: 'Review and approve extracted data before export',
      docs_csv_hint: 'Export selected documents as CSV',
      docs_xlsx_hint: 'Export selected documents as Excel (XLSX)',
      docs_lineitems_hint: 'Export detailed line items as Excel for accounting',
      docs_search_placeholder: '🔍 Search all fields...',
      docs_clear_filters: '✕ Clear Filters',
      docs_clear_filters_hint: 'Clear all search filters and show all documents',
      docs_delete_hint: 'Delete selected',
      docs_th_file: 'FILE',
      docs_th_labels: 'LABELS',
      docs_th_supplier: 'SUPPLIER / VENDOR',
      docs_th_pct: 'CONFIDENCE',
      docs_th_status: 'STATUS',
      docs_th_batch: 'BATCH',
      docs_th_date: 'REGISTERED',
      docs_filter_all: 'ALL',
      docs_filter_pending: 'Pending',
      docs_filter_approved: 'Approved',
      docs_filter_completed: 'Completed',
      docs_filter_from: 'From',
      docs_filter_to: 'To',
      docs_pct_placeholder: 'Percentage...',

      // ── Templates ──
      page_templates: 'Labels',
      tpl_new_btn: '+ New Label',
      tpl_new_hint: 'Create a new label for extracting data from a specific document type',
      tpl_search_name: '🔍 Label...',
      tpl_search_supplier: '🏢 Supplier Vendor...',
      tpl_clear_btn: '✕ Clear',
      tpl_clear_hint: 'Clear label search filters',

      // ── Template Modal ──
      tpl_modal_title: 'New Label',
      tpl_modal_name: 'Label',
      tpl_modal_name_placeholder: 'e.g. invoice_dei, cosmote_receipt...',
      tpl_modal_supplier: '🏢 Supplier Vendor',
      tpl_modal_supplier_note: '(supplier keywords, e.g. DEI, dei)',
      tpl_modal_supplier_placeholder: 'e.g. cosmote, ote — multiple with comma',
      tpl_modal_add_field: '+ Add Field',
      tpl_modal_add_field_hint: 'Add a new extraction field to the label',
      tpl_modal_add_array: '+ Array Line Items',
      tpl_modal_add_array_hint: 'Add line items table to label — for invoices with multiple rows',
      tpl_modal_add_column: '+ Add Column',
      tpl_modal_paste: 'Paste',
      tpl_modal_paste_hint: 'Paste label from clipboard',

      // ── Settings ──
      page_settings: 'Settings',
      settings_account_title: '👤 Account',
      settings_change_username: '👤 Change Username',
      settings_new_username: 'New username',
      settings_new_username_placeholder: 'At least 3 characters...',
      settings_password_confirm: 'Password (for confirmation)',
      settings_password_placeholder: 'Enter your password...',
      settings_show_hide: 'Show/Hide',
      settings_change_username_btn: 'Change Username',
      settings_change_username_hint: 'Save new username — password confirmation required',
      settings_change_password: '🔒 Change Password',
      settings_current_password: 'Current password',
      settings_current_password_placeholder: 'Enter your current password...',
      settings_new_password: 'New password',
      settings_new_password_placeholder: 'At least 6 characters...',
      settings_confirm_password: 'Confirm new password',
      settings_confirm_password_placeholder: 'Repeat new password...',
      settings_change_password_btn: 'Change Password',
      settings_change_password_hint: 'Save new password — minimum 6 characters',
      settings_change_email: '📧 Change Email',
      settings_new_email: 'New email',
      settings_new_email_placeholder: 'e.g. user@example.com',
      settings_change_email_btn: 'Change Email',
      settings_change_email_hint: 'Save new contact email',
      settings_2fa_title: '🛡️ Two-Factor Authentication (2FA)',
      settings_2fa_desc: 'Add an extra layer of security to your account. You will need an Authenticator app (e.g. Google Authenticator, Authy).',
      settings_2fa_enable: 'Enable 2FA',
      settings_2fa_enable_hint: 'Start 2FA setup — you will need an Authenticator app',
      settings_2fa_step1: '1. Scan the QR code with your Authenticator app:',
      settings_2fa_manual: 'Or enter manually:',
      settings_2fa_step2: '2. Enter the 6-digit code from the app:',
      settings_2fa_verify: 'Verify & Enable',
      settings_2fa_verify_hint: 'Confirm code and enable 2FA',
      settings_2fa_cancel: 'Cancel',
      settings_2fa_cancel_hint: 'Cancel 2FA setup',
      settings_2fa_active: '✅ 2FA is enabled. Your account is protected.',
      settings_2fa_disable_label: 'To disable, enter your password:',
      settings_2fa_password_placeholder: 'Account password...',
      settings_2fa_disable: 'Disable 2FA',
      settings_2fa_disable_hint: 'Disable 2FA — will need to be set up again if re-enabled',
      settings_api_title: '🔑 API Keys',
      settings_api_provider: 'Provider',
      settings_api_provider_gemini: 'Gemini (Google)',
      settings_api_provider_openai: 'OpenAI',
      settings_api_provider_claude: 'Claude (Anthropic)',
      settings_api_provider_mistral: 'Mistral',
      settings_api_key_label: 'API Key',
      settings_api_key_placeholder: 'Enter your API key...',
      settings_api_save: 'Save Key',
      settings_api_save_hint: 'Save AI key — encrypted with Fernet encryption',
      settings_system_title: '⚙️ System Information',
      settings_users_title: '👥 User Management',
      settings_users_search: 'Search user (username or email)...',

      // ── Help / FAQ ──
      page_help: 'Help & FAQ',
      help_system_title: '📋 System Description',
      help_system_desc1: 'FastWrite is a local tool for automatic data extraction from documents (invoices, receipts, vouchers) using artificial intelligence (AI). It runs exclusively on your own computer — your data is not shared with anyone, including the platform administrator.',
      help_system_desc2: 'What it does: You upload a PDF with one or multiple invoices. The system automatically identifies each individual invoice, detects the supplier, matches the appropriate label, and extracts the data you defined (invoice number, date, amounts, line items, etc.). Finally, you export the results to CSV or Excel.',
      help_workflow_title: '🔄 Workflow — Step by Step',
      help_step1_title: 'Set Up API Key',
      help_step1_desc: 'Go to Settings → API Keys and enter your own AI key (e.g. Google Gemini). This is mandatory — the platform does not provide its own key. Billing is done directly to your AI account.',
      help_step2_title: 'Upload Documents',
      help_step2_desc: 'Go to Upload & Extract. Drag or select a PDF file (up to 200 invoices per file) and click "Register Documents". The system automatically identifies individual invoices and suppliers.',
      help_step3_title: 'Create Labels',
      help_step3_desc: 'From the Documents page, select one or more documents and click "Labels". You will be taken to a special page where you see the actual invoice on the left and the label form on the right. Define the fields you want extracted (e.g. invoice number, date, total, VAT) and line items. Alternatively, create a label from the Labels page → + New Label.',
      help_step4_title: 'Data Extraction (Batch)',
      help_step4_desc: 'From the Documents page, select documents and click "Batch". The system uses AI to extract data based on each document\'s label. Results appear in the documents table.',
      help_step5_title: 'Review & Approve',
      help_step5_desc: 'From the Documents page, select documents and click "Approve". You see the invoice on the left and extracted data on the right. Correct any errors and click "Approve Invoice". Highlight sync highlights the corresponding area in the document as you hover over rows.',
      help_step6_title: 'Export Files',
      help_step6_desc: 'After approving documents, return to the Documents page. Select approved documents and click "CSV", "XLSX" or "Line Items XLSX" to export. If none selected, all approved documents are exported.',
      help_tip_title: '💡 Tip',
      help_tip_text: 'The correct order is: Upload → Labels → Batch → Approve → Export. First create labels for each invoice type (e.g. DEI, COSMOTE, VODAFONE) then start bulk extraction. Once you create a label, the system automatically matches new invoices from the same supplier.',
      help_faq_title: '❓ Frequently Asked Questions',
      help_faq_search: '🔍 Search questions...',

      // FAQ categories
      faq_cat_dashboard: '📊 Dashboard',
      faq_cat_upload: '📤 Upload & Extract (Invoice Registration)',
      faq_cat_docs: '📄 Documents',
      faq_cat_labels: '🏷 Labels (Templates)',
      faq_cat_approval: '✅ Approval',
      faq_cat_settings: '⚙️ Settings & Account',
      faq_cat_security: '🔒 Security & Privacy',
      faq_cat_general: '❓ General',

      // ── Label Editor ──
      le_page_title: 'Document Registration',
      le_back: '← Back',
      le_back_hint: 'Return to Documents page',
      le_docs_hint: 'Show list of selected documents for editing',
      le_docs_header: 'SELECTED DOCUMENTS',
      le_labels_btn: '🏷 Labels ▼',
      le_labels_hint: 'Show existing labels — select or delete',
      le_labels_header: 'EXISTING LABELS',
      le_panel_btn: '🏷 Panel',
      le_panel_hint: 'Show/Hide label side panel',
      le_prev: '← Prev',
      le_prev_hint: 'Go to previous document',
      le_next: 'Next →',
      le_next_hint: 'Go to next document',
      le_clear: 'Clear',
      le_clear_hint: 'Clear form — start a new label from scratch',
      le_new_label: '🏷 New Label',
      le_add_array: '+ Array Line Items',
      le_add_array_hint: 'Add line items table to label — for invoices with multiple rows',

      // ── Approval ──
      ap_page_title: 'Document Approval',
      ap_back: '← Back',
      ap_back_hint: 'Return to Documents page',
      ap_docs_hint: 'Show list of documents for approval',
      ap_docs_header: 'DOCUMENTS FOR APPROVAL',
      ap_prev: '← Prev',
      ap_prev_hint: 'Go to previous document for approval',
      ap_next: 'Next →',
      ap_next_hint: 'Go to next document for approval',
      ap_sidebar_toggle: 'Show/Hide menu',
      ap_scalar_title: 'General Fields',
      ap_scalar_hide: '▲ Hide',
      ap_scalar_show: '▼ Show',
      ap_line_items: 'LINE ITEMS',

      // ── Template Builder ──
      tb_page_title: 'Template Builder',
      tb_back: '← Back',
      tb_back_hint: 'Return to Documents page',
      tb_doc_info: '📄 Document Info',
      tb_extracted: '📊 Extracted Data',
      tb_select_extract: '🔧 Select Template & Extract',
      tb_template_label: 'Template',
      tb_extract_btn: 'Extract Data',
      tb_extract_hint: 'Run AI data extraction with selected template',
      tb_new_template: '+ Create New Template',
      tb_label: 'Label',
      tb_label_placeholder: 'e.g. invoice, receipt...',
      tb_supplier: '🏢 Supplier Vendor',
      tb_supplier_placeholder: 'e.g. cosmote, ote — multiple with comma',
      tb_add_field: '+ Add Field',
      tb_add_field_hint: 'Add a new extraction field to the template',
      tb_save: 'Save Template',
      tb_save_hint: 'Save template — will be used for future extractions',

      // ── Document Modal ──
      modal_doc_title: 'Document Details',

      // ── Time expressions ──
      time_just_now: 'Just now',
      time_minutes_ago: '{n} minutes ago',
      time_hour_ago: '{n} hour ago',
      time_hours_ago: '{n} hours ago',
      time_day_ago: '{n} day ago',
      time_days_ago: '{n} days ago',

      // ── JS Dynamic content ──
      js_uploading: 'Uploading...',
      js_batch_upload: '📤 Batch Upload',
      js_upload_menu: '📤 Upload',
      js_registration_done: 'Document registration complete. Please go to the **Documents** page to continue the process.',
      js_continue_docs: 'To complete the process, continue to the **Documents** page',
      js_continue_extraction: 'If you want to continue and complete the data extraction, please go to the **Documents** page',
      js_docs_label: 'Documents:',
      js_no_template: 'Documents without label',
      js_no_approval: 'Documents without approval',
      js_with_approval: 'Documents with approval',
      js_upload_preview: 'Uploading for preview...',
      js_upload_file: 'Uploading file...',
      js_invoices: 'invoices',

      // ── JS Messages (toast, confirm, dynamic) ──
      js_no_recent_activity: 'No recent activity',
      js_all: 'ALL',
      js_no_docs_found: 'No documents found',
      js_delete_doc_confirm: 'Delete document #{id}?',
      js_doc_deleted: 'Document deleted',
      js_select_docs_first: 'Select documents first',
      js_delete_selected_confirm: 'Delete {n} selected documents?',
      js_docs_deleted: '{n} documents deleted',
      js_n_selected: '{n} selected',
      js_exporting: 'Exporting {label}...',
      js_download_success: '✓ {name} downloading!',
      js_export_error: 'Export error: ',
      js_template_fallback: 'Template Fallback (for Auto Match)',
      js_select_pdf_first: 'Select PDF first',
      js_registration_progress: '<span class="spinner"></span> Registration in progress...',
      js_register_documents: 'Register Documents',
      js_registration_started: 'Registration started!',
      js_check_required: 'Check Required',
      js_follow_register_first: 'Please follow the <b>Register Documents</b> process first',
      js_ok: 'OK',
      js_template_required: 'Template Creation Required',
      js_no_template_for_supplier: 'No template found for this invoice\'s supplier',
      js_select_file_first: 'Select file first',
      js_select_label: 'Select label',
      js_uploading_spinner: '<span class="spinner"></span> Uploading...',
      js_extract_data_btn: 'Extract Data',
      js_extracting_ai: '<span class="spinner"></span> AI Extraction...',
      js_extraction_success: '✓ Extraction Successful',
      js_extraction_done: 'Extraction complete!',
      js_extraction_error: 'Extraction error',
      js_select_label_or_auto: 'Select a label or enable Auto Template Matching',
      js_no_labels_create: 'No labels exist. Create a label first.',
      js_analyzing_file: '<span class="spinner"></span> Analyzing file...',
      js_start_batch: 'Start Batch',
      js_file_analysis_error: 'File analysis error',
      js_batch_started: 'Batch started!',
      js_register_done: '✓ Registration complete: {n} documents',
      js_batch_done: '✓ Batch complete: {n} documents',
      js_process_failed: '✕ Process failed',
      js_process_complete: 'Process Complete',
      js_register_complete: 'Document Registration',
      js_batch_complete: 'Batch Complete',
      js_no_results_found: 'No results found',
      js_loading_error: 'Loading error',
      js_results_title: 'Results — ',
      js_select_docs_checkbox: 'Select documents first (checkbox or filters)',
      js_batch_export_title: 'Data Extraction (Batch)',
      js_export_progress: 'Export in progress...',
      js_no_fields: 'No fields',
      js_no_rows: 'No rows',
      js_rows: ' rows',
      js_row_of: 'Row {current} / {total}',
      js_hide: '▲ Hide',
      js_show: '▼ Show',
      js_save_error: 'Save error: ',
      js_approved: 'Approved!',
      js_approve_done: '✓ Approved',
      js_approving: 'Approving...',
      js_approve_invoice: '✓ Approve Invoice',
      js_no_labels: 'No labels',
      js_label_loaded: 'Label "{name}" loaded',
      js_enter_label_name: 'Enter a label name',
      js_add_at_least_one_field: 'Add at least one field',
      js_fill_required: 'Fill in required fields',
      js_label_saved: 'Label "{name}" saved!',
      js_saved_continue: 'Saved! You can continue or click Back.',
      js_no_labels_found: 'No labels found',
      js_create_first_label: 'Create your first label',
      js_new_template: 'New Template',
      js_save_template: 'Save Template',
      js_template_load_error: 'Template loading error',
      js_edit_template: '✏️ Edit: ',
      js_save_changes: 'Save Changes',
      js_copied: '📋 Copied: ',
      js_no_copied_template: 'No copied template',
      js_pasted: '📋 Pasted: ',
      js_enter_template_name: 'Enter template name',
      js_template_renamed: 'Template renamed to "{name}"!',
      js_template_updated: 'Template updated!',
      js_template_saved: 'Template saved!',
      js_delete_template_confirm: 'Delete template "{name}"? History records will be updated.',
      js_template_deleted: 'Template deleted',
      js_history_updated: '{n} history records updated',
      js_delete_error: 'Error during deletion',
      js_fill_username_pass: 'Enter username and password',
      js_username_min: 'Username must be at least 3 characters',
      js_username_changed: 'Username changed successfully!',
      js_username_error: 'Username change error',
      js_fill_all_fields: 'Fill in all fields',
      js_passwords_mismatch: 'Passwords do not match',
      js_password_min: 'Password must be at least 6 characters',
      js_password_changed: 'Password changed successfully!',
      js_password_error: 'Password change error',
      js_fill_email_pass: 'Enter email and password',
      js_invalid_email: 'Invalid email format',
      js_email_updated: 'Email updated!',
      js_email_error: 'Email change error',
      js_2fa_status_active: 'Status: Active',
      js_2fa_status_inactive: 'Status: Inactive',
      js_enter_6digit: 'Enter 6-digit code',
      js_2fa_enabled: '2FA enabled!',
      js_2fa_verify_error: 'Verification error',
      js_enter_password: 'Enter your password',
      js_2fa_disabled: '2FA disabled',
      js_users_total: 'total users',
      js_users_active: 'active',
      js_active: 'Active',
      js_inactive: 'Inactive',
      js_you: '(you)',
      js_deactivate: 'Deactivate',
      js_activate: 'Activate',
      js_no_email: 'No email',
      js_user_activated: 'User activated',
      js_user_deactivated: 'User deactivated',
      js_role_changed: 'Role changed to {role}',
      js_enter_api_key: 'Enter API key',
      js_key_saved: 'Key saved!',
      js_page_of: 'Page {current} / {total}',
      js_file_analysis_title: 'File Analysis',
      js_file_analysis_progress: 'File analysis in progress...',
      js_segmentation: 'Segmentation & supplier detection',
      js_unknown_error: 'Unknown error',
      js_template_builder_title: 'Template Builder — ',
      js_doc_hash: 'Document #',
      js_no_labels_available: '— No labels available —',
      js_doc_not_found: 'Document not found',
      js_template_saved_history: 'Template saved! {n} history records updated',
      js_upload_error: 'Upload error',
      js_view: 'View',
      js_delete: 'Delete',
      js_extracted_data: 'Extracted Data',
      js_no_extracted_data: 'No extracted data.',
      js_doc_image_not_found: 'Document image not found',
      js_doc_label: 'Document',
      js_activity_upload: '📤 Upload',
      js_activity_register: '📝 Register',
      js_activity_approve: '✅ Approve',
      js_activity_delete: '🗑 Delete',
      js_already_completed: 'Already completed: ',
      js_without_label: 'Without label: ',
      js_failures: 'Failures: ',

      // ── Status labels ──
      status_pending: 'Pending',
      status_completed: 'Approved',
      status_failed: 'Failed',

      // ── Batch phases ──
      phase_analyzing: 'Analyzing pages...',
      phase_detecting: 'Detecting invoices...',
      phase_registering: 'Registering documents...',
      phase_completed: 'Completed',
      phase_finalizing: 'Finalizing...',
      phase_extracting: 'Extracting data...',

      // ── Extra dynamic ──
      js_no_fallback: '— No Fallback (Auto Match only) —',
      js_activity_export: '📊 Export',
      js_field: 'Field',
      js_type: 'Type',
      js_column: 'Column',
      js_field_name_placeholder: 'Field name',
      js_column_name_placeholder: 'Column name',
      js_total_docs_file: 'Total documents in file',
      js_docs_without_label: 'Documents without label',
      js_docs_without_approval: 'Documents without approval',
      js_docs_with_approval: 'Documents with approval',
      js_pages: 'Pages',
      js_documents: 'documents',
      js_skipped: 'skipped',
      js_incomplete_batch: 'Incomplete Batch',
      js_last_update: 'last update',
      js_all_completed_msg: 'All selected documents are already completed.',
      js_no_label_msg: 'Selected documents have no label. Create a label first.',
      js_no_docs_to_export: 'No documents to export. Check that they have labels and are not already completed.',
      js_completed_count: 'Completed',
      js_register_label: 'Document Registration',
      js_start_batch_label: 'Start Batch',
      js_page_abbr: 'pg.',
      js_fields: 'fields',
      js_label_colon: 'Label:',
      js_supplier_colon: 'Supplier:',
      js_edit: '✏️ Edit',
      js_copy: '📋 Copy',
      js_copy_hint: 'Copy template',
      js_unknown_supplier: 'Unknown supplier',
      js_batch_not_ready: '{n} documents have not completed Batch. Run Batch first.',
      js_line_items_cols: '📋 Line Items Columns',
      js_add_column: '+ Add Column',
      js_user_label: 'User',
      js_role_label: 'Role',
      js_email_label_info: 'Email',
      js_registration_date: 'Registered',
      js_no_email_set: 'Not set',
      js_no_saved_keys: 'No saved keys',
      js_file_label: 'File:',

      // ── Common ──
      btn_save: 'Save',
      btn_cancel: 'Cancel',
      btn_delete: 'Delete',
      btn_close: 'Close',
      btn_export: 'Export',
      btn_search: 'Search',
      loading: 'Loading...',
      error: 'Error',
      success: 'Success',
      confirm: 'Confirm',
      no_data: 'No data available',
      lang_label: 'Language',
      lang_el: 'Ελληνικά',
      lang_en: 'English',
    }
  },

  // ── Supported languages registry ──
  // Built-in: el, en (loaded instantly from above)
  // External: loaded on-demand from /static/lang/XX.json
  supportedLanguages: {
    el: { name: 'Ελληνικά', native: 'Ελληνικά', builtin: true },
    en: { name: 'English', native: 'English', builtin: true },
    fr: { name: 'French', native: 'Français' },
    de: { name: 'German', native: 'Deutsch' },
    es: { name: 'Spanish', native: 'Español' },
    it: { name: 'Italian', native: 'Italiano' },
    pt: { name: 'Portuguese', native: 'Português' },
    nl: { name: 'Dutch', native: 'Nederlands' },
    pl: { name: 'Polish', native: 'Polski' },
    ro: { name: 'Romanian', native: 'Română' },
    tr: { name: 'Turkish', native: 'Türkçe' },
    ar: { name: 'Arabic', native: 'العربية', rtl: true },
    ja: { name: 'Japanese', native: '日本語' },
    zh: { name: 'Chinese', native: '中文' },
    ko: { name: 'Korean', native: '한국어' },
    ru: { name: 'Russian', native: 'Русский' },
    sv: { name: 'Swedish', native: 'Svenska' }
  },

  // Track loading state to avoid duplicate fetches
  _loading: {},

  /**
   * Get translated string
   */
  t(key, params) {
    const lang = this.translations[this.currentLang] || this.translations['el'];
    let str = lang[key] || this.translations['el'][key] || key;
    if (params) {
      Object.keys(params).forEach(k => {
        str = str.replace('{' + k + '}', params[k]);
      });
    }
    return str;
  },

  /**
   * Load external language JSON on demand
   * Returns a promise that resolves when translations are loaded
   */
  async loadLanguage(lang) {
    // Already loaded (built-in or previously fetched)
    if (this.translations[lang]) return true;
    // Not a supported language
    if (!this.supportedLanguages[lang]) return false;
    // Already loading — wait for it
    if (this._loading[lang]) return this._loading[lang];

    this._loading[lang] = fetch(`/static/lang/${lang}.json`)
      .then(resp => {
        if (!resp.ok) throw new Error(`Language file not found: ${lang}`);
        return resp.json();
      })
      .then(data => {
        this.translations[lang] = data;
        delete this._loading[lang];
        return true;
      })
      .catch(err => {
        console.error(`[i18n] Failed to load ${lang}:`, err);
        delete this._loading[lang];
        return false;
      });

    return this._loading[lang];
  },

  /**
   * Detect language from URL > localStorage > browser > default
   */
  detectLanguage() {
    const urlParams = new URLSearchParams(window.location.search);
    const urlLang = urlParams.get('lang');
    if (urlLang && this.supportedLanguages[urlLang]) return urlLang;
    const stored = localStorage.getItem('fw_lang');
    if (stored && this.supportedLanguages[stored]) return stored;
    const browserLang = (navigator.language || navigator.userLanguage || '').substring(0, 2).toLowerCase();
    if (this.supportedLanguages[browserLang]) return browserLang;
    return 'el';
  },

  async init() {
    this.currentLang = this.detectLanguage();
    localStorage.setItem('fw_lang', this.currentLang);
    // If detected language is external, load it first
    if (!this.translations[this.currentLang]) {
      const loaded = await this.loadLanguage(this.currentLang);
      if (!loaded) this.currentLang = 'el';
    }
    this.applyTranslations();
    this.buildLangSelector();
  },

  async setLanguage(lang) {
    if (!this.supportedLanguages[lang]) return;
    // Load if external and not yet loaded
    if (!this.translations[lang]) {
      const loaded = await this.loadLanguage(lang);
      if (!loaded) {
        console.error(`[i18n] Could not switch to ${lang}`);
        return;
      }
    }
    this.currentLang = lang;
    localStorage.setItem('fw_lang', lang);
    const url = new URL(window.location);
    url.searchParams.set('lang', lang);
    window.history.replaceState({}, '', url);
    // Handle RTL
    if (this.supportedLanguages[lang] && this.supportedLanguages[lang].rtl) {
      document.documentElement.setAttribute('dir', 'rtl');
    } else {
      document.documentElement.removeAttribute('dir');
    }
    this.applyTranslations();
    this.updateLangSelector();
  },

  applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translated = this.t(key);
      if (translated !== key) el.textContent = translated;
    });
    document.querySelectorAll('[data-i18n-html]').forEach(el => {
      const key = el.getAttribute('data-i18n-html');
      const translated = this.t(key);
      if (translated !== key) el.innerHTML = translated;
    });
    document.querySelectorAll('[data-i18n-hint]').forEach(el => {
      const key = el.getAttribute('data-i18n-hint');
      const translated = this.t(key);
      if (translated !== key) el.setAttribute('data-hint', translated);
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const translated = this.t(key);
      if (translated !== key) el.setAttribute('placeholder', translated);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const translated = this.t(key);
      if (translated !== key) el.setAttribute('title', translated);
    });
    // Dual language containers (FAQ, legal, etc.)
    // For built-in (el/en) show matching container; for external languages show EN as fallback
    const faqLang = (this.currentLang === 'el') ? 'el' : 'en';
    document.querySelectorAll('.faq-lang-content').forEach(el => {
      el.style.display = el.dataset.faqLang === faqLang ? '' : 'none';
    });
  },

  /**
   * Build the language selector dropdown with all supported languages
   */
  buildLangSelector() {
    const container = document.getElementById('lang-dropdown');
    if (!container) return;
    container.innerHTML = '';
    Object.entries(this.supportedLanguages).forEach(([code, info]) => {
      const item = document.createElement('div');
      item.className = 'lang-option' + (code === this.currentLang ? ' active' : '');
      item.dataset.lang = code;
      item.textContent = info.native;
      item.onclick = () => this.setLanguage(code);
      container.appendChild(item);
    });
  },

  updateLangSelector() {
    const el = document.getElementById('lang-selector-current');
    if (el) el.textContent = this.currentLang.toUpperCase();
    // Update active state in dropdown
    const container = document.getElementById('lang-dropdown');
    if (container) {
      container.querySelectorAll('.lang-option').forEach(opt => {
        opt.classList.toggle('active', opt.dataset.lang === this.currentLang);
      });
    }
  }
};

// Shorthand
function t(key, params) { return I18N.t(key, params); }
