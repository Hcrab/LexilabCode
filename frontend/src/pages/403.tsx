import Link from 'next/link'
import withAuth from '../components/withAuth'

function Forbidden() {
  return (
    <main className="p-6 text-center space-y-3">
      <h1 className="text-2xl font-bold">403 - Forbidden</h1>
      <p>You do not have permission to access this page.</p>
      <Link className="text-blue-600 underline" href="/login">Return to Login</Link>
    </main>
  )
}

export default withAuth(Forbidden)