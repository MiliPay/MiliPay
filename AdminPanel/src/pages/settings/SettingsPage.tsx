export default function SettingsPage() {
  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto animate-rise-in">
      <header className="mb-8">
        <h1 className="text-2xl font-display font-bold text-ink mb-1">Settings</h1>
        <p className="text-ink-muted text-sm">Admin-only configuration.</p>
      </header>
      <p className="text-ink-muted text-sm">Nothing configured yet.</p>
    </div>
  );
}