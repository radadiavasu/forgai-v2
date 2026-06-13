import { useEffect, useMemo, useRef, useState } from 'react'

const ROOT_FOLDER_PRIORITY = ['src', 'migrations', 'server']

const ROOT_FILE_PRIORITY = [
  'index.html',
  'package-lock.json',
  'package.json',
  'tsconfig.json',
  'vite.config.js',
  'vite.config.ts',
  'tailwind.config.js',
  'postcss.config.js',
  'README.md',
  'Dockerfile',
  'docker-compose.yml',
  '.env.example',
]

const TOP_LEVEL_FOLDERS = new Set(['src', 'migrations', 'server', 'public'])

function buildTree(files) {
  const root = { name: '', path: '', children: [] }

  for (const file of files) {
    const parts = file.path.replace(/\\/g, '/').split('/').filter(Boolean)
    let current = root

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]
      const isLeaf = i === parts.length - 1
      let child = current.children.find((c) => c.name === part)

      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          isFolder: !isLeaf,
          file: null,
          children: [],
        }
        current.children.push(child)
      }

      if (isLeaf) {
        child.file = file
        child.isFolder = false
      } else if (!child.isFolder) {
        child.isFolder = true
      }

      current = child
    }
  }

  const sortNodes = (node, depth = 0) => {
    node.children.sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1
      if (depth === 0 && a.isFolder && b.isFolder) {
        const ai = ROOT_FOLDER_PRIORITY.indexOf(a.name)
        const bi = ROOT_FOLDER_PRIORITY.indexOf(b.name)
        if (ai !== -1 || bi !== -1) {
          if (ai === -1) return 1
          if (bi === -1) return -1
          return ai - bi
        }
      }
      if (depth === 0 && !a.isFolder && !b.isFolder) {
        const ai = ROOT_FILE_PRIORITY.indexOf(a.name)
        const bi = ROOT_FILE_PRIORITY.indexOf(b.name)
        if (ai !== -1 || bi !== -1) {
          if (ai === -1) return 1
          if (bi === -1) return -1
          return ai - bi
        }
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    })
    node.children.forEach((child) => sortNodes(child, depth + 1))
  }
  sortNodes(root)

  return root
}

function collectFolderPaths(node) {
  const paths = []
  if (node.isFolder && node.path) paths.push(node.path)
  for (const child of node.children) {
    paths.push(...collectFolderPaths(child))
  }
  return paths
}

function defaultExpandedSet(files) {
  const set = new Set()
  for (const file of files) {
    const parts = file.path.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length >= 2 && TOP_LEVEL_FOLDERS.has(parts[0])) {
      set.add(parts[0])
    }
  }
  return set
}

function FileTypeIcon({ path }) {
  const name = path.split('/').pop() || path

  if (name === 'package.json' || name === 'package-lock.json') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-[#cb3837]">
        <rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor" opacity="0.15" />
        <text x="8" y="11" textAnchor="middle" fill="currentColor" fontSize="7" fontWeight="700">
          npm
        </text>
      </svg>
    )
  }

  if (name === 'vite.config.js' || name === 'vite.config.ts') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-violet-400">
        <path
          d="M8 2l5.5 9.5H2.5L8 2z"
          fill="currentColor"
          opacity="0.2"
        />
        <path d="M8 3.5L4 12h8L8 3.5z" fill="none" stroke="currentColor" strokeWidth="1" />
        <path d="M8 6v4M6.5 8.5h3" stroke="currentColor" strokeWidth="1" strokeLinecap="round" />
      </svg>
    )
  }

  if (name === 'tsconfig.json') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-blue-400">
        <rect x="2" y="2" width="12" height="12" rx="1.5" fill="currentColor" opacity="0.15" />
        <text x="8" y="10.5" textAnchor="middle" fill="currentColor" fontSize="6" fontWeight="700">
          TS
        </text>
      </svg>
    )
  }

  if (name.endsWith('.jsx') || name.endsWith('.tsx')) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-[#61dafb]">
        <circle cx="8" cy="8" r="1.4" fill="currentColor" />
        <ellipse cx="8" cy="8" rx="5.5" ry="2.2" fill="none" stroke="currentColor" strokeWidth="0.9" />
        <ellipse
          cx="8"
          cy="8"
          rx="5.5"
          ry="2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.9"
          transform="rotate(60 8 8)"
        />
        <ellipse
          cx="8"
          cy="8"
          rx="5.5"
          ry="2.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.9"
          transform="rotate(-60 8 8)"
        />
      </svg>
    )
  }

  if (name.endsWith('.css')) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-[#a855f7]">
        <text x="8" y="11" textAnchor="middle" fill="currentColor" fontSize="7" fontWeight="700">
          #
        </text>
      </svg>
    )
  }

  if (name.endsWith('.html')) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-orange-400">
        <path d="M3 3h10v10H3V3z" fill="currentColor" opacity="0.15" />
        <text x="8" y="11" textAnchor="middle" fill="currentColor" fontSize="7" fontWeight="700">
          5
        </text>
      </svg>
    )
  }

  if (name.endsWith('.sql')) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-violet-400">
        <ellipse cx="8" cy="5" rx="5" ry="2" fill="none" stroke="currentColor" strokeWidth="1" />
        <path d="M3 5v6c0 1.1 2.2 2 5 2s5-.9 5-2V5" fill="none" stroke="currentColor" strokeWidth="1" />
      </svg>
    )
  }

  if (name.endsWith('.md')) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-blue-300">
        <path d="M4 3h8v10H4V3z" fill="currentColor" opacity="0.15" />
        <path d="M6 6h4M6 8.5h4M6 11h2.5" stroke="currentColor" strokeWidth="0.9" strokeLinecap="round" />
      </svg>
    )
  }

  if (name.endsWith('.js') || name.endsWith('.ts')) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-yellow-400">
        <rect x="2" y="2" width="12" height="12" rx="1.5" fill="currentColor" opacity="0.12" />
        <text x="8" y="11" textAnchor="middle" fill="currentColor" fontSize="6.5" fontWeight="700">
          JS
        </text>
      </svg>
    )
  }

  if (name === 'Dockerfile' || name === 'docker-compose.yml') {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-cyan-400">
        <path
          d="M2 8.5h1.5v-1H2v1zm2 0h1.5v-1H4v1zm2 0h1.5v-1H6v1zm2 0h1.5v-1H8v1zm2.5-2.5H12v1h-1.5V6z"
          fill="currentColor"
        />
        <path
          d="M2 9.5c0 2 1.5 3.5 4 3.5h4c2.2 0 4-1.5 4.5-3.5H2z"
          fill="currentColor"
          opacity="0.35"
        />
      </svg>
    )
  }

  if (name.endsWith('.json')) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-amber-400">
        <text x="8" y="11" textAnchor="middle" fill="currentColor" fontSize="7" fontWeight="700">
          {'{}'}
        </text>
      </svg>
    )
  }

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-gray-500">
      <path d="M4 3h8v10H4V3z" fill="currentColor" opacity="0.12" />
    </svg>
  )
}

