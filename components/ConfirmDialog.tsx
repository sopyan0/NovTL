
import React, { useEffect, useState } from 'react';
import { useFocusTrap } from '../hooks/useFocusTrap';

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
}

const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Konfirmasi',
  cancelText = 'Batal',
  isDestructive = false,
}) => {
  const [isVisible, setIsVisible] = useState(false);
  
  // A11y: Trap focus inside dialog
  const dialogRef = useFocusTrap(isOpen, onClose);

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300); // Match animation duration
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  const handleConfirm = () => {
    onConfirm();
    onClose();
  };

  return (
    <div 
      className={`fixed inset-0 z-50 flex items-center justify-center p-4 transition-opacity duration-300 ${isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="dialog-title"
      aria-describedby="dialog-desc"
    >
      <div className="absolute inset-0 bg-charcoal/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      
      <div 
        ref={dialogRef}
        tabIndex={-1}
        className={`bg-card rounded-3xl p-8 shadow-2xl max-w-sm w-full relative z-10 transform transition-transform duration-300 ${isOpen ? 'scale-100 translate-y-0' : 'scale-95 translate-y-4'}`}
      >
        <h3 id="dialog-title" className="text-2xl font-serif font-bold text-charcoal mb-4">{title}</h3>
        <p id="dialog-desc" className="text-subtle mb-8 text-sm leading-relaxed">{message}</p>
        
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-xl border border-border text-charcoal font-bold text-sm hover:bg-gray-100 dark:hover:bg-border transition active:scale-95"
          >
            {cancelText}
          </button>
          <button
            onClick={handleConfirm}
            className={`px-6 py-3 rounded-xl text-white font-bold text-sm transition shadow-lg active:scale-95 ${
              isDestructive 
              ? 'bg-red-500 hover:bg-red-600 shadow-red-500/30' 
              : 'bg-accent hover:bg-accentHover shadow-accent/30'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
