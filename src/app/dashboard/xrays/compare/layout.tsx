export default function CompareLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Full-screen layout — no dashboard sidebar/topbar
  return <>{children}</>;
}
