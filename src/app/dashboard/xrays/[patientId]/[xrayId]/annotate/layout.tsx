export default function AnnotateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Full-screen layout — no dashboard sidebar/topbar
  return <>{children}</>;
}
