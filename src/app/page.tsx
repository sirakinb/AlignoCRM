import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  GitBranch,
  MailCheck,
  ShieldCheck,
  Sparkles,
  Terminal,
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";
import { getSiteUrl } from "@/lib/seo/site-url";
import { AlignoWaitlist } from "@/components/aligno-waitlist";

const siteUrl = getSiteUrl();

export const metadata: Metadata = {
  title: "Aligno CRM | AI-Native Pipeline and Workflow Automation",
  description:
    "Aligno CRM helps agencies, creators, coaches, and consultants manage pipeline, follow-up, AI drafts, approvals, and workflow automation in one focused command center.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Aligno CRM | AI-Native Pipeline and Workflow Automation",
    description:
      "A focused command center for pipeline management, workflow automation, and AI-assisted follow-up.",
    url: siteUrl,
    siteName: "Aligno CRM",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "Aligno CRM — AI-Native Pipeline and Workflow Automation",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Aligno CRM | AI-Native Pipeline and Workflow Automation",
    description:
      "Manage deal flow, automate follow-up, and review AI-assisted workflow outputs from one CRM command center.",
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
    text: "Track leads by pipeline, stage, value, owner, and linked contact so the next move is visible without digging through notes.",
  },
  {
    icon: Workflow,
    title: "Automate the repeatable work",
    text: "Start workflows from CRM activity, add waits and branches, send messages, create tasks, move deals, and call webhooks.",
  },
  {
    icon: Sparkles,
    title: "Use AI with control",
    text: "Draft messages, analyze context, route records, and pause high-risk outputs for approval before customers see them.",
  },
  {
    icon: Zap,
    title: "Visual workflow builder",
    text: "Published workflow versions with execution logs, enrollment history, and full audit trails for every automation run.",
  },
];

const howItWorks = [
  {
    step: "01",
    title: "Capture the business context",
    text: "Contacts, tags, deals, stages, tasks, and activity logs stay connected from the first touch.",
  },
  {
    step: "02",
    title: "Trigger structured workflows",
    text: "Automations begin from contact creation, tag changes, deal movement, forms, and other CRM events.",
  },
  {
    step: "03",
    title: "Review what needs judgment",
    text: "Approval checkpoints keep AI-generated decisions and messages accountable without slowing every routine step.",
  },
];

const stats = [
  { value: "1", label: "Subscription for every tool" },
  { value: "< 2 min", label: "Setup time" },
  { value: "Zero", label: "Leads dropped" },
];

