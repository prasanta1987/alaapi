import React from 'react';
import { X, Share, PlusSquare, Smartphone } from 'lucide-react';

export function IosInstallModal({ isOpen, onClose }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-gray-900 border border-purple-500/40 rounded-3xl max-w-sm w-full p-5 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="w-12 h-12 rounded-2xl bg-purple-900/40 border border-purple-500/50 flex items-center justify-center text-purple-400 mx-auto mb-3 shadow-lg shadow-purple-950/50">
          <Smartphone className="w-6 h-6" />
        </div>

        <h3 className="text-base font-bold text-center text-white mb-1">
          Install Alaapi on iOS
        </h3>
        <p className="text-xs text-gray-300 text-center mb-4">
          Install to your Home Screen for a distraction-free, full-screen studio experience.
        </p>

        <div className="space-y-3 bg-gray-950/60 p-3.5 rounded-2xl border border-gray-800 text-xs">
          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-blue-600/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
              1
            </div>
            <div className="text-gray-200">
              Tap the <strong className="text-white">Share</strong> button in Safari's bottom toolbar:
              <div className="mt-1 flex items-center gap-1.5 text-blue-400 font-semibold">
                <Share className="w-4 h-4" />
                <span>Share Icon</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
              2
            </div>
            <div className="text-gray-200">
              Scroll down and tap <strong className="text-white">Add to Home Screen</strong>:
              <div className="mt-1 flex items-center gap-1.5 text-purple-400 font-semibold">
                <PlusSquare className="w-4 h-4" />
                <span>Add to Home Screen</span>
              </div>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-6 h-6 rounded-lg bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-[11px] shrink-0 mt-0.5">
              3
            </div>
            <div className="text-gray-200">
              Tap <strong className="text-emerald-400 font-bold">Add</strong> at top right. Alaapi will launch in full screen directly from your home screen!
            </div>
          </div>
        </div>

        <button
          onClick={onClose}
          className="mt-4 w-full py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs rounded-xl shadow-md transition-all"
        >
          Got It
        </button>
      </div>
    </div>
  );
}

