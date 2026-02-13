interface SettingsRowProps {
  label: string
  value: string
}

export function SettingsRow({ label, value }: SettingsRowProps) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      <p className="text-sm font-semibold text-slate-900">{value}</p>
    </div>
  )
}
