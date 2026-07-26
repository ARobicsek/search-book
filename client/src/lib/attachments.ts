// Shared behavior for meeting attachment links.
//
// Attachments live in private Netlify Blobs and are served by the media proxy at
// a RELATIVE /files/<name> path (server/src/routes/media.ts), which makes an
// attachment link a same-origin navigation. That matters for the installed PWA:
// iOS standalone mode has no browser chrome and no new tab, so `target="_blank"`
// navigates the app window itself to the file, stranding the user with no way
// back — they have to force-close the app. Hence the two rules here:
//
//   • image attachments  → don't navigate at all; the app-wide lightbox
//     (components/image-lightbox.tsx) intercepts the click via `data-image-attachment`.
//   • everything else    → in standalone mode, download instead of navigating, so
//     iOS shows its save/share sheet and the app stays on screen. In a normal
//     browser tab the existing new-tab behavior is kept.

export interface AttachmentLike {
  url: string
  name: string
  mimeType?: string | null
}

// Kept byte-identical to the test previously inlined at each render site.
export function isImageAttachment(att: AttachmentLike): boolean {
  return (att.mimeType || '').startsWith('image/') || /\.(jpe?g|png|gif|webp)$/i.test(att.url)
}

// True when running as an installed PWA (iOS uses the legacy navigator.standalone).
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

// Props for an attachment anchor. Images are tagged for the lightbox; other types
// get `download` in standalone mode. `download` also restores the ORIGINAL filename
// on save — the stored blob name is `${Date.now()}-${rand}${ext}`, so a plain
// download would otherwise land as "1753…-a1b2.pdf".
export function attachmentLinkProps(att: AttachmentLike) {
  if (isImageAttachment(att)) {
    return {
      href: att.url,
      target: '_blank',
      rel: 'noreferrer',
      'data-image-attachment': att.name || '',
    } as const
  }
  return isStandalone()
    ? ({ href: att.url, download: att.name } as const)
    : ({ href: att.url, target: '_blank', rel: 'noreferrer' } as const)
}
