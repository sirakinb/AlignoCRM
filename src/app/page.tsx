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
  Users,
  Workflow,
  Zap,
} from "lucide-react";
import { getPurpleScaleColor, withAlpha } from "@/lib/design/aligno-theme";
import { getSiteUrl } from "@/lib/seo/site-url";

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
        url: "/aligno-crm_logo.png",
        width: 512,
        height: 512,
        alt: "Aligno CRM logo",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "Aligno CRM | AI-Native Pipeline and Workflow Automation",
    description:
      "Manage deal flow, automate follow-up, and review AI-assisted workflow outputs from one CRM command center.",
    images: ["/aligno-crm_logo.png"],
  },
};

const proofPoints = [
  "Pipeline-first CRM built around real deal movement",
  "Workflow automation tied directly to contacts, tags, and stages",
  "AI drafting and routing with human approval where it matters",
];

const painPoints = [
  "Leads arrive from forms, referrals, and partner tools, then sit too long before follow-up.",
  "Pipeline updates, tags, tasks, and messages live in separate workflows that are hard to trust.",
  "AI can draft useful responses, but operators still need guardrails before anything goes out.",
];

const outcomes = [
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
];

const mechanism = [
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

const featureList = [
  "Visual workflow builder",
  "Published workflow versions",
  "Execution logs and enrollment history",
  "Email actions and message templates",
  "Webhook actions for connected tools",
  "API keys for contact capture",
];

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
      price: "0",
      priceCurrency: "USD",
    },
  };

  return (
    <main className="aligno-page-surface min-h-screen overflow-hidden">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />

      <header className="border-b border-[#44106F]/10 bg-white/72 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Aligno CRM home">
            <Image
              src="/aligno-crm_logo.png"
              alt=""
              width={36}
              height={36}
              priority
              className="h-9 w-9 object-contain"
            />
            <span className="text-base font-bold tracking-tight text-[#21173A]">
              Aligno CRM
            </span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm font-medium text-[#5D5474] md:flex">
            <a href="#product" className="hover:text-[#44106F]">
              Product
            </a>
            <a href="#workflows" className="hover:text-[#44106F]">
              Workflows
            </a>
            <a href="#fit" className="hover:text-[#44106F]">
              Fit
            </a>
          </nav>
          <div className="flex items-center gap-3">
            <Link
              href="/sign-in"
              className="hidden text-sm font-medium text-[#5D5474] hover:text-[#44106F] sm:inline"
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

      <section className="mx-auto grid max-w-7xl gap-10 px-5 pb-16 pt-14 sm:px-6 lg:grid-cols-[1fr_0.92fr] lg:px-8 lg:pb-20 lg:pt-20">
        <div className="max-w-3xl">
          <p className="inline-flex rounded-full border border-[#6E2ABD]/20 bg-white/72 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-[#6E2ABD]">
            AI-native CRM command center
          </p>
          <h1 className="mt-6 max-w-4xl text-5xl font-bold leading-[1.02] tracking-tight text-[#21173A] sm:text-6xl lg:text-7xl">
            Turn every lead into the next right follow-up.
          </h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#5D5474]">
            Aligno CRM gives service businesses one focused place to manage
            pipeline, automate follow-up, and use AI without losing operator
            control.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
              style={{
                background: `linear-gradient(135deg, ${getPurpleScaleColor(3)}, ${getPurpleScaleColor(5)})`,
              }}
            >
              Build your command center
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/sign-in"
              className="inline-flex items-center justify-center rounded-lg border border-[#44106F]/16 bg-white/78 px-5 py-3 text-sm font-semibold text-[#3B2E56] transition hover:bg-white"
            >
              Open app
            </Link>
          </div>
          <div className="mt-8 grid gap-3 text-sm text-[#4A3A6A] sm:grid-cols-3">
            {proofPoints.map((point) => (
              <div key={point} className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#6E2ABD]" />
                <span>{point}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          id="product"
          className="aligno-panel rounded-lg p-4 lg:self-center"
          style={{ borderColor: withAlpha(getPurpleScaleColor(4), 0.2) }}
        >
          <div className="rounded-lg border border-[#44106F]/10 bg-white/84 p-4">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#7B7590]">
                  Pipeline
                </p>
                <p className="mt-1 text-lg font-bold text-[#21173A]">
                  New client acquisition
                </p>
              </div>
              <span className="rounded-full bg-[#F3EAFD] px-3 py-1 text-xs font-semibold text-[#6E2ABD]">
                Active
              </span>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              {[
                ["New Lead", "$42k", "8 contacts"],
                ["Qualified", "$86k", "5 deals"],
                ["Proposal", "$124k", "3 reviews"],
              ].map(([stage, value, detail], index) => (
                <div
                  key={stage}
                  className="rounded-lg border bg-[#FCFAFF] p-3"
                  style={{ borderColor: withAlpha(getPurpleScaleColor(index + 1), 0.2) }}
                >
                  <div
                    className="mb-3 h-1.5 rounded-full"
                    style={{ backgroundColor: getPurpleScaleColor(index + 1) }}
                  />
                  <p className="text-sm font-semibold text-[#21173A]">{stage}</p>
                  <p className="mt-2 text-2xl font-bold text-[#44106F]">{value}</p>
                  <p className="mt-1 text-xs text-[#6B6481]">{detail}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-lg border border-[#44106F]/10 bg-[#FBF8FF] p-4">
              <div className="mb-3 flex items-center gap-2">
                <Zap className="h-4 w-4 text-[#6E2ABD]" />
                <p className="text-sm font-semibold text-[#21173A]">
                  Workflow running
                </p>
              </div>
              <div className="grid gap-2 text-xs text-[#5D5474] sm:grid-cols-4">
                {["Tag added", "Wait 1 day", "AI draft", "Approval"].map((node) => (
                  <div key={node} className="rounded-md bg-white px-3 py-2 shadow-sm">
                    {node}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-[#44106F]/10 bg-white/58">
        <div className="mx-auto grid max-w-7xl gap-8 px-5 py-16 sm:px-6 lg:grid-cols-[0.8fr_1fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6E2ABD]">
              The problem
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#21173A] sm:text-4xl">
              Most CRMs record work after the fact. Your revenue needs movement now.
            </h2>
          </div>
          <div className="grid gap-3">
            {painPoints.map((point) => (
              <div
                key={point}
                className="rounded-lg border border-[#44106F]/12 bg-white/82 p-4 text-sm leading-6 text-[#5D5474] shadow-sm"
              >
                {point}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="workflows" className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
        <div className="max-w-3xl">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6E2ABD]">
            The promise
          </p>
          <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#21173A] sm:text-4xl">
            One operating layer for pipeline, automation, and AI-assisted follow-up.
          </h2>
        </div>
        <div className="mt-9 grid gap-4 md:grid-cols-3">
          {outcomes.map((item, index) => (
            <article
              key={item.title}
              className="aligno-panel rounded-lg p-6"
              style={{ borderColor: withAlpha(getPurpleScaleColor(index + 2), 0.2) }}
            >
              <div
                className="flex h-10 w-10 items-center justify-center rounded-lg"
                style={{ backgroundColor: withAlpha(getPurpleScaleColor(index + 2), 0.14) }}
              >
                <item.icon className="h-5 w-5" style={{ color: getPurpleScaleColor(index + 2) }} />
              </div>
              <h3 className="mt-5 text-lg font-bold text-[#21173A]">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-[#5D5474]">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="bg-white/52">
        <div className="mx-auto grid max-w-7xl gap-10 px-5 py-16 sm:px-6 lg:grid-cols-[0.9fr_1fr] lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6E2ABD]">
              The mechanism
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#21173A] sm:text-4xl">
              Built for service businesses that sell through process.
            </h2>
            <p className="mt-4 text-base leading-7 text-[#5D5474]">
              Aligno CRM keeps the system narrow on purpose: pipeline stages,
              workflow triggers, deterministic actions, AI steps, and approval
              history. The pieces operators need every day stay close together.
            </p>
          </div>
          <div className="grid gap-4">
            {mechanism.map((item) => (
              <div key={item.step} className="flex gap-4 rounded-lg border border-[#44106F]/12 bg-white/82 p-5 shadow-sm">
                <span className="font-mono text-sm font-bold text-[#6E2ABD]">{item.step}</span>
                <div>
                  <h3 className="font-bold text-[#21173A]">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[#5D5474]">{item.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="fit" className="mx-auto max-w-7xl px-5 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr]">
          <div className="aligno-panel rounded-lg p-6 sm:p-8">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6E2ABD]">
              Who it is for
            </p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-[#21173A]">
              Agencies, creators, coaches, and consultants who need follow-up to run on rails.
            </h2>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {[
                [Users, "Lead intake from forms, events, referrals, or APIs"],
                [MailCheck, "Nurture and sales follow-up that should not wait"],
                [Clock3, "Long-running sequences with waits, retries, and logs"],
                [ShieldCheck, "Human review before AI-generated outputs ship"],
              ].map(([Icon, text]) => (
                <div key={text as string} className="flex items-start gap-3 text-sm leading-6 text-[#4A3A6A]">
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[#6E2ABD]" />
                  <span>{text as string}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="rounded-lg border border-[#44106F]/12 bg-white/82 p-6 shadow-sm">
            <h3 className="text-lg font-bold text-[#21173A]">Core capabilities</h3>
            <div className="mt-5 grid gap-3">
              {featureList.map((feature) => (
                <div key={feature} className="flex items-center gap-3 text-sm text-[#4A3A6A]">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[#6E2ABD]" />
                  {feature}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-20 sm:px-6 lg:px-8">
        <div
          className="aligno-panel rounded-lg px-6 py-10 text-center sm:px-10 sm:py-12"
          style={{ borderColor: withAlpha(getPurpleScaleColor(5), 0.22) }}
        >
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#6E2ABD]">
            Start with the next lead
          </p>
          <h2 className="mx-auto mt-3 max-w-3xl text-3xl font-bold tracking-tight text-[#21173A] sm:text-4xl">
            Build the command center that turns pipeline activity into reliable follow-up.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#5D5474]">
            Put contacts, deals, workflow automation, and AI-assisted review in
            one place before another opportunity slips through the cracks.
          </p>
          <div className="mt-8 flex justify-center">
            <Link
              href="/sign-up"
              className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95"
              style={{
                background: `linear-gradient(135deg, ${getPurpleScaleColor(3)}, ${getPurpleScaleColor(5)})`,
              }}
            >
              Start free with Aligno CRM
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
