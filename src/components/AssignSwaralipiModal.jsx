import React, { useState, useEffect } from 'react';
import {
  Users,
  Check,
  X,
  Search,
  CheckCircle2,
  Clock,
  Sparkles,
  BookOpen,
  AlertCircle
} from 'lucide-react';
import { db, appId, doc, updateDoc, serverTimestamp } from '../services/firebase';
import { UserAvatar } from './UserAvatar';

export function AssignSwaralipiModal({
  isOpen,
  onClose,
  sheet,
  students = [],
  onAssigned
}) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('assign'); // 'assign' | 'progress'
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Synchronize initial selected students from sheet
  useEffect(() => {
    if (!sheet) {
      setSelectedIds([]);
      return;
    }

    if (Array.isArray(sheet.assignedTo)) {
      setSelectedIds(sheet.assignedTo);
    } else if (sheet.studentId) {
      // Legacy single student support
      setSelectedIds([sheet.studentId]);
    } else {
      setSelectedIds([]);
    }
    setActiveTab('assign');
    setErrorMsg('');
    setSearchQuery('');
  }, [sheet, isOpen]);

  if (!isOpen || !sheet) return null;

  const completions = sheet.completions || {};
  const assignedCount = selectedIds.length;

  // Filter students based on search
  const filteredStudents = students.filter(s => {
    const name = (s.displayName || '').toLowerCase();
    const email = (s.email || '').toLowerCase();
    const inst = (s.instrument || '').toLowerCase();
    const q = searchQuery.toLowerCase().trim();
    return !q || name.includes(q) || email.includes(q) || inst.includes(q);
  });

  const allFilteredSelected =
    filteredStudents.length > 0 &&
    filteredStudents.every(s => selectedIds.includes(s.id));

  const handleToggleStudent = (studentId) => {
    setSelectedIds(prev =>
      prev.includes(studentId)
        ? prev.filter(id => id !== studentId)
        : [...prev, studentId]
    );
  };

  const handleSelectAll = () => {
    if (allFilteredSelected) {
      // Uncheck all filtered
      const filteredIdSet = new Set(filteredStudents.map(s => s.id));
      setSelectedIds(prev => prev.filter(id => !filteredIdSet.has(id)));
    } else {
      // Add all filtered
      const newIds = new Set([...selectedIds, ...filteredStudents.map(s => s.id)]);
      setSelectedIds(Array.from(newIds));
    }
  };

  const handleSaveAssignment = async () => {
    if (!sheet?.id) return;
    try {
      setIsSaving(true);
      setErrorMsg('');

      const sheetRef = doc(db, 'artifacts', appId, 'public', 'data', 'swaralipi', sheet.id);
      const studentNames = students
        .filter(s => selectedIds.includes(s.id))
        .map(s => s.displayName || s.email || 'Student');

      await updateDoc(sheetRef, {
        assignedTo: selectedIds,
        assignedStudentNames: studentNames,
        // Update legacy studentName and studentId for backwards compatibility
        studentId: selectedIds.length === 1 ? selectedIds[0] : (selectedIds.length > 1 ? 'MULTI' : ''),
        studentName: selectedIds.length === 1
          ? studentNames[0]
          : (selectedIds.length > 1 ? `${selectedIds.length} Students` : ''),
        updatedAt: serverTimestamp()
      });

      if (onAssigned) {
        onAssigned({
          ...sheet,
          assignedTo: selectedIds,
          assignedStudentNames: studentNames
        });
      }
      onClose();
    } catch (err) {
      console.error('Failed to assign Swaralipi:', err);
      setErrorMsg(err.message || 'Failed to update assignment. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  // Practice progress calculation for this sheet
  const assignedStudentsList = students.filter(s =>
    (Array.isArray(sheet.assignedTo) && sheet.assignedTo.includes(s.id)) ||
    (!sheet.assignedTo && sheet.studentId === s.id)
  );

  const completedStudentsList = assignedStudentsList.filter(
    s => completions[s.id]?.completed
  );

  const completionPercent = assignedStudentsList.length > 0
    ? Math.round((completedStudentsList.length / assignedStudentsList.length) * 100)
    : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="bg-gray-900 border border-gray-800 rounded-3xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-gray-800/80 bg-gray-900/90 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-1">
              <div className="w-7 h-7 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                <Users className="w-4 h-4" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white truncate">
                Assign Swaralipi Sheet
              </h3>
            </div>
            <p className="text-xs text-purple-300 font-bengali font-semibold truncate">
              {sheet.title || 'স্বরলিপি'}
            </p>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Select which students should receive this notation for practice.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl bg-gray-800/70 hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
            title="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab switcher: Assign vs Practice Status */}
        <div className="flex items-center border-b border-gray-800 px-4 sm:px-5 bg-gray-950/40">
          <button
            onClick={() => setActiveTab('assign')}
            className={`py-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'assign'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Select Students ({selectedIds.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('progress')}
            className={`py-2.5 px-3 text-xs font-bold border-b-2 flex items-center gap-1.5 transition-colors ${
              activeTab === 'progress'
                ? 'border-purple-500 text-purple-300'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>
              Practice Progress ({completedStudentsList.length}/{assignedStudentsList.length})
            </span>
          </button>
        </div>

        {errorMsg && (
          <div className="mx-4 mt-3 p-2.5 bg-red-950/70 border border-red-500/50 rounded-xl flex items-center gap-2 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Main Body */}
        <div className="p-4 sm:p-5 flex-1 overflow-y-auto space-y-3.5">
          {activeTab === 'assign' ? (
            <>
              {/* Controls bar: Select all & Search */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search students by name or vocal..."
                    className="w-full bg-gray-950 border border-gray-800 focus:border-purple-500/70 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-gray-500 outline-none transition-colors"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    disabled={filteredStudents.length === 0}
                    className="px-2.5 py-1.5 rounded-xl bg-gray-800 hover:bg-gray-700 disabled:opacity-50 text-xs font-semibold text-gray-200 border border-gray-700 transition-colors"
                  >
                    {allFilteredSelected ? 'Deselect All' : 'Select All'}
                  </button>
                  <span className="text-[11px] font-semibold text-gray-400">
                    {selectedIds.length} of {students.length} selected
                  </span>
                </div>
              </div>

              {/* Students Checklist */}
              {students.length === 0 ? (
                <div className="text-center py-8 bg-gray-950/40 rounded-2xl border border-gray-800/60 p-4">
                  <Users className="w-8 h-8 text-gray-600 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-gray-300">No students assigned to you</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Once students are linked to your instructor account, they will appear here.
                  </p>
                </div>
              ) : filteredStudents.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs">
                  No students matched "{searchQuery}"
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredStudents.map(student => {
                    const isSelected = selectedIds.includes(student.id);
                    const isCompleted = Boolean(completions[student.id]?.completed);
                    const completedAt = completions[student.id]?.completedAt;

                    return (
                      <div
                        key={student.id}
                        onClick={() => handleToggleStudent(student.id)}
                        className={`p-3 rounded-2xl border cursor-pointer transition-all flex items-center justify-between gap-3 ${
                          isSelected
                            ? 'bg-purple-950/30 border-purple-500/50 shadow-md shadow-purple-950/20'
                            : 'bg-gray-950/40 border-gray-800/80 hover:border-gray-700 text-gray-400'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          {/* Checkbox */}
                          <div
                            className={`w-5 h-5 rounded-lg border flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-purple-600 border-purple-500 text-white'
                                : 'border-gray-700 bg-gray-900'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>

                          {/* Avatar */}
                          <UserAvatar
                            photoURL={student.photoURL}
                            name={student.displayName || student.email || 'Student'}
                            size="sm"
                          />

                          {/* Student Info */}
                          <div className="min-w-0">
                            <p
                              className={`text-xs sm:text-sm font-bold truncate ${
                                isSelected ? 'text-white' : 'text-gray-300'
                              }`}
                            >
                              {student.displayName || student.email || 'Student'}
                            </p>
                            <p className="text-[11px] text-gray-400 truncate">
                              {student.instrument || 'Indian Classical Vocals'}
                            </p>
                          </div>
                        </div>

                        {/* Status tag */}
                        <div className="shrink-0 text-right">
                          {isCompleted ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-600/40 px-2 py-0.5 rounded-full">
                              <CheckCircle2 className="w-3 h-3" />
                              Practiced
                            </span>
                          ) : isSelected ? (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-yellow-400/90 bg-yellow-950/40 border border-yellow-700/40 px-2 py-0.5 rounded-full">
                              <Clock className="w-3 h-3" />
                              Assigned
                            </span>
                          ) : (
                            <span className="text-[10px] text-gray-500">Unassigned</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          ) : (
            /* Tab 2: Practice Progress Detail View */
            <div className="space-y-4">
              {/* Progress Summary Card */}
              <div className="bg-gray-950/70 border border-gray-800 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-gray-300">Completion Status</span>
                  <span className="font-bold text-purple-300">
                    {completedStudentsList.length} of {assignedStudentsList.length} Practiced ({completionPercent}%)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-purple-500 to-emerald-400 transition-all duration-500"
                    style={{ width: `${completionPercent}%` }}
                  />
                </div>
              </div>

              {assignedStudentsList.length === 0 ? (
                <div className="text-center py-6 text-gray-400 text-xs">
                  This Swaralipi sheet has not been assigned to any students yet. Switch to the "Select Students" tab to assign it.
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-gray-400 px-1">
                    Student Practice Log
                  </p>
                  {assignedStudentsList.map(student => {
                    const record = completions[student.id];
                    const isDone = Boolean(record?.completed);
                    const formattedDate = record?.completedAt
                      ? new Date(record.completedAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })
                      : null;

                    return (
                      <div
                        key={student.id}
                        className="p-3 bg-gray-950/40 border border-gray-800 rounded-2xl flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <UserAvatar
                            photoURL={student.photoURL}
                            name={student.displayName || student.email || 'Student'}
                            size="sm"
                          />
                          <div className="min-w-0">
                            <p className="text-xs sm:text-sm font-bold text-white truncate">
                              {student.displayName || student.email || 'Student'}
                            </p>
                            <p className="text-[11px] text-gray-400 truncate">
                              {student.instrument || 'Indian Classical Vocals'}
                            </p>
                          </div>
                        </div>

                        <div className="shrink-0 text-right">
                          {isDone ? (
                            <div>
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-600/40 px-2 py-0.5 rounded-full">
                                <CheckCircle2 className="w-3 h-3" />
                                Practiced
                              </span>
                              {formattedDate && (
                                <p className="text-[10px] text-gray-400 mt-0.5">
                                  {formattedDate}
                                </p>
                              )}
                            </div>
                          ) : (
                            <div>
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-gray-400 bg-gray-800/80 border border-gray-700/60 px-2 py-0.5 rounded-full">
                                <Clock className="w-3 h-3 text-amber-400" />
                                Practice Pending
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 sm:p-5 border-t border-gray-800 bg-gray-900/90 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400 hidden sm:block">
            {selectedIds.length === 0
              ? 'Saved to library only (unassigned)'
              : `Assigning to ${selectedIds.length} student${selectedIds.length === 1 ? '' : 's'}`}
          </p>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="flex-1 sm:flex-initial px-4 py-2 rounded-xl bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-semibold transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveAssignment}
              disabled={isSaving}
              className="flex-1 sm:flex-initial px-5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md shadow-purple-900/40 active:scale-95 flex items-center justify-center gap-2"
            >
              {isSaving ? (
                <span>Saving...</span>
              ) : (
                <>
                  <Users className="w-3.5 h-3.5" />
                  <span>
                    {selectedIds.length === 0
                      ? 'Save to Library (0)'
                      : `Assign to ${selectedIds.length} Student${selectedIds.length === 1 ? '' : 's'}`}
                  </span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
