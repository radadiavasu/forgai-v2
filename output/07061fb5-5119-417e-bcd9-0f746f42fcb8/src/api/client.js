const BASE_URL = import.meta.env.VITE_API_URL ?? '/api';

async function request(path, options = {}) {
  const token = localStorage.getItem('auth_token');

  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers || {}),
  };

  const config = {
    ...options,
    headers,
  };

  const url = `${BASE_URL}${path}`;

  const response = await fetch(url, config);

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({
    message: 'An unexpected error occurred.',
  }));

  if (!response.ok) {
    const error = new Error(data.message || `HTTP error ${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

const client = {
  get: (path, options) => request(path, { method: 'GET', ...options }),
  post: (path, body, options) =>
    request(path, { method: 'POST', body: JSON.stringify(body), ...options }),
  patch: (path, body, options) =>
    request(path, { method: 'PATCH', body: JSON.stringify(body), ...options }),
  put: (path, body, options) =>
    request(path, { method: 'PUT', body: JSON.stringify(body), ...options }),
  delete: (path, options) => request(path, { method: 'DELETE', ...options }),
};

export default client;