import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * Top warning banner shown only when user opens room link inside WhatsApp's in-app browser
 */
export function WhatsAppBanner() {
  const isWhatsAppBrowser = typeof navigator !== 'undefined' && /WhatsApp/i.test(navigator.userAgent);

  if (!isWhatsAppBrowser) return null;

  return (
    <div className="absolute top-0 inset-x-0 z-50 bg-amber-500 text-gray-950 px-3 py-1.5 text-[11px] sm:text-xs font-semibold flex items-center justify-between shadow-lg">
      <div className="flex items-center gap-2 truncate">
        <AlertCircle className="w-4 h-4 shrink-0 text-gray-950" />
        <span className="truncate">
          Viewing in WhatsApp. For reliable camera &amp; high-fidelity audio, tap <strong>&#8942;</strong> (top right) &gt; <strong>Open in Chrome</strong>.
        </span>
      </div>
    </div>
  );
}
