import type { Policy } from "./types";

const tl: Policy = {
  ui: {
    title:                  "Patakaran ng Plano at Fair Usage",
    subtitle:               "Mabilisang basahin bago tumuloy sa bayad.",
    languageLabel:          "Wika",
    moreLanguagesSoon:      "Marami pang wika ang darating",
    sectionPlan:            "Napiling plano",
    sectionWhoFor:          "Para kanino ito",
    sectionDailyUsage:      "Arawang paggamit",
    sectionCooldowns:       "Cooldown bawat render",
    sectionAfterSoftLimit:  "Kapag lumampas ka sa arawang daloy",
    sectionCinematicIncludes: "Kasama sa plano",
    sectionCinematicFairUse:  "Cinematic fair usage",
    sectionCinematicRerender: "Patakaran sa rerender",
    sectionGlobalFairUsage: "Adaptive rendering at fair usage",
    agree:                  "Magpatuloy sa Secure Checkout",
    cancel:                 "Bumalik",
    proceedingTo:           "Susunod, bubuksan namin ang PayMongo para makapili ka ng GCash, Maya, o Card.",
    stepIndicator:          "Hakbang 1 ng 2 · Patakaran ng Plano",
    learnMore:              "Tingnan pa",
    showLess:               "Itago",
    securing:               "Ineensure ang iyong secure checkout…",
  },
  global: {
    title: "Teknolohiyang adaptive rendering",
    paragraphs: [
      "Gumagamit ang aming platform ng adaptive rendering para sa patas at matatag na serbisyo para sa lahat ng creator.",
      "Sa mga oras ng mataas na demand, maaaring kusang mag-adjust ang bilis ng rendering, resolution, queue priority, o visual effects para mapanatili ang katatagan ng sistema at pangmatagalang sustainability.",
      "Sa sobrang bigat na paggamit, maaaring pansamantalang mag-activate ang optimized rendering modes upang maprotektahan ang performance para sa lahat ng creator. Patuloy ang iyong creative flow nang walang abala — lumilipat lang ang rendering sa high-demand mode hanggang bumaba ang traffic.",
    ],
  },
  plans: {
    premium: {
      tagline: "Pinakamainam para sa casual creators at TikTok affiliate users",
      whoFor: [
        "Mga casual creator na nagsisimula pa lang",
        "TikTok affiliate workflow",
        "Balanced na araw-araw na AI usage",
        "Standard na bilis ng rendering",
      ],
      dailyUsage: [
        "150 AI chat kada araw",
        "20 standard-quality na larawan kada araw",
        "5 short AI videos kada araw",
      ],
      afterSoftLimit: [
        "Patuloy ang generation, walang pagkaantala",
        "Maaaring lumipat sa optimized mode ang rendering",
        "Maaaring mag-adapt ang resolution nang awtomatiko",
        "Maaaring mag-adjust ang queue priority sa peak traffic",
      ],
      cooldowns: [
        "5-segundong cooldown bawat larawan",
        "30-segundong cooldown bawat video",
      ],
    },
    elite: {
      tagline: "Para sa aktibong araw-araw na creator",
      whoFor: [
        "Mga active creator na regular na nagpo-post",
        "Mas magandang image at video quality",
        "Mas mabilis na queue",
        "Maaasahang araw-araw na workflow",
      ],
      dailyUsage: [
        "300 AI chat kada araw",
        "50 mas magandang quality na larawan kada araw",
        "10 AI videos kada araw na may mas mabilis na rendering",
      ],
      afterSoftLimit: [
        "Mag-aaktibo ang optimized rendering mode",
        "Maaaring mag-adjust ang queue priority kapag mabigat ang traffic",
        "Maaaring kusang mag-adapt ang rendering quality",
        "Patuloy ang iyong daloy nang walang abala",
      ],
      cooldowns: [
        "3-segundong cooldown bawat larawan",
        "20-segundong cooldown bawat video",
      ],
    },
    super_elite: {
      tagline: "Para sa mabibigat na araw-araw na creator",
      whoFor: [
        "Mabibigat na daily at pro creator",
        "Pinakamataas na priority sa rendering",
        "Premium performance class",
        "Top-tier na bilis ng generation",
      ],
      dailyUsage: [
        "500 AI chat kada araw",
        "100 high-quality na larawan kada araw",
        "20 AI videos kada araw sa priority queue",
      ],
      afterSoftLimit: [
        "Mag-aaktibo ang adaptive GPU balancing",
        "Maaaring magbago ang bilis ng rendering sa peak demand",
        "Maaaring kusang mag-apply ang quality optimization",
        "Mananatili ka sa pinakamataas na priority tier",
      ],
      cooldowns: [
        "1-segundong cooldown bawat larawan",
        "10-segundong cooldown bawat video",
      ],
    },
    cinematic: {
      tagline: "Propesyonal na cinematic creator add-on",
      whoFor: [
        "Para sa propesyonal na cinematic production",
        "Mataas-GPU na feature — sustainable ang presyo",
        "Pwedeng pagsamahin sa kahit anong chat plan",
        "Optimized para sa premium output",
      ],
      dailyUsage: [],
      afterSoftLimit: [
        "Lampas sa 10 buwanang projects, papasok sa economy cinematic mode ang dagdag na renders",
        "Mas mababang priority sa rendering ng dagdag na projects",
        "Mas mababang quality ng effects sa dagdag na projects",
        "Pinapayagang mas mabagal na rendering — laging available",
      ],
      cooldowns: [],
      cinematicIncludes: [
        "10 cinematic projects kada buwan",
        "Hanggang 10 scenes o larawan kada project",
        "Hanggang 30 segundong final cinematic video",
        "1080p cinematic export",
        "Voice acting at ambient sound design",
        "Cinematic camera motion controls",
        "Kumpletong render history",
      ],
      cinematicFairUse: [
        "Hiwalay ang cinematic render queue sa normal na queue",
        "Maaaring bumagal ang rendering kapag mabigat ang traffic",
        "Para sa premium output, hindi para sa walang-hanggang generation",
      ],
      cinematicRerender: [
        "2 premium rerenders bawat project",
        "Ang dagdag na rerenders ay sa economy cinematic mode",
        "May proteksyon laban sa rerender abuse para sa fair quality sa lahat ng creator",
      ],
    },
  },
};

export default tl;
