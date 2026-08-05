import { useEffect, useState } from 'react'

// "Now" has to move on its own: re-render on a timer so a meeting lights up when it
// starts and dims when it ends, without the owner reloading the page. 30s keeps the
// marker within half a minute of the truth — the clock is read fresh on each render,
// this only forces the render. Used by the meetings list and the Mentions feed.
export function useClockTick(ms = 30_000) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), ms)
    return () => clearInterval(id)
  }, [ms])
}
