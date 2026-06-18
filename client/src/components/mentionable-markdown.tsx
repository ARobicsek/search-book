import ReactMarkdown from 'react-markdown'
import { Link } from 'react-router-dom'

// Renders meeting-note markdown, turning @-mention tokens into chips:
//   [@Name](/contacts/123)  → a blue chip linking to the contact
//   [@Org](/companies/45)   → a violet chip linking to the organization
//   [@Name](#mention)       → a dashed amber "loose person" chip (not a contact yet)
//   [@Org](#org-mention)    → a dashed violet "loose org" chip (not a company yet)
// Everything else renders as normal markdown (other links open in a new tab).
//
// Wrap in a `.prep-note-markdown` container (as the meeting card does) for the
// shared note typography.
export function MentionableMarkdown({ children }: { children: string }) {
  return (
    <ReactMarkdown
      components={{
        a({ href, children }) {
          const h = href || ''
          if (h.startsWith('/contacts/')) {
            return (
              <Link
                to={h}
                className="rounded bg-blue-50 px-1 font-medium text-blue-700 no-underline hover:bg-blue-100"
              >
                {children}
              </Link>
            )
          }
          if (h.startsWith('/companies/')) {
            return (
              <Link
                to={h}
                className="rounded bg-violet-50 px-1 font-medium text-violet-700 no-underline hover:bg-violet-100"
              >
                {children}
              </Link>
            )
          }
          if (h === '#mention') {
            return (
              <span
                className="rounded border border-dashed border-amber-300 bg-amber-50 px-1 font-medium text-amber-700"
                title="Mentioned — not a contact yet"
              >
                {children}
              </span>
            )
          }
          if (h === '#org-mention') {
            return (
              <span
                className="rounded border border-dashed border-violet-300 bg-violet-50 px-1 font-medium text-violet-700"
                title="Mentioned — not an organization yet"
              >
                {children}
              </span>
            )
          }
          return (
            <a href={h} target="_blank" rel="noreferrer">
              {children}
            </a>
          )
        },
      }}
    >
      {children}
    </ReactMarkdown>
  )
}
