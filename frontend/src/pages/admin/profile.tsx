import { useState, useContext } from 'react'
import withAdminAuth from '../../components/withAdminAuth'
import { authFetch } from '../../lib/authFetch'
import AuthContext from '../../contexts/AuthContext'

const API = process.env.NEXT_PUBLIC_API_BASE || '/api'

function ProfilePage() {
  const { user } = useContext(AuthContext)
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')

    if (newPassword !== confirmPassword) {
      setError('New passwords do not match.')
      return
    }

    if (!oldPassword || !newPassword) {
      setError('All password fields are required.')
      return
    }

    try {
      const r = await authFetch(`${API}/account/password`, {
        method: 'PUT',
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
        }),
      })

      if (r.ok) {
        setMessage('Password updated successfully!')
        setOldPassword('')
        setNewPassword('')
        setConfirmPassword('')
      } else {
        const res = await r.json()
        setError(res.error || 'Failed to update password.')
      }
    } catch (err) {
      setError('An unexpected error occurred.')
    }
  }

  return (
    <main className="p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Admin Profile</h1>
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="mb-4">
          <p><strong>Username:</strong> {user?.username}</p>
          <p><strong>English Name:</strong> {user?.english_name}</p>
          <p><strong>Role:</strong> {user?.role}</p>
        </div>

        <hr className="my-6" />

        <h2 className="text-xl font-semibold mb-4">Change Password</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Current Password</label>
            <input
              type="password"
              value={oldPassword}
              onChange={e => setOldPassword(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">New Password</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">Confirm New Password</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2"
              required
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          {message && <p className="text-green-500 text-sm">{message}</p>}
          <div>
            <button type="submit" className="w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
              Update Password
            </button>
          </div>
        </form>
      </div>
    </main>
  )
}

export default withAdminAuth(ProfilePage)