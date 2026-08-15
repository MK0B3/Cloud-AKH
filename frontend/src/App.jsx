import { startTransition, useDeferredValue, useEffect, useState } from 'react'
import './App.css'
import { createSubscription, getPaperById, getPapers} from './api'
import { TOPIC_OPTIONS } from './constants'

const PAPER_ROUTE_PATTERN = /^\/papers\/([^/]+)\/?$/

function App() {
  const { pathname, navigate } = useClientRouter()
  const paperId = getPaperIdFromPath(pathname)

  if (paperId) {
    return (
      <div className="app-shell">
        <PaperDetailsPage paperId={paperId} navigate={navigate} />
      </div>
    )
  }

  if (pathname === '/' || pathname === '') {
    return (
      <div className="app-shell">
        <HomePage navigate={navigate} />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <NotFoundPage navigate={navigate} />
    </div>
  )
}

function HomePage({ navigate }) {
  const [selectedTopics, setSelectedTopics] = useState([])
  const [papers, setPapers] = useState([])
  const [resultCount, setResultCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [email, setEmail] = useState('')
  const [subscriptionTopics, setSubscriptionTopics] = useState([])
  const [submitError, setSubmitError] = useState('')
  const [submitMessage, setSubmitMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const deferredTopicKey = useDeferredValue(selectedTopics.join(','))
  const hasActiveFilters = selectedTopics.length > 0
  const canSubmit = email.trim() !== '' && subscriptionTopics.length > 0

  useEffect(() => {
    let isCancelled = false

    async function loadPapers() {
      try {
        setIsLoading(true)
        setErrorMessage('')

        const topics = deferredTopicKey ? deferredTopicKey.split(',') : []
        const response = await getPapers({ topics })

        if (isCancelled) {
          return
        }

        const nextPapers = response.data ?? []
        setPapers(nextPapers)
        setResultCount(response.count ?? nextPapers.length)
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error.message)
          setPapers([])
          setResultCount(0)
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadPapers()

    return () => {
      isCancelled = true
    }
  }, [deferredTopicKey])

  function toggleFilter(topic) {
    startTransition(() => {
      setSelectedTopics((currentTopics) =>
        toggleTopic(currentTopics, topic),
      )
    })
  }

  function clearFilters() {
    startTransition(() => {
      setSelectedTopics([])
    })
  }

  function toggleSubscriptionTopic(topic) {
    setSubmitError('')
    setSubmitMessage('')
    setSubscriptionTopics((currentTopics) => toggleTopic(currentTopics, topic))
  }

  function handleEmailChange(event) {
    setSubmitError('')
    setSubmitMessage('')
    setEmail(event.target.value)
  }

  async function handleSubscribe(event) {
    event.preventDefault()

    try {
      setIsSubmitting(true)
      setSubmitError('')
      setSubmitMessage('')

      const response = await createSubscription({
        email: email.trim(),
        subscribedTopics: subscriptionTopics,
      })

      setSubmitMessage(
        response.message ?? 'Subscription created successfully.',
      )
      setEmail('')
      setSubscriptionTopics([])
    } catch (error) {
      setSubmitError(error.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  function scrollToSubscription() {
    document.getElementById('subscribe-panel')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    })
  }

  return (
    <main className="page">
      <section className="hero-panel panel">
        <div className="hero-panel__copy">
          <div className="eyebrow">AI Knowledge Hub</div>
          <h1>Discover fresh AI papers without losing the thread.</h1>
          <p className="hero-panel__lead">
            Browse recent research, filter by topic, and open each paper on its
            own reading page. Subscribe once and get emailed when new work is
            uploaded in the areas you care about.
          </p>
          <div className="hero-panel__actions">
            <button
              className="primary-button"
              type="button"
              onClick={scrollToSubscription}
            >
              Subscribe for updates
            </button>
            <div className="hero-panel__hint">
              <span>{resultCount} papers listed</span>
              <span>3 research tracks</span>
              <span>Topic-based filtering</span>
            </div>
          </div>
        </div>

        <div className="hero-panel__stats">
          <div className="stat-card">
            <span className="stat-card__label">Reading flow</span>
            <strong>Clean reading experience</strong>
            <p>Click any paper to open a distraction-free reading page with full details.</p>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Topic filters</span>
            <strong>
              {hasActiveFilters ? `${selectedTopics.length} topic filters active` : 'All topics'}
            </strong>
            <p>Filter papers by research area in one click.</p>
          </div>
          <div className="stat-card">
            <span className="stat-card__label">Subscriptions</span>
            <strong>Personalized updates</strong>
            <p>Get notified when new research matches your selected topics.</p>
          </div>
        </div>
      </section>

      <section className="home-layout">
        <div className="panel content-panel">
          <div className="section-header">
            <div>
              <div className="eyebrow">Homepage</div>
              <h2>Latest papers</h2>
            </div>
            <p className="section-header__note">
              Click any paper card to open the reading page.
            </p>
          </div>

          <div className="filter-bar">
            <button
              type="button"
              className={`filter-chip ${!hasActiveFilters ? 'is-active' : ''}`}
              onClick={clearFilters}
            >
              All topics
            </button>

            {TOPIC_OPTIONS.map((topic) => (
              <button
                key={topic.value}
                type="button"
                className={`filter-chip ${selectedTopics.includes(topic.value) ? 'is-active' : ''}`}
                onClick={() => toggleFilter(topic.value)}
              >
                {topic.label}
              </button>
            ))}
          </div>

          {isLoading && papers.length === 0 ? (
            <div className="status-card">
              <h3>Loading papers</h3>
              <p>The homepage is requesting papers from the backend.</p>
            </div>
          ) : null}

          {!isLoading && errorMessage ? (
            <div className="status-card status-card--error">
              <h3>Could not load papers</h3>
              <p>{errorMessage}</p>
            </div>
          ) : null}

          {!isLoading && !errorMessage && papers.length === 0 ? (
            <div className="status-card">
              <h3>No papers found</h3>
              <p>
                No papers matched the selected filters. Clear the topic filters
                and try again.
              </p>
            </div>
          ) : null}

          {papers.length > 0 ? (
            <div className="paper-grid">
              {papers.map((paper) => {
                const paperPath = `/papers/${paper.externalId}`

                return (
                  <a
                    key={paper.externalId}
                    href={paperPath}
                    className="paper-card"
                    onClick={(event) =>
                      handleLocalLinkClick(event, paperPath, navigate)
                    }
                  >
                    <div className="paper-card__meta">
                      <span>{formatDate(paper.publishedAt ?? paper.createdAt)}</span>
                    </div>

                    <h3>{paper.title}</h3>

                    <p className="paper-card__summary">
                      {truncateText(paper.plainLanguageSummary)}
                    </p>

                    <div className="topic-list">
                      {normalizeTopics(paper.topics).map((topic) => (
                        <span key={`${paper.externalId}-${topic}`} className="topic-pill">
                          {topic}
                        </span>
                      ))}
                    </div>

                    <div className="paper-card__footer">
                      <span>{paper.source ?? 'Research source'}</span>
                      <strong>Read paper</strong>
                    </div>
                  </a>
                )
              })}
            </div>
          ) : null}
        </div>

        <aside id="subscribe-panel" className="panel subscribe-panel">
          <div className="eyebrow">Subscription</div>
          <h2>Receive new papers by email</h2>
          <p className="subscribe-panel__lead">
            Enter your email and choose any combination of the three available
            topics.
          </p>

          <form className="subscribe-form" onSubmit={handleSubscribe}>
            <label className="field">
              <span>Email address</span>
              <input
                className="text-input"
                type="email"
                value={email}
                onChange={handleEmailChange}
                placeholder="you@example.com"
                required
              />
            </label>

            <fieldset className="topic-fieldset">
              <legend>Select topics</legend>

              <div className="topic-checkboxes">
                {TOPIC_OPTIONS.map((topic) => (
                  <label key={topic.value} className="topic-option">
                    <input
                      type="checkbox"
                      checked={subscriptionTopics.includes(topic.value)}
                      onChange={() => toggleSubscriptionTopic(topic.value)}
                    />

                    <div>
                      <strong>{topic.label}</strong>
                      <p>{topic.description}</p>
                    </div>
                  </label>
                ))}
              </div>
            </fieldset>

            {submitError ? <p className="form-message form-message--error">{submitError}</p> : null}
            {submitMessage ? <p className="form-message form-message--success">{submitMessage}</p> : null}

            <button
              className="primary-button primary-button--full"
              type="submit"
              disabled={isSubmitting || !canSubmit}
            >
              {isSubmitting ? 'Submitting...' : 'Subscribe'}
            </button>
          </form>
        </aside>
      </section>
    </main>
  )
}

function PaperDetailsPage({ paperId, navigate }) {
  const [paper, setPaper] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let isCancelled = false

    async function loadPaper() {
      try {
        setIsLoading(true)
        setErrorMessage('')

        const response = await getPaperById(paperId)

        if (!isCancelled) {
          setPaper(response.data ?? null)
        }
      } catch (error) {
        if (!isCancelled) {
          setErrorMessage(error.message)
          setPaper(null)
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }

    loadPaper()

    return () => {
      isCancelled = true
    }
  }, [paperId])

  return (
    <main className="page page--detail">
      <a
        href="/"
        className="back-link"
        onClick={(event) => handleLocalLinkClick(event, '/', navigate)}
      >
        Back to homepage
      </a>

      {isLoading ? (
        <div className="panel status-card">
          <h2>Loading paper</h2>
          <p>The frontend is requesting the selected paper from the backend.</p>
        </div>
      ) : null}

      {!isLoading && errorMessage ? (
        <div className="panel status-card status-card--error">
          <h2>Paper unavailable</h2>
          <p>{errorMessage}</p>
        </div>
      ) : null}

      {!isLoading && paper ? (
        <>
          <section className="panel detail-hero">
            <div className="detail-hero__content">
              <div className="eyebrow">Paper page</div>
              <h1>{paper.title}</h1>

              <div className="topic-list">
                {normalizeTopics(paper.topics).map((topic) => (
                  <span key={`${paper.externalId}-${topic}`} className="topic-pill">
                    {topic}
                  </span>
                ))}
              </div>

              <div className="detail-actions">
                {paper.pdfUrl ? (
                  <a
                    className="primary-button primary-button--link"
                    href={paper.pdfUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open PDF
                  </a>
                ) : null}

                {paper.audioUrl ? (
                  <a
                    className="secondary-button"
                    href={paper.audioUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Open audio
                  </a>
                ) : null}
              </div>
            </div>

            <div className="detail-meta">
              <div className="metric-row">
                <span>Source</span>
                <strong>{paper.source ?? 'Unknown source'}</strong>
              </div>
              <div className="metric-row">
                <span>Published</span>
                <strong>{formatDate(paper.publishedAt ?? paper.createdAt)}</strong>
              </div>
              <div className="metric-row">
                <span>External ID</span>
                <strong>{paper.externalId ?? 'Unavailable'}</strong>
              </div>
            </div>
          </section>

          <section className="detail-grid">
            <article className="panel detail-card">
              <div className="section-header section-header--compact">
                <div>
                  <div className="eyebrow">Summary</div>
                  <h2>What this paper covers</h2>
                </div>
              </div>
              <p className="detail-card__body">
                {paper.plainLanguageSummary || 'No summary is available for this paper yet.'}
              </p>
            </article>

            <aside className="panel detail-card">
              <div className="section-header section-header--compact">
                <div>
                  <div className="eyebrow">Media</div>
                  <h2>Available resources</h2>
                </div>
              </div>

              {paper.audioUrl ? (
                <audio className="audio-player" controls preload="none">
                  <source src={paper.audioUrl} />
                  Your browser does not support audio playback.
                </audio>
              ) : (
                <p className="detail-card__body">
                  No audio version is attached to this paper.
                </p>
              )}
            </aside>
          </section>

          <section className="panel document-panel">
            <div className="section-header section-header--compact">
              <div>
                <div className="eyebrow">Document</div>
                <h2>Paper reader</h2>
              </div>
              {paper.pdfUrl ? (
                <a href={paper.pdfUrl} target="_blank" rel="noreferrer">
                  Open the file in a new tab
                </a>
              ) : null}
            </div>

            {paper.pdfUrl ? (
              <iframe
                className="document-frame"
                src={paper.pdfUrl}
                title={`PDF preview for ${paper.title}`}
              />
            ) : (
              <div className="status-card status-card--plain">
                <h3>PDF not available</h3>
                <p>The paper can still be read through the summary and metadata above.</p>
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  )
}

function NotFoundPage({ navigate }) {
  return (
    <main className="page page--centered">
      <section className="panel status-card status-card--plain">
        <div className="eyebrow">Route not found</div>
        <h1>This page does not exist.</h1>
        <p>
          Return to the homepage to browse papers and manage subscriptions.
        </p>
        <a
          href="/"
          className="primary-button primary-button--link"
          onClick={(event) => handleLocalLinkClick(event, '/', navigate)}
        >
          Go to homepage
        </a>
      </section>
    </main>
  )
}

function useClientRouter() {
  const [pathname, setPathname] = useState(() => window.location.pathname || '/')

  useEffect(() => {
    function handlePopState() {
      setPathname(window.location.pathname || '/')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    window.addEventListener('popstate', handlePopState)

    return () => {
      window.removeEventListener('popstate', handlePopState)
    }
  }, [])

  function navigate(nextPathname) {
    if (!nextPathname || nextPathname === pathname) {
      return
    }

    window.history.pushState({}, '', nextPathname)
    startTransition(() => {
      setPathname(nextPathname)
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return { pathname, navigate }
}

function handleLocalLinkClick(event, path, navigate) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return
  }

  event.preventDefault()
  navigate(path)
}

function getPaperIdFromPath(pathname) {
  const match = PAPER_ROUTE_PATTERN.exec(pathname)
  return match ? decodeURIComponent(match[1]) : null
}

function toggleTopic(currentTopics, topic) {
  return currentTopics.includes(topic)
    ? currentTopics.filter((currentTopic) => currentTopic !== topic)
    : [...currentTopics, topic]
}

function normalizeTopics(topics) {
  if (!Array.isArray(topics)) {
    return []
  }

  return topics
}

function formatDate(value) {
  if (!value) {
    return 'Recently added'
  }

  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
  }).format(new Date(value))
}

function truncateText(value, limit = 220) {
  if (!value) {
    return 'No summary is available for this paper yet.'
  }

  if (value.length <= limit) {
    return value
  }

  return `${value.slice(0, limit).trimEnd()}...`
}

export default App
