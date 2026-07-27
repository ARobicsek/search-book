import { Paperclip } from 'lucide-react'
import type { ConversationAttachment } from '@/lib/types'
import { attachmentLinkProps, isImageAttachment } from '@/lib/attachments'

// Read-only attachment row, shared by the meetings list and the meeting detail
// dialog (the two rendered byte-identical markup). Click behavior — lightbox for
// images, download-not-navigate for other types in a standalone PWA — comes from
// attachmentLinkProps; see lib/attachments.ts for why.
export function AttachmentChips({ attachments }: { attachments: ConversationAttachment[] }) {
  if (!attachments.length) return null
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {attachments.map((att) =>
        isImageAttachment(att) ? (
          <a key={att.id} {...attachmentLinkProps(att)} title={att.name}>
            <img
              src={att.url}
              alt={att.name}
              className="h-16 w-16 rounded-md border object-cover hover:opacity-80"
            />
          </a>
        ) : (
          <a
            key={att.id}
            {...attachmentLinkProps(att)}
            className="flex items-center gap-1 rounded-md border bg-muted/50 px-2 py-1 text-xs text-primary hover:underline"
            title={att.name}
          >
            <Paperclip className="h-3 w-3" />
            <span className="max-w-40 truncate">{att.name}</span>
          </a>
        )
      )}
    </div>
  )
}
