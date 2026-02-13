import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import clsx from 'clsx'

import { APP_ROUTES } from '@app/config/routes'
import { useChatsState } from '@features/chats/state/ChatsProvider'
import { publishAppNotification } from '@shared/runtime/notifications'
import { getWeftPreferences, PREFERENCES_UPDATED_EVENT } from '@shared/runtime/preferences'
import {
  FOCUS_NEW_CHAT_EVENT,
  FOCUS_QUICK_REPLY_EVENT,
  FOCUS_SEARCH_EVENT,
} from '@shared/runtime/shortcuts'
import { announceLxmfNow, daemonRestart } from '@lib/lxmf-api'

interface PaletteAction {
  id: string
  title: string
  subtitle?: string
  shortcut?: string
  keywords?: string[]
  run: () => Promise<void> | void
}

export function CommandPalette() {
  const navigate = useNavigate()
  const location = useLocation()
  const { threads } = useChatsState()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [runningActionId, setRunningActionId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [commandCenterEnabled, setCommandCenterEnabled] = useState(
    () => getWeftPreferences().commandCenterEnabled
  )
  const inputRef = useRef<HTMLInputElement | null>(null)

  const focusSearch = () => {
    window.dispatchEvent(new Event(FOCUS_SEARCH_EVENT))
  }

  const focusNewChat = () => {
    window.dispatchEvent(new Event(FOCUS_NEW_CHAT_EVENT))
  }

  const focusQuickReply = () => {
    window.dispatchEvent(new Event(FOCUS_QUICK_REPLY_EVENT))
  }

  const quickReplyAction = useMemo<PaletteAction>(
    () => ({
      id: 'quick-reply',
      title: 'Quick reply',
      subtitle: 'Focus composer in current thread',
      shortcut: '⌘/Ctrl+R',
      keywords: ['reply', 'composer', 'message'],
      run: () => {
        if (location.pathname.startsWith(`${APP_ROUTES.chats}/`)) {
          focusQuickReply()
          return
        }
        const firstThread = threads[0]
        if (firstThread) {
          void navigate(`${APP_ROUTES.chats}/${firstThread.id}`)
          window.setTimeout(() => focusQuickReply(), 90)
          return
        }
        void navigate(APP_ROUTES.chats)
      },
    }),
    [location.pathname, navigate, threads]
  )

  const actions = useMemo<PaletteAction[]>(() => {
    const staticActions: PaletteAction[] = [
      {
        id: 'goto-chats',
        title: 'Open chats',
        keywords: ['messages', 'threads'],
        run: () => {
          void navigate(APP_ROUTES.chats)
        },
      },
      {
        id: 'goto-people',
        title: 'Open people',
        keywords: ['contacts', 'peers'],
        run: () => {
          void navigate(APP_ROUTES.people)
        },
      },
      {
        id: 'goto-announces',
        title: 'Open announces',
        keywords: ['network', 'broadcast'],
        run: () => {
          void navigate(APP_ROUTES.announces)
        },
      },
      {
        id: 'goto-settings',
        title: 'Open settings',
        keywords: ['preferences', 'config'],
        run: () => {
          void navigate(APP_ROUTES.settings)
        },
      },
      {
        id: 'new-chat',
        title: 'New chat',
        subtitle: 'Go to People and focus destination input',
        shortcut: '⌘/Ctrl+N',
        keywords: ['compose', 'contact'],
        run: () => {
          void navigate(APP_ROUTES.people)
          window.setTimeout(() => focusNewChat(), 90)
        },
      },
      {
        id: 'search-current',
        title: 'Search current page',
        subtitle: 'Focus in-page search field',
        shortcut: '⌘/Ctrl+F',
        keywords: ['filter', 'find'],
        run: () => {
          focusSearch()
        },
      },
      quickReplyAction,
      {
        id: 'announce-now',
        title: 'Announce now',
        subtitle: 'Broadcast local presence',
        keywords: ['runtime', 'beacon'],
        run: async () => {
          await announceLxmfNow()
          publishAppNotification({
            kind: 'system',
            title: 'Announce sent',
            body: 'Local announce broadcast was triggered.',
          })
        },
      },
      {
        id: 'restart-daemon',
        title: 'Restart daemon',
        subtitle: 'Managed daemon restart',
        keywords: ['runtime', 'restart', 'recover'],
        run: async () => {
          await daemonRestart({ managed: true })
          publishAppNotification({
            kind: 'system',
            title: 'Daemon restarted',
            body: 'Managed runtime restart completed.',
          })
        },
      },
    ]
    if (commandCenterEnabled) {
      staticActions.push({
        id: 'goto-command-center',
        title: 'Open command center',
        keywords: ['advanced', 'runtime', 'commands'],
        run: () => {
          void navigate(APP_ROUTES.commandCenter)
        },
      })
    }
    const threadActions = threads.slice(0, 40).map<PaletteAction>(thread => ({
      id: `thread:${thread.id}`,
      title: `Jump to ${thread.name}`,
      subtitle: thread.preview || thread.destination,
      keywords: ['thread', thread.destination, thread.name],
      run: () => {
        void navigate(`${APP_ROUTES.chats}/${thread.id}`)
      },
    }))
    return [...staticActions, ...threadActions]
  }, [commandCenterEnabled, navigate, quickReplyAction, threads])

  const filteredActions = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) {
      return actions
    }
    const tokens = normalized.split(/\s+/).filter(Boolean)
    return actions.filter(action => {
      const haystack = [
        action.title,
        action.subtitle ?? '',
        action.shortcut ?? '',
        ...(action.keywords ?? []),
      ]
        .join(' ')
        .toLowerCase()
      return tokens.every(token => haystack.includes(token))
    })
  }, [actions, query])

  useEffect(() => {
    setSelectedIndex(0)
  }, [query, open])

  useEffect(() => {
    if (!open) {
      return
    }
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [open])

  useEffect(() => {
    const syncPreferences = () => {
      setCommandCenterEnabled(getWeftPreferences().commandCenterEnabled)
    }
    window.addEventListener(PREFERENCES_UPDATED_EVENT, syncPreferences)
    return () => {
      window.removeEventListener(PREFERENCES_UPDATED_EVENT, syncPreferences)
    }
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey
      if (!meta) {
        if (!open) {
          return
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setOpen(false)
          return
        }
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSelectedIndex(value => Math.min(value + 1, Math.max(filteredActions.length - 1, 0)))
          return
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSelectedIndex(value => Math.max(0, value - 1))
          return
        }
        if (event.key === 'Enter') {
          const action = filteredActions[selectedIndex]
          if (!action) {
            return
          }
          event.preventDefault()
          void runAction(action)
        }
        return
      }

      const key = event.key.toLowerCase()
      if (key === 'k') {
        event.preventDefault()
        setFeedback(null)
        setOpen(value => !value)
        return
      }
      if (key === 'n') {
        event.preventDefault()
        void runAction(actions.find(action => action.id === 'new-chat'))
        return
      }
      if (key === 'f') {
        event.preventDefault()
        void runAction(actions.find(action => action.id === 'search-current'))
        return
      }
      if (key === 'j') {
        event.preventDefault()
        setOpen(true)
        setQuery('thread ')
        return
      }
      if (key === 'r') {
        event.preventDefault()
        void runAction(quickReplyAction)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [actions, filteredActions, open, quickReplyAction, selectedIndex])

  const runAction = async (action?: PaletteAction) => {
    if (!action) {
      return
    }
    try {
      setRunningActionId(action.id)
      setFeedback(null)
      await action.run()
      setOpen(false)
      setQuery('')
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : String(error))
    } finally {
      setRunningActionId(null)
    }
  }

  if (!open) {
    return null
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/30 p-4" onClick={() => setOpen(false)}>
      <div
        className="mx-auto mt-[10vh] w-full max-w-2xl rounded-2xl border border-slate-200 bg-white shadow-[0_30px_80px_-35px_rgba(15,23,42,0.6)]"
        onClick={event => event.stopPropagation()}
      >
        <div className="border-b border-slate-100 p-3">
          <input
            ref={inputRef}
            value={query}
            onChange={event => setQuery(event.target.value)}
            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm text-slate-800 outline-none transition focus:border-blue-300"
            placeholder="Type a command or jump to a thread..."
          />
          <p className="mt-2 text-[11px] text-slate-500">
            Shortcuts: ⌘/Ctrl+K command palette, ⌘/Ctrl+N new chat, ⌘/Ctrl+F search, ⌘/Ctrl+J jump
            threads, ⌘/Ctrl+R quick reply
          </p>
          {feedback ? <p className="mt-2 text-xs text-rose-700">{feedback}</p> : null}
        </div>
        <div className="max-h-[56vh] overflow-y-auto p-2">
          {filteredActions.length === 0 ? (
            <p className="px-2 py-4 text-sm text-slate-500">No commands match.</p>
          ) : (
            <ul className="space-y-1">
              {filteredActions.map((action, index) => (
                <li key={action.id}>
                  <button
                    type="button"
                    onClick={() => {
                      void runAction(action)
                    }}
                    className={clsx(
                      'flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition',
                      selectedIndex === index ? 'bg-blue-50 text-blue-900' : 'hover:bg-slate-50'
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{action.title}</p>
                      {action.subtitle ? (
                        <p className="truncate text-xs text-slate-500">{action.subtitle}</p>
                      ) : null}
                    </div>
                    <div className="ml-3 shrink-0">
                      {runningActionId === action.id ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
                          Running...
                        </span>
                      ) : action.shortcut ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-500">
                          {action.shortcut}
                        </span>
                      ) : null}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
