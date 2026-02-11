import { Link } from 'react-router-dom'

export function WelcomePage() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl items-center px-4 py-8">
      <section className="w-full rounded-3xl border border-white/60 bg-white/85 p-8 shadow-[0_30px_90px_-50px_rgba(22,45,83,0.4)] backdrop-blur">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Weft Desktop</p>
        <h1 className="mt-3 font-heading text-4xl text-slate-900">Welcome</h1>
        <p className="mt-3 max-w-xl text-sm text-slate-600">
          Private chat over resilient mesh networking, designed for people who just want to talk without dealing with network jargon.
        </p>

        <label className="mt-8 block text-sm font-medium text-slate-700" htmlFor="displayName">
          Display name
        </label>
        <input
          id="displayName"
          className="mt-2 h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-sm text-slate-800 outline-none transition focus:border-blue-300"
          placeholder="e.g. Alex"
        />

        <div className="mt-6 flex items-center gap-3">
          <Link
            to="/chats"
            className="rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700"
          >
            Create profile
          </Link>
          <button className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
            Restore from backup
          </button>
        </div>
      </section>
    </main>
  )
}
