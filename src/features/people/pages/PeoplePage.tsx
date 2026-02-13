import { useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'

import clsx from 'clsx'

import { FOCUS_NEW_CHAT_EVENT, FOCUS_SEARCH_EVENT } from '@shared/runtime/shortcuts'
import type { PersonTrust } from '@shared/types/people'
import { ListSkeleton } from '@shared/ui/ListSkeleton'
import { PageHeading } from '@shared/ui/PageHeading'
import { Panel } from '@shared/ui/Panel'
import { VirtualizedList } from '@shared/ui/VirtualizedList'
import { buildNewChatHref, parseLxmfContactReference } from '@shared/utils/contactReference'
import { filterIndexedItems, indexSearchItems } from '@shared/utils/search'

import { usePeople } from '../hooks/usePeople'

export function PeoplePage() {
  const navigate = useNavigate()
  const { people, loading, error, refresh } = usePeople()
  const [query, setQuery] = useState('')
  const [destinationInput, setDestinationInput] = useState('')
  const [nameInput, setNameInput] = useState('')
  const [createError, setCreateError] = useState<string | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const destinationInputRef = useRef<HTMLInputElement | null>(null)
  const deferredQuery = useDeferredValue(query)
  const indexedPeople = useMemo(
    () =>
      indexSearchItems(people, person => [person.name, person.id, person.lastSeen, person.trust], {
        cacheKey: 'people',
      }),
    [people]
  )
  const filteredPeople = useMemo(
    () => filterIndexedItems(indexedPeople, deferredQuery),
    [deferredQuery, indexedPeople]
  )

  useEffect(() => {
    const onFocusSearch = () => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    }
    const onFocusNewChat = () => {
      destinationInputRef.current?.focus()
      destinationInputRef.current?.select()
    }
    window.addEventListener(FOCUS_SEARCH_EVENT, onFocusSearch)
    window.addEventListener(FOCUS_NEW_CHAT_EVENT, onFocusNewChat)
    return () => {
      window.removeEventListener(FOCUS_SEARCH_EVENT, onFocusSearch)
      window.removeEventListener(FOCUS_NEW_CHAT_EVENT, onFocusNewChat)
    }
  }, [])

  return (
    <Panel className="flex h-full min-h-0 flex-col">
      <PageHeading
        title="People"
        subtitle="Contacts you can message"
        action={
          <button
            onClick={() => {
              void refresh()
            }}
            className="rounded-xl bg-blue-600 px-3 py-2 text-xs font-semibold text-white transition hover:bg-blue-700"
          >
            Refresh
          </button>
        }
      />
      <input
        ref={searchInputRef}
        value={query}
        onChange={event => setQuery(event.target.value)}
        className="mb-3 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-700 transition outline-none focus:border-blue-300"
        placeholder="Search peers by name, hash, or trust"
      />
      <form
        className="mb-3 grid gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-2.5"
        onSubmit={event => {
          event.preventDefault()
          const parsed = parseLxmfContactReference(destinationInput)
          if (!parsed.ok) {
            setCreateError(parsed.error)
            return
          }
          setCreateError(null)
          void navigate(buildNewChatHref(parsed.value.destinationHash, nameInput))
          setDestinationInput('')
          setNameInput('')
        }}
      >
        <input
          ref={destinationInputRef}
          value={destinationInput}
          onChange={event => {
            setDestinationInput(event.target.value)
            setCreateError(null)
          }}
          className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition outline-none focus:border-blue-300"
          placeholder="Add contact from hash or lxma:// link"
        />
        <div className="flex items-center gap-2">
          <input
            value={nameInput}
            onChange={event => {
              setNameInput(event.target.value)
              setCreateError(null)
            }}
            className="h-10 flex-1 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700 transition outline-none focus:border-blue-300"
            placeholder="Optional display name"
          />
          <button
            type="submit"
            className="h-10 rounded-xl border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Start chat
          </button>
        </div>
        {createError ? <p className="text-xs text-rose-700">{createError}</p> : null}
      </form>

      {error ? (
        <p className="mb-2 rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
      ) : null}
      {!loading && people.length === 0 ? (
        <p className="text-sm text-slate-500">
          No peers discovered yet. Keep Weft connected to the network.
        </p>
      ) : null}
      {!loading && people.length > 0 && filteredPeople.length === 0 ? (
        <p className="text-sm text-slate-500">No peers match your search.</p>
      ) : null}

      {loading ? (
        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          <ListSkeleton rows={8} />
        </div>
      ) : (
        <VirtualizedList
          items={filteredPeople}
          estimateItemHeight={82}
          className="min-h-0 flex-1 overflow-y-auto pr-1"
          listClassName="pb-1"
          getKey={person => person.id}
          renderItem={person => (
            <div className="py-1">
              <Link
                to={buildNewChatHref(person.id, person.name)}
                className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 transition-colors hover:border-slate-300 hover:bg-slate-50/70"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{person.name}</p>
                  <p className="mt-0.5 text-xs text-slate-500">Last seen {person.lastSeen}</p>
                </div>
                <span
                  className={clsx(
                    'rounded-full px-2 py-1 text-xs font-medium',
                    trustBadgeClasses(person.trust)
                  )}
                >
                  {person.trust}
                </span>
              </Link>
            </div>
          )}
        />
      )}
    </Panel>
  )
}

function trustBadgeClasses(trust: PersonTrust): string {
  switch (trust) {
    case 'Verified':
      return 'bg-emerald-100 text-emerald-700'
    case 'Known':
      return 'bg-sky-100 text-sky-700'
    case 'New':
      return 'bg-slate-100 text-slate-700'
    default:
      return 'bg-slate-100 text-slate-700'
  }
}
