
// SUPABASE DINONAKTIFKAN UNTUK MODE LOCAL/NATIVE
// Aplikasi sekarang berjalan 100% offline menggunakan IndexedDB.

export const supabase = {
    auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        signInWithOAuth: async () => ({ error: { message: "Cloud auth disabled" } }),
        signOut: async () => ({ error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
    from: () => ({
        select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
        upsert: async () => ({ error: null }),
        delete: () => ({ eq: () => ({}) })
    })
};
