
export const TRANSLATIONS = {
  en: {
    sidebar: {
      dashboard: "Home",
      editor: "Editor",
      collection: "Library",
      settings: "Settings",
      author: "Author",
      plan: "Local Edition",
      help: "Help",
      logout: "Reset App"
    },
    // ... (Dashboard & Editor keys remain same as per previous versions)
    editor: {
      source: "Source Text",
      translation: "Translation",
      placeholder: "Paste your novel chapter here...",
      chars: "chars",
      translating: "Translating...",
      ready: "Ready",
      stop: "STOP",
      translate: "TRANSLATE",
      save: "SAVE",
      saved: "SAVED!",
      paste: "PASTE", 
      instruction: "Instruction / Style",
      instructionPlaceholder: "E.g., Use Shakespearean style, maintain cultivation terms...",
      apiKeyError: "API Key Missing",
      apiKeyPlaceholder: "Paste API Key here...",
      upload: "Upload File (.txt)",
      focusMode: "FOCUS READ MODE",
      waiting: "Brewing words...",
      emptyState: "Translation results will appear here."
    },
    library: {
      bookshelf: "Bookshelf",
      chapters: "Saved Chapters",
      downloadEpub: "Download EPUB",
      generating: "Generating...",
      backupTxt: "Download TXT",
      clearAll: "Clear All",
      search: "Search chapter...",
      sort: {
        oldest: "📅 Oldest (Book Order)",
        newest: "📅 Newest",
        az: "🔤 A - Z",
        za: "🔤 Z - A"
      },
      emptyTitle: "Library is Empty",
      emptyDesc: "Start translating to fill your collection.",
      confirmDeleteTitle: "Delete Chapter?",
      confirmDeleteMsg: "This chapter will be removed from your storage.",
      confirmClearTitle: "Clear Project?",
      confirmClearMsg: "Are you sure you want to delete ALL chapters in this project?"
    },
    help: {
      title: "NovTL User Guide",
      subtitle: "Professional Translation Assistant",
      tabs: {
        start: "🚀 Getting Started",
        api: "🔑 AI Setup",
        storage: "💾 Storage",
        faq: "❓ FAQ"
      },
      close: "Close Guide",
      start: {
        title: "Welcome to NovTL Studio!",
        desc: "NovTL is your personal AI station for novel translation. Your data is stored 100% on your device.",
        step1: "Prepare Text",
        step1Desc: "Drag & drop a .txt or .epub file into the editor, or just paste it.",
        step2: "Set Style",
        step2Desc: "Use the 'Prompt' button to tell the AI how to translate (e.g. 'Royal tone', 'Captivating').",
        step3: "Glossary",
        step3Desc: "Add names/terms in Settings. AI will strictly follow your dictionary.",
        step4: "Translate & Save",
        step4Desc: "Click Translate, then Save to store it in your Library."
      },
      api: {
        title: "Setting up the AI",
        geminiTitle: "Google Gemini (Recommended)",
        step1: "Get a free API Key from Google AI Studio.",
        step2: "Click the 🔑 API button in NovTL.",
        step3: "Paste your key and select the Gemini Flash model.",
        step4: "Now you're ready to translate!",
        note: "Privacy: Your API Key is only stored in your browser's private memory."
      },
      storage: {
        title: "Where are my files?",
        desc: "NovTL uses Hybrid Storage for safety and speed.",
        step1: "Physical Files: All data is saved in your 'Documents/NovTL' folder.",
        step2: "Hybrid Cache: We use a local database (IndexedDB) to make loading 2000+ chapters feel instant.",
        step3: "Cleaning: If the app feels slow, use 'Clear Cache' in Settings. Your physical files are ALWAYS safe."
      },
      faq: {
        q1: "Is this free?",
        a1: "The app is free. The AI cost depends on your API provider (Gemini has a generous free tier).",
        q2: "Can I read offline?",
        a2: "Yes! Once translated and saved, you can read your collection without an internet connection.",
        q3: "How to read on other apps?",
        a3: "Use the 'Download EPUB' button. You can then open the file in Google Play Books or Moon+ Reader."
      }
    }
  },
  id: {
    sidebar: {
      dashboard: "Beranda",
      editor: "Editor",
      collection: "Koleksi",
      settings: "Setelan",
      author: "Penulis",
      plan: "Edisi Lokal",
      help: "Bantuan",
      logout: "Reset App"
    },
    // ... (Indonesian keys follow same pattern)
    editor: {
      source: "Sumber",
      translation: "Terjemahan",
      placeholder: "Tempel bab novel di sini...",
      chars: "karakter",
      translating: "Menerjemahkan...",
      ready: "Siap",
      stop: "BERHENTI (STOP)",
      translate: "TERJEMAHKAN",
      save: "SIMPAN",
      saved: "TERSIMPAN!",
      paste: "TEMPEL",
      instruction: "Instruksi / Gaya Bahasa",
      instructionPlaceholder: "Contoh: Gunakan gaya bahasa novel fantasi klasik...",
      apiKeyError: "API Key Hilang",
      apiKeyPlaceholder: "Tempel API Key di sini...",
      upload: "Upload File (.txt)",
      focusMode: "BACA MODE FOKUS",
      waiting: "Sedang meracik kata...",
      emptyState: "Hasil terjemahan akan muncul di sini."
    },
    library: {
      bookshelf: "Rak Buku",
      chapters: "Bab Tersimpan",
      downloadEpub: "Download EPUB",
      generating: "Membuat...",
      backupTxt: "Download TXT",
      clearAll: "Hapus Semua",
      search: "Cari bab...",
      sort: {
        oldest: "📅 Terlama (Buku)",
        newest: "📅 Terbaru",
        az: "🔤 A - Z",
        za: "🔤 Z - A"
      },
      emptyTitle: "Rak buku kosong",
      emptyDesc: "Mulailah menerjemahkan untuk mengisi koleksi.",
      confirmDeleteTitle: "Hapus Bab?",
      confirmDeleteMsg: "Bab ini akan dihapus dari penyimpanan perangkat.",
      confirmClearTitle: "Bersihkan Proyek?",
      confirmClearMsg: "Yakin ingin menghapus SEMUA bab di proyek ini?"
    },
    help: {
      title: "Panduan Pengguna NovTL",
      subtitle: "Asisten Penerjemah Novel Profesional",
      tabs: {
        start: "🚀 Memulai",
        api: "🔑 Setup AI",
        storage: "💾 Penyimpanan",
        faq: "❓ FAQ"
      },
      close: "Tutup Panduan",
      start: {
        title: "Selamat datang di NovTL Studio!",
        desc: "NovTL adalah stasiun AI pribadi untuk menerjemahkan novel. Data Anda 100% aman di perangkat sendiri.",
        step1: "Siapkan Teks",
        step1Desc: "Tarik file .txt atau .epub ke editor, atau tempel teks secara manual.",
        step2: "Atur Gaya",
        step2Desc: "Gunakan tombol 'Prompt' untuk mengatur gaya bahasa (misal: 'Bahasa Kerajaan', 'Menyentuh').",
        step3: "Glosarium",
        step3Desc: "Tambah nama karakter/istilah di Setelan agar AI tidak salah menerjemahkan.",
        step4: "Terjemah & Simpan",
        step4Desc: "Klik Terjemahkan, lalu klik Simpan untuk memasukkannya ke Koleksi/Koleksi."
      },
      api: {
        title: "Menyiapkan Otak AI",
        geminiTitle: "Google Gemini (Rekomendasi)",
        step1: "Dapatkan API Key gratis di Google AI Studio.",
        step2: "Klik tombol 🔑 API di halaman utama NovTL.",
        step3: "Tempel kunci Anda dan pilih model Gemini Flash.",
        step4: "Selesai! Anda siap menerjemahkan ribuan kata.",
        note: "Privasi: API Key hanya disimpan di memori browser Anda, tidak pernah dikirim ke server kami."
      },
      storage: {
        title: "Di mana file saya disimpan?",
        desc: "NovTL menggunakan Hybrid Storage agar aman dan cepat.",
        step1: "File Fisik: Semua data disimpan di folder 'Documents/NovTL' di komputer/HP Anda.",
        step2: "Hybrid Cache: Kami menggunakan database lokal (IndexedDB) agar ribuan bab terbuka secara instan.",
        step3: "Optimasi: Jika aplikasi terasa berat, gunakan 'Bersihkan Cache' di Setelan. File asli Anda tetap AMAN."
      },
      faq: {
        q1: "Apakah ini gratis?",
        a1: "Aplikasi ini gratis. Biaya AI tergantung penyedia API (Gemini menyediakan kuota gratis yang besar).",
        q2: "Bisa baca offline?",
        a2: "Bisa! Setelah bab diterjemahkan dan disimpan, Anda bisa membacanya tanpa koneksi internet.",
        q3: "Cara baca di aplikasi lain?",
        a3: "Gunakan tombol 'Download EPUB'. File tersebut bisa dibuka di Google Play Books atau Moon+ Reader."
      }
    }
  }
};
