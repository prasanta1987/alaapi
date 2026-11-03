import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { X, Save, User, Phone, Music, FileText } from 'lucide-react';
import { UserAvatar } from './UserAvatar';

export function ProfileModal({ isOpen, onClose }) {
  const { currentUser, userProfile, updateUserProfile } = useAuth();

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
      setInstrument(userProfile.instrument || 'Vocals');
      setBio(userProfile.bio || '');
    }
  }, [userProfile, currentUser]);

  if (!isOpen || !currentUser) return null;

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
      <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl relative">
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 text-gray-400 hover:text-white transition-colors p-1"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <UserAvatar
            photoURL={currentUser.photoURL || userProfile?.photoURL}
            name={userProfile?.displayName || currentUser.displayName}
            size="lg"
          />
          <div>
            <h3 className="text-lg font-bold text-white">Your Profile</h3>
            <p className="text-gray-400 text-xs">{currentUser.email}</p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 text-xs sm:text-sm">
          <div>
            <label className="block text-gray-400 font-medium mb-1 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-purple-400" />
              Display Name
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="w-full bg-gray-800/80 border border-gray-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
            />
          </div>

          <div>
            <label className="block text-gray-400 font-medium mb-1 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-blue-400" />
              Phone / Contact
            </label>
            <input
              type="tel"
              placeholder="+1 234 567 8900"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full bg-gray-800/80 border border-gray-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
            />
          </div>

          <div>
            <label className="block text-gray-400 font-medium mb-1 flex items-center gap-1.5">
              <Music className="w-3.5 h-3.5 text-green-400" />
              Vocal Range / Instrument
            </label>
            <input
              type="text"
              placeholder="e.g. Classical Soprano, Tenor, Acoustic Guitar"
              value={instrument}
              onChange={(e) => setInstrument(e.target.value)}
              className="w-full bg-gray-800/80 border border-gray-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors shadow-inner"
            />
          </div>

          <div>
            <label className="block text-gray-400 font-medium mb-1 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-yellow-400" />
              Bio / Note for Class
            </label>
            <textarea
              rows="3"
              placeholder="Add your music background or goals..."
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="w-full bg-gray-800/80 border border-gray-700 rounded-xl px-3.5 py-2 text-white focus:outline-none focus:border-purple-500 transition-colors resize-none shadow-inner"
            />
          </div>

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="w-full py-2.5 px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-semibold flex items-center justify-center gap-2 shadow-lg shadow-purple-900/30 transition-all disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

