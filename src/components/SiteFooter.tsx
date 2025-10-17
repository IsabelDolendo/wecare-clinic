import Image from "next/image";
import Link from "next/link";

const FACEBOOK_URL = "https://www.facebook.com/profile.php?id=61572724907175";
const CONTACT_NUMBER = "09568670010";
const CONTACT_EMAIL = "wecareanimalbitec@gmail.com";

type SiteFooterProps = {
  className?: string;
};

export default function SiteFooter({ className = "" }: SiteFooterProps) {
  return (
    <footer className={`bg-neutral-900 text-neutral-100 px-6 py-8 ${className}`}>
      <div className="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row md:items-start md:justify-between">
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">WeCare Animal Bite Clinic</h2>
          <p className="max-w-xl text-sm text-neutral-300">
            If you have questions, you can contact us via Facebook, email, or phone—or visit us in person at
            Zone 8, Bulan, Sorsogon. We&apos;re here to help keep your community safe and protected.
          </p>
          <div className="flex items-center gap-3">
            <Link
              href={FACEBOOK_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-white/10 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-white/20"
            >
              <Image src="/images/fb.png" alt="Facebook" width={20} height={20} className="h-5 w-5" />
              <span>Follow us on Facebook</span>
            </Link>
          </div>
        </div>
        <div className="space-y-2 text-sm text-neutral-300">
          <div>
            <span className="font-semibold text-neutral-100">Contact Number:</span>{" "}
            <a href={`tel:${CONTACT_NUMBER}`} className="hover:text-white">
              {CONTACT_NUMBER}
            </a>
          </div>
          <div>
            <span className="font-semibold text-neutral-100">Email:</span>{" "}
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-white">
              {CONTACT_EMAIL}
            </a>
          </div>
        </div>
      </div>
      <div className="mt-6 border-t border-white/10 pt-4 text-center text-xs text-neutral-400">
        © 2025 WeCare Animal Bite Clinic. All rights reserved.
      </div>
    </footer>
  );
}
