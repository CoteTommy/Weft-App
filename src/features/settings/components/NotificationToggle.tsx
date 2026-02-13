interface NotificationToggleProps {
  label: string
  description: string
  checked: boolean
  onChange: (next: boolean) => void
}

export function NotificationToggle({
  label,
  description,
  checked,
  onChange,
}: NotificationToggleProps) {
  return (
    <label className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
      <input
        type="checkbox"
        checked={checked}
        onChange={event => {
          onChange(event.target.checked)
        }}
        className="mt-0.5"
      />
      <span>
        <span className="block font-medium text-slate-800">{label}</span>
        <span className="mt-0.5 block text-xs text-slate-500">{description}</span>
      </span>
    </label>
  )
}
