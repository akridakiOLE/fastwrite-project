/**
 * FastWrite i18n — Lightweight translation engine
 * Supports: el (Greek, default), en (English)
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
      activity_title: 'Πρόσφατη Δραστηριότητα',
      activity_empty: 'Δεν υπάρχει πρόσφατη δραστηριότητα',

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

      // ── Settings ──
      page_settings: 'Ρυθμίσεις',
      settings_api_title: '🔑 API Key (Gemini)',
      settings_api_hint: 'Εισάγετε το Gemini API Key σας',
      settings_save: 'Αποθήκευση',
      settings_2fa_title: '🔒 Έλεγχος Ταυτότητας 2FA',
      settings_theme_title: '🎨 Θέμα Εμφάνισης',

      // ── Help ──
      page_help: 'Βοήθεια',
      help_system_title: '📋 Περιγραφή Συστήματος',
      help_faq_title: '❓ Συχνές Ερωτήσεις',
      help_faq_search: 'Αναζήτηση ερωτήσεων...',

      // ── Labels ──
      page_labels: 'Ετικέτες',

      // ── Time expressions ──
      time_just_now: 'Μόλις τώρα',
      time_minutes_ago: '{n} λεπτά πριν',
      time_hour_ago: '{n} ώρα πριν',
      time_hours_ago: '{n} ώρες πριν',
      time_day_ago: '{n} ημέρα πριν',
      time_days_ago: '{n} ημέρες πριν',

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

      // ── Language selector ──
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
      activity_title: 'Recent Activity',
      activity_empty: 'No recent activity',

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

      // ── Settings ──
      page_settings: 'Settings',
      settings_api_title: '🔑 API Key (Gemini)',
      settings_api_hint: 'Enter your Gemini API Key',
      settings_save: 'Save',
      settings_2fa_title: '🔒 Two-Factor Authentication',
      settings_theme_title: '🎨 Appearance Theme',

      // ── Help ──
      page_help: 'Help',
      help_system_title: '📋 System Description',
      help_faq_title: '❓ Frequently Asked Questions',
      help_faq_search: 'Search questions...',

      // ── Labels ──
      page_labels: 'Labels',

      // ── Time expressions ──
      time_just_now: 'Just now',
      time_minutes_ago: '{n} minutes ago',
      time_hour_ago: '{n} hour ago',
      time_hours_ago: '{n} hours ago',
      time_day_ago: '{n} day ago',
      time_days_ago: '{n} days ago',

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

      // ── Language selector ──
      lang_label: 'Language',
      lang_el: 'Ελληνικά',
      lang_en: 'English',
    }
  },

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
   * Detect language from URL > localStorage > browser > default
   */
  detectLanguage() {
    // 1. URL parameter ?lang=xx
    const urlParams = new URLSearchParams(window.location.search);
    const urlLang = urlParams.get('lang');
    if (urlLang && this.translations[urlLang]) {
      return urlLang;
    }
    // 2. localStorage
    const stored = localStorage.getItem('fw_lang');
    if (stored && this.translations[stored]) {
      return stored;
    }
    // 3. Browser language
    const browserLang = (navigator.language || navigator.userLanguage || '').substring(0, 2).toLowerCase();
    if (browserLang === 'en') return 'en';
    // 4. Default: Greek
    return 'el';
  },

  /**
   * Initialize i18n system
   */
  init() {
    this.currentLang = this.detectLanguage();
    localStorage.setItem('fw_lang', this.currentLang);
    this.applyTranslations();
  },

  /**
   * Switch language
   */
  setLanguage(lang) {
    if (!this.translations[lang]) return;
    this.currentLang = lang;
    localStorage.setItem('fw_lang', lang);
    // Update URL param without reload
    const url = new URL(window.location);
    url.searchParams.set('lang', lang);
    window.history.replaceState({}, '', url);
    this.applyTranslations();
    // Update language selector visual
    this.updateLangSelector();
  },

  /**
   * Apply translations to all elements with data-i18n attribute
   */
  applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      const translated = this.t(key);
      if (translated !== key) {
        el.textContent = translated;
      }
    });
    // Also handle data-i18n-hint (for tooltip hints)
    document.querySelectorAll('[data-i18n-hint]').forEach(el => {
      const key = el.getAttribute('data-i18n-hint');
      const translated = this.t(key);
      if (translated !== key) {
        el.setAttribute('data-hint', translated);
      }
    });
    // Handle data-i18n-placeholder
    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      const translated = this.t(key);
      if (translated !== key) {
        el.setAttribute('placeholder', translated);
      }
    });
    // Handle data-i18n-title
    document.querySelectorAll('[data-i18n-title]').forEach(el => {
      const key = el.getAttribute('data-i18n-title');
      const translated = this.t(key);
      if (translated !== key) {
        el.setAttribute('title', translated);
      }
    });
  },

  /**
   * Update language selector button appearance
   */
  updateLangSelector() {
    const el = document.getElementById('lang-selector-current');
    if (el) {
      el.textContent = this.currentLang.toUpperCase();
    }
  }
};

// Shorthand
function t(key, params) { return I18N.t(key, params); }
