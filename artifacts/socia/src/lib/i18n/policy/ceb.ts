import type { Policy } from "./types";

const ceb: Policy = {
  ui: {
    title:                  "Polisiya sa Plano ug Fair Usage",
    subtitle:               "Paspasang basahon una mopadayon sa bayad.",
    languageLabel:          "Pinulongan",
    moreLanguagesSoon:      "Daghan pang pinulongan moabot",
    sectionPlan:            "Gipili nga plano",
    sectionWhoFor:          "Para kang kinsa kini",
    sectionDailyUsage:      "Adlaw-adlaw nga paggamit",
    sectionCooldowns:       "Cooldown matag render",
    sectionAfterSoftLimit:  "Kung molapas ka sa adlaw-adlaw nga dagan",
    sectionCinematicIncludes: "Apil sa plano",
    sectionCinematicFairUse:  "Cinematic fair usage",
    sectionCinematicRerender: "Polisiya sa rerender",
    sectionGlobalFairUsage: "Adaptive rendering ug fair usage",
    agree:                  "Nakasabot ko ug miuyon",
    cancel:                 "Sa makadiyot",
    proceedingTo:           "Human ka mouyon, dad-on ka sa PayMongo aron mopili og GCash, Maya, o Card.",
  },
  global: {
    title: "Teknolohiya sa adaptive rendering",
    paragraphs: [
      "Naggamit ang among platform og adaptive rendering aron masiguro ang patas ug lig-on nga serbisyo para sa tanang creator.",
      "Sa panahon sa taas nga demand, mahimong awtomatikong mag-adjust ang katulin sa rendering, resolution, queue priority, o visual effects aron mapadayon ang kalig-on sa platform ug long-term nga sustainability.",
      "Sa bug-at o sobra nga paggamit, mahimong temporaryong mag-aktibo ang optimized rendering modes aron mapanalipdan ang performance para sa tanang creator. Padayon ang imong creative flow nga walay pagkahunong — ang rendering molihok lang sa high-demand mode hangtod mokunhod ang traffic.",
    ],
  },
  plans: {
    premium: {
      tagline: "Maayo para sa casual creators ug TikTok affiliate users",
      whoFor: [
        "Mga casual creator nga bag-o pa magsugod",
        "TikTok affiliate workflow",
        "Balanseng adlaw-adlaw nga AI usage",
        "Standard nga katulin sa rendering",
      ],
      dailyUsage: [
        "150 AI chat kada adlaw",
        "20 standard-quality nga hulagway kada adlaw",
        "5 mubo nga AI videos kada adlaw",
      ],
      afterSoftLimit: [
        "Padayon ang generation, walay pagkahunong",
        "Mahimong mobalhin sa optimized mode ang rendering",
        "Mahimong awtomatikong mag-adapt ang resolution",
        "Mahimong mag-adjust ang queue priority sa peak traffic",
      ],
      cooldowns: [
        "5-segundo nga cooldown matag hulagway",
        "30-segundo nga cooldown matag video",
      ],
    },
    elite: {
      tagline: "Gidisenyo para sa aktibong adlaw-adlaw nga creator",
      whoFor: [
        "Mga aktibong creator nga regular nga nag-post",
        "Mas maayong image ug video quality",
        "Mas paspas nga queue",
        "Kasaligang adlaw-adlaw nga workflow",
      ],
      dailyUsage: [
        "300 AI chat kada adlaw",
        "50 mas maayong quality nga hulagway kada adlaw",
        "10 AI videos kada adlaw nga adunay mas paspas nga rendering",
      ],
      afterSoftLimit: [
        "Mag-aktibo ang optimized rendering mode",
        "Mahimong mag-adjust ang queue priority sa bug-at nga traffic",
        "Mahimong awtomatikong mag-adapt ang rendering quality",
        "Padayon ang imong dagan nga walay pagkahunong",
      ],
      cooldowns: [
        "3-segundo nga cooldown matag hulagway",
        "20-segundo nga cooldown matag video",
      ],
    },
    super_elite: {
      tagline: "Gihimo para sa bug-at nga adlaw-adlaw nga creator",
      whoFor: [
        "Bug-at nga daily ug pro creator",
        "Pinakataas nga priority sa rendering",
        "Premium performance class",
        "Top-tier nga katulin sa generation",
      ],
      dailyUsage: [
        "500 AI chat kada adlaw",
        "100 high-quality nga hulagway kada adlaw",
        "20 AI videos kada adlaw sa priority queue",
      ],
      afterSoftLimit: [
        "Mag-aktibo ang adaptive GPU balancing",
        "Mahimong magbag-o ang katulin sa rendering sa peak demand",
        "Mahimong awtomatikong i-apply ang quality optimization",
        "Magpabilin ka sa pinakataas nga priority tier",
      ],
      cooldowns: [
        "1-segundo nga cooldown matag hulagway",
        "10-segundo nga cooldown matag video",
      ],
    },
    cinematic: {
      tagline: "Propesyonal nga cinematic creator add-on",
      whoFor: [
        "Para sa propesyonal nga cinematic production",
        "Taas-GPU nga feature — sustainable ang presyo",
        "Mahimong i-combine sa bisan unsang chat plan",
        "Optimized para sa premium output",
      ],
      dailyUsage: [],
      afterSoftLimit: [
        "Lapas sa 10 binulan nga projects, mosulod sa economy cinematic mode ang dugang renders",
        "Mas mubo nga priority sa rendering sa dugang projects",
        "Mas mubo nga quality sa effects sa dugang projects",
        "Gitugotan nga mas hinay nga rendering — kanunay nga available",
      ],
      cooldowns: [],
      cinematicIncludes: [
        "10 cinematic projects matag bulan",
        "Hangtod 10 scenes o hulagway matag project",
        "Hangtod 30 segundo nga final cinematic video",
        "1080p cinematic export",
        "Voice acting ug ambient sound design",
        "Cinematic camera motion controls",
        "Kompletong render history",
      ],
      cinematicFairUse: [
        "Bulag ang cinematic render queue sa normal nga queue",
        "Mahimong mohinay ang rendering kung bug-at ang traffic",
        "Para sa premium output, dili para sa walay-katapusang generation",
      ],
      cinematicRerender: [
        "2 premium rerenders matag project",
        "Ang dugang nga rerenders maa-economy cinematic mode",
        "Adunay proteksyon batok sa rerender abuse para sa patas nga quality sa tanang creator",
      ],
    },
  },
};

export default ceb;
