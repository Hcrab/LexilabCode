import { useState, useEffect } from 'react'
import withAdminAuth from '../../components/withAdminAuth'
import { authFetch } from '../../lib/authFetch'

interface User {
  username: string
  password: string
  english_name: string
}

const API = process.env.NEXT_PUBLIC_API_BASE || '/api'

function UsersPage() {
  const [users, setUsers] = useState<User[]>([])
  const [form, setForm] = useState<User>({ username: '', password: '', english_name: '' })
  const [edit, setEdit] = useState<User | null>(null)
  const [file, setFile] = useState<File | null>(null)

  useEffect(() => {
    const load = async () => {
      const r = await authFetch(`${API}/usersdata`)
      if (r.ok) setUsers(await r.json())
    }
    load()
  }, [])

  const create = async () => {
    await authFetch(`${API}/usersdata`, { method: 'POST', body: JSON.stringify(form) })
    setForm({ username: '', password: '', english_name: '' })
    load()
  }

  const save = async () => {
    if (!edit) return
    await authFetch(`${API}/usersdata/${edit.username}`, { method: 'PUT', body: JSON.stringify(edit) })
    setEdit(null)
    load()
  }

  const del = async (u: string) => {
    await authFetch(`${API}/usersdata/${u}`, { method: 'DELETE' })
    load()
  }

  const importExcel = async () => {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    await authFetch(`${API}/usersdata/batch`, { method: 'POST', body: fd })
    setFile(null)
    ;(document.getElementById('file') as HTMLInputElement).value = ''
    load()
  }

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">User Management</h1>

      <section className="space-y-3">
        <h2 className="font-medium">Add User</h2>
        <div className="flex flex-wrap gap-2">
          <input className="border p-1" placeholder="username" value={form.username} onChange={e => setForm({ ...form, username: e.target.value })} />
          <input className="border p-1" placeholder="password" value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          <input className="border p-1" placeholder="English name" value={form.english_name} onChange={e => setForm({ ...form, english_name: e.target.value })} />
          <button className="px-3 py-1 bg-blue-600 text-white" onClick={create}>Create</button>
        </div>
      </section>

      {edit && (
        <section className="space-y-3">
          <h2 className="font-medium">Edit {edit.username}</h2>
          <div className="flex flex-wrap gap-2">
            <input className="border p-1" placeholder="password" value={edit.password} onChange={e => setEdit({ ...edit, password: e.target.value })} />
            <input className="border p-1" placeholder="English name" value={edit.english_name} onChange={e => setEdit({ ...edit, english_name: e.target.value })} />
            <button className="px-3 py-1 bg-green-600 text-white" onClick={save}>Save</button>
            <button className="px-3 py-1 bg-gray-400 text-white" onClick={() => setEdit(null)}>Cancel</button>
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-medium">Import from Excel</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <input id="file" type="file" onChange={e => setFile(e.target.files?.[0] || null)} />
          <button className="px-3 py-1 bg-purple-600 text-white" onClick={importExcel}>Upload</button>
        </div>
      </section>

      <table className="min-w-full text-left border mt-6">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="p-2">Username</th>
            <th className="p-2">Password</th>
            <th className="p-2">English Name</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.username} className="border-b">
              <td className="p-2">{u.username}</td>
              <td className="p-2">{u.password}</td>
              <td className="p-2">{u.english_name}</td>
              <td className="p-2 space-x-2">
                <button className="px-2 py-1 bg-yellow-500 text-white" onClick={() => setEdit(u)}>Edit</button>
                <button className="px-2 py-1 bg-red-600 text-white" onClick={() => del(u.username)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  )
}

export default withAdminAuth(UsersPage)