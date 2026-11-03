import { useEffect, useRef } from 'react'
import type { PortfolioView } from './Portfolio'

const items = [
  { view: 'work', label: 'Selected work', heading: 'selected-heading', button: 'selected-button', panel: 'selected-projects' },
  { view: 'social', label: 'Social', heading: 'social-heading', button: 'social-button', panel: 'social-links' },
] as const

export function Navigation({ view, onNavigate }: {
  view: PortfolioView
  onNavigate: (view: PortfolioView) => void
}) {
  const selected = useRef<HTMLButtonElement>(null)
  const social = useRef<HTMLButtonElement>(null)
  const back = useRef<HTMLButtonElement>(null)
  const previous = useRef(view)

  useEffect(() => {
    if (previous.current !== view) {
      const homeTarget = previous.current === 'social' ? social : selected
      const target = view === 'home' ? homeTarget : back
      target.current?.focus({ preventScroll: true })
      previous.current = view
    }
    if (view === 'home') return
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onNavigate('home')
    }
    window.addEventListener('keydown', escape)
    return () => window.removeEventListener('keydown', escape)
  }, [view, onNavigate])

  return (
    <header className="portfolio-header">
      <button ref={back} type="button" className="back-button" aria-label="Back to Home"
        aria-hidden={view === 'home'} disabled={view === 'home'} onClick={() => onNavigate('home')}>
        <span className="back-icon" aria-hidden="true" />
      </button>
      <h1 className="identity" aria-hidden={view !== 'home'}>RIVERA</h1>
      <nav aria-label="Portfolio">
        {items.map((item) => {
          const active = view === item.view
          const hidden = view !== 'home' && !active
          return <div key={item.view} className={`navigation-heading ${item.heading}`}
            role={active ? 'heading' : undefined} aria-level={active ? 1 : undefined} aria-hidden={hidden}>
            <button ref={item.view === 'work' ? selected : social} type="button"
              className={`navigation-button ${item.button}`} disabled={hidden}
              aria-controls={item.panel} aria-expanded={active}
              tabIndex={active ? -1 : 0} onClick={() => onNavigate(item.view)}>
              {item.label}
            </button>
          </div>
        })}
      </nav>
    </header>
  )
}
