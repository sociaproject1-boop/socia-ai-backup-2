/**
 * LegalPage.tsx — single component that renders the four
 * static info pages reachable from Settings → About:
 *
 *   /legal/terms      → Terms of Service
 *   /legal/privacy    → Privacy Policy
 *   /legal/licenses   → Open Source Licenses
 *   /legal/developer  → About the Developer
 *
 * One component, one route per kind, real (non-empty) content
 * with the same dark glass styling as the rest of the app.
 */
import { useLocation } from "wouter";
import { ArrowLeft } from "lucide-react";

type Kind = "terms" | "privacy" | "licenses" | "developer";

interface Block {
  heading?: string;
  body:     string | string[];
  link?: { href: string; label: string };
}

const CONTENT: Record<Kind, { title: string; updated: string; intro: string; blocks: Block[] }> = {
  /* ────────────────────────── TERMS OF SERVICE ─────────────────────────── */
  terms: {
    title:   "Terms of Service",
    updated: "Last updated: April 2026",
    intro:   "By creating an account on Socia or using any part of the Socia mobile or web experience, you agree to the terms below. Please read them carefully — they explain what you can expect from us and what we expect from you.",
    blocks: [
      {
        heading: "1. Your account",
        body: [
          "You must be at least 13 years old to use Socia. If you are under the age of majority in your country, you confirm that a parent or legal guardian has reviewed and accepted these terms on your behalf.",
          "You are responsible for keeping your login credentials secure and for everything that happens on your account. Notify us immediately if you believe your account has been compromised.",
          "One human, one account. Creating duplicate, automated, throwaway, or impersonation accounts is not allowed and may result in immediate termination.",
        ],
      },
      {
        heading: "2. Acceptable use",
        body: [
          "You may not use Socia to harass, threaten, dox, defame, or impersonate anyone.",
          "You may not upload, share, or generate content that is illegal, sexually explicit involving minors, hateful, or that incites violence.",
          "You may not scrape, mass-download, reverse-engineer, or reuse any part of the service or other users' content without explicit permission.",
          "You may not abuse the AI generation features to attempt to recreate copyrighted works, generate non-consensual sexual imagery, or impersonate real people without their consent.",
          "You may not interfere with the operation of the service — no spam, no DDoS, no exploitation of bugs for advantage, no circumventing rate limits or storage quotas.",
        ],
      },
      {
        heading: "3. Your content",
        body: [
          "You retain ownership of everything you post, send, or generate on Socia. You grant us a limited, worldwide, royalty-free license to host, display, and transmit your content solely so we can operate the service for you and the people you share with.",
          "You are responsible for the legality of what you upload. You confirm that you have the right to share any media or text you put on the platform.",
          "You can delete individual posts and messages, or delete your entire account from Settings → Account → Delete Account. Deletion is permanent and cannot be reversed.",
        ],
      },
      {
        heading: "4. Termination",
        body: [
          "We may suspend or terminate accounts that repeatedly or seriously violate these terms, that put other users at risk, or that we are required to remove for legal reasons.",
          "You may stop using the service and delete your account at any time. After deletion, copies of your content may persist briefly in encrypted backups for up to 30 days before being permanently purged.",
        ],
      },
      {
        heading: "5. Disclaimers and limitation of liability",
        body: [
          "Socia is provided on an \"as is\" and \"as available\" basis. We do not warrant that the service will be uninterrupted, error-free, or free of harmful components.",
          "AI-generated content is produced by third-party models and may be inaccurate, biased, or unsuitable. You are responsible for how you use it.",
          "To the maximum extent permitted by law, the developer of Socia is not liable for any indirect, incidental, special, or consequential damages arising from your use of the service. Total liability for any direct damages is limited to the amount you have paid us in the prior twelve months (which, for the free service, is zero).",
        ],
      },
      {
        heading: "6. Changes",
        body: "We may update these terms from time to time. If we make material changes, we will notify you in-app before they take effect. Continued use of Socia after the effective date means you accept the revised terms.",
      },
      {
        heading: "7. Contact",
        body: "Questions about these terms? Reach out from your account: Settings → About → Contact, or email the developer through the channels listed on the About the Developer page.",
      },
    ],
  },

  /* ────────────────────────── PRIVACY POLICY ──────────────────────────── */
  privacy: {
    title:   "Privacy Policy",
    updated: "Last updated: April 2026",
    intro:   "Socia is built by an independent developer. We collect the minimum data needed to run the service, we never sell it, and you can delete it at any time. This policy explains what we collect, why, and what control you have.",
    blocks: [
      {
        heading: "What we collect",
        body: [
          "Account info: email address, display name, username, avatar, and any optional profile bio you provide.",
          "Content you create: posts, comments, direct messages (text, images, voice notes), and AI generations you save.",
          "Device & usage info: browser/OS version, IP address (briefly, for abuse prevention), and basic crash diagnostics.",
        ],
      },
      {
        heading: "How we use it",
        body: [
          "To deliver the core features you signed up for: showing your feed, routing your messages, generating media you request.",
          "To keep the service safe: detecting spam, abuse, or attacks against other users.",
          "To improve the product: aggregated, anonymous usage trends help us prioritize features and fix bugs. We do not build advertising profiles.",
        ],
      },
      {
        heading: "Where it lives",
        body: [
          "Your data is stored in a Supabase Postgres database with row-level security: only you (and the people you've shared with) can read your rows.",
          "Files (avatars, chat images, voice messages) are stored in Supabase Storage with bucket-level access policies.",
        ],
      },
      {
        heading: "What we never do",
        body: [
          "We do not sell your personal data to anyone, ever.",
          "We do not show third-party ads.",
          "We do not read your private messages.",
          "We do not share your data with data brokers or analytics resellers.",
        ],
      },
      {
        heading: "Your rights",
        body: [
          "Export or correct your data: contact the developer (see About) and we'll help.",
          "Delete your account: Settings → Account → Delete Account permanently removes your profile, posts, messages, follows, settings, and your auth record in a single transaction.",
          "Control privacy: Settings → Privacy lets you switch your account to private, hide your online status, restrict DMs, and enable two-factor authentication.",
        ],
      },
      {
        heading: "Security",
        body: "All traffic between your device and our backend is encrypted in transit (HTTPS/WSS). Passwords are never stored in plaintext — Supabase hashes them with bcrypt. We patch dependencies regularly and follow Supabase's security advisories.",
      },
      {
        heading: "Children",
        body: "Socia is not directed to children under 13. We do not knowingly collect data from children under 13. If you believe a child has created an account, please contact us so we can remove it.",
      },
      {
        heading: "Changes",
        body: "If we materially change this policy, we'll notify you in-app before the change takes effect.",
      },
    ],
  },

  /* ────────────────────────── OPEN SOURCE LICENSES ─────────────────────── */
  licenses: {
    title:   "Open Source Licenses",
    updated: "Generated from package manifests · April 2026",
    intro:   "Socia is built on the work of an enormous open source community. We are deeply grateful. This page lists the major libraries Socia depends on and the licenses under which they are used. The full license text for each project is available at the linked source.",
    blocks: [
      {
        heading: "React  ·  MIT License",
        body: [
          "Copyright (c) Meta Platforms, Inc. and affiliates.",
          "The library that powers the entire Socia user interface. https://github.com/facebook/react",
          "MIT: permission is granted, free of charge, to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the software, subject to including the copyright notice and this permission notice.",
        ],
      },
      {
        heading: "Vite  ·  MIT License",
        body: [
          "Copyright (c) 2019-present, Yuxi (Evan) You and Vite contributors.",
          "The build tool and development server used by Socia. https://github.com/vitejs/vite",
        ],
      },
      {
        heading: "Supabase JS  ·  MIT License",
        body: [
          "Copyright (c) 2020 Supabase.",
          "Client SDK for Supabase Auth, Postgres, Realtime, and Storage. https://github.com/supabase/supabase-js",
        ],
      },
      {
        heading: "Tailwind CSS  ·  MIT License",
        body: [
          "Copyright (c) Tailwind Labs, Inc.",
          "The utility-first CSS framework used throughout Socia. https://github.com/tailwindlabs/tailwindcss",
        ],
      },
      {
        heading: "Framer Motion  ·  MIT License",
        body: [
          "Copyright (c) 2018 Framer B.V.",
          "Animation library used for transitions, sheets, and motion details. https://github.com/framer/motion",
        ],
      },
      {
        heading: "Zustand  ·  MIT License",
        body: [
          "Copyright (c) 2019 Paul Henschel.",
          "Lightweight state management for the app store. https://github.com/pmndrs/zustand",
        ],
      },
      {
        heading: "Wouter  ·  Unlicense",
        body: [
          "Released into the public domain by Alexey Taktarov.",
          "The minimalist router used for client-side navigation. https://github.com/molefrog/wouter",
        ],
      },
      {
        heading: "Lucide Icons  ·  ISC License",
        body: [
          "Copyright (c) 2022 Lucide Contributors.",
          "Icon set used throughout the UI. https://github.com/lucide-icons/lucide",
        ],
      },
      {
        heading: "TanStack Query  ·  MIT License",
        body: [
          "Copyright (c) 2021-present Tanner Linsley.",
          "Async state management for server data. https://github.com/TanStack/query",
        ],
      },
      {
        heading: "MIT License (summary)",
        body: [
          "Most of the libraries above are released under the MIT License. The MIT License grants permission, free of charge, to any person obtaining a copy of the software and associated documentation files (the \"Software\"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, subject to inclusion of the original copyright notice and the permission notice.",
          "THE SOFTWARE IS PROVIDED \"AS IS\", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED.",
        ],
      },
    ],
  },

  /* ────────────────────────── ABOUT THE DEVELOPER ──────────────────────── */
  developer: {
    title:   "About the Developer",
    updated: "",
    intro:   "Socia was created and is maintained by one person — a young, self-taught builder from the Philippines who chose to dream bigger than his circumstances.",
    blocks: [
      {
        heading: "Allan Budlong Albacen",
        body: [
          "Born: April 26, 2004 — Calatrava, Negros Occidental, Philippines",
          "Location: Brgy. Lipat-on, Calatrava, Negros Occidental, Philippines",
          "Education: Grade 11 level",
          "Background: A simple person from a humble background — not wealthy, but deeply ambitious, hardworking, and a faithful servant of God.",
        ],
      },
      {
        heading: "The story behind Socia",
        body: [
          "Socia was born on February 16, 2026 — not inside a tech company, not with investor funding, and not with a team of engineers. It began with one person, a vision, and the determination to figure things out one step at a time.",
          "Allan handled every aspect of the product: the vision, the structure, the layouts, the features, the concepts, and the overall direction of what Socia should become. AI tools assisted during the development process, helping translate ideas into working code — but the foundation, the thinking, and the soul of the app came entirely from him.",
          "Building Socia meant long nights, failed attempts, hard lessons, and moments of doubt. But it also meant breakthroughs — the kind that only come when you refuse to quit.",
        ],
      },
      {
        heading: "Why Socia exists",
        body: "Not everyone who has something great to build starts with money, a degree, or a network. Allan built Socia as proof that persistence, faith, and a clear vision can close that gap. If you're reading this from a similar place in life — uncertain, with limited resources but with a dream that won't leave you alone — know that this app exists because someone just like you decided to start anyway.",
      },
      {
        heading: "Connect with the creator",
        body: "Want to reach out, share feedback, or simply say hello? You can find Allan directly on Facebook — tap the button below to open his profile.",
        link: { href: "https://www.facebook.com/share/17Yzu7p447/", label: "Open Facebook Profile" },
      },
      {
        heading: "Thank you",
        body: "Thank you for being here and for trusting Socia with your creativity. Every post you make, every image you generate, every message you send — it all means something to the person who built this.",
      },
    ],
  },
};

