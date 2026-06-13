import { useEffect, useRef, useState, useMemo } from 'react'
import {
  buildPreviewMockSpec,
  generatePreviewMockPlugin,
  sanitizePreviewFiles,
  collectPreviewDependencies,
} from '../utils/previewMock.js'

let _wc = null
let _wcBooting = null
let _runningProjectId = null

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (_wc) {
      try {
        _wc.teardown()
      } catch {}
    }
    _wc = null
    _wcBooting = null
    _runningProjectId = null
  })
}

async function getWebContainer() {
  if (_wc) return _wc
  if (_wcBooting) return _wcBooting

  const { WebContainer } = await import('@webcontainer/api')
  _wcBooting = WebContainer.boot().then((wc) => {
    _wc = wc
    _wcBooting = null
    return wc
  })
  return _wcBooting
}

function teardownWebContainer() {
  if (_wc) {
    try {
      _wc.teardown()
    } catch {}
    _wc = null
    _wcBooting = null
  }
}

function isSingletonError(message) {
  return message?.includes('single WebContainer') ||
    message?.includes('Only a single WebContainer')
}

function normalizePath(path) {
  return path.replace(/\\/g, '/')
}

export default function WebContainerPreview({ files, projectId }) {
  const iframeRef = useRef(null)
  const previewUrlRef = useRef(null)
  const [status, setStatus] = useState('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [error, setError] = useState(null)
  const [retryTrigger, setRetryTrigger] = useState(0)
  const filesFingerprint = useMemo(
    () =>
      files
        .map((f) => `${f.path}:${f.content?.length ?? 0}`)
        .sort()
        .join('|'),
    [files]
  )
  const lastMountedFingerprint = useRef('')

  useEffect(() => {
    if (!files || files.length === 0) return

    const sameProjectAndFiles =
      _runningProjectId === projectId &&
      lastMountedFingerprint.current === filesFingerprint
    if (sameProjectAndFiles) return

    if (_runningProjectId === projectId) {
      teardownWebContainer()
      _runningProjectId = null
    }

    let cancelled = false
    _runningProjectId = projectId
    lastMountedFingerprint.current = filesFingerprint

    async function startWebContainer() {
      try {
        setError(null)
        setStatus('booting')
        console.log('[WebContainer] Status: booting')
        setStatusMessage('Starting WebContainer...')

        const wc = await getWebContainer()
        if (cancelled) return

        const SKIP_PATHS = new Set([
          'Dockerfile',
          'docker-compose.yml',
          '.env.example',
        ])
        const SKIP_PREFIXES = [
          'src/routes/',
          'src/controllers/',
          'src/middleware/',
          'src/models/',
          'src/db',
          'src/services/TaskService',
          'migrations/',
        ]

        const previewFiles = sanitizePreviewFiles(files)

        const fsFiles = {}
        for (const f of previewFiles) {
          const path = normalizePath(f.path)
          if (SKIP_PATHS.has(path)) continue
          if (SKIP_PREFIXES.some((p) => path.startsWith(p))) continue
          if (path.endsWith('.sql')) continue

          const parts = path.split('/')
          let current = fsFiles
          for (let i = 0; i < parts.length - 1; i++) {
            if (!current[parts[i]]) {
              current[parts[i]] = { directory: {} }
            }
            current = current[parts[i]].directory
          }
          current[parts[parts.length - 1]] = {
            file: { contents: f.content },
          }
        }

        const pkgContent = {
          name: 'forgeai-preview',
          version: '1.0.0',
          type: 'module',
          scripts: {
            dev: 'vite --port 3111 --host',
            build: 'vite build',
          },
          dependencies: {
            react: '^18.2.0',
            'react-dom': '^18.2.0',
            'react-router-dom': '^6.22.0',
            axios: '^1.6.0',
            ...collectPreviewDependencies(previewFiles),
          },
          devDependencies: {
            '@vitejs/plugin-react': '^4.2.0',
            vite: '^5.1.0',
            tailwindcss: '^3.4.1',
            autoprefixer: '^10.4.17',
            postcss: '^8.4.35',
          },
        }

        fsFiles['package.json'] = {
          file: {
            contents: JSON.stringify(pkgContent, null, 2),
          },
        }

        const mockSpec = buildPreviewMockSpec(previewFiles)
        console.log('[WebContainer] Preview mock spec:', mockSpec)

        fsFiles['preview-mock-plugin.js'] = {
          file: {
            contents: generatePreviewMockPlugin(mockSpec),
          },
        }

        fsFiles['vite.config.js'] = {
          file: {
            contents: `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import previewMockApi from './preview-mock-plugin.js'

export default defineConfig({
  plugins: [react(), previewMockApi()],
  server: { port: 3111, host: true },
})
`,
          },
        }

        if (!fsFiles['index.html']) {
          fsFiles['index.html'] = {
            file: {
              contents: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width" />
  <title>App Preview</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.jsx"></script>
</body>
</html>`,
            },
          }
        }

        if (cancelled) return

        setStatusMessage('Writing files...')
        await wc.mount(fsFiles)
        if (cancelled) return

        setStatus('installing')
        console.log('[WebContainer] Status: installing')
        setStatusMessage('Installing dependencies (this takes ~30s)...')

        const installProcess = await wc.spawn('npm', [
          'install',
          '--prefer-offline',
        ])

        installProcess.output.pipeTo(
          new WritableStream({
            write(data) {
              console.log('[npm install]', data)
            },
          })
        )

        const installExit = await installProcess.exit
        if (installExit !== 0) {
          throw new Error('npm install failed')
        }
        if (cancelled) return

        setStatus('starting')
        console.log('[WebContainer] Status: starting')
        setStatusMessage('Starting dev server...')

        const devProcess = await wc.spawn('npm', ['run', 'dev'])
        let isReady = false

        const setPreviewUrl = (url) => {
          if (!url || isReady) return
          isReady = true
          previewUrlRef.current = url
          setStatus('ready')
          setStatusMessage('Ready')
          console.log('[WebContainer] Preview URL:', url)
          if (iframeRef.current) {
            iframeRef.current.src = url
          }
        }

        wc.on('server-ready', (port, url) => {
          console.log('[WebContainer] server-ready fired', port, url)
          if (cancelled) return
          setPreviewUrl(url)
        })

        const reader = devProcess.output.getReader()

        const readOutput = async () => {
          while (true) {
            const { done, value } = await reader.read()
            if (done) break
            console.log('[vite output]', value)

            if (cancelled || isReady) continue

            const urlMatch = value.match(
              /https?:\/\/[^\s]+\.webcontainer\.io[^\s]*/
            )
            if (urlMatch) {
              console.log('[WebContainer] Vite ready detected from output')
              setPreviewUrl(urlMatch[0])
              continue
            }

            if (
              value.includes('ready in') &&
              previewUrlRef.current
            ) {
              setPreviewUrl(previewUrlRef.current)
            }
          }
        }
        readOutput()
      } catch (err) {
        if (!cancelled) {
          console.error('[WebContainer] Error:', err)
          _runningProjectId = null
          setStatus('error')
          setError(err.message)
        }
      }
    }

    startWebContainer()

    return () => {
      cancelled = true
      if (_runningProjectId === projectId) {
        _runningProjectId = null
      }
    }
  }, [filesFingerprint, projectId, retryTrigger])

  useEffect(() => {
    return () => {
      if (_runningProjectId === projectId) {
        _runningProjectId = null
      }
    }
  }, [projectId])

  if (status === 'idle') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 bg-gray-950">
        <div className="text-5xl mb-4">👁</div>
        <p className="text-sm">Preview will appear here</p>
      </div>
    )
  }

  if (status === 'error') {
    const singleton = isSingletonError(error)
    return (
      <div className="flex flex-col items-center justify-center h-full text-gray-500 bg-gray-950 px-4">
        <div className="text-5xl mb-4">⚠️</div>
        <p className="text-sm text-red-400">Preview failed</p>
        {singleton ? (
          <>
            <p className="text-xs mt-2 text-gray-400 max-w-xs text-center">
              Only one preview can run per browser tab.
              Close other ForgeAI tabs, then retry.
            </p>
            <button
              type="button"
              onClick={() => {
                teardownWebContainer()
                _runningProjectId = null
                setError(null)
                setRetryTrigger((n) => n + 1)
              }}
              className="mt-4 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500"
            >
              Retry preview
            </button>
          </>
        ) : (
          <p className="text-xs mt-2 text-gray-400 max-w-xs text-center">
            {error}
          </p>
        )}
      </div>
    )
  }

  return (
    <div className="relative w-full h-full bg-gray-950">
      {status !== 'ready' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-950 z-10">
          <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
          <p className="text-gray-400 text-sm">{statusMessage}</p>
          {status === 'installing' && (
            <p className="text-gray-600 text-xs mt-2">
              First load takes 30-60 seconds
            </p>
          )}
        </div>
      )}

      <iframe
        ref={iframeRef}
        className="w-full h-full border-0"
        title="Live Preview"
        allow="cross-origin-isolated"
      />
    </div>
  )
}
