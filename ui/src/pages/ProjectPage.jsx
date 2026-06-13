import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import { api } from '../api/engine'
import WebContainerPreview from '../components/WebContainerPreview'
import FileTree from '../components/FileTree'

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
    case 'CANCELLED':
      return 'bg-red-400'
    default:
      return 'bg-gray-400'
  }
}

function canStopProject(state) {
  return [
    'RESEARCHING',
    'PLAN_APPROVAL',
    'GENERATING_FRONTEND',
    'FRONTEND_APPROVAL',
    'GENERATING_BACKEND',
  ].includes(state)
}

function formatTime(ts) {
  if (!ts) return ''
  try {
    return new Date(ts).toLocaleTimeString()
  } catch {
    return String(ts)
  }
}

function getLanguage(path) {
  if (!path) return 'plaintext'
  if (path.endsWith('.jsx') || path.endsWith('.js')) return 'javascript'
  if (path.endsWith('.ts') || path.endsWith('.tsx')) return 'typescript'
  if (path.endsWith('.css')) return 'css'
  if (path.endsWith('.html')) return 'html'
  if (path.endsWith('.json')) return 'json'
  if (path.endsWith('.sql')) return 'sql'
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml'
  if (path.endsWith('.md')) return 'markdown'
  if (path.endsWith('.py')) return 'python'
  return 'plaintext'
}

