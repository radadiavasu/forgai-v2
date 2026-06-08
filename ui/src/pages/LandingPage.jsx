import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { api } from '../api/engine'

const EXAMPLES = [
  'A restaurant booking app',
  'A personal task manager',
  'An e-commerce store with admin panel',
]

export default function LandingPage() {
  const [brief, setBrief] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const submit = async () => {
    if (!brief.trim() || loading) return
    setLoading(true)
    try {
      const res = await api.createProject(brief.trim())
      navigate(`/projects/${res.project_id}`)
    } catch {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center px-4">
      <div className="absolute top-6 right-6">
        <Link
          to="/projects"
          className="text-gray-400 hover:text-white text-sm"
        >
          Your projects →
        </Link>
      </div>

      <h1 className="text-6xl font-bold">
        <span className="text-white">Forge</span>
        <span className="text-blue-500">AI</span>
      </h1>
      <p className="text-gray-400 text-xl mt-4 text-center max-w-xl">
        Describe what you want to build. ForgeAI does the rest.
      </p>

      <div className="mt-8 flex flex-wrap gap-2 justify-center max-w-2xl">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            onClick={() => setBrief(ex)}
            className="px-4 py-2 rounded-full bg-gray-900 border border-gray-700 text-gray-300 text-sm hover:border-blue-500 hover:text-white transition-colors"
          >
            {ex}
          </button>
        ))}
      </div>

      <div className="mt-8 w-full max-w-2xl flex flex-col gap-4">
        <textarea
          value={brief}
          onChange={(e) => setBrief(e.target.value)}
          placeholder="What do you want to build today?"
          className="bg-gray-900 border border-gray-700 rounded-xl text-white placeholder-gray-500 p-4 w-full min-h-32 resize-y focus:outline-none focus:border-blue-500"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!brief.trim() || loading}
          className="self-center bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 disabled:text-gray-500 text-white px-8 py-3 rounded-xl font-semibold transition-colors"
        >
          {loading ? 'Starting...' : 'Build it →'}
        </button>
      </div>
    </div>
  )
}
