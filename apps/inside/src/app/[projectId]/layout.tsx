export default function DesignLayout({ children }: { children: React.ReactNode }) {
  return <div className="w-full flex-1 flex flex-col min-h-0">{children}</div>;
}
