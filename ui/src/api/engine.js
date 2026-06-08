export const api = {
  createProject: async (brief) => {
    const r = await fetch('/api-engine/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ brief }),
    })
    return r.json()
  },

  sendMessage: async (projectId, message) => {
    const r = await fetch(
      `/api-engine/projects/${projectId}/message`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      }
    )
    return r.json()
  },

  getProject: async (projectId) => {
    const r = await fetch(`/api-engine/projects/${projectId}`)
    return r.json()
  },

  listProjects: async () => {
    const r = await fetch('/api-engine/projects')
    return r.json()
  },

  getFiles: async (projectId) => {
    const r = await fetch(
      `/api-engine/projects/${projectId}/files`
    )
    return r.json()
  },

  getMessages: async (projectId) => {
    const r = await fetch(
      `/api-engine/projects/${projectId}/messages`
    )
    return r.json()
  },

  downloadUrl: (projectId) =>
    `/api-engine/projects/${projectId}/download`,

  streamActivity: (projectId, onEvent) => {
    const es = new EventSource(
      `/api-engine/projects/${projectId}/stream`
    )
    es.onmessage = (e) => {
      try {
        onEvent(JSON.parse(e.data))
      } catch {}
    }
    return es
  },
}
