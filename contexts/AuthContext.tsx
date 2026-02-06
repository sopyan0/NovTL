
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { wipeAllLocalData } from '../utils/storage';

// Tipe User Lokal Mockup
const LOCAL_USER: User = {
    id: 'local-admin',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'local@novtl.app',
    email_confirmed_at: new Date().toISOString(),
    phone: '',
    confirmed_at: new Date().toISOString(),
    last_sign_in_at: new Date().toISOString(),
    app_metadata: { provider: 'local' },
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
};

interface AuthContextType {
    user: User | null;
    session: Session | null;
    providerToken: string | null;
    signInWithGoogle: (forceConsent?: boolean) => Promise<void>;
    signOut: () => Promise<void>;
    exitOfflineMode: () => Promise<void>; 
    isLoading: boolean;
    isOfflineMode: boolean;
    isRestoringToken: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    // MODE LOKAL: Langsung login sebagai admin lokal saat aplikasi dibuka
    useEffect(() => {
        console.log("🚀 Booting NovTL in Local/Native Mode...");
        setTimeout(() => {
            setUser(LOCAL_USER);
            setIsLoading(false);
        }, 500); // Sedikit delay untuk animasi loading
    }, []);

    const signInWithGoogle = async () => {
        alert("Aplikasi ini berjalan dalam Mode Offline/Lokal. Tidak perlu login cloud.");
    };

    const signOut = async () => {
        if (confirm("Reset Aplikasi? Ini akan menghapus semua data lokal.")) {
            setIsLoading(true);
            await wipeAllLocalData();
            window.location.reload();
        }
    };

    const exitOfflineMode = async () => {
        // No-op in local mode
    };

    return (
        <AuthContext.Provider value={{ 
            user, 
            session: null, 
            providerToken: null, 
            signInWithGoogle, 
            signOut, 
            exitOfflineMode, 
            isLoading, 
            isOfflineMode: false, // Selalu dianggap 'Online' secara fungsionalitas
            isRestoringToken: false 
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error("useAuth must be used within AuthProvider");
    }
    return context;
};
