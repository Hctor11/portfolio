import { useCallback, useRef, useState } from 'react'
import { Navigation } from './Navigation'
import { ProjectCard } from './ProjectCard'
import './tokens.css'
import './portfolio.css'
import './transitions.css'

export type PortfolioView = 'home' | 'work' | 'social'

const socialLinks = [
  ['LinkedIn', 'https://www.linkedin.com/in/hectorrivera222/'],
  ['GitHub', 'https://github.com/Hctor11'],
  ['Dribbble', 'https://dribbble.com/HectorRivera222'],
  ['Behance', 'https://www.behance.net/hctorrivera3'],
] as const

export function Portfolio() {
  const [view, setView] = useState<PortfolioView>('home')
  const viewport = useRef<HTMLElement>(null)
  const navigate = useCallback((next: PortfolioView) => {
    if (next === 'home') viewport.current?.scrollTo(0, 0)
    setView(next)
  }, [])

  return (
    <main ref={viewport} className="portfolio" data-view={view} aria-label="Rivera portfolio">
      <div className="portfolio-layout">
        <Navigation view={view} onNavigate={navigate} />
        <div className="portfolio-panels">
          <section id="selected-projects" className="portfolio-panel projects" aria-label="Selected projects"
            aria-hidden={view !== 'work'} inert={view !== 'work'}>
            <ol className="project-list">
              <li><ProjectCard project="manifold" /></li>
              <li><ProjectCard project="alexandria" /></li>
            </ol>
          </section>
          <section id="social-links" className="portfolio-panel social-view" aria-label="Social links"
            aria-hidden={view !== 'social'} inert={view !== 'social'}>
            <ul className="social-list">
              {socialLinks.map(([label, href]) => <li key={label}>
                <a href={href} target="_blank" rel="noopener noreferrer">{label}</a>
              </li>)}
            </ul>
          </section>
        </div>
      </div>
    </main>
  )
}
