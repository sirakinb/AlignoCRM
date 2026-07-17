import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  Clock3,
  GitBranch,
  MailCheck,
  Send,
  ShieldCheck,
  Terminal,
  Users,
} from "lucide-react";
import { getSiteUrl } from "@/lib/seo/site-url";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: "Aligno CRM | A Lightweight CRM for Service Businesses",
  description:
    "Aligno CRM helps agencies, creators, coaches, and consultants manage contacts, pipeline, and follow-up in one focused workspace.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Aligno CRM | A Lightweight CRM for Service Businesses",
    description:
      "One focused place to manage contacts, track pipeline, and stay on top of follow-up.",
    url: siteUrl,
    siteName: "Aligno CRM",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Aligno CRM — A Lightweight CRM for Service Businesses",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Aligno CRM | A Lightweight CRM for Service Businesses",
    description:
      "One focused place to manage contacts, track pipeline, and stay on top of follow-up.",
    images: ["/og-image.png"],
  },
};

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const features = [
  {
    icon: GitBranch,
    title: "See every deal in motion",
    text: "Track leads by pipeline, stage, value, and contact so the next move is visible without digging through notes.",
  },
  {
    icon: Users,
    title: "Keep contacts organized",
    text: "Every contact, tag, note, and deal stays connected, so the full story is one click away.",
  },
  {
    icon: Clock3,
    title: "Never miss a follow-up",
    text: "Activity and next steps live on every deal, so nothing sits waiting or slips through the cracks.",
  },
  {
    icon: Send,
    title: "Capture leads from anywhere",
    text: "Point your forms and tools at a simple webhook and new leads land straight in your pipeline.",
  },
];

const howItWorks = [
  {
    step: "01",
    title: "Capture your leads",
    text: "Contacts, tags, deals, and notes stay connected from the first touch.",
  },
  {
    step: "02",
    title: "Work your pipeline",
    text: "Move deals through stages, update values, and keep every detail attached to the record.",
  },
  {
    step: "03",
    title: "Follow up on time",
    text: "See what needs attention next, so every lead gets a response while it still matters.",
  },
];

const stats = [
  { value: "< 2 min", label: "Setup time" },
  { value: "Zero", label: "Leads dropped" },
];

