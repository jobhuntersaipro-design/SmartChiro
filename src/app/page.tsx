import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[linear-gradient(135deg,oklch(97.5%_.016_300),oklch(98%_.016_65))] px-6">
      <h1 className="max-w-4xl text-center text-[44px] font-medium leading-[1.1] tracking-[-0.03em] text-foreground sm:text-[64px]">
        See More. Treat Better.
      </h1>
      <p className="mt-6 max-w-2xl text-center text-[18px] leading-[1.5] text-fg-secondary">
        The modern chiropractic platform with Adobe-grade X-ray annotation,
        patient management, and clinical workflow — all in one place.
      </p>
      <div className="mt-10 flex gap-3">
        <Link href="/register" className={buttonVariants({ size: "lg" })}>
          Get Started
        </Link>
        <Link href="/login" className={buttonVariants({ variant: "outline", size: "lg" })}>
          Sign In
        </Link>
      </div>
    </div>
  );
}
