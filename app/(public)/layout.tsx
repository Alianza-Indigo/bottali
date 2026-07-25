export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-subtle px-4 py-12">
      <main id="main-content" className="w-full max-w-md">
        {children}
      </main>
    </div>
  );
}