export default function ProjectPage() {
  const { id: projectId } = useParams()
  const [project, setProject] = useState(null)
  const [activity, setActivity] = useState([])
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
  const [rightView, setRightView] = useState('code')
  const [files, setFiles] = useState([])
  const [selectedFile, setSelectedFile] = useState(null)
  const [gateInput, setGateInput] = useState('')
  const [stopping, setStopping] = useState(false)
  const [previewBannerDismissed, setPreviewBannerDismissed] = useState(false)
  const feedRef = useRef(null)

  const scrollFeed = useCallback(() => {
    if (feedRef.current) {
      feedRef.current.scrollTop = feedRef.current.scrollHeight
    }
  }, [])

  const loadProject = useCallback(async () => {
    const p = await api.getProject(projectId)
    setProject(p)
    return p
  }, [projectId])

  const loadFiles = useCallback(async () => {
    const data = await api.getFiles(projectId)
    setFiles(data.files || [])
  }, [projectId])

  const loadMessages = useCallback(async () => {
    const msgs = await api.getMessages(projectId)
    setMessages(msgs.messages || [])
  }, [projectId])

  useEffect(() => {
    setPreviewBannerDismissed(false)
  }, [projectId])

  useEffect(() => {
    const fetchFiles = async () => {
      const result = await api.getFiles(projectId)
      setFiles(result.files || [])
    }
    fetchFiles()
    const interval = setInterval(fetchFiles, 5000)
    return () => clearInterval(interval)
  }, [projectId])

  useEffect(() => {
    loadProject()
    loadMessages()

    const es = api.streamActivity(projectId, (event) => {
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
      const msgs = await api.getMessages(projectId)
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
  }, [projectId, loadProject, loadFiles, loadMessages])

  useEffect(() => {
    if (files.length === 0) return
    if (!selectedFile || !files.some((f) => f.path === selectedFile.path)) {
      setSelectedFile(files[0])
    }
  }, [files, selectedFile])

  useEffect(() => {
    if (
      project?.state === 'FRONTEND_APPROVAL' ||
      project?.state === 'COMPLETE'
    ) {
      setRightView('preview')
    }
  }, [project?.state])

  useEffect(scrollFeed, [activity, messages, scrollFeed])

  const send = async (text) => {
    const msg = text.trim()
    if (!msg || thinking) return
    setInput('')
    setThinking(true)
    try {
      const res = await api.sendMessage(projectId, msg)
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

  const stopProject = async () => {
    if (stopping || !canStopProject(project?.state)) return
    if (!window.confirm('Stop this project? You can start a new one from the home page.')) {
      return
    }
    setStopping(true)
    try {
      const res = await api.cancelProject(projectId)
      await loadProject()
      await loadMessages()
      setActivity((prev) => [
        ...prev,
        {
          type: 'cancelled',
          message: res.message || 'Project stopped',
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setStopping(false)
    }
  }

  const state = project?.state
  const fileCount = files.length

  return (
    <div className="h-screen bg-gray-950 flex flex-col overflow-hidden">
      <div className="flex flex-1 min-h-0">
        {/* Left panel */}
        <div className="w-[40%] border-r border-gray-800 flex flex-col min-h-0">
          <div className="px-4 py-3 border-b border-gray-800 flex items-start justify-between gap-2">
            <div className="min-w-0">
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
            {canStopProject(state) && (
              <button
                type="button"
                onClick={stopProject}
                disabled={stopping}
                className="shrink-0 text-xs px-3 py-1.5 rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10 disabled:opacity-50"
              >
                {stopping ? 'Stopping...' : 'Stop'}
              </button>
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
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    a.type === 'error' || a.type === 'cancelled'
                      ? 'bg-red-500'
                      : stateBadgeClass(state)
                  }`}
                />
                <div>
                  <p
                    className={`text-sm ${
                      a.type === 'error' || a.type === 'cancelled'
                        ? 'text-red-400'
                        : 'text-gray-300'
                    }`}
                  >
                    {a.message}
                  </p>
                  <p className="text-gray-500 text-xs">{formatTime(a.timestamp)}</p>
                </div>
              </div>
            ))}

            {thinking && (
              <p className="text-gray-500 text-sm italic">
                ForgeAI is thinking...
              </p>
            )}

            {state === 'RESEARCHING' && !thinking && (
              <div className="bg-gray-900 border border-yellow-500/30 rounded-xl p-4 mt-4">
                <p className="text-yellow-400 font-medium">
                  Planning your project...
                </p>
                <p className="text-gray-400 text-sm mt-1">
                  This usually takes 1–3 minutes. Use Stop if it seems stuck.
                </p>
              </div>
            )}

            {state === 'CANCELLED' && (
              <div className="bg-gray-900 border border-red-500/30 rounded-xl p-4 mt-4">
                <p className="text-red-400 font-medium">Project stopped</p>
                <p className="text-gray-400 text-sm mt-1">
                  <Link to="/" className="text-blue-400 hover:text-blue-300">
                    Start a new project →
                  </Link>
                </p>
              </div>
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
                  href={api.downloadUrl(projectId)}
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
              placeholder={
                state === 'CANCELLED'
                  ? 'Project stopped — start a new one from home'
                  : 'Message ForgeAI...'
              }
              rows={2}
              disabled={state === 'CANCELLED'}
              className="flex-1 bg-gray-900 border border-gray-700 rounded-xl text-white text-sm p-3 resize-none focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
            <button
              type="submit"
              disabled={!input.trim() || thinking || state === 'CANCELLED'}
              className="self-end bg-blue-600 hover:bg-blue-500 disabled:bg-gray-700 text-white px-4 py-2 rounded-xl text-sm font-medium"
            >
              Send
            </button>
          </form>
        </div>

        {/* Right panel */}
        <div className="w-[60%] flex flex-col min-h-0 bg-gray-950">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-900 border-b border-gray-800 gap-3">
            <span className="text-gray-400 text-sm truncate min-w-0 flex-1">
              {rightView === 'preview' ? (
                <span className="text-gray-500">Live preview</span>
              ) : selectedFile ? (
                <>
                  <span className="text-gray-500">{selectedFile.path.replace(/[^/]+$/, '')}</span>
                  <span className="text-white font-medium">
                    {selectedFile.path.split('/').pop()}
                  </span>
                </>
              ) : (
                'No file selected'
              )}
            </span>

            {rightView === 'preview' && !previewBannerDismissed && (
              <span className="hidden sm:inline-flex items-center gap-1.5 shrink-0 text-[11px] text-amber-200/90 bg-amber-500/10 border border-amber-500/25 rounded-full px-2.5 py-0.5">
                Mock API · backend not running
                <button
                  type="button"
                  onClick={() => setPreviewBannerDismissed(true)}
                  className="text-amber-200/60 hover:text-amber-100 leading-none"
                  title="Dismiss"
                  aria-label="Dismiss preview notice"
                >
                  ×
                </button>
              </span>
            )}

            <div className="flex gap-1 shrink-0">
              <button
                type="button"
                onClick={() => setRightView('preview')}
                className={`p-1.5 rounded ${
                  rightView === 'preview'
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                title="Preview"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              </button>

              <button
                type="button"
                onClick={() => setRightView('code')}
                className={`p-1.5 rounded ${
                  rightView === 'code'
                    ? 'bg-gray-700 text-white'
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                title="Code"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-hidden flex min-h-0">
            <div
              className={`flex-1 min-h-0 ${
                rightView === 'preview' ? 'flex' : 'hidden'
              }`}
            >
              <WebContainerPreview
                files={files}
                projectId={projectId}
              />
            </div>

            {rightView === 'code' && (
              <div className="flex flex-1 min-h-0">
                <div className="w-[260px] shrink-0 bg-[#0d1117] border-r border-gray-800 flex flex-col min-h-0 h-full">
                  <FileTree
                    files={files}
                    selectedPath={selectedFile?.path}
                    onSelectFile={setSelectedFile}
                  />
                </div>

                <div className="flex-1 min-h-0">
                  {selectedFile ? (
                    <Editor
                      height="100%"
                      language={getLanguage(selectedFile?.path)}
                      value={selectedFile?.content || ''}
                      theme="vs-dark"
                      options={{
                        readOnly: true,
                        minimap: { enabled: false },
                        fontSize: 13,
                        lineNumbers: 'on',
                        scrollBeyondLastLine: false,
                        wordWrap: 'on',
                      }}
                    />
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-gray-500 text-sm">
                        Select a file to view its contents
                      </p>
                    </div>
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
