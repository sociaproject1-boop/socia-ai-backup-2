import type { Policy } from "./types";

const en: Policy = {
  ui: {
    title:                  "Plan Policy & Fair Usage",
    subtitle:               "A quick read before we continue to payment.",
    languageLabel:          "Language",
    moreLanguagesSoon:      "More languages coming soon",
    sectionPlan:            "Your selected plan",
    sectionWhoFor:          "Who it's for",
    sectionDailyUsage:      "Daily creator usage",
    sectionCooldowns:       "Cooldowns between renders",
    sectionAfterSoftLimit:  "If you create beyond the daily flow",
    sectionCinematicIncludes: "What's included",
    sectionCinematicFairUse:  "Cinematic fair usage",
    sectionCinematicRerender: "Rerender policy",
    sectionGlobalFairUsage: "Adaptive rendering & fair usage",
    agree:                  "I Understand & Agree",
    cancel:                 "Not yet",
    proceedingTo:           "After you agree, we'll send you to PayMongo to choose GCash, Maya, or Card.",
  },
  global: {
    title: "Adaptive rendering technology",
    paragraphs: [
      "Our platform uses adaptive rendering technology to ensure fair and stable service quality for every creator.",
      "During periods of high demand, rendering speed, resolution, queue priority, or visual effects quality may automatically adjust to maintain platform stability and long-term sustainability.",
      "Heavy or excessive usage patterns may temporarily activate optimized rendering modes designed to protect performance for all creators. Your creative flow continues without interruption — rendering simply shifts into high-demand mode until traffic eases.",
    ],
  },
  plans: {
    premium: {
      tagline: "Best for casual creators and TikTok affiliate users",
      whoFor: [
        "Casual creators getting started",
        "TikTok affiliate workflows",
        "Balanced everyday AI usage",
        "Standard rendering speed",
      ],
      dailyUsage: [
        "150 AI chats every day",
        "20 standard-quality images every day",
        "5 short AI videos every day",
      ],
      afterSoftLimit: [
        "Generation continues without interruption",
        "Rendering may shift into optimized mode",
        "Resolution may automatically adapt",
        "Queue priority may adjust during peak traffic",
      ],
      cooldowns: [
        "5-second cooldown between images",
        "30-second cooldown between videos",
      ],
    },
    elite: {
      tagline: "Designed for active daily creators",
      whoFor: [
        "Active creators posting regularly",
        "Better image and video quality",
        "Faster queue access",
        "Reliable daily workflow",
      ],
      dailyUsage: [
        "300 AI chats every day",
        "50 better-quality images every day",
        "10 AI videos every day with faster rendering",
      ],
      afterSoftLimit: [
        "Optimized rendering mode activates",
        "Queue priority may adjust during heavy traffic",
        "Rendering quality may adapt automatically",
        "Your creative flow continues seamlessly",
      ],
      cooldowns: [
        "3-second cooldown between images",
        "20-second cooldown between videos",
      ],
    },
    super_elite: {
      tagline: "Built for heavy daily creators",
      whoFor: [
        "Heavy daily and pro creators",
        "Highest rendering priority",
        "Premium performance class",
        "Top-tier generation speed",
      ],
      dailyUsage: [
        "500 AI chats every day",
        "100 high-quality images every day",
        "20 AI videos every day in the priority queue",
      ],
      afterSoftLimit: [
        "Adaptive GPU balancing activates",
        "Rendering speed may vary during peak demand",
        "Quality optimization may apply automatically",
        "You remain in the highest priority tier",
      ],
      cooldowns: [
        "1-second cooldown between images",
        "10-second cooldown between videos",
      ],
    },
    cinematic: {
      tagline: "Professional cinematic creator add-on",
      whoFor: [
        "Professional cinematic production",
        "High-GPU usage feature — sustainably priced",
        "Stacks on top of any chat plan",
        "Optimized for premium output",
      ],
      dailyUsage: [],
      afterSoftLimit: [
        "Beyond 10 monthly projects, additional renders enter economy cinematic mode",
        "Lower rendering priority on extra projects",
        "Reduced effects quality on extra projects",
        "Slower rendering allowed — always available",
      ],
      cooldowns: [],
      cinematicIncludes: [
        "10 cinematic projects per month",
        "Up to 10 scenes or images per project",
        "Up to 30 seconds final cinematic video",
        "1080p cinematic export",
        "Voice acting and ambient sound design",
        "Cinematic camera motion controls",
        "Full render history",
      ],
      cinematicFairUse: [
        "Cinematic render queue is separate from the normal queue",
        "Rendering speed may slow during heavy traffic",
        "Designed for premium output, not infinite generation",
      ],
      cinematicRerender: [
        "2 premium rerenders included per project",
        "Additional rerenders use economy cinematic mode",
        "Rerender abuse protection keeps quality fair for all creators",
      ],
    },
  },
};

export default en;