const audiences = [
  {
    icon: Users,
    title: "Agencies",
    text: "Lead intake from forms, events, and referrals with pipeline visibility across every client.",
  },
  {
    icon: MailCheck,
    title: "Creators & coaches",
    text: "Simple follow-up for the conversations that shouldn't have to wait.",
  },
  {
    icon: Clock3,
    title: "Consultants",
    text: "A clear picture of every engagement so nothing falls through the cracks.",
  },
  {
    icon: ShieldCheck,
    title: "Service teams",
    text: "One shared view of contacts, deals, and next steps that keeps everyone aligned.",
  },
];

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function LandingPage() {
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: "Aligno CRM",
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: siteUrl,
    description:
      "A lightweight pipeline and contact management CRM for agencies, creators, coaches, and consultants.",
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      url: "https://pentridgemedia.com/labs",
      name: "Pentridge Labs",
    },
  };

  return (
    <main className="min-h-screen overflow-hidden bg-[#f7f7f8]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />

      {/* ---------------------------------------------------------- */}
      {/*  Nav                                                        */}
      {/* ---------------------------------------------------------- */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[#e7e7ea] bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-6 lg:px-8">
          {/* Logo left */}
          <Link href="/" className="flex items-center gap-2" aria-label="Aligno CRM home">
            <Image
              src="/aligno-crm_logo.png"
              alt=""
              width={28}
              height={28}
              priority
              className="h-7 w-7 object-contain"
            />
            <span className="flex flex-col leading-tight">
              <span className="text-sm font-semibold tracking-tight text-zinc-900">
                Aligno CRM
              </span>
              <span className="text-[11px] text-zinc-500">
                Part of the Pentridge product suite
              </span>
            </span>
          </Link>

          {/* Nav links center */}
          <nav className="hidden items-center gap-7 text-[13px] font-medium text-zinc-600 md:flex">
            <a href="#features" className="transition-colors hover:text-zinc-900">
              Features
            </a>
            <a href="#how-it-works" className="transition-colors hover:text-zinc-900">
              How it works
            </a>
            <a href="#who-its-for" className="transition-colors hover:text-zinc-900">
              Who it&apos;s for
            </a>
          </nav>

          {/* CTA button right */}
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in?redirect=/dashboard"
              className="rounded-lg bg-[#6c2bd9] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#5b21b6]"
            >
              Log In
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------------------------------------------------- */}
      {/*  Hero                                                       */}
      {/* ---------------------------------------------------------- */}
      <section className="relative px-5 pb-0 pt-32 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl text-center">
          {/* Badge / pill */}
          <p className="inline-flex rounded-md border border-[#e3d5f8] bg-[#f4eefc] px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6c2bd9]">
            The CRM for service businesses
          </p>

          {/* Big bold heading */}
          <h1 className="mt-7 text-4xl font-semibold leading-[1.08] tracking-[-0.02em] text-zinc-900 sm:text-5xl lg:text-6xl">
            Turn every lead into
            <br />
            the next right follow-up.
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-zinc-600">
            Aligno CRM gives service businesses one focused place to manage
            contacts, track pipeline, and stay on top of follow-up.
          </p>

          {/* Two CTA buttons side by side */}
          <div className="mt-9 flex flex-col items-center justify-center gap-3">
            <Link
              href="/sign-in?redirect=/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#6c2bd9] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5b21b6]"
            >
              Log In
              <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
            </Link>
            <p className="text-[13px] text-zinc-500">
              Don&apos;t have an account yet?{" "}
              <a
                href="https://pentridgemedia.com/labs"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-[#6c2bd9] transition-colors hover:text-[#5b21b6]"
              >
                Sign up here
              </a>
            </p>
          </div>
        </div>

        {/* App screenshot with chrome bar and fade */}
        <div className="relative mx-auto mt-14 max-w-5xl">
          {/* Chrome overlay bar */}
          <div className="relative overflow-hidden rounded-t-xl border border-b-0 border-[#e7e7ea] bg-white shadow-[0_2px_4px_rgba(17,17,26,0.05),0_8px_24px_rgba(17,17,26,0.07)]">
            {/* Fake browser chrome */}
            <div className="flex items-center gap-2 border-b border-[#e7e7ea] bg-[#fafafa] px-4 py-3">
              <span className="h-3 w-3 rounded-full bg-[#e7e7ea]" />
              <span className="h-3 w-3 rounded-full bg-[#e7e7ea]" />
              <span className="h-3 w-3 rounded-full bg-[#e7e7ea]" />
              <span className="mx-auto block h-5 w-56 rounded-md bg-[#f0f0f2]" />
            </div>

            {/* Screenshot */}
            <Image
              src="/dashboard.png"
              alt="Aligno CRM app screenshot showing the dashboard view"
              width={1920}
              height={1035}
              className="block w-full"
              priority
            />
          </div>

          {/* Fade at bottom into page surface */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
            style={{
              background: "linear-gradient(to top, #f7f7f8 0%, transparent 100%)",
            }}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/*  Problem section — single card, terminal style              */}
      {/* ---------------------------------------------------------- */}
      <section className="px-5 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="overflow-hidden rounded-xl border border-[#e7e7ea] bg-white shadow-[0_1px_2px_rgba(17,17,26,0.05)]">
            {/* Terminal chrome bar */}
            <div className="flex items-center gap-2 border-b border-[#e7e7ea] bg-[#fafafa] px-4 py-3">
              <Terminal className="h-4 w-4 text-[#6c2bd9]" strokeWidth={1.8} />
              <span className="text-xs font-medium text-zinc-500">the_problem.sh</span>
            </div>

            <div className="space-y-4 p-6 sm:p-8">
              <h2 className="text-2xl font-semibold tracking-[-0.01em] text-zinc-900 sm:text-3xl">
                Most CRMs record work after the fact.
                <br />
                Your revenue needs movement now.
              </h2>

              <div className="mt-6 space-y-3 font-mono text-sm leading-7 text-zinc-600">
                <p>
                  <span className="text-[#6c2bd9]">$</span> Leads arrive from forms, referrals,
                  and partner tools, then sit too long before follow-up.
                </p>
                <p>
                  <span className="text-[#6c2bd9]">$</span> Pipeline updates, tags, tasks, and
                  notes live in separate tools that are hard to trust.
                </p>
                <p>
                  <span className="text-[#6c2bd9]">$</span> Spreadsheets and heavyweight CRMs
                  both get in the way of the next follow-up.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/*  Features grid — 2 columns                                  */}
      {/* ---------------------------------------------------------- */}
      <section id="features" className="px-5 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6c2bd9]">
              Features
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.01em] text-zinc-900 sm:text-3xl">
              Everything you need to move deals forward. Nothing you don&apos;t.
            </h2>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {features.map((item) => (
              <article
                key={item.title}
                className="rounded-xl border border-[#e7e7ea] bg-white p-7 shadow-[0_1px_2px_rgba(17,17,26,0.05)] transition-[border-color,box-shadow] duration-150 hover:border-[#dcdce1] hover:shadow-[0_1px_2px_rgba(17,17,26,0.05),0_2px_8px_rgba(17,17,26,0.04)]"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-[#e3d5f8] bg-[#f4eefc]">
                  <item.icon className="h-4 w-4 text-[#6c2bd9]" strokeWidth={1.8} />
                </div>
                <h3 className="mt-5 text-base font-semibold text-zinc-900">{item.title}</h3>
                <p className="mt-2 text-sm leading-6 text-zinc-600">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/*  How it works — numbered steps with icon boxes              */}
      {/* ---------------------------------------------------------- */}
      <section id="how-it-works" className="border-y border-[#e7e7ea] bg-white px-5 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6c2bd9]">
              How it works
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.01em] text-zinc-900 sm:text-3xl">
              Built for service businesses that sell through process.
            </h2>
            <p className="mt-4 text-[15px] leading-7 text-zinc-600">
              Contacts, pipeline stages, deal values, and follow-up. The pieces
              service businesses need every day stay close together.
            </p>
          </div>

          <div className="mx-auto mt-14 grid max-w-3xl gap-4">
            {howItWorks.map((item, index) => {
              const icons = [Users, GitBranch, MailCheck];
              const Icon = icons[index];
              return (
                <div
                  key={item.step}
                  className="flex items-start gap-5 rounded-xl border border-[#e7e7ea] bg-[#fafafa] p-6"
                >
                  {/* Icon box on the left */}
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#e3d5f8] bg-[#f4eefc]">
                    <Icon className="h-4 w-4 text-[#6c2bd9]" strokeWidth={1.8} />
                  </div>

                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-zinc-400">
                      Step {item.step}
                    </p>
                    <h3 className="mt-1 text-base font-semibold text-zinc-900">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-zinc-600">{item.text}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/*  Stats row — 3 stat blocks                                  */}
      {/* ---------------------------------------------------------- */}
      <section className="px-5 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto grid max-w-2xl gap-4 sm:grid-cols-2">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-xl border border-[#e7e7ea] bg-white p-6 text-center shadow-[0_1px_2px_rgba(17,17,26,0.05)]"
            >
              <p className="text-3xl font-semibold tracking-[-0.01em] text-[#6c2bd9]">
                {stat.value}
              </p>
              <p className="mt-2 text-sm font-medium text-zinc-600">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/*  Who it's for — 2x2 grid                                    */}
      {/* ---------------------------------------------------------- */}
      <section id="who-its-for" className="px-5 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6c2bd9]">
              Who it&apos;s for
            </p>
            <h2 className="mt-3 text-2xl font-semibold tracking-[-0.01em] text-zinc-900 sm:text-3xl">
              Built for teams who need follow-up to run on rails.
            </h2>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-2">
            {audiences.map((item) => (
              <div
                key={item.title}
                className="flex items-start gap-4 rounded-xl border border-[#e7e7ea] bg-white p-6 shadow-[0_1px_2px_rgba(17,17,26,0.05)] transition-[border-color,box-shadow] duration-150 hover:border-[#dcdce1] hover:shadow-[0_1px_2px_rgba(17,17,26,0.05),0_2px_8px_rgba(17,17,26,0.04)]"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-[#e3d5f8] bg-[#f4eefc]">
                  <item.icon className="h-4 w-4 text-[#6c2bd9]" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-zinc-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-zinc-600">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/*  Signup                                                     */}
      {/* ---------------------------------------------------------- */}
      <section className="px-5 pb-24 pt-8 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-4xl rounded-xl border border-[#e7e7ea] bg-white px-6 py-14 text-center shadow-[0_1px_2px_rgba(17,17,26,0.05)] sm:px-12 sm:py-16">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#6c2bd9]">
            Aligno CRM is live
          </p>
          <h2 className="mx-auto max-w-3xl text-2xl font-semibold tracking-[-0.01em] text-zinc-900 sm:text-3xl">
            Create your account and start building your pipeline.
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-[15px] leading-7 text-zinc-600">
            Sign up for the app, set up your workspace, and begin managing contacts,
            deals, and follow-up from one place.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <a
              href="https://pentridgemedia.com/labs"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#6c2bd9] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#5b21b6]"
            >
              Sign Up
              <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
            </a>
            <Link
              href="/sign-in?redirect=/dashboard"
              className="inline-flex items-center justify-center rounded-lg border border-[#e7e7ea] bg-white px-5 py-2.5 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
            >
              Sign In
            </Link>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/*  Footer — logo left, links right                            */}
      {/* ---------------------------------------------------------- */}
      <footer className="border-t border-[#e7e7ea] bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 px-5 py-8 sm:flex-row sm:px-6 lg:px-8">
          {/* Logo left */}
          <Link href="/" className="flex items-center gap-2" aria-label="Aligno CRM home">
            <Image
              src="/aligno-crm_logo.png"
              alt=""
              width={24}
              height={24}
              className="h-6 w-6 object-contain"
            />
            <span className="text-sm font-semibold text-zinc-900">Aligno CRM</span>
          </Link>

          {/* Links right */}
          <div className="flex items-center gap-6 text-[13px] text-zinc-500">
            <span>&copy; {new Date().getFullYear()} Aligno</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
