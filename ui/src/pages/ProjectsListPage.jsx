import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api/engine'

function stateBadgeClass(state) {
  switch (state) {
    case 'WAITING_BRIEF':
    case 'RESEARCHING':
    case 'PLAN_APPROVAL':
      return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30'
    case 'GENERATING_FRONTEND':
    case 'FRONTEND_APPROVAL':
      return 'bg-blue-500/20 text-blue-400 border-blue-500/30'
    case 'GENERATING_BACKEND':
      return 'bg-orange-500/20 text-orange-400 border-orange-500/30'
    case 'COMPLETE':
    case 'LIVE':
      return 'bg-green-500/20 text-green-400 border-green-500/30'
    default:
      return 'bg-gray-500/20 text-gray-400 border-gray-500/30'
  }
}

export default function ProjectsListPage() {
  const [projects, setProjects] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    api.listProjects()
      .then((data) => setProjects(data.projects || []))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-950">
      <header className="border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <Link to="/" className="text-xl font-bold">
          <span className="text-white">Forge</span>
          <span className="text-blue-500">AI</span>
        </Link>
        <Link
          to="/"
          className="text-sm text-blue-400 hover:text-blue-300"
        >
          + New project
        </Link>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10">
        <h1 className="text-2xl text-white font-semibold mb-8">
          Your Projects
        </h1>

        {loading && (
          <p className="text-gray-500">Loading...</p>
        )}

        {!loading && projects.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-500 mb-4">No projects yet.</p>
            <Link
              to="/"
              className="text-blue-400 hover:text-blue-300"
            >
              Start building →
            </Link>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate(`/projects/${p.id}`)}
              className="text-left bg-gray-900 border border-gray-800 rounded-xl p-4 hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h2 className="text-white font-medium truncate">
                  {p.name || 'Untitled project'}
                </h2>
                <span
                  className={`shrink-0 text-xs px-2 py-0.5 rounded-full border ${stateBadgeClass(p.state)}`}
                >
                  {p.state}
                </span>
              </div>
              <p className="text-gray-400 text-sm line-clamp-2">
                {p.brief}
              </p>
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
