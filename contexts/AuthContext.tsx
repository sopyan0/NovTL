
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { wipeAllLocalData } from '../utils/storage';

// Tipe User Lokal Mockup sederhana tanpa library eksternal
interface LocalUser {
    id: string;
    email: string;
    role: string;
}

const LOCAL_USER: LocalUser = {
    id: 'local-author',
    email: 'author@novtl.local',
    role: 'authenticated'
};

interface AuthContextType {
    user: LocalUser | null;
    signInWithGoogle: () => Promise<void>;
    signOut: () => Promise<void>;
    isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<LocalUser | null>(null);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        // Langsung masuk sebagai user lokal (Offline First)
        const timer = setTimeout(() => {
            setUser(LOCAL_USER);
            setIsLoading(false);
        }, 300);
        return () => clearTimeout(timer);
    }, []);

    const signInWithGoogle = async () => {
        alert("Mode Lokal: Tidak memerlukan login cloud.");
    };

    const signOut = async () => {
        if (confirm("Reset Aplikasi? Ini akan menghapus semua pengaturan dan cache lokal.")) {
            setIsLoading(true);
            await wipeAllLocalData();
            window.location.reload();
        }
    };

    return (
        <AuthContext.Provider value={{ 
            user, 
            signInWithGoogle, 
            signOut, 
            isLoading
        }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within AuthProvider");
    return context;
};
