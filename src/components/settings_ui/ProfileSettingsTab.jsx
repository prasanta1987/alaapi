import React, { useState, useEffect } from 'react';
import { useAuth } from '../../context/AuthContext';
import { UserAvatar } from '../UserAvatar';
import {
  User,
  Phone,
  Music,
  FileText,
  Save,
  Check,
  Loader2,
  LogIn
} from 'lucide-react';

export function ProfileSettingsTab({ onSaved }) {
  const { currentUser, userProfile, updateUserProfile, loginWithGoogle } = useAuth();

  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [instrument, setInstrument] = useState('');
  const [bio, setBio] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (userProfile) {
      setDisplayName(userProfile.displayName || currentUser?.displayName || '');
      setPhone(userProfile.phone || '');
      setInstrument(userProfile.instrument || 'Indian Classical Vocals');
      setBio(userProfile.bio || '');
    } else if (currentUser) {
      setDisplayName(currentUser.displayName || '');
    }
  }, [userProfile, currentUser]);

  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-center space-y-4">
        <div className="w-14 h-14 rounded-2xl bg-purple-600/20 text-purple-400 border border-purple-500/30 flex items-center justify-center">
          <User className="w-7 h-7" />
        </div>
        <div>
          <h4 className="text-sm font-bold text-white">Sign In to Edit Profile</h4>
          <p className="text-xs text-gray-400 max-w-sm mx-auto mt-1">
            Connect your Google account to customize your artist name, music instrument, and contact info.
          </p>
        </div>
        <button
          type="button"
          onClick={loginWithGoogle}
          className="py-2.5 px-5 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl text-xs shadow-lg shadow-purple-900/30 transition-all flex items-center gap-2"
        >
          <LogIn className="w-4 h-4" />
          <span>Sign In with Google</span>
        </button>
      </div>
    );
  }

  const presetInstruments = [
    'Indian Classical Vocals',
    'Western Vocals',
    'Carnatic Vocals',
    'Harmonium',
    'Tanpura',
    'Acoustic Guitar',
    'Piano / Keyboard',
    'Tabla / Percussion',
    'Flute',
    'Violin'
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
      if (onSaved) onSaved();
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error("Failed to update profile:", err);
      alert("Failed to update profile: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Alert on Save */}
      {saveSuccess && (
        <div className="p-3 bg-green-950/80 border border-green-600/70 text-green-300 rounded-xl text-xs sm:text-sm flex items-center justify-between shadow-lg animate-fadeIn">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-green-400 shrink-0" />
            <span>Profile and musical discipline updated successfully.</span>
          </div>
        </div>
      )}

      {/* User Header */}
      <div className="flex items-center gap-4 bg-gray-950/80 p-4 rounded-2xl border border-gray-800">
        <UserAvatar
          photoURL={currentUser.photoURL || userProfile?.photoURL}
          name={userProfile?.displayName || currentUser.displayName}
          size="lg"
        />
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-white truncate">
            {displayName || currentUser.displayName || 'Vocal Artist'}
          </h4>
          <p className="text-xs text-gray-400 truncate">{currentUser.email}</p>
          <span className="inline-block mt-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-300 border border-purple-500/40">
            {userProfile?.role || 'Student'}
          </span>
        </div>
      </div>

      {/* Profile Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Display Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
            <User className="w-3.5 h-3.5 text-purple-400" />
            Display Name
          </label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            required
            placeholder="Your stage or legal name"
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
          />
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
            <Phone className="w-3.5 h-3.5 text-blue-400" />
            Phone / Contact Number
          </label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+1 234 567 8900"
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
          />
        </div>

        {/* Primary Musical Focus */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
            <Music className="w-3.5 h-3.5 text-emerald-400" />
            Primary Musical Focus / Instrument
          </label>
          <input
            type="text"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            placeholder="e.g. Hindustani Vocal, Harmonium"
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
          />

          {/* Quick presets pills */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {presetInstruments.map((preset) => (
              <button
                type="button"
                key={preset}
                onClick={() => setInstrument(preset)}
                className={`text-[10px] px-2 py-1 rounded-lg border transition-all ${
                  instrument === preset
                    ? 'bg-purple-900/60 text-purple-200 border-purple-500 font-semibold'
                    : 'bg-gray-900 text-gray-400 border-gray-800 hover:text-gray-200 hover:border-gray-700'
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Bio */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            Musical Bio & Teaching / Learning Goals
          </label>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            rows={3}
            placeholder="Brief background about your vocal journey, Gharana, or class targets..."
            className="w-full bg-gray-950 border border-gray-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-purple-500 transition-colors shadow-inner resize-none"
          />
        </div>

        {/* Submit */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 px-4 bg-purple-600 hover:bg-purple-500 active:scale-[0.99] disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-lg shadow-purple-900/30 transition-all flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Saving Profile...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Profile Changes</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
