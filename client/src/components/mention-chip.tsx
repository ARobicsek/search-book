import { Link } from 'react-router-dom'
import { Building2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import type { ConversationMention } from '@/lib/types'

// The badge for one @-mention. A resolved person (blue) or organization (violet)
// links out to its record; a loose mention — a name that isn't in the CRM yet —
// is dashed and inert. Shared by the Mentions review page (which adds a "Create"
// button beside the loose ones) and the search page's "@-Mentions" results, so the
// two surfaces read the same.
export function MentionChip({ mention }: { mention: ConversationMention }) {
  if (mention.contact) {
    return (
      <Link to={`/contacts/${mention.contact.id}`}>
        <Badge variant="outline" className="bg-blue-50 text-blue-800 border-blue-200 hover:bg-blue-100 text-xs">
          {mention.contact.name}
        </Badge>
      </Link>
    )
  }
  if (mention.company) {
    return (
      <Link to={`/companies/${mention.company.id}`}>
        <Badge variant="outline" className="bg-violet-50 text-violet-800 border-violet-200 hover:bg-violet-100 text-xs">
          <Building2 className="mr-1 h-3 w-3" />
          {mention.company.name}
        </Badge>
      </Link>
    )
  }
  return (
    <Badge
      variant="outline"
      className={
        mention.kind === 'COMPANY'
          ? 'border-dashed border-violet-300 bg-violet-50 text-violet-800 text-xs'
          : 'border-dashed border-amber-300 bg-amber-50 text-amber-800 text-xs'
      }
      title={mention.kind === 'COMPANY' ? 'Not an organization yet' : 'Not a contact yet'}
    >
      {mention.kind === 'COMPANY' && <Building2 className="mr-1 h-3 w-3" />}
      {mention.mentionedName}
    </Badge>
  )
}
