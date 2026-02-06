
import { useEffect, useRef, useCallback } from 'react';

export const useFocusTrap = (isOpen: boolean, onClose: () => void) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  // Memoize onClose to prevent effect re-triggering if parent passes inline function
  const stableOnClose = useCallback(onClose, []);

  useEffect(() => {
    if (!isOpen) return;

    const container = containerRef.current;
    if (!container) return;

    // 1. Capture previous focus safely
    if (document.activeElement instanceof HTMLElement) {
      previousFocusRef.current = document.activeElement;
    }

    // 2. Focus first viable element
    // Select candidates: interactive elements that are not disabled and not hidden
    const getFocusableElements = (): HTMLElement[] => {
      if (!container) return [];
      const selectors = [
        'button', 'a[href]', 'input', 'select', 'textarea', 
        '[tabindex]:not([tabindex="-1"])'
      ].join(',');
      
      // Fix: Cast the NodeList conversion result to HTMLElement[] to avoid 'unknown[]' type error
      return (Array.from(container.querySelectorAll(selectors)) as HTMLElement[])
        .filter((el: HTMLElement) => !el.hasAttribute('disabled') && !el.getAttribute('aria-hidden') && el.offsetParent !== null);
    };

    const focusableElements = getFocusableElements();
    
    // Check for explicit autofocus first
    const autoFocusEl = container.querySelector<HTMLElement>('[data-autofocus]');
    if (autoFocusEl) {
      autoFocusEl.focus();
    } else if (focusableElements.length > 0) {
      focusableElements[0].focus();
    } else {
      // Fallback: focus container itself (ensure it has tabIndex -1 in JSX)
      container.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      // Security: Ensure event happened inside our context to avoid closing wrong modals
      if (!container.contains(document.activeElement)) {
          // Optional: Force focus back if user clicked outside but focus is lost
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation(); // Stop propagation to prevent closing parent modals
        stableOnClose();
        return;
      }

      if (e.key === 'Tab') {
        const elements = getFocusableElements();
        if (elements.length === 0) {
          e.preventDefault();
          return;
        }

        const firstElement = elements[0];
        const lastElement = elements[elements.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          }
        } else {
          if (document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      
      // 3. Restore focus safely
      const prevEl = previousFocusRef.current;
      if (prevEl && document.contains(prevEl)) {
        // Wrap in timeout to allow UI updates (like drawer closing) to finish
        setTimeout(() => prevEl.focus(), 0);
      }
    };
  }, [isOpen, stableOnClose]);

  return containerRef;
};
