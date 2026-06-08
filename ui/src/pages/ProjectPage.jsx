import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api/engine'

function stateBadgeClass(state) {
  switch (state) {
    case 'WAITING_BRIEF':
    case 'RESEARCHING':
    case 'PLAN_APPROVAL':
      return 'bg-yellow-400'
    case 'GENERATING_FRONTEND':
    case 'FRONTEND_APPROVAL':
      return 'bg-blue-400'
    case 'GENERATING_BACKEND':
      return 'bg-orange-400'
    case 'COMPLETE':
    case 'LIVE':
      return 'bg-green-400'
    default:
      return 'bg-gray-400'
  }
}

function formatTime(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleTimeString()
  } catch {
    return String(ts)
  }
}

function fileIcon(path) {
  if (path.endsWith('.jsx') || path.endsWith('.js')) return '⚡'
  if (path.endsWith('.css')) return '🎨'
  if (path.endsWith('.json')) return '📦'
  if (path.endsWith('.sql')) return '🗄'
  if (path.endsWith('.html')) return '🌐'
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return '🐳'
  return '📄'
}

export default function ProjectPage() {
  const { id } = useParams()
  const [project, setProject] = useState(null)
  const [activity, setActivity] = useState([])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [tab, setTab] = useState('preview')
  const [files, setFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [gateInput, setGateInput] = useState('')
  const feedRef = useRef(null)

  const scrollFeed = useCallback(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [])

  const loadProject = useCallback(async () => {
    const p = await api.getProject(id)
    setProject(p)
    return p
  }, [id])

  const loadFiles = useCallback(async () => {
    const data = await api.getFiles(id)
    setFiles(data.files || [])
  }, [id])

  const loadMessages = useCallback(async () => {
    const msgs = await api.getMessages(id)
    setMessages(msgs.messages || [])
  }, [id])

  useEffect(() => {
    loadProject()
    loadFiles()
    loadMessages()

    const es = api.streamActivity(id, (event) => {
      setActivity((prev) => {
        const key = `${event.type}-${event.message}-${event.timestamp}`
        if (prev.some((a) => `${a.type}-${a.message}-${a.timestamp}` === key)) {
          return prev
        }
        return [...prev, event]
      })
    })

    const poll = setInterval(async () => {
      const p = await loadProject()
      const msgs = await api.getMessages(id)
      setMessages(msgs.messages || [])
      if (
        p?.state === 'GENERATING_FRONTEND' ||
        p?.state === 'FRONTEND_APPROVAL' ||
        p?.state === 'GENERATING_BACKEND' ||
        p?.state === 'COMPLETE'
      ) {
        loadFiles()
      }
    }, 8000)

    return () => {
      es.close()
      clearInterval(poll)
    }
  }, [id, loadProject, loadFiles, loadMessages])

  useEffect(scrollFeed, [activity, messages, scrollFeed])

  const send = async (text) => {
    const msg = text.trim()
    if (!msg || thinking) return
    setInput('')
    setThinking(true)
    try {
      const res = await api.sendMessage(id, msg)
      setProject(res.project || project)
      await loadMessages()
      await loadFiles()
    } finally {
      setThinking(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    send(input)
  }

  const state = project?.state
  const showPreviewPlaceholder =
    state === 'GENERATING_FRONTEND' ||
    state === 'GENERATING_BACKEND' ||
    state === 'RESEARCHING' ||
    state === 'PLAN_APPROVAL'
  const showFileTree =
    state === 'FRONTEND_APPROVAL' ||
    state === 'COMPLETE' ||
    state === 'LIVE'

  const fileCount = files.length

  return (
    <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <div className="w-[40%] border-r border-gray-800 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-gray-800">
            <Link to="/" className="text-sm text-gray-500 hover:text-gray-300">
              ← ForgeAI
            </Link>
            <h1 className="text-white font-semibold mt-1 truncate">
              {project?.name || project?.brief?.slice(0, 40) || 'Loading...'}
            </h1>
            {state && (
              <span className="text-xs text-gray-500">{state}</span>
            )}
          </div>

          <div
            ref={feedRef}
            className="flex-1 overflow-y-auto px-4 py-3 space-y-3"
          >
            {messages.map((m, i) => (
              <div
                key={`msg-${i}`}
                className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div
                  className={`text-sm rounded-lg px-3 py-2 max-w-[85%] whitespace-pre-wrap ${
                    m.role === 'user'
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-800 text-white'
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {activity.map((a, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${stateBadgeClass(state)}`}
                />
                <div>
                  <p className="text-gray-300 text-sm">{a.message}</p>
                  <p className="text-gray-500 text-xs">{formatTime(a.timestamp)}</p>
                </div>
              </div>
            ))}

            {thinking && (
              <p className="text-gray-500 text-sm italic">
                ForgeAI is thinking...
              </p>
            )}

            {state === 'FRONTEND_APPROVAL' && !thinking && (
              <div className="bg-gray-900 border border-gray-700 rounded-xl p-4 mt-4">
                <p className="text-white font-medium">
                  Your frontend is ready.
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  Review it before backend starts.
                </p>
                <form
                  className="mt-3 flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (gateInput.trim()) {
                      send(gateInput)
                      setGateInput('')
                    } else {
                      send('looks good')
                    }
                  }}
                >
                  <input
                    type="text"
                    value={gateInput}
                    onChange={(e) => setGateInput(e.target.value)}
                    placeholder="Anything to change?"
                    className="flex-1 bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="submit"
                    className="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
                  >
                    →
                  </button>
                </form>
              </div>
            )}

            {state === 'COMPLETE' && (
              <div className="bg-gray-900 border border-green-500/30 rounded-xl p-4 mt-4">
                <p className="text-green-400 font-medium">
                  ✓ Project complete
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  {fileCount} files generated
                </p>
                <a
                  href={api.downloadUrl(id)}
                  className="inline-block mt-3 bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-medium"
                >
                  Download Project
                </a>
              </div>
            )}
          </div>

          {state === 'PLAN_APPROVAL' && (
            <div className="px-4">
              <div className="bg-gray-800 border border-gray-600 rounded-xl p-4 mb-3">
                <p className="text-white font-medium mb-1">
                  Plan ready for review
                </p>
                <p className="text-gray-400 text-sm mb-3">
                  Review the plan above then type your response below.
                  Say &quot;looks good&quot; to start building.
                </p>
              </div>
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className="p-4 border-t border-gray-800 flex gap-2"
          >
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Message ForgeAI..."
              rows={2}
              className="flex-1 bg-gray-900 border border-gray-700 rounded-xl text-white text-sm p-3 resize-none focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking}
              className="self-end bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
            >
              Send
            </button>
          </form>
        </div>

        {/* Right panel */}
        <div className="w-[60%] flex flex-col min-h-0">
          <div className="flex border-b border-gray-800">
            {['preview', 'files'].map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`px-6 py-3 text-sm font-medium capitalize ${
                  tab === t
                    ? 'text-white border-b-2 border-blue-500'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
              >
                {t === 'preview' ? 'Preview' : 'Files'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-hidden flex min-h-0">
            {tab === 'preview' && (
              <div className="flex-1 flex items-center justify-center p-8">
                {showPreviewPlaceholder && (
                  <p className="text-gray-500 text-center max-w-md">
                    Frontend preview will appear here once generation is
                    complete
                  </p>
                )}
                {showFileTree && files.length === 0 && (
                  <p className="text-gray-500">No files generated yet</p>
                )}
                {showFileTree && files.length > 0 && (
                  <div className="w-full h-full overflow-auto p-4">
                    <p className="text-gray-400 text-sm mb-4">
                      File tree ({files.length} files) — switch to Files tab
                      to view contents
                    </p>
                    <ul className="space-y-1 font-mono text-sm">
                      {files.map((f) => (
                        <li
                          key={f.path}
                          className="text-gray-300 flex gap-2"
                        >
                          <span>{fileIcon(f.path)}</span>
                          <span>{f.path}</span>
                          <span className="text-gray-600">
                            ({f.bytes} bytes)
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {!showPreviewPlaceholder && !showFileTree && (
                  <p className="text-gray-500">
                    Waiting for generation to begin...
                  </p>
                )}
              </div>
            )}

            {tab === 'files' && (
              <div className="flex flex-1 min-h-0">
                <div className="w-1/3 border-r border-gray-800 overflow-y-auto">
                  {files.length === 0 && (
                    <p className="text-gray-500 text-sm p-4">
                      No files yet
                    </p>
                  )}
                  {files.map((f) => (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => setSelectedFile(f)}
                      className={`w-full text-left px-3 py-2 text-sm flex gap-2 hover:bg-gray-900 ${
                        selectedFile?.path === f.path
                          ? 'bg-gray-900 text-white'
                          : 'text-gray-400'
                      }`}
                    >
                      <span>{fileIcon(f.path)}</span>
                      <span className="truncate">{f.path}</span>
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-auto p-4">
                  {selectedFile ? (
                    <pre className="text-gray-300 text-xs overflow-x-auto whitespace-pre-wrap font-mono">
                      {selectedFile.content}
                    </pre>
                  ) : (
                    <p className="text-gray-500 text-sm">
                      Select a file to view its contents
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