function TreeNode({
  node,
  depth,
  expanded,
  toggle,
  selectedPath,
  onSelect,
}) {
  const isExpanded = expanded.has(node.path)
  const isSelected = selectedPath === node.path
  const rowClass = isSelected
    ? 'bg-[#2a2d2e] text-white'
    : 'text-[#cccccc] hover:bg-[#2a2d2e]/60'

  if (node.isFolder) {
    return (
      <div role="treeitem" aria-expanded={isExpanded}>
        <button
          type="button"
          onClick={() => toggle(node.path)}
          className={`w-full text-left flex items-center gap-1 py-[5px] pr-3 ${rowClass}`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="currentColor"
            className={`shrink-0 text-[#858585] transition-transform duration-150 ${
              isExpanded ? 'rotate-90' : ''
            }`}
          >
            <path d="M6 4l4 4-4 4V4z" />
          </svg>
          <svg width="16" height="16" viewBox="0 0 16 16" className="shrink-0 text-[#c5c5c5]">
            {isExpanded ? (
              <path
                d="M2 4h5l1.5 1.5H14v7.5H2V4z"
                fill="currentColor"
                opacity="0.25"
              />
            ) : (
              <path
                d="M2 4h5l1.5 1.5H14v8.5H2V4z"
                fill="currentColor"
                opacity="0.25"
              />
            )}
          </svg>
          <span className="truncate text-[13px] leading-none font-normal">{node.name}</span>
        </button>
        {isExpanded && (
          <div
            className="border-l border-[#3c3c3c]/80"
            style={{ marginLeft: `${20 + depth * 16}px` }}
          >
            {node.children.map((child) => (
              <TreeNode
                key={child.path}
                node={child}
                depth={depth + 1}
                expanded={expanded}
                toggle={toggle}
                selectedPath={selectedPath}
                onSelect={onSelect}
              />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(node.file)}
      className={`w-full text-left flex items-center gap-1.5 py-[5px] pr-3 ${rowClass}`}
      style={{ paddingLeft: `${28 + depth * 16}px` }}
    >
      <FileTypeIcon path={node.path} />
      <span className="truncate text-[13px] leading-none font-normal">{node.name}</span>
    </button>
  )
}

export default function FileTree({ files, selectedPath, onSelectFile }) {
  const tree = useMemo(() => buildTree(files), [files])
  const folderPaths = useMemo(() => collectFolderPaths(tree), [tree])
  const folderKey = useMemo(
    () => [...folderPaths].sort().join('|'),
    [folderPaths]
  )
  const [expanded, setExpanded] = useState(() => defaultExpandedSet(files))
  const lastFolderKeyRef = useRef('')

  useEffect(() => {
    if (!folderKey) return

    if (!lastFolderKeyRef.current) {
      setExpanded(defaultExpandedSet(files))
      lastFolderKeyRef.current = folderKey
      return
    }

    if (folderKey === lastFolderKeyRef.current) return

    const oldPaths = new Set(lastFolderKeyRef.current.split('|'))
    setExpanded((prev) => {
      const next = new Set(prev)
      for (const path of folderPaths) {
        if (!oldPaths.has(path)) next.add(path)
      }
      return next
    })
    lastFolderKeyRef.current = folderKey
  }, [folderKey, folderPaths, files])

  useEffect(() => {
    if (!selectedPath) return
    const parts = selectedPath.replace(/\\/g, '/').split('/').filter(Boolean)
    if (parts.length <= 1) return

    setExpanded((prev) => {
      const next = new Set(prev)
      for (let i = 1; i < parts.length; i++) {
        next.add(parts.slice(0, i).join('/'))
      }
      return next
    })
  }, [selectedPath])

  const toggle = (path) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  if (files.length === 0) {
    return (
      <div className="px-3 py-4">
        <p className="text-[#858585] text-xs">No files yet</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full min-h-0 select-none">
      <div className="shrink-0 px-3 pt-3 pb-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#858585]">
          FILES
        </p>
      </div>

      <div
        className="flex-1 overflow-y-auto overflow-x-hidden pb-3"
        role="tree"
      >
        {tree.children.map((node, index) => (
          <TreeNode
            key={node.path}
            node={node}
            depth={0}
            expanded={expanded}
            toggle={toggle}
            selectedPath={selectedPath}
            onSelect={onSelectFile}
          />
        ))}
      </div>
    </div>
  )
}
