
import React from 'react';
import { useAuth } from '../contexts/AuthContext';

export const AuthGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const { isLoading } = useAuth();

    if (isLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#F8F7F2] p-4 text-center">
                <div className="dango-loader text-4xl animate-bounce mb-4">🍡</div>
                <h2 className="text-charcoal font-bold animate-pulse">Memuat Studio Lokal...</h2>
                <p className="text-xs text-subtle mt-2">Menyiapkan Database Offline</p>
            </div>
        );
    }

    return <>{children}</>;
};
