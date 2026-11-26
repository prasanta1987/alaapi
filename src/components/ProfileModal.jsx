import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import {
  X,
  Save,
  User,
  Phone,
  Music,
  FileText,
  ShieldCheck,
  GraduationCap,
  Loader2,
  Check
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';

export function ProfileModal({ isOpen, onClose }) {
  const { currentUser, userProfile, updateUserProfile, isAdmin } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [instrument, setInstrument] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const hasInitializedRef = useRef(false);

  useEffect(() => {
    if (!isOpen) {
      hasInitializedRef.current = false;
      return;
    }

    if (isOpen && !hasInitializedRef.current && (userProfile || currentUser)) {
      setDisplayName(userProfile?.displayName || currentUser?.displayName || '');
      setPhone(userProfile?.phone || '');
      setInstrument(userProfile?.instrument || 'Indian Classical Vocals');
      setBio(userProfile?.bio || '');
      hasInitializedRef.current = true;
    }
  }, [isOpen, userProfile, currentUser]);

  // Handle escape key to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !currentUser) return null;

  const role = userProfile?.role || 'student';
  const isTeacher = role === 'teacher' || isAdmin;

  const presetInstruments = [
    'Indian Classical Vocals',
    'Harmonium',
    'Western Vocals',
    'Tanpura',
    'Acoustic Guitar',
    'Flute',
    'Piano / Keyboard',
  ];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setSaveSuccess(false);

    try {
      await updateUserProfile({
        displayName: displayName.trim(),
        phone: phone.trim(),
        instrument: instrument.trim(),
        bio: bio.trim()
      });
      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 700);
    } catch (err) {
      console.error("Failed to update profile:", err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Background Dim & Blur Overlay */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card (Isolated from backdrop blur to maintain razor-sharp text) */}
      <div className="relative z-10 bg-gray-900 border border-gray-700/80 rounded-3xl max-w-md w-full shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-fadeIn">
        {/* Modal Header (Pinned) */}
        <div className="shrink-0 p-5 sm:px-6 pb-4 border-b border-gray-800/80 bg-gray-950/50 flex items-center justify-between">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative shrink-0">
              <UserAvatar
                photoURL={currentUser.photoURL || userProfile?.photoURL}
                name={userProfile?.displayName || currentUser.displayName}
                size="lg"
                className="w-12 h-12 shadow-xl ring-2 ring-purple-500/20"
              />
              <div
                className={`absolute -bottom-1 -right-1 p-0.5 rounded-full border shadow-md flex items-center justify-center ${isAdmin
                  ? 'bg-purple-950 text-purple-300 border-purple-500/80 shadow-purple-950/60'
                  : isTeacher
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-500/80 shadow-emerald-950/60'
                    : 'bg-blue-950 text-blue-300 border-blue-500/80 shadow-blue-950/60'
                  }`}
                title={role.toUpperCase()}
              >
                {isAdmin ? (
                  <ShieldCheck className="w-2.5 h-2.5" />
                ) : isTeacher ? (
                  <GraduationCap className="w-2.5 h-2.5" />
                ) : (
                  <Music className="w-2.5 h-2.5" />
                )}
              </div>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-white tracking-normal truncate">
                  {displayName || currentUser.displayName || 'Your Profile'}
                </h3>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border shrink-0 ${isAdmin
                    ? 'bg-purple-950 text-purple-300 border-purple-500/60'
                    : isTeacher
                      ? 'bg-emerald-950 text-emerald-300 border-emerald-500/60'
                      : 'bg-blue-950 text-blue-300 border-blue-500/60'
                    }`}
                >
                  {role}
                </span>
              </div>
              <p className="text-gray-300 text-xs font-medium truncate mt-0.5">{currentUser.email}</p>
            </div>
          </div>

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:bg-gray-800 transition-colors p-1.5 rounded-xl ml-2 shrink-0"
            title="Close Profile Modal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Container */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Scrollable Form Body */}
          <div className="overflow-y-auto flex-1 p-5 sm:px-6 space-y-4 custom-scrollbar">
            {/* Display Name */}
            <div>
              <label className="text-gray-200 font-semibold mb-1.5 flex items-center gap-1.5 text-xs">
                <User className="w-3.5 h-3.5 text-purple-400" />
                Display Name
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                placeholder="Your full or artist name"
                className="w-full bg-gray-950 border border-gray-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 font-medium focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/30 transition-all shadow-inner"
              />
            </div>

            {/* Phone */}
            <div>
              <label className="text-gray-200 font-semibold mb-1.5 flex items-center gap-1.5 text-xs">
                <Phone className="w-3.5 h-3.5 text-blue-400" />
                Phone / Contact
              </label>
              <input
                type="tel"
                placeholder="+1 234 567 8900"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 font-medium focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/30 transition-all shadow-inner"
              />
            </div>

            {/* Musical Focus / Instrument */}
            <div>
              <label className="text-gray-200 font-semibold mb-1.5 flex items-center gap-1.5 text-xs">
                <Music className="w-3.5 h-3.5 text-emerald-400" />
                Vocal Discipline / Instrument
              </label>
              <input
                type="text"
                placeholder="e.g. Indian Classical Vocals, Harmonium"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700/80 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-gray-500 font-medium focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/30 transition-all shadow-inner"
              />
              {/* Quick preset pills */}
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {presetInstruments.map((preset) => (
                  <button
                    type="button"
                    key={preset}
                    onClick={() => setInstrument(preset)}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-all ${instrument === preset
                      ? 'bg-purple-900/70 text-purple-200 border-purple-400 font-semibold shadow-sm'
                      : 'bg-gray-950 text-gray-300 border-gray-700/80 hover:text-white hover:border-gray-600'
                      }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>

            {/* Bio / Teaching Goals */}
            <div>
              <label className="text-gray-200 font-semibold mb-1.5 flex items-center gap-1.5 text-xs">
                <FileText className="w-3.5 h-3.5 text-amber-400" />
                Musical Bio & Goals
              </label>
              <textarea
                rows={2}
                placeholder="Add your music background, Gharana, or class targets..."
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                className="w-full bg-gray-950 border border-gray-700/80 rounded-xl px-3.5 py-2.5 text-sm text-gray-100 placeholder-gray-500 font-normal focus:outline-none focus:border-purple-400 focus:ring-1 focus:ring-purple-400/30 transition-all resize-none shadow-inner leading-relaxed"
              />
            </div>
          </div>

          {/* Modal Footer (Pinned) */}
          <div className="shrink-0 p-4 sm:px-6 border-t border-gray-800/80 bg-gray-950/60">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50 active:scale-[0.99]"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : saveSuccess ? (
                <>
                  <Check className="w-4 h-4 text-emerald-300" />
                  <span>Saved!</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Profile</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

