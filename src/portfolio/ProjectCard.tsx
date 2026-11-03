import type { PointerEvent } from 'react'

const projects = {
  manifold: { title: 'Manifold UI', kind: 'UI Kit', stack: 'React 10 + Tailwind', href: 'https://manifolds-ui.vercel.app/?path=%2Fstory%2Fmanifolds-ui-introduction--getting-started' },
  alexandria: { title: 'Alexandria', kind: 'Note taking app', stack: 'Tauri + React', href: 'https://alexandria-landing-page.vercel.app/' },
} as const

function moveSpotlight(event: PointerEvent<HTMLAnchorElement>) {
  if (event.pointerType === 'touch') return
  const card = event.currentTarget
  const bounds = card.getBoundingClientRect()
  card.style.setProperty('--spotlight-x', `${event.clientX - bounds.left}px`)
  card.style.setProperty('--spotlight-y', `${event.clientY - bounds.top}px`)
}

export function ProjectCard({ project }: { project: keyof typeof projects }) {
  const { title, kind, stack, href } = projects[project]
  return (
    <a className={`project-card project-card--${project}`} aria-labelledby={`${project}-title`}
      href={href} target="_blank" rel="noopener noreferrer" onPointerMove={moveSpotlight}
      onFocus={(event) => {
        event.currentTarget.style.setProperty('--spotlight-x', '50%')
        event.currentTarget.style.setProperty('--spotlight-y', '50%')
      }}>
      <div className="project-copy">
        <h2 id={`${project}-title`}>{title}</h2>
        <p>{kind}<br />{stack}</p>
      </div>
      <div className="project-preview" aria-hidden="true">
        <div className="preview-detail"><img src="/projects/manifold-detail.png" alt="" width="1920" height="999" /></div>
        {project === 'manifold' ? (
          <div className="preview-manifold"><img src="/projects/manifold-ui.png" alt="" width="1920" height="1163" /></div>
        ) : (
          <>
            {/* Figma exports these previews already clipped to the card's visible area. */}
            <img className="preview-import" src="/projects/alexandria-import.png" alt="" width="283" height="140" />
            <img className="preview-editor" src="/projects/alexandria-editor.png" alt="" width="286" height="169" />
          </>
        )}
      </div>
    </a>
  )
}
