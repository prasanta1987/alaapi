import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LogOut, User, Shield, GraduationCap, Music, Sliders } from 'lucide-react';
import { UserAvatar } from './UserAvatar';

export function Navbar({ onOpenProfile, onOpenAudioSettings }) {
  const { currentUser, userProfile, isAdmin, loginWithGoogle, logout } = useAuth();
  const location = useLocation();

  const getRoleBadge = (role) => {
    switch (role) {
      case 'admin':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-900/60 text-purple-300 border border-purple-600/40 uppercase tracking-wider">
            <Shield className="w-2.5 h-2.5" />
            Admin
          </span>
        );
      case 'teacher':
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-900/60 text-emerald-300 border border-emerald-600/40 uppercase tracking-wider">
            <GraduationCap className="w-2.5 h-2.5" />
            Teacher
          </span>
        );
      case 'student':
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-900/60 text-blue-300 border border-blue-600/40 uppercase tracking-wider">
            <Music className="w-2.5 h-2.5" />
            Student
          </span>
        );
    }
  };

  return (
    <nav className="w-full bg-gray-900/95 backdrop-blur border-b border-gray-800 px-3 sm:px-6 py-2.5 flex items-center justify-between shrink-0 z-40">
      {/* Brand & Nav Links */}
      <div className="flex items-center gap-4 sm:gap-6">
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white shadow-md shadow-purple-900/30 group-hover:scale-105 transition-transform">
            <Music className="w-4 h-4" />
          </div>
          {/* <span className="font-extrabold text-sm sm:text-base tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-100 to-gray-300">
            Alaapi Studio
          </span> */}
        </Link>

        {/* Links */}
        <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm font-medium">
          <Link
            to="/"
            className={`px-2.5 py-1.5 rounded-lg transition-colors ${location.pathname === '/'
              ? 'bg-gray-800 text-purple-400 font-semibold'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
              }`}
          >
            Lobby
          </Link>
          {
            currentUser && (
              <Link
                to="/dashboard"
                className={`px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 ${location.pathname === '/dashboard'
                  ? 'bg-gray-800 text-purple-400 font-semibold'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                  }`}
              >
                Dashboard
              </Link>
            )
          }


          {/* Hidden Admin-Only Roles Link */}
          {isAdmin && (
            <Link
              to="/editroll"
              title="Admin Role Management"
              className={`px-2.5 py-1.5 rounded-lg transition-colors flex items-center gap-1.5 text-xs sm:text-sm ${location.pathname === '/editroll' || location.pathname === '/editroles'
                ? 'bg-purple-900/60 text-purple-300 font-semibold border border-purple-500/40'
                : 'text-purple-400 hover:text-purple-200 hover:bg-purple-950/40'
                }`}
            >
              <Shield className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Edit Roles</span>
            </Link>
          )}

          {/* Audio Settings Trigger */}
          <button
            onClick={onOpenAudioSettings}
            title="Audio & DSP Settings"
            className="px-2.5 py-1.5 rounded-lg text-gray-300 hover:text-purple-300 hover:bg-gray-800 transition-colors flex items-center gap-1.5 text-xs sm:text-sm"
          >
            <Sliders className="w-3.5 h-3.5 text-purple-400" />
            <span className="hidden sm:inline">Audio Settings</span>
          </button>
        </div>
      </div>

      {/* User Auth Section */}
      <div className="flex items-center gap-2 sm:gap-3">
        {currentUser ? (
          <div className="flex items-center gap-2">
            {/* Role Badge */}
            {/* <div className="hidden xs:flex">
              {getRoleBadge(userProfile?.role)}
            </div> */}

            {/* Profile Button */}
            <button
              onClick={onOpenProfile}
              className="flex items-center gap-2 bg-gray-800/80 hover:bg-gray-800 px-2.5 py-1 sm:px-3 sm:py-1.5 rounded-xl border border-gray-700/80 hover:border-gray-600 text-xs text-gray-200 transition-all shadow-sm"
              title="Edit Profile"
            >
              <UserAvatar
                photoURL={currentUser.photoURL || userProfile?.photoURL}
                name={userProfile?.displayName || currentUser.displayName}
                size="xs"
              />
              {/* <span className="font-medium max-w-[50px] sm:max-w-[130px] truncate text-left">
                  {userProfile?.displayName || currentUser.displayName || 'Vocalist'}
                </span> */}

              {/* <User className="w-3.5 h-3.5 text-gray-400 hidden sm:inline" /> */}
            </button>

            {/* Logout Button */}
            <button
              onClick={logout}
              className="p-1.5 sm:p-3 text-red-500 hover:text-red-700 hover:bg-gray-800 rounded-lg transition-colors"
              title="Sign Out"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        ) : (
          <button
            onClick={loginWithGoogle}
            className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-gray-800 hover:bg-gray-750 active:bg-gray-700 text-white text-xs sm:text-sm font-semibold rounded-xl border border-gray-700 hover:border-gray-600 transition-all shadow-md group"
          >
            <svg className="w-4 h-4 shrink-0 transition-transform group-hover:scale-110" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
            </svg>
            <span className="whitespace-nowrap">
              <span className="sm:inline">Sign in</span>
            </span>
          </button>
        )}
      </div>
    </nav>
  );
}

