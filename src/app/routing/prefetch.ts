export function prefetchRouteChunks(commandCenterEnabled: boolean) {
  const fallback = () => {
    void import('@features/chats/pages/ChatsPage')
    void import('@features/chats/pages/ChatThreadPage')
    void import('@features/settings/pages/SettingsPage')
    void import('@features/people/pages/PeoplePage')
    if (commandCenterEnabled) {
      void import('@features/command-center/pages/CommandCenterPage')
    }
  }

  const idle = (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback
  if (typeof idle === 'function') {
    idle(fallback, { timeout: 1500 })
  } else {
    window.setTimeout(fallback, 1200)
  }
}
