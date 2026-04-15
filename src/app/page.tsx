import Link from "next/link";

export default function Home() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center px-6"
      style={{ backgroundColor: "#1c1e54" }}
    >
      <h1
        className="max-w-4xl text-center"
        style={{
          fontSize: 56,
          fontWeight: 300,
          lineHeight: 1.03,
          letterSpacing: "-1.4px",
          color: "#ffffff",
        }}
      >
        See More. Treat Better.
      </h1>
      <p
        className="mt-6 max-w-2xl text-center"
        style={{
          fontSize: 18,
          fontWeight: 300,
          lineHeight: 1.4,
          color: "rgba(255,255,255,0.7)",
        }}
      >
        The modern chiropractic platform with Adobe-grade X-ray annotation,
        patient management, and clinical workflow — all in one place.
      </p>
      <div className="mt-10 flex gap-4">
        <Link
          href="/login"
          className="inline-flex items-center justify-center px-4 py-2 text-[15px] font-medium text-white transition-colors hover:opacity-90"
          style={{
            backgroundColor: "#533afd",
            borderRadius: 4,
            padding: "8px 16px",
          }}
        >
          Get Started
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center justify-center px-4 py-2 text-[15px] font-medium transition-colors hover:opacity-90"
          style={{
            backgroundColor: "transparent",
            borderRadius: 4,
            padding: "8px 16px",
            color: "rgba(255,255,255,0.7)",
            border: "1px solid rgba(255,255,255,0.25)",
          }}
        >
          Sign In
        </Link>
      </div>
    </div>
  );
}
