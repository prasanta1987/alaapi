import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth, isUserOnline } from '../context/AuthContext';
import { useCall } from '../context/CallContext';
import {
  db,
  appId,
  collection,
  doc,
  updateDoc,
  deleteDoc,
  onSnapshot
} from '../services/firebase';
import {
  Shield,
  ShieldAlert,
  ShieldCheck,
  GraduationCap,
  Music,
  Users,
  Search,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Mail,
  UserCheck,
  RefreshCw,
  Info,
  Phone,
  Video,
  Trash2
} from 'lucide-react';
import { UserAvatar } from '../components/UserAvatar';

export function EditRolePage() {
  const { currentUser, userProfile, isAdmin, loading: authLoading, loginWithGoogle } = useAuth();
  const { initiateDirectCall } = useCall();
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [feedback, setFeedback] = useState(null);
  const [updatingUid, setUpdatingUid] = useState(null);
  const navigate = useNavigate();

  // Tick for updating online status badges every 10s
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick(t => t + 1), 10000);
    return () => clearInterval(timer);
  }, []);

  // Fetch all users in real-time
  useEffect(() => {
    if (!currentUser || !isAdmin) return;

    setLoadingUsers(true);
    const usersRef = collection(db, 'artifacts', appId, 'public', 'data', 'users');
    const unsubscribe = onSnapshot(usersRef, (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      setUsers(list);
      setLoadingUsers(false);
    }, (err) => {
      console.error("Error loading users for admin:", err);
      setLoadingUsers(false);
    });

    return () => unsubscribe();
  }, [currentUser, isAdmin]);


  // Admin delete user (Cannot delete other Admins or Self)
  const handleDeleteUser = async (targetUser) => {
    if (!isAdmin) return;
    if (targetUser.role === 'admin' || targetUser.id === currentUser.uid) {
      alert("Admin accounts cannot be deleted.");
      return;
    }

    const confirmed = window.confirm(
      `Are you sure you want to permanently delete "${targetUser.displayName || targetUser.email || 'this user'}" (${targetUser.role || 'student'})?\n\nThis will remove their account profile from the platform.`
    );
    if (!confirmed) return;

    try {
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', targetUser.id);
      await deleteDoc(userRef);
      setFeedback({
        type: 'success',
        msg: `User "${targetUser.displayName || targetUser.email}" was deleted successfully.`
      });
      setTimeout(() => setFeedback(null), 4000);
    } catch (err) {
      console.error("Failed to delete user:", err);
      setFeedback({
        type: 'error',
        msg: `Failed to delete user: ${err.message}`
      });
    }
  };

  // Update user role
  const handleRoleChange = async (targetUser, newRole) => {
    if (targetUser.role === newRole) return;

    // Safety confirmation if current admin tries to change their own role
    if (targetUser.id === currentUser?.uid && newRole !== 'admin') {
      const confirmed = window.confirm(
        "Warning: You are about to remove Admin rights from your own account. You will immediately lose access to this admin role control panel. Are you sure?"
      );
      if (!confirmed) return;
    }

    setUpdatingUid(targetUser.id);
    try {
      const userRef = doc(db, 'artifacts', appId, 'public', 'data', 'users', targetUser.id);
      await updateDoc(userRef, {
        role: newRole,
        roleUpdatedAt: new Date().toISOString()
      });

      setFeedback({
        type: 'success',
        msg: `Role for ${targetUser.displayName || targetUser.email} changed to ${newRole.toUpperCase()}.`
      });

      setTimeout(() => {
        setFeedback(null);
      }, 4000);
    } catch (err) {
      console.error("Failed to update role:", err);
      setFeedback({
        type: 'error',
        msg: `Failed to update role: ${err.message}`
      });
    } finally {
      setUpdatingUid(null);
    }
  };

  // 1. Loading State
  if (authLoading) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="flex items-center gap-3 text-purple-400">
          <RefreshCw className="w-5 h-5 animate-spin" />
          <span className="text-sm font-medium">Verifying admin credentials...</span>
        </div>
      </div>
    );
  }

  // 2. Unauthenticated State
  if (!currentUser) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-8 max-w-md w-full text-center shadow-2xl">
          <div className="w-16 h-16 rounded-2xl bg-purple-900/30 text-purple-400 border border-purple-500/30 flex items-center justify-center mx-auto mb-4">
            <Shield className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Admin Portal Restricted</h2>
          <p className="text-gray-400 text-xs sm:text-sm mb-6 leading-relaxed">
            This protected administrative route (<code className="text-purple-300 font-mono">/editroll</code>) requires administrator sign-in.
          </p>
          <button
            onClick={loginWithGoogle}
            className="w-full py-3 px-6 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl text-sm shadow-lg shadow-purple-900/30 transition-all flex items-center justify-center gap-2"
          >
            Sign In with Google
          </button>
        </div>
      </div>
    );
  }

  // 3. Authenticated but NOT Admin State
  if (!isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="bg-gray-900 border border-red-900/50 rounded-3xl p-8 max-w-lg w-full text-center shadow-2xl shadow-red-950/40">
          <div className="w-16 h-16 rounded-2xl bg-red-950/50 text-red-400 border border-red-600/30 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Access Denied</h2>
          <p className="text-gray-300 text-sm mb-3">
            Administrator permissions are required to access <code className="text-red-400 font-mono">/editroll</code>.
          </p>
          <div className="p-3 rounded-xl bg-gray-950/60 border border-gray-800 text-left mb-6 text-xs text-gray-400 space-y-1">
            <p><span className="text-gray-200 font-semibold">Account:</span> {currentUser.email}</p>
            <p><span className="text-gray-200 font-semibold">Current Role:</span> <span className="capitalize text-purple-300 font-bold">{userProfile?.role || 'student'}</span></p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
            <Link
              to="/dashboard"
              className="flex-1 py-2.5 px-4 bg-purple-600 hover:bg-purple-500 text-white font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
            >
              Go to Dashboard
            </Link>
            <Link
              to="/"
              className="flex-1 py-2.5 px-4 bg-gray-800 hover:bg-gray-700 text-gray-200 font-semibold rounded-xl text-xs transition-colors flex items-center justify-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Return to Lobby
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 4. Authorized Admin View
  const adminCount = users.filter(u => u.role === 'admin').length;
  const teacherCount = users.filter(u => u.role === 'teacher').length;
  const studentCount = users.filter(u => u.role === 'student' || (!u.role && u.role !== 'admin' && u.role !== 'teacher')).length;

  const filteredUsers = users.filter(u => {
    const userRole = u.role || 'student';
    if (roleFilter !== 'all' && userRole !== roleFilter) return false;

    if (!searchTerm.trim()) return true;
    const term = searchTerm.toLowerCase();
    return (
      (u.displayName || '').toLowerCase().includes(term) ||
      (u.email || '').toLowerCase().includes(term) ||
      (u.instrument || '').toLowerCase().includes(term) ||
      (u.role || '').toLowerCase().includes(term)
    );
  });

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <Link
              to="/dashboard"
              className="text-xs text-purple-400 hover:text-purple-300 inline-flex items-center gap-1 font-semibold"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Dashboard
            </Link>
            <span className="text-gray-600">/</span>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/50">
              /editroll
            </span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black text-white flex items-center gap-3">
            <ShieldCheck className="w-7 h-7 text-purple-400" />
            User Role Administration
          </h1>
          <p className="text-xs sm:text-sm text-gray-400 mt-1">
            Manage permissions and roles for all registered users across the platform in real time.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-purple-900/40 text-purple-300 border border-purple-500/40">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Admin: {currentUser.email}
          </span>
        </div>
      </div>

      {/* Real-time Notification Banner */}
      {feedback && (
        <div className={`mb-6 p-4 rounded-2xl flex items-center gap-3 text-xs sm:text-sm font-medium border animate-fadeIn ${feedback.type === 'success'
          ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300'
          : 'bg-red-950/60 border-red-500/40 text-red-300'
          }`}>
          {feedback.type === 'success' ? (
            <CheckCircle className="w-5 h-5 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="w-5 h-5 shrink-0 text-red-400" />
          )}
          <span>{feedback.msg}</span>
        </div>
      )}

      {/* Role Stats Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Total Users</span>
            <Users className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-white">{users.length}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Students</span>
            <Music className="w-4 h-4 text-blue-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-blue-300">{studentCount}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Teachers</span>
            <GraduationCap className="w-4 h-4 text-emerald-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-emerald-300">{teacherCount}</p>
        </div>

        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 shadow-lg">
          <div className="flex items-center justify-between text-gray-400 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Admins</span>
            <Shield className="w-4 h-4 text-purple-400" />
          </div>
          <p className="text-2xl sm:text-3xl font-black text-purple-300">{adminCount}</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-6 shadow-xl flex flex-col md:flex-row gap-4 items-stretch md:items-center justify-between">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search users by name, email, or instrument..."
            className="w-full pl-10 pr-4 py-2 bg-gray-950 border border-gray-800 focus:border-purple-500 rounded-xl text-xs sm:text-sm text-gray-200 placeholder-gray-500 outline-none transition-colors"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: `All (${users.length})` },
            { id: 'student', label: `Students (${studentCount})` },
            { id: 'teacher', label: `Teachers (${teacherCount})` },
            { id: 'admin', label: `Admins (${adminCount})` }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setRoleFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors ${roleFilter === tab.id
                ? 'bg-purple-600 text-white shadow-md shadow-purple-900/30'
                : 'bg-gray-800/60 text-gray-400 hover:text-gray-200 hover:bg-gray-800'
                }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* User Management Content */}
      {loadingUsers ? (
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-12 text-center text-gray-400 flex items-center justify-center gap-3">
          <RefreshCw className="w-5 h-5 animate-spin text-purple-400" />
          <span>Loading user accounts from Firestore...</span>
        </div>
      ) : filteredUsers.length === 0 ? (
        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-12 text-center text-gray-400">
          <Users className="w-10 h-10 mx-auto mb-3 text-gray-600" />
          <p className="text-base font-semibold text-gray-300">No matching users found</p>
          <p className="text-xs text-gray-500 mt-1">Try refining your search terms or filter selection.</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-2xl">
          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="bg-gray-950/80 text-gray-400 uppercase text-[11px] font-bold tracking-wider border-b border-gray-800">
                <tr>
                  <th className="py-3.5 px-4">User</th>
                  {/* <th className="py-3.5 px-4">Email / ID</th> */}
                  <th className="py-3.5 px-4">Details</th>
                  <th className="py-3.5 px-4">Current Role</th>
                  <th className="py-3.5 px-4 text-right">Assign New Role</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredUsers.map((user) => {
                  const currentRole = user.role || 'student';
                  const isSelf = user.id === currentUser.uid;
                  const photo = isSelf ? (currentUser.photoURL || user.photoURL) : user.photoURL;

                  return (
                    <tr
                      key={user.id}
                      className={`hover:bg-gray-800/40 transition-colors ${isSelf ? 'bg-purple-950/10' : ''
                        }`}
                    >
                      {/* Name & Avatar */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="relative shrink-0">
                            <UserAvatar
                              photoURL={photo}
                              name={user.displayName}
                              size="sm"
                            />
                            <span
                              className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-gray-900 ${isUserOnline(user) ? 'bg-emerald-400' : 'bg-gray-500'
                                }`}
                            />
                          </div>
                          <div>
                            <div className="font-semibold text-gray-100 flex items-center gap-1.5">
                              {user.displayName || 'Unnamed User'}
                              {isSelf && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-900/60 text-purple-300 border border-purple-600/40">
                                  You
                                </span>
                              )}
                              <span
                                className={`text-[10px] px-1.5 py-0.2 rounded border font-medium ${isUserOnline(user)
                                  ? 'bg-emerald-950/70 text-emerald-400 border-emerald-600/40'
                                  : 'bg-gray-900 text-gray-500 border-gray-800'
                                  }`}
                              >
                                {isUserOnline(user) ? 'Online' : 'Offline'}
                              </span>
                            </div>
                            {user.phone && (
                              <div className="text-[11px] text-gray-400">
                                {user.phone}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Email / ID */}
                      {/* <td className="py-3.5 px-4 text-gray-300 font-mono text-xs">
                        {user.email ? (
                          <span>{user.email}</span>
                        ) : (
                          <span className="text-gray-500 bg-gray-950 px-2 py-0.5 rounded border border-gray-800 text-[11px]">
                            {user.id}
                          </span>
                        )}
                      </td> */}

                      {/* Details / Instrument */}
                      <td className="py-3.5 px-4">
                        <span className="text-gray-400 text-xs flex items-center gap-1">
                          <Music className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          {user.instrument || 'Vocals'}
                        </span>
                      </td>

                      {/* Current Role Badge */}
                      <td className="py-3.5 px-4">
                        {currentRole === 'admin' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-purple-900/60 text-purple-300 border border-purple-500/50 uppercase tracking-wide">
                            <Shield className="w-3 h-3" />
                            Admin
                          </span>
                        ) : currentRole === 'teacher' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-900/60 text-emerald-300 border border-emerald-500/50 uppercase tracking-wide">
                            <GraduationCap className="w-3 h-3" />
                            Teacher
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-blue-900/60 text-blue-300 border border-blue-500/50 uppercase tracking-wide">
                            <Music className="w-3 h-3" />
                            Student
                          </span>
                        )}
                      </td>

                      {/* Assign Role Dropdown, Call Actions & Delete Action */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center justify-end gap-2">
                          {!isSelf && isUserOnline(user) && (
                            <div className="inline-flex items-center gap-1">
                              <button
                                onClick={() => initiateDirectCall(user, 'video')}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition-all"
                                title={`Video Call ${user.displayName || 'User'}`}
                              >
                                <Video className="w-3 h-3" />
                                Video
                              </button>
                              <button
                                onClick={() => initiateDirectCall(user, 'audio')}
                                className="px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all"
                                title={`Audio Call ${user.displayName || 'User'}`}
                              >
                                <Phone className="w-3 h-3" />
                                Audio
                              </button>
                            </div>
                          )}
                          {updatingUid === user.id && (
                            <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                          )}
                          <select
                            value={currentRole}
                            disabled={updatingUid === user.id}
                            onChange={(e) => handleRoleChange(user, e.target.value)}
                            className="bg-gray-950 border border-gray-700 hover:border-purple-500 focus:border-purple-500 text-gray-200 text-xs font-semibold rounded-xl px-3 py-1.5 outline-none transition-colors cursor-pointer"
                          >
                            <option value="student">Student</option>
                            <option value="teacher">Teacher</option>
                            <option value="admin">Admin</option>
                          </select>
                          {/* Admin Delete Action (Non-admins only) */}
                          {!isSelf && currentRole !== 'admin' && (
                            <button
                              onClick={() => handleDeleteUser(user)}
                              title={`Delete ${user.displayName || 'User'}`}
                              className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-500/30 transition-all"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Mobile Card View */}
          <div className="block md:hidden divide-y divide-gray-800">
            {filteredUsers.map((user) => {
              const currentRole = user.role || 'student';
              const isSelf = user.id === currentUser.uid;

              return (
                <div key={user.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <UserAvatar
                        photoURL={isSelf ? (currentUser.photoURL || user.photoURL) : user.photoURL}
                        name={user.displayName}
                        size="md"
                      />
                      <div>
                        <div className="font-semibold text-gray-100 text-sm flex items-center gap-1.5">
                          {user.displayName || 'Unnamed User'}
                          {isSelf && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-900/60 text-purple-300 border border-purple-600/40">
                              You
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-gray-400 font-mono truncate max-w-[200px]">
                          {user.email || user.id}
                        </div>
                      </div>
                    </div>

                    {/* Role Badge */}
                    {currentRole === 'admin' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-900/60 text-purple-300 border border-purple-500/50 uppercase">
                        Admin
                      </span>
                    ) : currentRole === 'teacher' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-900/60 text-emerald-300 border border-emerald-500/50 uppercase">
                        Teacher
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-900/60 text-blue-300 border border-blue-500/50 uppercase">
                        Student
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs text-gray-400 pt-1">
                    <span>Instrument: <strong className="text-gray-300">{user.instrument || 'Vocals'}</strong></span>
                  </div>

                  {/* Mobile Role Switcher, Calling & Delete Actions */}
                  <div className="pt-2 border-t border-gray-800/80 flex flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-semibold text-gray-400">Change Role:</span>
                      <div className="flex items-center gap-2">
                        {updatingUid === user.id && (
                          <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                        )}
                        <select
                          value={currentRole}
                          disabled={updatingUid === user.id}
                          onChange={(e) => handleRoleChange(user, e.target.value)}
                          className="bg-gray-950 border border-gray-700 hover:border-purple-500 text-gray-200 text-xs font-semibold rounded-xl px-3 py-1.5 outline-none"
                        >
                          <option value="student">Student</option>
                          <option value="teacher">Teacher</option>
                          <option value="admin">Admin</option>
                        </select>
                        {!isSelf && currentRole !== 'admin' && (
                          <button
                            onClick={() => handleDeleteUser(user)}
                            title={`Delete ${user.displayName || 'User'}`}
                            className="p-1.5 rounded-lg bg-red-950/40 hover:bg-red-900/60 text-red-400 hover:text-red-300 border border-red-500/30 transition-all"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    {!isSelf && isUserOnline(user) && (
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          onClick={() => initiateDirectCall(user, 'video')}
                          className="py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 bg-purple-600 hover:bg-purple-500 text-white shadow-sm transition-all"
                        >
                          <Video className="w-3.5 h-3.5" />
                          Video Call
                        </button>
                        <button
                          onClick={() => initiateDirectCall(user, 'audio')}
                          className="py-1.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white shadow-sm transition-all"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          Audio Call
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Admin Help Footer */}
      <div className="mt-8 p-4 rounded-2xl bg-gray-900/60 border border-gray-800 flex items-start gap-3 text-xs text-gray-400">
        <Info className="w-4 h-4 text-purple-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold text-gray-300">Role Permissions Overview:</p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-400">
            <li><strong>Admin:</strong> Full system access, ability to visit this <code className="text-purple-300">/editroll</code> route, and manage all users' roles.</li>
            <li><strong>Teacher:</strong> Can access Dashboard, browse students, and initiate direct 1-click calls with audible ringtone.</li>
            <li><strong>Student:</strong> Receives incoming calls directly with audio ringtone, joins class with 1-click without room codes.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

