function normalizePath(path) {
  return path.replace(/\\/g, '/')
}

function normalizeApiPath(raw) {
  let path = raw.split('?')[0]
  path = path.replace(/\/\$\{[^}]+\}/g, '/:id')
  path = path.replace(/\$\{[^}]+\}/g, '')
  return path.replace(/\/+/g, '/').replace(/\/$/, '') || '/'
}

function classifyRoute(path, method) {
  const normalized = path.replace(/:\w+/g, ':id')
  const hasId = /\/:id(?:\/|$)/.test(normalized)
  if (hasId && /\/:id\/[^/]+/.test(normalized)) return 'action'
  if (hasId && method === 'GET') return 'item'
  if (hasId && method === 'DELETE') return 'delete'
  if (hasId) return 'item'
  if (method === 'GET') return 'collection'
  if (method === 'POST') return 'collection'
  return 'action'
}

function routeKey(route) {
  return `${route.method} ${route.path.replace(/:\w+/g, ':id')}`
}

function dedupeRoutes(routes) {
  const seen = new Map()
  for (const route of routes) {
    const key = routeKey(route)
    if (!seen.has(key)) seen.set(key, route)
  }
  return [...seen.values()]
}

export function extractApiBaseUrl(files) {
  const client = files.find((f) =>
    /src\/api\/client\.(js|ts|jsx|tsx)$/i.test(normalizePath(f.path))
  )
  if (!client) return '/api'

  const envDefault = client.content.match(
    /VITE_API_URL\s*\?\?\s*['"`]([^'"`]+)['"`]/
  )
  if (envDefault) return envDefault[1].replace(/\/$/, '')

  if (/['"`]\/api['"`]/.test(client.content)) return '/api'
  return '/api'
}

function resolveApiPath(relativePath, baseUrl) {
  const path = normalizeApiPath(relativePath)
  if (!path || path.startsWith('http')) return null
  if (path.startsWith('/api')) return path
  const rel = path.startsWith('/') ? path : `/${path}`
  return `${baseUrl}${rel}`.replace(/\/+/g, '/')
}

export function extractFrontendApiCalls(files, baseUrl = '/api') {
  const routes = []
  const frontendFiles = files.filter((f) => {
    const path = normalizePath(f.path)
    return (
      /\.(jsx?|tsx?)$/.test(path) &&
      !path.includes('/routes/') &&
      !path.includes('/controllers/') &&
      !path.includes('/middleware/')
    )
  })

  const apiCallRe =
    /apiClient\.(get|post|patch|put|delete)\(\s*(?:`([^`]*)`|'([^']*)'|"([^"]*)")/gi
  const fetchRe =
    /fetch\(\s*(?:`([^`]*)`|'([^']*)'|"([^"]*)")/gi
  const absApiRe = /['"`](\/api\/[^'"`\s?]+)['"`]/g

  for (const file of frontendFiles) {
    const content = file.content

    let match
    while ((match = apiCallRe.exec(content))) {
      const method = match[1].toUpperCase()
      const rawPath = match[2] ?? match[3] ?? match[4] ?? ''
      const fullPath = resolveApiPath(rawPath, baseUrl)
      if (!fullPath) continue
      routes.push({ method, path: fullPath, kind: classifyRoute(fullPath, method) })
    }

    while ((match = fetchRe.exec(content))) {
      const rawPath = match[1] ?? match[2] ?? match[3] ?? ''
      const fullPath = resolveApiPath(rawPath, baseUrl)
      if (!fullPath) continue
      routes.push({
        method: 'GET',
        path: fullPath,
        kind: classifyRoute(fullPath, 'GET'),
      })
    }

    while ((match = absApiRe.exec(content))) {
      const fullPath = normalizeApiPath(match[1])
      routes.push({
        method: 'GET',
        path: fullPath,
        kind: classifyRoute(fullPath, 'GET'),
      })
    }
  }

  return dedupeRoutes(routes)
}

export function extractBackendRoutes(files) {
  const routes = []
  const normalized = files.map((f) => ({
    ...f,
    path: normalizePath(f.path),
  }))

  let apiMount = '/api'
  for (const f of normalized) {
    if (!/(app|server)\.js$/.test(f.path)) continue
    const match = f.content.match(/app\.use\(\s*['"`](\/api[^'"`]*)['"`]/)
    if (match) {
      apiMount = match[1].replace(/\/$/, '')
      break
    }
  }

  const subMounts = new Map()
  const indexFile = normalized.find((f) => f.path.endsWith('src/routes/index.js'))
  if (indexFile) {
    const moduleVars = new Map()
    const requireRe =
      /(?:const|let|var)\s+(\w+)\s*=\s*require\(\s*['"`]\.\/([^'"`]+)['"`]\s*\)/g
    let requireMatch
    while ((requireMatch = requireRe.exec(indexFile.content))) {
      moduleVars.set(requireMatch[1], requireMatch[2].replace(/\.js$/, ''))
    }

    const mountRe =
      /router\.use\(\s*['"`]([^'"`]+)['"`]\s*,\s*(?:require\(\s*['"`]\.\/([^'"`]+)['"`]\s*\)|(\w+))\s*\)/g
    let mountMatch
    while ((mountMatch = mountRe.exec(indexFile.content))) {
      const segment = mountMatch[1].replace(/^\//, '')
      const stem = (mountMatch[2] || moduleVars.get(mountMatch[3]) || '')
        .replace(/\.js$/, '')
      if (!stem) continue
      subMounts.set(stem, `${apiMount}/${segment}`.replace(/\/+/g, '/'))
    }
  }

  for (const f of normalized) {
    const routeMatch = f.path.match(/src\/routes\/([^/]+)\.js$/)
    if (!routeMatch || routeMatch[1] === 'index') continue

    const stem = routeMatch[1]
    const mountPrefix = subMounts.get(stem) || apiMount

    const routeRe =
      /router\.(get|post|put|patch|delete)\(\s*['"`]([^'"`]+)['"`]/gi
    let routeDef
    while ((routeDef = routeRe.exec(f.content))) {
      const method = routeDef[1].toUpperCase()
      let relPath = routeDef[2]
      if (relPath === '/') relPath = ''
      const fullPath = `${mountPrefix}${relPath}`.replace(/\/+/g, '/')
      routes.push({
        method,
        path: fullPath.replace(/:\w+/g, ':id'),
        kind: classifyRoute(fullPath, method),
      })
    }

    const commentRe = /\/\/\s*(GET|POST|PUT|PATCH|DELETE)\s+(\/api\/[^\s]+)/gi
    let commentMatch
    while ((commentMatch = commentRe.exec(f.content))) {
      const method = commentMatch[1].toUpperCase()
      const fullPath = normalizeApiPath(commentMatch[2]).replace(/:\w+/g, ':id')
      routes.push({
        method,
        path: fullPath,
        kind: classifyRoute(fullPath, method),
      })
    }
  }

  return dedupeRoutes(routes)
}

export function buildPreviewMockSpec(files) {
  const baseUrl = extractApiBaseUrl(files)
  const frontendRoutes = extractFrontendApiCalls(files, baseUrl)
  const backendRoutes = extractBackendRoutes(files)
  const routes = dedupeRoutes([...backendRoutes, ...frontendRoutes]).filter(
    (route) => route.path.length > baseUrl.length
  )
  const seedProfiles = buildSeedProfiles(files, routes, baseUrl)
  const embeddedSeeds = extractEmbeddedSeeds(files)

  return {
    baseUrl,
    routes,
    seedProfiles,
    embeddedSeeds,
    source: {
      frontend: frontendRoutes.length,
      backend: backendRoutes.length,
    },
  }
}

function pathResource(path, baseUrl) {
  const rest = path.startsWith(baseUrl) ? path.slice(baseUrl.length) : path
  const segment = rest.split('/').filter(Boolean)[0]
  return segment || 'items'
}

function singularize(word) {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y'
  if (word.endsWith('ses')) return word.slice(0, -2)
  if (word.endsWith('s')) return word.slice(0, -1)
  return word
}

function mentionsResource(content, resource, singular) {
  const lower = content.toLowerCase()
  return (
    lower.includes(`/${resource}`) ||
    lower.includes(`'/${resource}'`) ||
    lower.includes(`"/${resource}"`) ||
    lower.includes(`\`/${resource}`) ||
    lower.includes(singular) ||
    lower.includes(resource)
  )
}

function inferFieldsForResource(resource, files) {
  const fields = new Set(['id'])
  const singular = singularize(resource)

  const propPatterns = [
    new RegExp(`\\b${singular}s?\\.([a-zA-Z_][a-zA-Z0-9_]*)`, 'gi'),
    new RegExp(
      `\\b(?:item|items|row|rows|entry|entries|record|book|books|task|tasks|product|products|order|orders)\\.(\\w+)`,
      'gi'
    ),
    /\{[^{}]*\b([a-z_][a-z0-9_]*)\s*[,}]/gi,
  ]

  for (const file of files) {
    const path = normalizePath(file.path)
    if (!/\.(jsx?|tsx?|sql)$/i.test(path)) continue
    if (!mentionsResource(file.content, resource, singular)) continue

    for (const pattern of propPatterns) {
      let match
      while ((match = pattern.exec(file.content))) {
        const field = match[1]
        if (
          field &&
          !['map', 'filter', 'length', 'then', 'catch', 'key', 'id'].includes(
            field
          )
        ) {
          fields.add(field)
        }
      }
    }

    if (path.endsWith('.sql')) {
      const tableNames = [resource, singular, `${singular}s`]
      for (const table of tableNames) {
        const colRe = new RegExp(
          `CREATE TABLE (?:IF NOT EXISTS )?${table}\\s*\\(([\\s\\S]*?)\\);`,
          'i'
        )
        const tableMatch = file.content.match(colRe)
        if (!tableMatch) continue
        const colDefRe = /^\s*([a-z_][a-z0-9_]*)\s+/gim
        let colMatch
        while ((colMatch = colDefRe.exec(tableMatch[1]))) {
          if (colMatch[1] !== 'PRIMARY' && colMatch[1] !== 'FOREIGN') {
            fields.add(colMatch[1])
          }
        }
      }
    }
  }

  applyResourceHeuristics(resource, fields)
  if (!fields.has('title') && !fields.has('name')) {
    fields.add('title')
  }
  if (!fields.has('description')) fields.add('description')
  return [...fields]
}

function applyResourceHeuristics(resource, fields) {
  const r = resource.toLowerCase()
  if (/book|product|item|part/.test(r)) {
    fields.add('title')
    fields.add('price')
    fields.add('description')
  }
  if (/book/.test(r)) fields.add('author')
  if (/task|todo/.test(r)) {
    fields.add('title')
    fields.add('description')
    fields.add('is_complete')
  }
  if (/order/.test(r)) {
    fields.add('customer_name')
    fields.add('customer_email')
    fields.add('total_price')
  }
  if (/user|customer|contact/.test(r)) {
    fields.add('name')
    fields.add('email')
  }
  if (/cart/.test(r)) {
    fields.add('quantity')
    fields.add('price')
    fields.add('title')
  }
  fields.add('created_at')
}

function extractEmbeddedSeeds(files) {
  const seeds = {}
  for (const file of files) {
    const path = normalizePath(file.path)
    if (!isSeedDataPath(path)) continue
    const data = parseSeedFileContent(file)
    if (!data) continue
    if (Array.isArray(data)) {
      seeds.items = data
    } else if (typeof data === 'object') {
      for (const [key, value] of Object.entries(data)) {
        if (Array.isArray(value)) seeds[key] = value
      }
    }
  }
  return seeds
}

function isSeedDataPath(path) {
  return /src\/data\/(previewSeed|seedData|seed|mock)/i.test(path)
}

function resolveRelativeImport(fromFile, importPath) {
  const fromDir = normalizePath(fromFile).split('/').slice(0, -1)
  const stack = [...fromDir]
  for (const part of importPath.split('/')) {
    if (!part || part === '.') continue
    if (part === '..') stack.pop()
    else stack.push(part)
  }
  return stack.join('/')
}

function findSeedImportPaths(files) {
  const paths = new Set()
  for (const file of files) {
    const path = normalizePath(file.path)
    if (!/\.(jsx?|tsx?)$/i.test(path)) continue
    const re = /from\s+['"]([^'"]+)['"]/g
    let match
    while ((match = re.exec(file.content))) {
      const imp = match[1]
      if (!imp.includes('/data/') && !/seed|preview|mock/i.test(imp)) continue
      paths.add(resolveRelativeImport(path, imp))
    }
  }
  return paths
}

function parseSeedFileContent(file) {
  const path = normalizePath(file.path)
  const content = file.content?.trim()
  if (!content) return null

  if (path.endsWith('.json')) {
    try {
      return JSON.parse(content)
    } catch {
      return null
    }
  }

  if (!path.endsWith('.js')) return null

  const defaultExport = content.match(/export\s+default\s+([\s\S]+?)\s*;?\s*$/)
  if (defaultExport) {
    try {
      return new Function(`return (${defaultExport[1].trim()})`)()
    } catch {
      // fall through
    }
  }

  const named = {}
  const constRe =
    /export\s+const\s+(\w+)\s*=\s*(\[[\s\S]*?\]|\{[\s\S]*?\})\s*;?/g
  let m
  while ((m = constRe.exec(content))) {
    try {
      named[m[1]] = new Function(`return (${m[2]})`)()
    } catch {
      // skip invalid export
    }
  }
  return Object.keys(named).length ? named : null
}

function mergeSeedPayload(files) {
  const merged = {}
  for (const file of files) {
    if (!isSeedDataPath(normalizePath(file.path))) continue
    const data = parseSeedFileContent(file)
    if (!data || typeof data !== 'object' || Array.isArray(data)) continue
    Object.assign(merged, data)
  }
  return Object.keys(merged).length ? merged : null
}

function reconcileSeedFiles(files) {
  const byPath = new Map(files.map((f) => [normalizePath(f.path), f]))
  const required = findSeedImportPaths(files)
  if (required.size === 0) return files

  const payload = mergeSeedPayload(files)
  const additions = []

  for (const targetPath of required) {
    if (byPath.has(targetPath)) continue

    if (targetPath.endsWith('.json')) {
      const content = payload
        ? `${JSON.stringify(payload, null, 2)}\n`
        : '{}\n'
      additions.push({ path: targetPath, content })
      console.warn(
        `[preview] Created missing ${targetPath} from existing seed data`
      )
      continue
    }

    if (targetPath.endsWith('.js')) {
      const content = payload
        ? `export default ${JSON.stringify(payload, null, 2)}\n`
        : 'export default {}\n'
      additions.push({ path: targetPath, content })
      console.warn(
        `[preview] Created missing ${targetPath} from existing seed data`
      )
    }
  }

  return additions.length ? [...files, ...additions] : files
}

/** Extra npm deps detected from generated imports (preview package.json). */
export function collectPreviewDependencies(files) {
  const deps = {}
  const known = {
    marked: '^12.0.0',
    'react-markdown': '^9.0.0',
    'date-fns': '^3.6.0',
    clsx: '^2.1.0',
    'lucide-react': '^0.400.0',
  }
  for (const file of files) {
    if (!/\.(jsx?|tsx?)$/i.test(normalizePath(file.path))) continue
    for (const [pkg, version] of Object.entries(known)) {
      if (new RegExp(`from\\s+['"]${pkg}['"]`).test(file.content)) {
        deps[pkg] = version
      }
    }
  }
  return deps
}

/** Drop or stub broken previewSeed.js; reconcile missing seed imports. */
export function sanitizePreviewFiles(files) {
  const normalized = files.map((f) => ({
    ...f,
    path: normalizePath(f.path),
  }))
  const hasJsonSeed = normalized.some((f) =>
    /src\/data\/previewSeed\.json$/i.test(f.path)
  )

  const sanitized = normalized
    .filter((f) => {
      if (hasJsonSeed && /src\/data\/previewSeed\.js$/i.test(f.path)) {
        return false
      }
      return true
    })
    .map((f) => {
      if (!/src\/data\/previewSeed\.js$/i.test(f.path)) return f
      if (!isLikelyBrokenSeedJs(f.content)) return f
      console.warn(
        '[preview] Replacing broken previewSeed.js with empty stub; mock API will supply data'
      )
      return {
        ...f,
        content: 'export default {}\n',
      }
    })

  return reconcileSeedFiles(sanitized)
}

function isLikelyBrokenSeedJs(content) {
  if (!content?.trim()) return true
  // Apostrophe inside single-quoted string: 'children's fantasy'
  if (/'[^'\n]*'[a-z]/i.test(content)) return true
  // Unclosed single-quoted string near description fields
  if (/description:\s*\n?\s*'[^'\n]*$/m.test(content)) return true
  return false
}

function buildSeedProfiles(files, routes, baseUrl) {
  const resources = new Set()
  for (const route of routes) {
    if (route.method === 'GET' && route.kind === 'collection') {
      resources.add(pathResource(route.path, baseUrl))
    }
  }

  const profiles = {}
  for (const resource of resources) {
    profiles[resource] = {
      fields: inferFieldsForResource(resource, files),
      count: 4,
      label: singularize(resource),
    }
  }
  return profiles
}

export function generatePreviewMockPlugin(spec) {
  const specJson = JSON.stringify(spec, null, 2)

  return `// Auto-generated ForgeAI preview mock — backend not running in WebContainer
const spec = ${specJson}

const stores = {}
let nextId = 1

function send(res, status, body) {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(body))
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {})
      } catch {
        resolve({})
      }
    })
  })
}

function segments(path) {
  const base = spec.baseUrl || '/api'
  const rest = path.startsWith(base) ? path.slice(base.length) : path
  return rest.split('/').filter(Boolean)
}

function resourceKey(path) {
  const parts = segments(path)
  return parts[0] || 'items'
}

function ensureStore(key) {
  if (!stores[key]) stores[key] = []
  return stores[key]
}

function profileFor(resource) {
  return spec.seedProfiles?.[resource] || {
    fields: ['id', 'title', 'name', 'description', 'created_at'],
    count: 3,
    label: resource.replace(/s$/, ''),
  }
}

function valueForField(field, resource, id, profile) {
  const f = field.toLowerCase()
  const label = profile.label || resource
  if (f === 'id') return id
  if (f.includes('email')) return \`preview\${id}@example.com\`
  if (f.includes('price') || f.includes('total')) return Number((9.99 + id).toFixed(2))
  if (f === 'quantity') return 1
  if (f === 'is_complete' || (f.startsWith('is_') && f.endsWith('ed'))) return false
  if (f.startsWith('is_')) return false
  if (f.includes('url') || f.includes('_url')) return null
  if (f.includes('created_at') || f.includes('updated_at') || f.endsWith('_at')) {
    return new Date().toISOString()
  }
  if (f === 'status') return 'active'
  if (f === 'author') return 'Preview Author'
  if (f === 'title') return \`Preview \${label} \${id}\`
  if (f === 'name' || f === 'customer_name') return \`Preview \${label} \${id}\`
  if (f === 'description' || f === 'body' || f === 'content' || f === 'summary') {
    return \`Sample \${f} for preview mode\`
  }
  if (f.includes('phone')) return '+1-555-0100'
  return \`preview-\${f}-\${id}\`
}

function buildSeedItem(resource, profile, id) {
  const item = {}
  for (const field of profile.fields) {
    item[field] = valueForField(field, resource, id, profile)
  }
  if (item.id === undefined) item.id = id
  return item
}

function seedCollection(resource) {
  const embedded = spec.embeddedSeeds?.[resource]
  if (Array.isArray(embedded) && embedded.length) {
    return embedded.map((item, i) => ({ ...item, id: item.id ?? i + 1 }))
  }
  const profile = profileFor(resource)
  const count = profile.count || 3
  return Array.from({ length: count }, (_, i) =>
    buildSeedItem(resource, profile, i + 1)
  )
}

function collectionItems(resource) {
  const store = ensureStore(resource)
  if (store.length === 0) {
    const seed = seedCollection(resource)
    if (seed.length) store.push(...seed)
  }
  return store
}

function pathToRegex(pattern) {
  const regex = pattern
    .replace(/:[^/]+/g, '([^/]+)')
    .replace(/\\//g, '\\\\/')
  return new RegExp('^' + regex + '$')
}

function findRoute(method, path) {
  for (const route of spec.routes) {
    if (route.method !== method) continue
    if (pathToRegex(route.path).test(path)) return route
  }
  return null
}

function filterCollection(items, params) {
  let result = items
  for (const [key, value] of params.entries()) {
    if (value === 'true') {
      result = result.filter((item) => item[key] === true)
    } else if (value === 'false') {
      result = result.filter((item) => item[key] === false)
    } else if (value) {
      result = result.filter((item) => String(item[key]) === value)
    }
  }
  return result
}

function sampleItem(id, resource) {
  const seeded = collectionItems(resource).find(
    (item) => String(item.id) === String(id)
  )
  if (seeded) return { ...seeded }
  const profile = profileFor(resource)
  return buildSeedItem(resource, profile, Number.isNaN(Number(id)) ? id : Number(id))
}

function handleAuth(path, method, res) {
  if (!/(\\/auth|\\/login|\\/register|\\/session)/i.test(path)) return false
  if (method === 'POST') {
    send(res, 200, {
      data: {
        token: 'preview-token',
        user: { id: 1, email: 'demo@example.com', name: 'Preview User' },
      },
    })
    return true
  }
  if (method === 'GET') {
    send(res, 200, {
      data: { id: 1, email: 'demo@example.com', name: 'Preview User' },
    })
    return true
  }
  return false
}

async function handleRequest(req, res) {
  const rawUrl = req.url || ''
  const [path, query = ''] = rawUrl.split('?')
  const base = spec.baseUrl || '/api'
  if (!path.startsWith(base)) return false

  const method = req.method || 'GET'
  const params = new URLSearchParams(query)
  const parts = segments(path)
  const resource = resourceKey(path)

  if (handleAuth(path, method, res)) return true

  const route = findRoute(method, path)

  if (route?.kind === 'collection' && method === 'GET') {
    const items = filterCollection(collectionItems(resource), params)
    send(res, 200, { data: items })
    return true
  }

  if (route?.kind === 'collection' && method === 'POST') {
    const body = await readBody(req)
    const item = {
      id: nextId++,
      ...body,
      created_at: new Date().toISOString(),
    }
    ensureStore(resource).unshift(item)
    send(res, 201, { data: item })
    return true
  }

  if (route?.kind === 'item' && method === 'GET') {
    const id = parts[1]
    const items = ensureStore(resource)
    const found = items.find((item) => String(item.id) === String(id))
    send(res, 200, { data: found || sampleItem(id, resource) })
    return true
  }

  if (route?.kind === 'action' && (method === 'PATCH' || method === 'PUT' || method === 'POST')) {
    const id = parts[1]
    const action = parts[2]
    const items = ensureStore(resource)
    let item = items.find((entry) => String(entry.id) === String(id))
    if (!item) {
      item = sampleItem(id, resource)
      items.push(item)
    }
    if (action === 'complete') item.is_complete = true
    else if (action) item[action] = true
    send(res, 200, { data: item })
    return true
  }

  if (route?.kind === 'item' && (method === 'PATCH' || method === 'PUT')) {
    const id = parts[1]
    const body = await readBody(req)
    const items = ensureStore(resource)
    let item = items.find((entry) => String(entry.id) === String(id))
    if (!item) {
      item = { id: Number.isNaN(Number(id)) ? id : Number(id), ...body }
      items.push(item)
    } else {
      Object.assign(item, body)
    }
    send(res, 200, { data: item })
    return true
  }

  if (route?.kind === 'delete' && method === 'DELETE') {
    const id = parts[1]
    const items = ensureStore(resource)
    const index = items.findIndex((entry) => String(entry.id) === String(id))
    if (index >= 0) items.splice(index, 1)
    send(res, 200, { data: null })
    return true
  }

  if (method === 'GET') {
    if (parts.length >= 2 && !Number.isNaN(Number(parts[1]))) {
      send(res, 200, { data: sampleItem(parts[1], resource) })
      return true
    }
    if (parts.length === 1) {
      send(res, 200, { data: collectionItems(resource) })
      return true
    }
    send(res, 200, { data: [] })
    return true
  }
  if (method === 'POST') {
    const body = await readBody(req)
    const item = { id: nextId++, ...body, created_at: new Date().toISOString() }
    ensureStore(resource).unshift(item)
    send(res, 201, { data: item })
    return true
  }
  if (method === 'PATCH' || method === 'PUT') {
    send(res, 200, { data: {} })
    return true
  }
  if (method === 'DELETE') {
    send(res, 200, { data: null })
    return true
  }

  send(res, 404, { error: 'Not found' })
  return true
}

export default function previewMockApi() {
  return {
    name: 'preview-mock-api',
    configureServer(server) {
      console.log(
        '[preview-mock] routes:',
        spec.routes.length,
        'seed profiles:',
        Object.keys(spec.seedProfiles || {}).join(', ') || '(none)',
        '(frontend:',
        spec.source?.frontend ?? 0,
        'backend:',
        spec.source?.backend ?? 0,
        ')'
      )
      server.middlewares.use(async (req, res, next) => {
        try {
          const handled = await handleRequest(req, res)
          if (!handled) next()
        } catch (err) {
          console.error('[preview-mock]', err)
          send(res, 500, { error: 'Preview mock error' })
        }
      })
    },
  }
}
`
}