interface Props {
  kind: Kind;
}

export default function LegalPage({ kind }: Props) {
  const [, navigate] = useLocation();
  const data = CONTENT[kind];

  /* Failsafe — should never trigger because all four kinds are in CONTENT,
   * but if it ever does we render a readable message instead of a blank
   * white screen.                                                          */
  if (!data) {
    return (
      <div className="app-bg flex h-[100dvh] flex-col items-center justify-center px-6 text-center">
        <h1 className="text-lg font-semibold app-text">Page not available</h1>
        <p className="mt-2 text-sm app-text-muted">
          We couldn't load this page. Please try again from Settings → About.
        </p>
        <button
          onClick={() => navigate("/profile/settings")}
          className="mt-6 rounded-xl px-5 py-2.5 text-sm font-semibold text-white"
          style={{ background: "linear-gradient(135deg, var(--accent-primary), var(--accent-secondary))" }}
        >
          Back to Settings
        </button>
      </div>
    );
  }

  return (
    <div className="app-bg flex h-[100dvh] w-full flex-col">
      {/* Header */}
      <div
        className="app-header flex items-center gap-3 px-4 py-3"
        style={{ borderBottom: "1px solid var(--s-border-a)" }}
      >
        <button
          onClick={() => navigate("/profile/settings")}
          aria-label="Back"
          className="app-surface grid h-9 w-9 place-items-center rounded-full app-text"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-base font-semibold app-text">{data.title}</h1>
      </div>

      {/* Body */}
      <div className="hide-scrollbar flex-1 overflow-y-auto px-5 pb-16 pt-5">
        {data.updated && (
          <p className="text-[11px] uppercase tracking-[0.12em] app-text-muted">
            {data.updated}
          </p>
        )}
        <p className="mt-3 text-[14px] leading-[1.65] app-text">
          {data.intro}
        </p>

        <div className="mt-6 space-y-6">
          {data.blocks.map((b, i) => (
            <section key={i} className="app-card rounded-[18px] p-4">
              {b.heading && (
                <h2 className="mb-2 text-[14px] font-semibold app-text">
                  {b.heading}
                </h2>
              )}
              {Array.isArray(b.body) ? (
                <ul className="list-none space-y-2 text-[13.5px] leading-[1.65] app-text-muted">
                  {b.body.map((p, j) => (
                    <li key={j}>
                      <span className="app-text">•</span>{" "}
                      <span>{p}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13.5px] leading-[1.65] app-text-muted">
                  {b.body}
                </p>
              )}
              {b.link && (
                <a
                  href={b.link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-[14px] px-4 py-2.5 text-[13px] font-semibold text-white"
                  style={{ background: "linear-gradient(135deg, #1877f2 0%, #42a5f5 100%)" }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.514c-1.491 0-1.956.93-1.956 1.887v2.267h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
                  </svg>
                  {b.link.label}
                </a>
              )}
            </section>
          ))}
        </div>

        <p className="pt-8 text-center text-[11px] app-text-muted">
          Socia · Built independently with care
        </p>
      </div>
    </div>
  );
}
