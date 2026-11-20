import React from 'react';
import {
  X,
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
  AlertTriangle,
  Users,
  Sparkles,
  GraduationCap
} from 'lucide-react';
import { UserAvatar } from './UserAvatar';

/**
 * Reusable Confirmation Modal for Role Demotions
 * e.g., Admin -> Teacher, Admin -> Student, Teacher -> Student
 */
export function DemotionModal({ target, onConfirm, onCancel }) {
  if (!target) return null;

  const { user, currentRole, newRole, isSelf, assignedStudentsCount } = target;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="bg-gray-900 border border-amber-500/40 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl relative flex flex-col items-center gap-3 text-center">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="Cancel"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Glowing Amber Shield Icon */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500/20 to-red-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-950/40">
          <ShieldAlert className="w-7 h-7" />
        </div>

        <div>
          <h3 className="text-lg sm:text-xl font-bold text-white mb-1">
            Confirm Role Demotion
          </h3>
          <p className="text-xs text-gray-400">
            Please confirm this role downgrade before continuing.
          </p>
        </div>

        {/* User Target Card with Transition Pill */}
        <div className="w-full bg-gray-850 border border-gray-700/80 rounded-2xl p-3.5 flex flex-col gap-2.5 text-left shadow-inner">
          <div className="flex items-center gap-3">
            <UserAvatar
              photoURL={user?.photoURL}
              name={user?.displayName || user?.email}
              size="md"
              className="w-10 h-10 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-bold text-white truncate">
                {user?.displayName || 'User'}
              </h4>
              <p className="text-xs text-gray-400 font-mono truncate">
                {user?.email || 'No email'}
              </p>
            </div>
          </div>

          {/* Role Transition Indicator */}
          <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-700/60 font-mono text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-gray-800 text-gray-300 font-semibold uppercase border border-gray-700">
              {currentRole}
            </span>
            <ArrowRight className="w-4 h-4 text-amber-400 shrink-0" />
            <span className="px-2.5 py-1 rounded-lg bg-red-950/70 text-red-300 font-bold uppercase border border-red-500/40">
              {newRole}
            </span>
          </div>
        </div>

        {/* Warnings Container */}
        <div className="w-full flex flex-col gap-2 text-left text-xs">
          {/* Warning: Self-Demotion from Admin */}
          {isSelf && currentRole === 'admin' && (
            <div className="p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-red-300 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <p className="leading-snug">
                <strong>Critical Warning:</strong> You are removing Admin rights from your own account. You will immediately lose access to this admin control panel.
              </p>
            </div>
          )}

          {/* Warning: Assigned Students unassigned & deleted */}
          {assignedStudentsCount > 0 && newRole === 'student' && (
            <div className="p-3 rounded-xl bg-amber-950/50 border border-amber-500/40 text-amber-300 flex items-start gap-2.5">
              <Users className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
              <p className="leading-snug">
                This teacher currently has <strong>{assignedStudentsCount} assigned student(s)</strong>. Demoting will automatically unassign all {assignedStudentsCount} students and delete their teacher assignment records.
              </p>
            </div>
          )}

          {/* General Note */}
          <div className="p-2.5 rounded-xl bg-gray-800/60 border border-gray-700/60 text-gray-300 text-[11px] leading-relaxed">
            This account will lose access and privileges associated with the <strong>{(currentRole || '').toUpperCase()}</strong> role.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-750 active:scale-95 text-gray-300 hover:text-white font-semibold text-xs border border-gray-700 transition-all shadow-sm cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 active:scale-95 text-white font-bold text-xs shadow-lg shadow-red-900/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Confirm Demotion</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Reusable Confirmation Modal for Role Promotions
 * e.g., Student -> Teacher, Student -> Admin, Teacher -> Admin
 */
export function PromotionModal({ target, onConfirm, onCancel }) {
  if (!target) return null;

  const { user, currentRole, newRole } = target;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn select-none">
      <div className="bg-gray-900 border border-purple-500/40 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl relative flex flex-col items-center gap-3 text-center">
        {/* Close button */}
        <button
          onClick={onCancel}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          title="Cancel"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Glowing Purple Shield/Sparkles Icon */}
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500/20 via-indigo-500/20 to-pink-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400 shadow-lg shadow-purple-950/40">
          <Sparkles className="w-7 h-7 text-purple-300" />
        </div>

        <div>
          <h3 className="text-lg sm:text-xl font-bold text-white mb-1">
            Confirm Role Promotion
          </h3>
          <p className="text-xs text-gray-400">
            Please confirm this role upgrade for the user.
          </p>
        </div>

        {/* User Target Card with Transition Pill */}
        <div className="w-full bg-gray-850 border border-gray-700/80 rounded-2xl p-3.5 flex flex-col gap-2.5 text-left shadow-inner">
          <div className="flex items-center gap-3">
            <UserAvatar
              photoURL={user?.photoURL}
              name={user?.displayName || user?.email}
              size="md"
              className="w-10 h-10 shrink-0"
            />
            <div className="min-w-0 flex-1">
              <h4 className="text-sm font-bold text-white truncate">
                {user?.displayName || 'User'}
              </h4>
              <p className="text-xs text-gray-400 font-mono truncate">
                {user?.email || 'No email'}
              </p>
            </div>
          </div>

          {/* Role Transition Indicator */}
          <div className="flex items-center justify-center gap-2 pt-2 border-t border-gray-700/60 font-mono text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-gray-800 text-gray-300 font-semibold uppercase border border-gray-700">
              {currentRole}
            </span>
            <ArrowRight className="w-4 h-4 text-purple-400 shrink-0" />
            <span className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-950 to-indigo-950 text-purple-200 font-bold uppercase border border-purple-500/40">
              {newRole}
            </span>
          </div>
        </div>

        {/* Permissions / Benefits Container */}
        <div className="w-full flex flex-col gap-2 text-left text-xs">
          {/* Promoting to Teacher */}
          {newRole === 'teacher' && (
            <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-300 flex items-start gap-2.5">
              <GraduationCap className="w-4 h-4 shrink-0 text-emerald-400 mt-0.5" />
              <p className="leading-snug">
                <strong>Teacher Privileges:</strong> This user will be granted access to the Teacher Dashboard, can be assigned students, and can place direct calls to students.
              </p>
            </div>
          )}

          {/* Promoting to Admin */}
          {newRole === 'admin' && (
            <div className="p-3 rounded-xl bg-purple-950/50 border border-purple-500/40 text-purple-300 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 shrink-0 text-purple-400 mt-0.5" />
              <p className="leading-snug">
                <strong>Full Admin Privileges:</strong> This user will gain complete administrative control over the platform, including access to this role management panel and user administration.
              </p>
            </div>
          )}

          {/* General Note */}
          <div className="p-2.5 rounded-xl bg-gray-800/60 border border-gray-700/60 text-gray-300 text-[11px] leading-relaxed">
            This account will immediately receive the privileges associated with the <strong>{(newRole || '').toUpperCase()}</strong> role.
          </div>
        </div>

        {/* Action Buttons */}
        <div className="w-full flex items-center gap-3 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2.5 px-4 rounded-xl bg-gray-800 hover:bg-gray-750 active:scale-95 text-gray-300 hover:text-white font-semibold text-xs border border-gray-700 transition-all shadow-sm cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 active:scale-95 text-white font-bold text-xs shadow-lg shadow-purple-900/40 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Confirm Promotion</span>
          </button>
        </div>
      </div>
    </div>
  );
}
