export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-ocean-950 flex items-center justify-center p-4">
      <div className="glass-card p-6 md:p-8 w-full max-w-lg">{children}</div>
    </div>
  );
}
