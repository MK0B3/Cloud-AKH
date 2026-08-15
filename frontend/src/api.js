const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

export async function getPapers({ topics = [] } = {}) {
  const searchParams = new URLSearchParams()

  if (topics.length > 0) {
    searchParams.set('topic', topics.join(','))
  }

  const query = searchParams.toString()
  return request(`/papers${query ? `?${query}` : ''}`)
}

export async function getPaperById(id) {
  return request(`/papers/${id}`)
}

export async function createSubscription(payload) {
  return request('/subscriptions', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

async function request(path, options = {}) {
  const hasBody = typeof options.body !== 'undefined'
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  })

  const contentType = response.headers.get('content-type') ?? ''
  const payload = contentType.includes('application/json')
    ? await response.json()
    : null

  if (!response.ok || payload?.success === false) {
    throw new Error(getErrorMessage(payload, response.status))
  }

  return payload
}

function getErrorMessage(payload, statusCode) {
  if (payload?.error === 'Duplicate field value entered') {
    return 'This email is already subscribed.'
  }

  if (payload?.error) {
    return payload.error
  }

  if (payload?.message) {
    return payload.message
  }

  if (statusCode === 404) {
    return 'The requested resource could not be found.'
  }

  return 'Something went wrong while contacting the backend.'
}