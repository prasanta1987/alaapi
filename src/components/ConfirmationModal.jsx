import React, { useState } from 'react';
import {
  X,
  AlertTriangle,
  Trash2,
  AlertCircle,
  FileText,
  Music,
  ArrowRight
} from 'lucide-react';

/**
 * Reusable Confirmation Modal
 * Used for:
 * 1. Unsaved Swaralipi changes when leaving composer
 * 2. Swaralipi deletion on Dashboard and Composer
 * 3. Clearing swaralipi sheets
 */
export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Are you sure?',
  message = 'Please confirm this action to proceed.',
  subMessage,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'purple'
  sheetPreview,
  isLoading = false
}) {
  const [internalLoading, setInternalLoading] = useState(false);

  if (!isOpen) return null;

  const effectiveLoading = isLoading || internalLoading;

  const handleConfirm = async () => {
    try {
      setInternalLoading(true);
      await onConfirm?.();
    } finally {
      setInternalLoading(false);
    }
  };

  // Variant themes
  const isDanger = variant === 'danger';
  const isWarning = variant === 'warning';

  const iconBg = isDanger
    ? 'from-red-500/20 to-rose-600/20 border-red-500/40 text-red-400 shadow-red-950/50'
    : isWarning
      ? 'from-amber-500/20 to-orange-500/20 border-amber-500/40 text-amber-400 shadow-amber-950/50'
      : 'from-purple-500/20 to-indigo-500/20 border-purple-500/40 text-purple-400 shadow-purple-950/50';

  const modalBorder = isDanger
    ? 'border-red-500/30'
    : isWarning
      ? 'border-amber-500/30'
      : 'border-purple-500/30';

  const confirmBtnStyle = isDanger
    ? 'bg-red-600 hover:bg-red-500 shadow-red-900/40 text-white'
    : isWarning
      ? 'bg-amber-600 hover:bg-amber-500 shadow-amber-900/40 text-white'
      : 'bg-purple-600 hover:bg-purple-500 shadow-purple-900/40 text-white';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200 select-none"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`bg-gray-900 border ${modalBorder} rounded-3xl p-5 sm:p-6 max-w-md w-full shadow-2xl relative flex flex-col items-center gap-3.5 text-center animate-in zoom-in-95 duration-200 overflow-hidden`}
      >
        {/* Top Close Button */}
        <button
          onClick={onClose}
          disabled={effectiveLoading}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="Cancel"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Glow Header Icon */}
        <div
          className={`w-14 h-14 rounded-2xl bg-gradient-to-br border flex items-center justify-center shadow-lg shrink-0 mt-1 ${iconBg}`}
        >
          {isDanger ? (
            <Trash2 className="w-7 h-7" />
          ) : isWarning ? (
            <AlertTriangle className="w-7 h-7" />
          ) : (
            <AlertCircle className="w-7 h-7" />
          )}
        </div>

        {/* Title & Message */}
        <div className="space-y-1.5 px-2">
          <h3 className="text-lg sm:text-xl font-bold text-white font-bengali">
            {title}
          </h3>
          <p className="text-xs sm:text-sm text-gray-300 leading-relaxed font-bengali">
            {message}
          </p>
          {subMessage && (
            <p className="text-[11px] text-gray-400 mt-1 italic">
              {subMessage}
            </p>
          )}
        </div>

        {/* Optional Swaralipi Sheet Preview Card */}
        {sheetPreview && (
          <div className="w-full bg-gray-950/70 border border-gray-800 rounded-2xl p-3 flex items-center gap-3 text-left shadow-inner">
            <div className="w-10 h-10 rounded-xl bg-purple-900/30 border border-purple-500/30 flex items-center justify-center text-purple-300 font-bold shrink-0">
              <Music className="w-5 h-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs sm:text-sm font-bold text-white truncate font-bengali">
                {sheetPreview.title || 'স্বরলিপি'}
              </p>
              <p className="text-[11px] text-gray-400 truncate">
                {sheetPreview.taal ? `তাল: ${sheetPreview.taal}` : ''}
                {sheetPreview.bpm ? ` • ${sheetPreview.bpm} BPM` : ''}
              </p>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex items-center gap-2.5 w-full pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={effectiveLoading}
            className="flex-1 py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs sm:text-sm font-semibold transition-colors"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={effectiveLoading}
            className={`flex-1 py-2.5 px-4 rounded-xl text-xs sm:text-sm font-bold shadow-lg transition-all active:scale-95 disabled:opacity-50 ${confirmBtnStyle}`}
          >
            {effectiveLoading ? 'Processing...' : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
