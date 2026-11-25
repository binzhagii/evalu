import { createContext, useContext, useEffect, useState, useCallback } from 'react';

// All data now lives on the server (server/api.js). This file:
//  - signs in/out (session is an HttpOnly cookie the browser sends automatically)
//  - loads the data this user may see:  GET /api/data
//  - makes changes through server actions:  act('submitEvaluation', {...})
const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

// The short confirmation shown after a change is saved. Actions not listed here stay quiet
// (opening a page, reading notifications, drafts saved in the background, or pages with their own message).
const DONE = {
  createPeriod: 'Evaluation period created', closePeriod: 'Period closed', reopenPeriod: 'Period reopened',
  releaseNext: 'Results released', withdrawRelease: 'Release step withdrawn', checkThreshold: 'Participation alerts sent',
  setPeriodDeadline: 'Deadline changed', importStaff: 'Staff list imported', applyClassTypes: 'Class types set', generateTasks: 'Evaluation tasks created', sendReminders: 'Reminders sent',
  addAssignment: 'Evaluation added', removeTask: 'Evaluation removed',
  importClassList: 'Class list imported', setStudentDepts: 'Departments confirmed', createSection: 'Class added', deleteSection: 'Class deleted', setClassType: 'Class type changed',
  importPastResults: 'Earlier records imported', deletePastResult: 'Record deleted',
  createUser: 'Account created', updateUser: 'Changes saved', resetPassword: 'Password reset', setUserActive: 'Account updated',
  addDepartment: 'Department added', updateDepartment: 'Department saved', deleteDepartment: 'Department deleted',
  addUbDepartments: 'UB departments added', addEvaluatorGroup: 'Evaluator group created', followAllDepartments: 'Sent to the VP for approval',
  createForm: 'Draft created', reviseForm: 'Draft created', useForm: 'Tool saved', unscheduleForm: 'Back to draft', discardForm: 'Draft discarded', renameForm: 'Name saved',
  addFormItem: 'Indicator added', addNewFormItem: 'Indicator added', editFormItem: 'Indicator saved', removeFormItem: 'Indicator removed',
  addFormPart: 'Part added', renameFormPart: 'Part renamed', removeFormPart: 'Part removed', addGroupWithFormula: 'Evaluator group added to a draft', updateEvaluatorGroup: 'Evaluator group saved', deleteEvaluatorGroup: 'Evaluator group removed', restoreEvaluatorGroup: 'Evaluator group restored',
  setDepartmentActive: 'Department saved', moveDepartment: 'Everyone moved',
  addCriterion: 'Question added', renameCriterion: 'Question saved', deleteCriterion: 'Question deleted',
  setFormItemWeight: 'Weight saved', setFormItemCategory: 'Question moved', setFormCategoryWeight: 'Weight saved',
  submitFormula: 'Sent to the VP for approval', approveFormula: 'Formula approved', rejectFormula: 'Formula returned to HR',
  activateFormula: 'Formula put in use', deleteFormulaDraft: 'Draft deleted', setPolicy: 'Rules saved',
  approveRelease: 'Results approved', returnToHR: 'Results returned to HR', recordResultRequest: 'Request recorded',
  createPlan: 'Development plan saved', updatePlan: 'Plan updated', acknowledgePlan: 'Marked as read', closePlan: 'Plan closed',
  saveDraft: 'Saved. You can finish it later.',
};

async function api(path, body) {
  const res = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [db, setDb] = useState(null);
  const [checking, setChecking] = useState(true); // asking the server "am I still signed in?"
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(''); // good news shown on the sign-in screen, e.g. "You have logged out"
  const [done, setDone] = useState(null); // { id, text }: the short confirmation after a change is saved

  const signedOut = useCallback((msg = '', ok = '') => { setUser(null); setDb(null); setError(msg); setNotice(ok); }, []);

  const loadData = useCallback(async () => {
    const r = await api('/api/data');
    if (r.ok) setDb(r.data);
    else if (r.status === 401) signedOut('Your session has ended. Please sign in again.');
    else setError(r.data.error || 'Could not load data.');
  }, [signedOut]);

  useEffect(() => {
    (async () => {
      try {
        const r = await api('/api/auth/me');
        if (r.ok) { setUser(r.data.user); if (!r.data.user.mustChangePassword) await loadData(); }
      } catch { /* server offline: show the login screen */ }
      setChecking(false);
    })();
  }, [loadData]);

  // Returns { ok: true, user, enter } or { ok: false, error: 'message to show' }.
  // The data is loaded first; enter() then opens the app (the sign-in screen shows "Welcome" in between).
  const login = async (username, password) => {
    try {
      const r = await api('/api/auth/login', { username, password });
      if (!r.ok) return { ok: false, error: r.data.error || 'Sign-in failed. Please try again.' };
      setError(''); setNotice('');
      const u = r.data.user;
      if (!u.mustChangePassword) await loadData(); // otherwise: choose a new password first
      return { ok: true, user: u, enter: () => setUser(u) };
    } catch {
      return { ok: false, error: "Can't reach the server. Check that it is running." };
    }
  };

  // Returns { ok: true } or { ok: false, error }. Errors are shown in the form, not the page banner.
  const changePassword = async (currentPassword, newPassword) => {
    try {
      const r = await api('/api/actions/changePassword', { currentPassword, newPassword });
      if (r.status === 401) { signedOut('Your session has ended. Please sign in again.'); return { ok: false, error: '' }; }
      if (!r.ok) return { ok: false, error: r.data.error || 'Could not change the password.' };
      setUser((u) => ({ ...u, mustChangePassword: false }));
      setDb(r.data.data);
      return { ok: true };
    } catch {
      return { ok: false, error: "Can't reach the server. Your password was not changed." };
    }
  };

  const logout = async () => {
    signedOut('', 'You have successfully logged out.');
    try { await api('/api/auth/logout', {}); } catch { /* ignore */ }
  };

  /**
   * Ask the server to make a change. On success the page data is refreshed and
   * the action's result is returned (an object). On failure the error is shown
   * at the top of the page and null is returned.
   */
  const act = useCallback(async (name, args = {}) => {
    try {
      const r = await api(`/api/actions/${name}`, args);
      if (r.ok) {
        setError(''); setDb(r.data.data);
        if (DONE[name] && !args?.preview) setDone({ id: Date.now(), text: DONE[name] }); // a short "done" message slides in
        return r.data.result;
      }
      if (r.status === 401) signedOut('Your session has ended. Please sign in again.');
      else setError(r.data.error || 'Something went wrong. Please try again.');
    } catch {
      setError("Can't reach the server. Your change was not saved.");
    }
    return null;
  }, [signedOut]);

  return (
    <Ctx.Provider value={{ db, user, checking, error, clearError: () => setError(''), notice, clearNotice: () => setNotice(''), done, clearDone: () => setDone(null), act, login, logout, changePassword, reload: loadData }}>
      {children}
    </Ctx.Provider>
  );
}