const audiences = [
  {
    icon: Users,
    title: "Agencies",
    text: "Lead intake from forms, events, referrals, or APIs with pipeline visibility across every client.",
  },
  {
    icon: MailCheck,
    title: "Creators & coaches",
    text: "Nurture and sales follow-up that should not wait, powered by automated sequences.",
  },
  {
    icon: Clock3,
    title: "Consultants",
    text: "Long-running sequences with waits, retries, and logs so nothing falls through the cracks.",
  },
  {
    icon: ShieldCheck,
    title: "Service teams",
    text: "Human review before AI-generated outputs ship, keeping quality high without slowing routine work.",
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
      "AI-native pipeline and workflow automation command center for agencies, creators, coaches, and consultants.",
    offers: {
      "@type": "Offer",
      availability: "https://schema.org/InStock",
      url: "https://pentridgemedia.com/labs",
      name: "Pentridge Labs",
    },
  };

  return (
    <main className="aligno-page-surface min-h-screen overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />

      {/* ---------------------------------------------------------- */}
      {/*  Nav                                                        */}
      {/* ---------------------------------------------------------- */}
      <header className="fixed inset-x-0 top-0 z-50 border-b border-[#44106F]/10 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3 sm:px-6 lg:px-8">
          {/* Logo left */}
          <Link href="/" className="flex items-center gap-2.5" aria-label="Aligno CRM home">
            <Image
              src="/aligno-crm_logo.png"
              alt=""
              width={32}
              height={32}
              priority
              className="h-8 w-8 object-contain"
            />
            <span className="text-base font-bold tracking-tight text-[#21173A]">
              Aligno CRM
            </span>
          </Link>

          {/* Nav links center */}
          <nav className="hidden items-center gap-8 text-sm font-medium text-[#5D5474] md:flex">
            <a href="#features" className="transition hover:text-[#44106F]">
              Features
            </a>
            <a href="#how-it-works" className="transition hover:text-[#44106F]">
              How it works
            </a>
            <a href="#who-its-for" className="transition hover:text-[#44106F]">
              Who it&apos;s for
            </a>
          </nav>

          {/* CTA button right */}
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="hidden text-sm font-medium text-[#5D5474] transition hover:text-[#44106F] sm:inline"
            >
              Log in
            </Link>
            <Link
              href="/sign-up"
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
              style={{
                background: `linear-gradient(135deg, ${getPurpleScaleColor(3)}, ${getPurpleScaleColor(5)})`,
              }}
            >
              Start free
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
          <p className="inline-flex rounded-full border border-[#6E2ABD]/20 bg-white/72 px-4 py-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-[#6E2ABD]">
            AI-native CRM command center
          </p>

          {/* Big bold heading */}
          <h1 className="mt-7 text-5xl font-bold leading-[1.05] tracking-tight text-[#21173A] sm:text-6xl lg:text-7xl">
            Turn every lead into
            <br />
            the next right follow-up.
          </h1>

          {/* Subtitle */}
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#5D5474]">
            Aligno CRM gives service businesses one focused place to manage
            pipeline, automate follow-up, and use AI without losing operator
            control.
          </p>

          {/* Two CTA buttons side by side */}
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center gap-2 rounded-lg px-6 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
              style={{
                background: `linear-gradient(135deg, ${getPurpleScaleColor(3)}, ${getPurpleScaleColor(5)})`,
              }}
            >
              Build your command center
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center rounded-lg border border-[#44106F]/16 bg-white/78 px-6 py-3 text-sm font-semibold text-[#3B2E56] transition hover:bg-white"
            >
              Open app
            </Link>
          </div>

          {/* Small note underneath */}
          <p className="mt-4 text-xs text-[#7B7590]">
            Part of Pentridge Labs — one subscription for every tool.
          </p>
        </div>

        {/* App screenshot with chrome bar and gradient fade */}
        <div className="relative mx-auto mt-14 max-w-5xl">
          {/* Chrome overlay bar */}
          <div
            className="relative overflow-hidden rounded-t-xl border border-b-0 shadow-2xl shadow-[#44106F]/10"
            style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.18) }}
          >
            {/* Fake browser chrome */}
            <div
              className="flex items-center gap-2 px-4 py-3"
              style={{ backgroundColor: withAlpha(getPurpleScaleColor(1), 0.06) }}
            >
              <span className="h-3 w-3 rounded-full bg-[#E5D6F5]" />
              <span className="h-3 w-3 rounded-full bg-[#E5D6F5]" />
              <span className="h-3 w-3 rounded-full bg-[#E5D6F5]" />
              <span className="mx-auto block h-5 w-56 rounded-md bg-[#F3EAFD]" />
            </div>

            {/* Screenshot */}
            <Image
              src="/dashboard.png"
              alt="Aligno CRM app screenshot showing pipeline view and workflow automation"
              width={1920}
              height={1080}
              className="block w-full"
              priority
            />
          </div>

          {/* Gradient fade at bottom */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-40"
            style={{
              background:
                "linear-gradient(to top, var(--aligno-page-surface, #FAF8FF) 0%, transparent 100%)",
            }}
          />
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/*  Problem section — single card, terminal style              */}
      {/* ---------------------------------------------------------- */}
      <section className="px-5 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div
            className="aligno-panel overflow-hidden rounded-xl"
            style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.2) }}
          >
            {/* Terminal chrome bar */}
            <div
              className="flex items-center gap-2 border-b px-4 py-3"
              style={{
                borderColor: withAlpha(getPurpleScaleColor(4), 0.12),
                backgroundColor: withAlpha(getPurpleScaleColor(1), 0.05),
              }}
            >
              <Terminal className="h-4 w-4 text-[#6E2ABD]" />
              <span className="text-xs font-semibold text-[#7B7590]">the_problem.sh</span>
            </div>

            <div className="space-y-4 p-6 sm:p-8">
              <h2 className="text-2xl font-bold tracking-tight text-[#21173A] sm:text-3xl">
                Most CRMs record work after the fact.
                <br />
                Your revenue needs movement now.
              </h2>

              <div className="mt-6 space-y-3 font-mono text-sm leading-7 text-[#5D5474]">
                <p>
                  <span className="text-[#6E2ABD]">$</span> Leads arrive from forms, referrals,
                  and partner tools, then sit too long before follow-up.
                </p>
                <p>
                  <span className="text-[#6E2ABD]">$</span> Pipeline updates, tags, tasks, and
                  messages live in separate workflows that are hard to trust.
                </p>
                <p>
                  <span className="text-[#6E2ABD]">$</span> AI can draft useful responses, but
                  operators still need guardrails before anything goes out.
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
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6E2ABD]">
              Features
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#21173A] sm:text-4xl">
              One operating layer for pipeline, automation, and AI-assisted follow-up.
            </h2>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {features.map((item, index) => (
              <article
                key={item.title}
                className="aligno-panel rounded-xl p-7"
                style={{ borderColor: withAlpha(getPurpleScaleColor((index % 4) + 2), 0.2) }}
              >
                <div
                  className="flex h-11 w-11 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: withAlpha(getPurpleScaleColor((index % 4) + 2), 0.14),
                  }}
                >
                  <item.icon
                    className="h-5 w-5"
                    style={{ color: getPurpleScaleColor((index % 4) + 2) }}
                  />
                </div>
                <h3 className="mt-5 text-lg font-bold text-[#21173A]">{item.title}</h3>
                <p className="mt-3 text-sm leading-6 text-[#5D5474]">{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/*  How it works — numbered steps with icon boxes              */}
      {/* ---------------------------------------------------------- */}
      <section id="how-it-works" className="border-y border-[#44106F]/10 bg-white/52 px-5 py-20 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6E2ABD]">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#21173A] sm:text-4xl">
              Built for service businesses that sell through process.
            </h2>
            <p className="mt-4 text-base leading-7 text-[#5D5474]">
              Pipeline stages, workflow triggers, deterministic actions, AI steps, and approval
              history. The pieces operators need every day stay close together.
            </p>
          </div>

          <div className="mx-auto mt-14 grid max-w-3xl gap-6">
            {howItWorks.map((item, index) => {
              const icons = [GitBranch, Workflow, ShieldCheck];
              const Icon = icons[index];
              return (
                <div
                  key={item.step}
                  className="flex items-start gap-5 rounded-xl border border-[#44106F]/12 bg-white/82 p-6 shadow-sm"
                >
                  {/* Icon box on the left */}
                  <div
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
                    style={{
                      backgroundColor: withAlpha(getPurpleScaleColor(index + 2), 0.14),
                    }}
                  >
                    <Icon
                      className="h-5 w-5"
                      style={{ color: getPurpleScaleColor(index + 2) }}
                    />
                  </div>

                  <div>
                    <p className="font-mono text-xs font-bold text-[#6E2ABD]">
                      Step {item.step}
                    </p>
                    <h3 className="mt-1 text-lg font-bold text-[#21173A]">{item.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-[#5D5474]">{item.text}</p>
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
        <div className="mx-auto grid max-w-4xl gap-6 sm:grid-cols-3">
          {stats.map((stat, index) => (
            <div
              key={stat.label}
              className="aligno-panel rounded-xl p-6 text-center"
              style={{ borderColor: withAlpha(getPurpleScaleColor(index + 2), 0.2) }}
            >
              <p
                className="text-4xl font-bold"
                style={{ color: getPurpleScaleColor(index + 2) }}
              >
                {stat.value}
              </p>
              <p className="mt-2 text-sm font-medium text-[#5D5474]">{stat.label}</p>
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
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6E2ABD]">
              Who it&apos;s for
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#21173A] sm:text-4xl">
              Built for teams who need follow-up to run on rails.
            </h2>
          </div>

          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {audiences.map((item, index) => (
              <div
                key={item.title}
                className="aligno-panel flex items-start gap-4 rounded-xl p-6"
                style={{ borderColor: withAlpha(getPurpleScaleColor((index % 4) + 2), 0.2) }}
              >
                <div
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg"
                  style={{
                    backgroundColor: withAlpha(getPurpleScaleColor((index % 4) + 2), 0.14),
                  }}
                >
                  <item.icon
                    className="h-5 w-5"
                    style={{ color: getPurpleScaleColor((index % 4) + 2) }}
                  />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#21173A]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#5D5474]">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- */}
      {/*  Waitlist                                                   */}
      {/* ---------------------------------------------------------- */}
      <section className="px-5 pb-24 pt-8 sm:px-6 lg:px-8">
        <AlignoWaitlist />
      </section>

      {/* ---------------------------------------------------------- */}
      {/*  Footer — logo left, links right                            */}
      {/* ---------------------------------------------------------- */}
      <footer className="border-t border-[#44106F]/10 bg-white/60">
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
            <span className="text-sm font-bold text-[#21173A]">Aligno CRM</span>
          </Link>

          {/* Links right */}
          <div className="flex items-center gap-6 text-sm text-[#7B7590]">
            <Link href="/sign-in" className="transition hover:text-[#44106F]">
              Log in
            </Link>
            <Link href="/sign-up" className="transition hover:text-[#44106F]">
              Sign up
            </Link>
            <span>&copy; {new Date().getFullYear()} Aligno</span>
          </div>
        </div>
      </footer>
    </main>
  );
}
