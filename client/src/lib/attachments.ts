// Shared behavior for meeting attachment links.
//
// Attachments live in private Netlify Blobs and are served by the media proxy at
// a RELATIVE /files/<name> path (server/src/routes/media.ts), which makes an
// attachment link a same-origin navigation. That matters for the installed PWA:
// iOS standalone mode has no browser chrome, no tab bar and no back button, so a
// navigation replaces the app with the file and the only escape is force-quitting.
//
// `target="_blank"` doesn't help (standalone has no second tab to open into) and
// neither does the `download` attribute — that was the first attempt and iOS
// ignored it, so the trap survived. The rule that actually holds is NEVER NAVIGATE:
// every attachment, whatever its type, is marked `data-attachment-view` and opened
// by the app-wide overlay in components/media-lightbox.tsx (images inline, other
// types as a preview + Save), so closing always returns the user where they were.
//
// In a normal browser tab, non-images keep the plain new-tab behavior — the browser's
// own viewer is better there and there's always a way back.

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

// Props for an attachment anchor.
//
// Images are always shown in the overlay (zoomable, and it beats a bare browser tab
// on any device). Non-images go to the overlay ONLY in a standalone PWA, where
// navigating away is a trap; in a browser tab they open normally.
//
// The href is kept in every case so the link still works if the interception script
// hasn't loaded, and `download` rides along in standalone mode as a second line of
// defence — it also restores the ORIGINAL filename, since the stored blob name is
// `${Date.now()}-${rand}${ext}` and a plain save lands as "1753…-a1b2.pdf".
export function attachmentLinkProps(att: AttachmentLike) {
  if (isImageAttachment(att)) {
    return {
      href: att.url,
      target: '_blank',
      rel: 'noreferrer',
      'data-attachment-view': att.name || 'image',
      'data-attachment-kind': 'image',
    } as const
  }
  return isStandalone()
    ? ({
        href: att.url,
        download: att.name,
        'data-attachment-view': att.name || 'attachment',
        'data-attachment-kind': 'file',
      } as const)
    : ({ href: att.url, target: '_blank', rel: 'noreferrer' } as const)
}
