
/*
 * NovTL Studio - Global Error Boundary
 * Copyright (c) 2025 NovTL Studio. All Rights Reserved.
 * Catches render errors and provides a safe fallback UI.
 */

import React, { ErrorInfo, ReactNode } from 'react';

// Using specific naming to avoid namespace collisions and making children optional to solve parent component prop validation errors.
interface ErrorBoundaryProps {
  children?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  handleReset = () => {
    // Nuclear Button: Clear LocalStorage if corrupt data causes crash
    // eslint-disable-next-line no-restricted-globals
    if (confirm("This will clear all local settings and refresh the page. Continue?")) {
        localStorage.clear();
        window.location.reload();
    }
  };

  handleReload = () => {
      window.location.reload();
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#f8f7f2] p-8 text-center font-sans">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full border border-red-100">
            <div className="text-6xl mb-6">🤕</div>
            <h1 className="text-2xl font-serif font-bold text-gray-800 mb-2">Oops! Something went wrong.</h1>
            <p className="text-gray-500 mb-6 text-sm leading-relaxed">
              The application encountered an unexpected error. This might be due to corrupted data or a network issue.
            </p>
            
            <div className="bg-red-50 p-4 rounded-xl mb-6 text-left overflow-auto max-h-32">
                <code className="text-[10px] text-red-600 font-mono break-all">
                    {this.state.error?.message}
                </code>
            </div>

            <div className="flex flex-col gap-3">
                <button
                onClick={this.handleReload}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-bold shadow-lg hover:bg-indigo-700 transition-all"
                >
                Reload Page
                </button>
                <button
                onClick={this.handleReset}
                className="w-full py-3 bg-white border border-gray-200 text-gray-500 rounded-xl font-bold hover:bg-gray-50 hover:text-red-500 transition-all text-xs"
                >
                Emergency Reset Data
                </button>
            </div>
          </div>
        </div>
      );
    }

    return (this as any).props.children;
  }
}

export default ErrorBoundary;
