import { useCallback, useEffect, useState } from 'react'
import {
  ApiRequestError,
  createAdminUser,
  listAdminUsers,
  resetAdminPassword,
  updateAdminUser,
  type AdminUser,
} from '../api'
import { useAuth } from '../authContext'

const ROLES = ['REQUESTER', 'IT_STAFF', 'ADMINISTRATOR']

type LoadState = 'loading' | 'ready' | 'error'

interface UserForm {
  name: string
  email: string
  role: string
  active: boolean
  initialPassword: string
}

const EMPTY_FORM: UserForm = { name: '', email: '', role: 'REQUESTER', active: true, initialPassword: '' }

function roleBadge(role: string): string {
  return `tg-badge tg-badge-role-${role.toLowerCase().replace('_', '-')}`
}

export default function UserManagement() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [attempt, setAttempt] = useState(0)

  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')

  const [modal, setModal] = useState<null | { mode: 'create' } | { mode: 'edit'; user: AdminUser }>(null)
  const [form, setForm] = useState<UserForm>(EMPTY_FORM)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [formBusy, setFormBusy] = useState(false)

  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetError, setResetError] = useState<string | null>(null)
  const [resetBusy, setResetBusy] = useState(false)

  const [notice, setNotice] = useState<string | null>(null)

  const reload = useCallback(() => {
    setLoadState('loading')
    listAdminUsers({ search: search || undefined, role: roleFilter || undefined })
      .then((next) => {
        setUsers(next.items)
        setLoadState('ready')
      })
      .catch(() => setLoadState('error'))
  }, [search, roleFilter, attempt])

  useEffect(() => {
    reload()
  }, [reload])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setFormErrors({})
    setFormError(null)
    setModal({ mode: 'create' })
  }

  const openEdit = (user: AdminUser) => {
    setForm({ name: user.name, email: user.email, role: user.role, active: user.active, initialPassword: '' })
    setFormErrors({})
    setFormError(null)
    setModal({ mode: 'edit', user })
  }

  const closeModal = () => {
    setModal(null)
    setForm(EMPTY_FORM)
  }

  const submitForm = async () => {
    const errors: Record<string, string> = {}
    if (!form.name.trim()) errors.name = 'Name is required'
    if (!form.email.trim()) errors.email = 'Email is required'
    if (!ROLES.includes(form.role)) errors.role = 'Role is required'
    if (modal?.mode === 'create' && !form.initialPassword) {
      errors.initialPassword = 'Initial password is required'
    }
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    setFormBusy(true)
    setFormError(null)
    try {
      if (modal?.mode === 'create') {
        await createAdminUser({
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          active: form.active,
          initialPassword: form.initialPassword,
        })
        setNotice('User created. They must change the initial password at next sign-in.')
      } else if (modal?.mode === 'edit') {
        await updateAdminUser(modal.user.id, {
          name: form.name.trim(),
          email: form.email.trim(),
          role: form.role,
          active: form.active,
        })
        setNotice('User updated.')
      }
      closeModal()
      reload()
    } catch (error) {
      if (error instanceof ApiRequestError && error.details) {
        const mapped: Record<string, string> = {}
        for (const detail of error.details) {
          mapped[detail.field] = detail.message
        }
        setFormErrors(mapped)
        setFormError('Could not save the user. Check the highlighted fields.')
      } else if (error instanceof ApiRequestError) {
        setFormError(error.message)
      } else {
        setFormError('Unable to save the user. Please try again.')
      }
    } finally {
      setFormBusy(false)
    }
  }

  const submitReset = async () => {
    if (!resetTarget) return
    if (!resetPassword) {
      setResetError('New password is required.')
      return
    }
    setResetBusy(true)
    setResetError(null)
    try {
      await resetAdminPassword(resetTarget.id, resetPassword)
      setNotice(`New initial password set for ${resetTarget.email}. They must change it at next sign-in.`)
      setResetTarget(null)
      setResetPassword('')
      reload()
    } catch (error) {
      setResetError(error instanceof Error ? error.message : 'Unable to set the password.')
    } finally {
      setResetBusy(false)
    }
  }

  return (
    <div className="tg-card" style={{ maxWidth: '960px', margin: '0 auto' }}>
      <div className="d-flex align-items-center justify-content-between gap-3 mb-3 flex-wrap">
        <h1 className="h4 mb-0">User Management</h1>
        <button type="button" className="tg-btn tg-btn-primary" onClick={openCreate}>
          Create user
        </button>
      </div>

      {notice && (
        <div className="tg-success-panel mb-3" role="status" data-testid="admin-notice">
          {notice}
        </div>
      )}

      <form
        className="row g-2 align-items-end mb-3"
        onSubmit={(event) => {
          event.preventDefault()
          setSearch(searchInput.trim())
        }}
        aria-label="User search and filter"
      >
        <div className="col-12 col-md-6">
          <label className="tg-label" htmlFor="user-search">
            Search
          </label>
          <input
            id="user-search"
            className="tg-field w-100"
            type="search"
            placeholder="Name or email…"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
          />
        </div>
        <div className="col-12 col-md-3">
          <label className="tg-label" htmlFor="user-role-filter">
            Role
          </label>
          <select
            id="user-role-filter"
            className="tg-field w-100"
            value={roleFilter}
            onChange={(event) => setRoleFilter(event.target.value)}
          >
            <option value="">All roles</option>
            {ROLES.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>
        <div className="col-12 col-md-3">
          <button type="submit" className="tg-btn tg-btn-secondary">
            Apply search
          </button>
        </div>
      </form>

      {loadState === 'loading' && (
        <p data-testid="loading-state" style={{ color: 'var(--tg-muted)' }}>
          Loading users…
        </p>
      )}

      {loadState === 'error' && (
        <div className="tg-error-banner" data-testid="error-state" role="alert">
          Unable to load users right now.{' '}
          <button
            type="button"
            className="tg-btn tg-btn-secondary"
            style={{ minHeight: '32px', padding: '2px 12px' }}
            onClick={() => setAttempt((value) => value + 1)}
          >
            Retry
          </button>
        </div>
      )}

      {loadState === 'ready' && users.length === 0 && (
        <div className="tg-empty-state" data-testid="empty-state">
          <p className="mb-0">No users match.</p>
        </div>
      )}

      {loadState === 'ready' && users.length > 0 && (
        <>
          <div className="table-responsive d-none d-md-block">
            <table className="table align-middle">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">Role</th>
                  <th scope="col">Status</th>
                  <th scope="col" aria-label="Actions" />
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id} data-testid={`user-row-${user.id}`}>
                    <td>{user.name}</td>
                    <td style={{ wordBreak: 'break-all' }}>{user.email}</td>
                    <td>
                      <span className={roleBadge(user.role)}>{user.role}</span>
                    </td>
                    <td>{user.active ? 'Active' : 'Deactivated'}</td>
                    <td className="d-flex gap-2">
                      <button
                        type="button"
                        className="tg-btn tg-btn-secondary"
                        aria-label={`Edit ${user.name}`}
                        onClick={() => openEdit(user)}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        className="tg-btn tg-btn-tertiary"
                        aria-label={`Set new password for ${user.name}`}
                        onClick={() => {
                          setResetTarget(user)
                          setResetPassword('')
                          setResetError(null)
                        }}
                      >
                        Set password
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="d-md-none">
            {users.map((user) => (
              <div key={user.id} className="tg-card mb-2" data-testid={`user-card-${user.id}`}>
                <p className="mb-1">
                  <strong>{user.name}</strong>
                </p>
                <p className="mb-1 small" style={{ wordBreak: 'break-all' }}>
                  {user.email}
                </p>
                <div className="d-flex gap-2 align-items-center flex-wrap mb-2">
                  <span className={roleBadge(user.role)}>{user.role}</span>
                  <span className="small" style={{ color: 'var(--tg-muted)' }}>
                    {user.active ? 'Active' : 'Deactivated'}
                  </span>
                </div>
                <div className="d-flex gap-2">
                  <button
                    type="button"
                    className="tg-btn tg-btn-secondary"
                    aria-label={`Edit ${user.name}`}
                    onClick={() => openEdit(user)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="tg-btn tg-btn-tertiary"
                    aria-label={`Set new password for ${user.name}`}
                    onClick={() => {
                      setResetTarget(user)
                      setResetPassword('')
                      setResetError(null)
                    }}
                  >
                    Set password
                  </button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {modal && (
        <div
          className="tg-modal-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeModal()
          }}
        >
          <div className="tg-modal" role="dialog" aria-modal="true" aria-labelledby="user-modal-title">
            <h3 id="user-modal-title" className="h6 mb-3">
              {modal.mode === 'create' ? 'Create user' : `Edit ${modal.user.name}`}
            </h3>
            <div className="mb-3">
              <label className="tg-label" htmlFor="user-name">
                Name <span className="tg-required-mark">*</span>
              </label>
              <input
                id="user-name"
                className={`tg-field w-100${formErrors.name ? ' tg-field-invalid' : ''}`}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
              />
              {formErrors.name && <p className="tg-field-error">{formErrors.name}</p>}
            </div>
            <div className="mb-3">
              <label className="tg-label" htmlFor="user-email">
                Email <span className="tg-required-mark">*</span>
              </label>
              <input
                id="user-email"
                className={`tg-field w-100${formErrors.email ? ' tg-field-invalid' : ''}`}
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
              />
              {formErrors.email && <p className="tg-field-error">{formErrors.email}</p>}
            </div>
            <div className="row g-3 mb-3">
              <div className="col-6">
                <label className="tg-label" htmlFor="user-role">
                  Role <span className="tg-required-mark">*</span>
                </label>
                <select
                  id="user-role"
                  className="tg-field w-100"
                  value={form.role}
                  onChange={(event) => setForm({ ...form, role: event.target.value })}
                >
                  {ROLES.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <div className="col-6">
                <span className="tg-label" id="user-active-label">
                  Status
                </span>
                <div className="form-check" role="group" aria-labelledby="user-active-label">
                  <input
                    id="user-active"
                    className="form-check-input"
                    type="checkbox"
                    checked={form.active}
                    disabled={
                      (modal.mode === 'edit' && modal.user.id === me?.id) ||
                      (modal.mode === 'edit' && !form.active && users.filter((u) => u.active && u.role === 'ADMINISTRATOR').length <= 1)
                    }
                    onChange={(event) => setForm({ ...form, active: event.target.checked })}
                  />
                  <label className="form-check-label" htmlFor="user-active">
                    Active
                  </label>
                </div>
                {modal.mode === 'edit' && modal.user.id === me?.id && (
                  <p className="small mb-0" style={{ color: 'var(--tg-muted)' }}>
                    You cannot deactivate your own account.
                  </p>
                )}
                {modal.mode === 'edit' && modal.user.id !== me?.id && !form.active && users.filter((u) => u.active && u.role === 'ADMINISTRATOR').length <= 1 && (
                  <p className="small mb-0" style={{ color: 'var(--tg-muted)' }}>
                    Cannot deactivate — at least one active Administrator is required.
                  </p>
                )}
              </div>
            </div>
            {modal.mode === 'create' && (
              <div className="mb-3">
                <label className="tg-label" htmlFor="user-initial-password">
                  Initial password <span className="tg-required-mark">*</span>
                </label>
                <input
                  id="user-initial-password"
                  className={`tg-field w-100${formErrors.initialPassword ? ' tg-field-invalid' : ''}`}
                  type="password"
                  autoComplete="new-password"
                  value={form.initialPassword}
                  onChange={(event) => setForm({ ...form, initialPassword: event.target.value })}
                />
                <p className="mb-0 small" style={{ color: 'var(--tg-muted)' }}>
                  8–72 characters, a letter and a digit. The user must change it at next sign-in.
                </p>
                {formErrors.initialPassword && <p className="tg-field-error">{formErrors.initialPassword}</p>}
              </div>
            )}
            {formError && (
              <div className="tg-error-banner mb-3" role="alert" data-testid="user-form-error">
                {formError}
              </div>
            )}
            <div className="d-flex justify-content-end gap-2 mt-2">
              <button type="button" className="tg-btn tg-btn-tertiary" onClick={closeModal}>
                Cancel
              </button>
              <button
                type="button"
                className="tg-btn tg-btn-primary"
                disabled={formBusy}
                data-testid="user-form-save"
                onClick={() => void submitForm()}
              >
                {formBusy ? 'Saving…' : modal.mode === 'create' ? 'Create user' : 'Save changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {resetTarget && (
        <div
          className="tg-modal-overlay"
          role="presentation"
          onClick={(event) => {
            if (event.target === event.currentTarget) setResetTarget(null)
          }}
        >
          <div className="tg-modal" role="dialog" aria-modal="true" aria-labelledby="reset-password-title">
            <h3 id="reset-password-title" className="h6 mb-1">
              Set new password for {resetTarget.name}?
            </h3>
            <p className="small mb-3" style={{ color: 'var(--tg-muted)' }}>
              They must change it at their next sign-in. Their other sessions are signed out.
            </p>
            <label className="tg-label" htmlFor="reset-password">
              New initial password <span className="tg-required-mark">*</span>
            </label>
            <input
              id="reset-password"
              className="tg-field w-100"
              type="password"
              autoComplete="new-password"
              value={resetPassword}
              onChange={(event) => {
                setResetPassword(event.target.value)
                setResetError(null)
              }}
            />
            {resetError && <p className="tg-field-error">{resetError}</p>}
            <div className="d-flex justify-content-end gap-2 mt-2">
              <button type="button" className="tg-btn tg-btn-tertiary" onClick={() => setResetTarget(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="tg-btn tg-btn-danger"
                disabled={resetBusy}
                data-testid="confirm-reset"
                onClick={() => void submitReset()}
              >
                {resetBusy ? 'Saving…' : 'Set password'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
