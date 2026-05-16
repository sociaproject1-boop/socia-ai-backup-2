/**
 * Preset Studio — single source of truth for all 1-click generation presets.
 *
 * The full record (including `promptTemplate` and `negativeHints`) is SERVER
 * ONLY. The HTTP layer exposes a sanitised view to the client via
 * `sanitizePreset()`. This means a malicious client cannot rewrite the
 * template or smuggle in a different prompt — the only thing the client sends
 * is `presetId` + an optional short subject string.
 */

export type PresetKind = "image" | "video";
export type PresetAspect = "1:1" | "9:16" | "16:9";
export type PresetBadge = "New" | "Hot" | "Top Pick" | "Pro" | "Quick";

export interface ServerPreset {
  id: string;
  title: string;
  category: string;
  description: string;
  kind: PresetKind;
  /** Visual placeholder for the card. */
  thumb: { from: string; to: string; emoji: string };

  /** The actual prompt template. Supports tokens: {subject}. */
  promptTemplate: string;
  /**
   * Hints concatenated into the positive prompt as `Avoid: …`.
   * gpt-image-1 and Kling do not expose a separate `negative_prompt` parameter.
   */
  negativeHints?: string[];

  defaultAspect: PresetAspect;
  /** Only meaningful for video presets. Kling supports 5 or 10 seconds. */
  durationSec?: 5 | 10;

  /**
   * If true, the route uses gpt-image-1's IMAGE EDIT endpoint.
   * Video presets always require an uploaded image (image-to-video).
   */
  requiresUploadedImage: boolean;

  /** Fallback subject when the user doesn't type one. */
  defaultSubject: string;

  /** UI presentation fields (safe to expose to client). */
  badge?: PresetBadge;
  featured?: boolean;
  tags?: string[];
  glowColor?: string;
}

export const PRESETS: ServerPreset[] = [

  // ── Viral TikTok Ads ──────────────────────────────────────────────────────
  {
    id: "tiktok-white-bg",
    title: "TikTok White BG",
    category: "Viral TikTok Ads",
    description: "Crisp white-background product shot, listing-ready.",
    kind: "image",
    thumb: { from: "#fef3c7", to: "#f97316", emoji: "🛍️" },
    promptTemplate:
      "Transform the uploaded product into a crisp TikTok Shop listing photo on a pure white seamless background, soft even studio lighting, subtle floor reflection beneath the product, sharp tack-sharp focus, retail-ready ecommerce thumbnail composition. Product: {subject}.",
    negativeHints: ["text overlays", "watermarks", "harsh shadows", "cluttered backdrop"],
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the product",
    badge: "Hot",
    featured: true,
    tags: ["product", "ecom", "clean"],
    glowColor: "rgba(249,115,22,0.45)",
  },
  {
    id: "tiktok-handheld-demo",
    title: "Hand-Held Demo",
    category: "Viral TikTok Ads",
    description: "Creator's hand holding the product, vlog vibe.",
    kind: "image",
    thumb: { from: "#fde68a", to: "#ef4444", emoji: "🤳" },
    promptTemplate:
      "Reimagine the uploaded product being held by a young Asian creator's hand entering frame from the right against a soft pastel pink/peach background, vlog selfie aesthetic, natural daylight from a window, candid TikTok review framing, shallow depth of field. Product: {subject}.",
    negativeHints: ["face of person", "text", "logos other than the product"],
    defaultAspect: "9:16",
    requiresUploadedImage: true,
    defaultSubject: "the product",
    badge: "Hot",
    tags: ["creator", "vlog", "lifestyle"],
    glowColor: "rgba(239,68,68,0.4)",
  },
  {
    id: "viral-pov-tryon",
    title: "POV Try-On",
    category: "Viral TikTok Ads",
    description: "First-person POV testing a product for maximum engagement.",
    kind: "image",
    thumb: { from: "#fca5a5", to: "#7c2d12", emoji: "👀" },
    promptTemplate:
      "First-person point-of-view shot of hands using or trying on the product, looking downward angle, soft natural window light, intimate candid consumer testing vibe, TikTok POV style, ultra-realistic. Product: {subject}.",
    defaultAspect: "9:16",
    requiresUploadedImage: true,
    defaultSubject: "the product",
    badge: "New",
    tags: ["POV", "viral", "trending"],
    glowColor: "rgba(185,28,28,0.4)",
  },
  {
    id: "viral-trending-flatlay",
    title: "Trending Flat Lay",
    category: "Viral TikTok Ads",
    description: "Aesthetic top-down flat lay, pastel palette, highly shareable.",
    kind: "image",
    thumb: { from: "#fbcfe8", to: "#a855f7", emoji: "📱" },
    promptTemplate:
      "Perfectly arranged aesthetic flat lay product shot from directly above, soft pastel color palette, minimalist props (dried flowers, neutral fabric, glass jar), harmonious composition, even diffused softbox lighting. Product: {subject}.",
    negativeHints: ["harsh shadows", "clutter", "dark tones"],
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the product",
    badge: "Hot",
    tags: ["flatlay", "aesthetic", "pastel"],
    glowColor: "rgba(168,85,247,0.4)",
  },

  // ── Luxury Product Ads ────────────────────────────────────────────────────
  {
    id: "ads-luxury-studio",
    title: "Black Marble Studio",
    category: "Luxury Product Ads",
    description: "Black marble + dramatic single-source light.",
    kind: "image",
    thumb: { from: "#1f2937", to: "#fbbf24", emoji: "💎" },
    promptTemplate:
      "Luxury product photography on a polished black marble surface, dramatic single-source rim light from camera left, deep glossy shadow falling to camera right, premium brand atmosphere, ultra-detailed material texture, magazine ad composition, champagne accents. Product: {subject}.",
    negativeHints: ["clutter", "extra props", "low contrast", "flat lighting"],
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the product",
    badge: "Top Pick",
    featured: true,
    tags: ["marble", "dark", "premium"],
    glowColor: "rgba(251,191,36,0.4)",
  },
  {
    id: "ads-floating-product",
    title: "Floating Product",
    category: "Luxury Product Ads",
    description: "Product floats in mid-air, Apple-keynote vibe.",
    kind: "image",
    thumb: { from: "#a5f3fc", to: "#6366f1", emoji: "🪄" },
    promptTemplate:
      "Studio shot of the product floating in mid-air against a vibrant gradient backdrop, perfectly centered, soft inflated shadow underneath suggesting levitation, modern Apple-keynote ad style, ultra-clean composition, razor-sharp product detail. Product: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the product",
    badge: "Pro",
    tags: ["levitation", "minimal", "premium"],
    glowColor: "rgba(99,102,241,0.4)",
  },
  {
    id: "ads-splash-liquid",
    title: "Splash Liquid",
    category: "Luxury Product Ads",
    description: "Frozen splash, dynamic hero ad.",
    kind: "image",
    thumb: { from: "#22d3ee", to: "#1e3a8a", emoji: "💦" },
    promptTemplate:
      "Hero product ad: dynamic splashes of crystal-clear water frozen mid-motion swirling around the product, dramatic dark backdrop, accent rim lighting from behind, droplets caught mid-air with hyperreal sharpness. Product: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the product",
    tags: ["splash", "dynamic", "water"],
    glowColor: "rgba(34,211,238,0.4)",
  },
  {
    id: "ads-luxury-hero-video",
    title: "Luxury Hero Video",
    category: "Luxury Product Ads",
    description: "Slow 360° reveal with spotlight and glossy reflections.",
    kind: "video",
    thumb: { from: "#1e293b", to: "#a855f7", emoji: "🎬" },
    promptTemplate:
      "Cinematic luxury product reveal: slow controlled 360 degree rotation around the product, single dramatic spotlight creating glossy surface reflections that travel across the product, premium brand ad cinematography, smooth motion, ultra-clean dark background. Product: {subject}.",
    defaultAspect: "1:1",
    durationSec: 5,
    requiresUploadedImage: true,
    defaultSubject: "the product",
    badge: "Pro",
    featured: true,
    tags: ["360", "video", "luxury"],
    glowColor: "rgba(168,85,247,0.45)",
  },

  // ── Beauty Influencer ─────────────────────────────────────────────────────
  {
    id: "beauty-glass-skin",
    title: "Glass Skin Closeup",
    category: "Beauty Influencer",
    description: "Dewy K-beauty glass-skin macro.",
    kind: "image",
    thumb: { from: "#fce7f3", to: "#f472b6", emoji: "✨" },
    promptTemplate:
      "Macro beauty shot of glass-skin K-beauty look, dewy luminous complexion, gentle peach blush, soft pink lip, perfect natural makeup, soft daylight from a north-facing window, 100mm macro lens, ultra-detailed skin texture with visible micro-pores. Subject: {subject}.",
    negativeHints: ["plastic skin", "over-smoothing", "heavy makeup"],
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "a young east-Asian woman with clear glowing complexion",
    badge: "Top Pick",
    featured: true,
    tags: ["K-beauty", "glass skin", "dewy"],
    glowColor: "rgba(244,114,182,0.4)",
  },
  {
    id: "beauty-glossy-lip",
    title: "Glossy Lip Macro",
    category: "Beauty Influencer",
    description: "Mirror-finish lip gloss editorial.",
    kind: "image",
    thumb: { from: "#fb7185", to: "#7c2d12", emoji: "💋" },
    promptTemplate:
      "Extreme macro photograph of glossy lips, ultra-shiny mirror-finish lip gloss, plump definition, subtle freckles around the mouth, beauty editorial soft lighting, 100mm macro lens, razor-sharp focus on the central lip highlight. Subject: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "model lips with rose-pink lipgloss",
    tags: ["lips", "macro", "beauty"],
    glowColor: "rgba(251,113,133,0.4)",
  },
  {
    id: "beauty-influencer-selfie",
    title: "Influencer Glow Selfie",
    category: "Beauty Influencer",
    description: "Ring-lit beauty selfie, influencer-ready glow.",
    kind: "image",
    thumb: { from: "#fde68a", to: "#f472b6", emoji: "💄" },
    promptTemplate:
      "Beauty influencer selfie style portrait, perfect ring light catchlights in eyes, warm peach-toned glow on skin, subtle contouring, dewy highlight on cheekbones, soft background blur, Instagram/TikTok beauty creator aesthetic, 35mm portrait. Subject: {subject}.",
    negativeHints: ["heavy filter", "harsh shadows", "dark tones"],
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "a radiant young woman with natural glam makeup",
    badge: "New",
    tags: ["selfie", "influencer", "glow"],
    glowColor: "rgba(244,114,182,0.4)",
  },
  {
    id: "beauty-eyeshadow-macro",
    title: "Eyeshadow Macro",
    category: "Beauty Influencer",
    description: "Extreme close-up editorial eyeshadow look.",
    kind: "image",
    thumb: { from: "#6d28d9", to: "#f472b6", emoji: "👁️" },
    promptTemplate:
      "Extreme macro beauty editorial of a dramatic eyeshadow look, intense pigment colors, glitter particles catching the light, perfect blending, sharp eyeliner, mascara-coated lashes, strong beauty light from camera-right. Subject: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "dramatic purple and gold eyeshadow look, model eye",
    tags: ["eye", "editorial", "macro"],
    glowColor: "rgba(109,40,217,0.45)",
  },

  // ── Fashion Editorial ─────────────────────────────────────────────────────
  {
    id: "fashion-editorial",
    title: "Vogue Editorial",
    category: "Fashion Editorial",
    description: "High-contrast Vogue-style editorial cover.",
    kind: "image",
    thumb: { from: "#a78bfa", to: "#1e1b4b", emoji: "👗" },
    promptTemplate:
      "High-fashion editorial cover photograph: bold high-contrast lighting, muted desaturated color grade, model styled like a Vogue cover shoot, dramatic shadows on a textured wall, 85mm portrait lens, subtle film grain, magazine-cover composition with negative space at the top for masthead. Subject: {subject}.",
    negativeHints: ["smiling", "casual snapshot feel", "plastic skin"],
    defaultAspect: "9:16",
    requiresUploadedImage: true,
    defaultSubject: "the styled outfit",
    badge: "Top Pick",
    featured: true,
    tags: ["Vogue", "editorial", "luxury"],
    glowColor: "rgba(167,139,250,0.4)",
  },
  {
    id: "fashion-slow-mo-video",
    title: "Slow-Mo Fabric Flow",
    category: "Fashion Editorial",
    description: "Hyperreal slow-motion fabric and hair in wind.",
    kind: "video",
    thumb: { from: "#f9a8d4", to: "#581c87", emoji: "🌬️" },
    promptTemplate:
      "Slow-motion fashion editorial sequence: fabric flowing dramatically in the wind, hair tossing gently, hyperreal smooth 240fps look, soft studio key light from camera right, dreamy atmosphere, magazine editorial quality. Subject: {subject}.",
    defaultAspect: "9:16",
    durationSec: 5,
    requiresUploadedImage: true,
    defaultSubject: "the fashion model",
    badge: "Pro",
    tags: ["slow-mo", "video", "wind"],
    glowColor: "rgba(88,28,135,0.45)",
  },
  {
    id: "fashion-ai-model-walk",
    title: "Runway Walk",
    category: "Fashion Editorial",
    description: "Confident runway walk toward camera, slow-mo.",
    kind: "video",
    thumb: { from: "#1e1b4b", to: "#ec4899", emoji: "👠" },
    promptTemplate:
      "Confident AI model walks toward the camera in fashion runway style, natural stride, hair flowing softly, slow motion, cinematic depth of field with background falling out of focus, 35mm anamorphic look. Subject: {subject}.",
    defaultAspect: "9:16",
    durationSec: 10,
    requiresUploadedImage: true,
    defaultSubject: "the fashion model",
    badge: "Pro",
    tags: ["runway", "walk", "cinematic"],
    glowColor: "rgba(236,72,153,0.4)",
  },

  // ── Hyper Realistic ───────────────────────────────────────────────────────
  {
    id: "hyper-portrait",
    title: "Hyper-Real Portrait",
    category: "Hyper Realistic",
    description: "Uncannily photorealistic human portrait.",
    kind: "image",
    thumb: { from: "#d1fae5", to: "#064e3b", emoji: "🔬" },
    promptTemplate:
      "Ultra-hyperrealistic portrait photograph indistinguishable from reality, 8K medium format camera, extreme skin texture detail showing every pore and micro-hair, perfect natural catchlights in eyes, photojournalism color grading, Hasselblad camera aesthetic. Subject: {subject}.",
    negativeHints: ["painting", "render", "illustration", "plastic skin", "smooth skin"],
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "a photorealistic person, neutral expression",
    badge: "New",
    featured: true,
    tags: ["hyperreal", "portrait", "8K"],
    glowColor: "rgba(6,78,59,0.45)",
  },
  {
    id: "hyper-product",
    title: "Hyper-Real Product",
    category: "Hyper Realistic",
    description: "Ultra-photorealistic product hero, every detail visible.",
    kind: "image",
    thumb: { from: "#e0f2fe", to: "#0369a1", emoji: "🔭" },
    promptTemplate:
      "Hyperrealistic product photography, 100MP medium-format sensor quality, every surface detail rendered with perfect material accuracy, microscopic texture visible, optically perfect lens with zero aberration, extreme depth of field, museum-quality product documentation. Product: {subject}.",
    negativeHints: ["artistic interpretation", "illustration", "painterly"],
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the product",
    badge: "New",
    tags: ["hyperreal", "detail", "product"],
    glowColor: "rgba(3,105,161,0.45)",
  },

  // ── Cinematic Film ─────────────────────────────────────────────────────────
  {
    id: "cinematic-golden-reveal",
    title: "Cinematic Golden Reveal",
    category: "Cinematic Film",
    description: "Golden hour cinematic reveal with anamorphic lens.",
    kind: "video",
    thumb: { from: "#78350f", to: "#fcd34d", emoji: "🎥" },
    promptTemplate:
      "Cinematic golden hour reveal, anamorphic lens flare sweeping across frame as the camera slowly pulls back, warm amber and gold tones, horizontal bokeh streaks, photochemical film look, Kodak Vision 3 emulation, breathtaking cinematic composition. Subject: {subject}.",
    defaultAspect: "16:9",
    durationSec: 5,
    requiresUploadedImage: true,
    defaultSubject: "the scene",
    badge: "Top Pick",
    featured: true,
    tags: ["cinematic", "golden hour", "anamorphic"],
    glowColor: "rgba(252,211,77,0.4)",
  },
  {
    id: "cinematic-noir",
    title: "Film Noir",
    category: "Cinematic Film",
    description: "1940s Hollywood noir, dramatic shadows and mystery.",
    kind: "image",
    thumb: { from: "#0f172a", to: "#64748b", emoji: "🎭" },
    promptTemplate:
      "Hollywood film noir still, deep high-contrast black and white with rich tonal range, venetian blind shadow pattern, single hard key light from above creating strong shadow, atmospheric cigarette smoke haze, classic 1940s crime thriller aesthetic. Subject: {subject}.",
    negativeHints: ["color", "modern elements", "flat lighting"],
    defaultAspect: "16:9",
    requiresUploadedImage: false,
    defaultSubject: "a mysterious figure in a trench coat",
    badge: "New",
    tags: ["noir", "B&W", "cinematic"],
    glowColor: "rgba(100,116,139,0.4)",
  },
  {
    id: "cinematic-scene-video",
    title: "Cinematic Lifestyle Scene",
    category: "Cinematic Film",
    description: "Slow dolly through a lifestyle scene, film-look grade.",
    kind: "video",
    thumb: { from: "#fcd34d", to: "#7c2d12", emoji: "🌅" },
    promptTemplate:
      "Slow cinematic dolly forward through the lifestyle scene, gentle handheld camera shake, warm afternoon sunlight streaming in, subtle dust particles drifting in the air, film-look color grade, anamorphic depth of field. Scene: {subject}.",
    defaultAspect: "16:9",
    durationSec: 5,
    requiresUploadedImage: true,
    defaultSubject: "the scene",
    tags: ["dolly", "lifestyle", "film"],
    glowColor: "rgba(124,45,18,0.45)",
  },

  // ── Anime Style ────────────────────────────────────────────────────────────
  {
    id: "anime-ghibli",
    title: "Studio Ghibli",
    category: "Anime Style",
    description: "Soft painterly Ghibli aesthetic, magical atmosphere.",
    kind: "image",
    thumb: { from: "#a7f3d0", to: "#0d9488", emoji: "🌿" },
    promptTemplate:
      "Studio Ghibli inspired illustration, soft hand-painted watercolor aesthetic, lush dreamy backgrounds with magical soft light, gentle pastel colors, intricate botanical details, Hayao Miyazaki signature style, warm nostalgic atmosphere, storybook quality. Subject: {subject}.",
    negativeHints: ["photorealistic", "3D render", "harsh edges", "dark tones"],
    defaultAspect: "16:9",
    requiresUploadedImage: false,
    defaultSubject: "a young girl standing in a magical forest clearing",
    badge: "Top Pick",
    featured: true,
    tags: ["Ghibli", "painterly", "magical"],
    glowColor: "rgba(13,148,136,0.4)",
  },
  {
    id: "anime-dark-fantasy",
    title: "Dark Fantasy Anime",
    category: "Anime Style",
    description: "Vibrant dramatic anime art with epic atmosphere.",
    kind: "image",
    thumb: { from: "#1e1b4b", to: "#7c3aed", emoji: "⚔️" },
    promptTemplate:
      "Epic dark fantasy anime illustration, dramatic action composition, cinematic lighting with neon energy effects, intricate character details, detailed background architecture, vibrant color contrast, ultra-detailed anime art by top studio, dynamic pose. Subject: {subject}.",
    negativeHints: ["photorealistic", "simple", "flat color"],
    defaultAspect: "9:16",
    requiresUploadedImage: false,
    defaultSubject: "a powerful anime warrior with glowing sword",
    badge: "New",
    tags: ["dark", "fantasy", "anime"],
    glowColor: "rgba(124,58,237,0.45)",
  },

  // ── Dark Luxury ────────────────────────────────────────────────────────────
  {
    id: "dark-luxury-noir",
    title: "Dark Luxury Noir",
    category: "Dark Luxury",
    description: "Deep black, neon accent, mysterious noir luxury.",
    kind: "image",
    thumb: { from: "#0c0a09", to: "#22d3ee", emoji: "🖤" },
    promptTemplate:
      "Dark luxury product photography: nearly black matte background, single thin neon blue or teal rim light creating a razor-thin glow around product silhouette, deep atmospheric shadow, premium brand aura, editorial magazine quality, expensive and mysterious. Subject: {subject}.",
    negativeHints: ["bright tones", "colorful background", "clutter"],
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the luxury product",
    badge: "Top Pick",
    featured: true,
    tags: ["dark", "neon", "luxury"],
    glowColor: "rgba(34,211,238,0.45)",
  },
  {
    id: "dark-luxury-velvet",
    title: "Velvet Dark Room",
    category: "Dark Luxury",
    description: "Rich velvet textures, candlelight, opulent mood.",
    kind: "image",
    thumb: { from: "#3b0764", to: "#7c3aed", emoji: "🕯️" },
    promptTemplate:
      "Opulent dark luxury still life, deep jewel-tone velvet fabric surface, warm candlelight glow from behind creating dramatic depth, soft bokeh of candle flames in background, gold and deep purple accents, editorial perfume or jewelry ad quality. Subject: {subject}.",
    negativeHints: ["harsh light", "flat backdrop", "modern look"],
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the luxury item",
    badge: "New",
    tags: ["velvet", "candle", "opulent"],
    glowColor: "rgba(124,58,237,0.45)",
  },
  {
    id: "luxury-marble-gold",
    title: "Marble & Gold",
    category: "Dark Luxury",
    description: "Carrara marble + polished gold accents.",
    kind: "image",
    thumb: { from: "#fef9c3", to: "#a16207", emoji: "🏛️" },
    promptTemplate:
      "Ultra-luxury product still life on white Carrara marble, polished gold accents nearby, soft window light from camera left, champagne color palette, premium fashion-magazine ad styling, generous negative space. Subject: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the luxury product",
    tags: ["marble", "gold", "luxury"],
    glowColor: "rgba(161,98,7,0.45)",
  },

  // ── Apple Commercial Style ────────────────────────────────────────────────
  {
    id: "apple-white-minimal",
    title: "Apple White Minimal",
    category: "Apple Commercial Style",
    description: "Pure white, centered perfection, Apple keynote aesthetic.",
    kind: "image",
    thumb: { from: "#f8fafc", to: "#94a3b8", emoji: "⬜" },
    promptTemplate:
      "Apple commercial product photography: pure white seamless background, perfect product centered with mathematically precise composition, crisp sharp edges, a single delicate soft shadow perfectly underneath, ultra-clean Apple keynote aesthetic, optimised for screen-accurate colors. Product: {subject}.",
    negativeHints: ["props", "gradients", "imperfections", "lifestyle elements"],
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the product",
    badge: "Top Pick",
    featured: true,
    tags: ["Apple", "minimal", "clean"],
    glowColor: "rgba(148,163,184,0.4)",
  },
  {
    id: "apple-glass-depth",
    title: "Glass Depth & Layers",
    category: "Apple Commercial Style",
    description: "Glass layers, depth, light refraction — premium tech ad.",
    kind: "image",
    thumb: { from: "#e0f2fe", to: "#0284c7", emoji: "💻" },
    promptTemplate:
      "Premium tech product commercial photography, inspired by Apple and Sony ads: layered glass depth effect, subtle refraction prisms on product surface, clean gradient background transitioning from white to very light blue, shallow depth revealing internal complexity, crisp sharp focus. Product: {subject}.",
    defaultAspect: "16:9",
    requiresUploadedImage: true,
    defaultSubject: "the tech product",
    badge: "New",
    tags: ["tech", "glass", "premium"],
    glowColor: "rgba(2,132,199,0.4)",
  },

  // ── Nike Style ─────────────────────────────────────────────────────────────
  {
    id: "nike-athletic-motion",
    title: "Athletic Motion Blur",
    category: "Nike Style",
    description: "Speed lines and motion blur, peak athletic energy.",
    kind: "image",
    thumb: { from: "#111827", to: "#ef4444", emoji: "⚡" },
    promptTemplate:
      "Nike-inspired athletic product ad: extreme dynamic motion blur, speed lines radiating from product, high-contrast black background, accent spot lighting on product creating dramatic highlight, raw kinetic energy, powerful and bold commercial photography. Product: {subject}.",
    negativeHints: ["static", "calm", "soft tones", "white background"],
    defaultAspect: "16:9",
    requiresUploadedImage: true,
    defaultSubject: "the athletic product",
    badge: "Hot",
    featured: true,
    tags: ["athletic", "motion", "dynamic"],
    glowColor: "rgba(239,68,68,0.45)",
  },
  {
    id: "nike-just-do-it",
    title: "Bold Statement Ad",
    category: "Nike Style",
    description: "Stark high-contrast, motivational campaign aesthetic.",
    kind: "image",
    thumb: { from: "#0a0a0a", to: "#f97316", emoji: "🏃" },
    promptTemplate:
      "Bold athletic campaign image: stark high-contrast dark background, strong directional key light sculpting the subject, dramatic muscle definition or product structure, cinematic ad quality, raw determination and power, minimal but powerful composition. Subject: {subject}.",
    defaultAspect: "9:16",
    requiresUploadedImage: false,
    defaultSubject: "an athlete in peak performance moment",
    badge: "New",
    tags: ["bold", "campaign", "contrast"],
    glowColor: "rgba(249,115,22,0.45)",
  },

  // ── Streetwear Campaign ───────────────────────────────────────────────────
  {
    id: "street-neon-tokyo",
    title: "Neon Tokyo Night",
    category: "Streetwear Campaign",
    description: "Shibuya neon, atmospheric night street portrait.",
    kind: "image",
    thumb: { from: "#0c0a09", to: "#22d3ee", emoji: "🌃" },
    promptTemplate:
      "Streetwear portrait at night in Tokyo Shibuya, vibrant neon signage reflections playing across the jacket, slight motion blur of passing cars in the background, atmospheric haze, Sony A7 cinematic look, high ISO grain. Subject: {subject}.",
    defaultAspect: "9:16",
    requiresUploadedImage: false,
    defaultSubject: "a young man in an oversized black puffer jacket",
    badge: "Hot",
    tags: ["Tokyo", "neon", "streetwear"],
    glowColor: "rgba(34,211,238,0.4)",
  },
  {
    id: "street-skater-polaroid",
    title: "Skater Polaroid",
    category: "Streetwear Campaign",
    description: "90s polaroid skater action shot, retro film look.",
    kind: "image",
    thumb: { from: "#fed7aa", to: "#1e3a8a", emoji: "🛹" },
    promptTemplate:
      "1990s skater polaroid aesthetic, slightly washed faded colors, mild motion blur of a kickflip mid-air, sun flare in the corner, vintage Kodak film grain, square-format polaroid border. Subject: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "a teenage skater in baggy jeans on a street ramp",
    badge: "Quick",
    tags: ["90s", "polaroid", "skate"],
    glowColor: "rgba(30,58,138,0.4)",
  },
  {
    id: "street-lookbook-tokyo",
    title: "Tokyo Lookbook",
    category: "Streetwear Campaign",
    description: "Rainy Tokyo Shinjuku at dusk, neon reflections.",
    kind: "image",
    thumb: { from: "#f472b6", to: "#3730a3", emoji: "🧥" },
    promptTemplate:
      "Streetwear lookbook shot on the streets of Tokyo Shinjuku at dusk, vibrant neon shop signs reflected on wet asphalt, cinematic 35mm anamorphic lens, full-body framing, candid mid-stride, atmospheric haze. Subject: {subject}.",
    defaultAspect: "9:16",
    requiresUploadedImage: true,
    defaultSubject: "the streetwear outfit",
    badge: "Top Pick",
    tags: ["lookbook", "streetwear", "wet streets"],
    glowColor: "rgba(55,48,163,0.4)",
  },

  // ── Food Commercial ────────────────────────────────────────────────────────
  {
    id: "food-overhead-flat",
    title: "Food Overhead Flat",
    category: "Food Commercial",
    description: "Clean top-down food editorial, perfect styling.",
    kind: "image",
    thumb: { from: "#fef9c3", to: "#a16207", emoji: "🍽️" },
    promptTemplate:
      "Professional food editorial photograph from directly above, perfectly styled dish with fresh garnishes, rich colors, complementary props (vintage cutlery, linen napkin, herb sprigs), even diffused studio light, zero harsh shadows, editorial magazine quality. Food: {subject}.",
    negativeHints: ["harsh shadows", "distracting backgrounds", "dark tones"],
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "a beautifully plated gourmet meal",
    badge: "Quick",
    featured: true,
    tags: ["overhead", "editorial", "food"],
    glowColor: "rgba(161,98,7,0.4)",
  },
  {
    id: "food-dark-moody",
    title: "Dark Moody Restaurant",
    category: "Food Commercial",
    description: "Fine dining moody atmosphere, low key dramatic.",
    kind: "image",
    thumb: { from: "#1c1917", to: "#92400e", emoji: "🍷" },
    promptTemplate:
      "Dark moody fine-dining restaurant photography, dramatic low-key side lighting, deep shadows, rich warm amber tones, slight candlelight glow, bokeh background of restaurant atmosphere, luxurious textures on plate, Michelin-starred aesthetic. Food: {subject}.",
    negativeHints: ["bright background", "flat lighting", "casual setting"],
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "an exquisite fine-dining dish with elaborate plating",
    badge: "New",
    tags: ["moody", "fine dining", "dark"],
    glowColor: "rgba(146,64,14,0.45)",
  },
  {
    id: "food-condensation-hero",
    title: "Cold & Fresh Hero",
    category: "Food Commercial",
    description: "Condensation, ice, water droplets — craving trigger.",
    kind: "image",
    thumb: { from: "#bfdbfe", to: "#1d4ed8", emoji: "🧊" },
    promptTemplate:
      "Commercial food/beverage hero shot: cold item covered in perfect water condensation droplets, ice crystals and frost details, one droplet rolling down the surface, crisp studio lighting creating specular highlights on each water droplet, hyperrealistic and intensely appetising. Subject: {subject}.",
    negativeHints: ["warm tones", "dry surface", "flat lighting"],
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "a cold glass bottle or can",
    badge: "Hot",
    tags: ["cold", "condensation", "beverage"],
    glowColor: "rgba(29,78,216,0.4)",
  },

  // ── Jewelry Macro ──────────────────────────────────────────────────────────
  {
    id: "jewelry-diamond-macro",
    title: "Diamond Sparkle Macro",
    category: "Jewelry Macro",
    description: "Extreme macro diamond with rainbow light dispersion.",
    kind: "image",
    thumb: { from: "#e0f2fe", to: "#93c5fd", emoji: "💎" },
    promptTemplate:
      "Extreme macro jewelry photography of a diamond, rainbow prismatic light dispersion visible in crystal faces, ultra-sharp facet detail, perfect fire and brilliance, micro water droplets on metal setting, pure white diffused light background, 100mm macro lens at f/8. Jewelry: {subject}.",
    negativeHints: ["dull", "lack of sparkle", "dark background"],
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the diamond jewelry piece",
    badge: "Top Pick",
    featured: true,
    tags: ["diamond", "macro", "sparkle"],
    glowColor: "rgba(147,197,253,0.5)",
  },
  {
    id: "jewelry-gold-chain",
    title: "Gold Chain Detail",
    category: "Jewelry Macro",
    description: "Editorial macro of gold chain links, premium styling.",
    kind: "image",
    thumb: { from: "#fef3c7", to: "#b45309", emoji: "⛓️" },
    promptTemplate:
      "Close-up editorial jewelry photograph of gold chain, each link perfectly formed showing the warm yellow gold texture and surface detail, soft shadowless light revealing the material quality, draped on a neutral stone surface, luxury brand catalog aesthetic. Jewelry: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the gold chain or necklace",
    badge: "New",
    tags: ["gold", "chain", "luxury"],
    glowColor: "rgba(180,83,9,0.4)",
  },
  {
    id: "jewelry-ring-marble",
    title: "Ring on Marble",
    category: "Jewelry Macro",
    description: "Minimal ring editorial on white marble.",
    kind: "image",
    thumb: { from: "#f1f5f9", to: "#94a3b8", emoji: "💍" },
    promptTemplate:
      "Minimal luxury ring editorial on polished white Carrara marble surface, soft north-light window illumination, gentle reflection on marble beneath the ring, elevated perspective, negative space composition, editorial jewelry catalog quality. Jewelry: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the ring",
    badge: "Quick",
    tags: ["ring", "marble", "minimal"],
    glowColor: "rgba(148,163,184,0.4)",
  },

  // ── Korean Aesthetic ───────────────────────────────────────────────────────
  {
    id: "korean-pastel-portrait",
    title: "Soft Korean Portrait",
    category: "Korean Aesthetic",
    description: "Y2K Korean dreamy soft palette, film grain.",
    kind: "image",
    thumb: { from: "#fbcfe8", to: "#a78bfa", emoji: "🌸" },
    promptTemplate:
      "Korean Y2K aesthetic portrait, soft pastel palette, gentle 35mm film grain, dreamy out-of-focus background bokeh, soft natural overcast light, minimalist styling, light freckles, subtle smile, balanced rule-of-thirds composition. Subject: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "a young Korean woman in a cream knit cardigan",
    badge: "Top Pick",
    featured: true,
    tags: ["K-pop", "Y2K", "soft"],
    glowColor: "rgba(167,139,250,0.4)",
  },
  {
    id: "korean-cafe-aesthetic",
    title: "Korean Cafe Aesthetic",
    category: "Korean Aesthetic",
    description: "Minimalist Korean cafe setting, warm tones.",
    kind: "image",
    thumb: { from: "#fef3c7", to: "#a78bfa", emoji: "☕" },
    promptTemplate:
      "Korean minimalist cafe aesthetic photo, warm beige and cream tones, soft window natural light, hand wrapped around a ceramic cup, clear skin and natural makeup, linen fabric, subtle grain, editorial yet candid Seoul cafe vibe. Subject: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "a young woman in a Korean minimal cafe",
    badge: "Quick",
    tags: ["cafe", "Seoul", "aesthetic"],
    glowColor: "rgba(167,139,250,0.4)",
  },

  // ── Viral Unboxing ─────────────────────────────────────────────────────────
  {
    id: "tiktok-unboxing-vid",
    title: "TikTok Unboxing",
    category: "Viral Unboxing",
    description: "First-person unboxing reveal moment, viral TikTok style.",
    kind: "video",
    thumb: { from: "#fda4af", to: "#7c3aed", emoji: "📦" },
    promptTemplate:
      "First-person unboxing moment, hands carefully opening packaging revealing the product, smooth slow camera dolly forward, soft daylight, cosy desk setup, satisfying TikTok unboxing vibe, gentle anticipation. Subject: {subject}.",
    defaultAspect: "9:16",
    durationSec: 5,
    requiresUploadedImage: true,
    defaultSubject: "the product",
    badge: "Hot",
    featured: true,
    tags: ["unboxing", "TikTok", "viral"],
    glowColor: "rgba(124,58,237,0.45)",
  },
  {
    id: "unboxing-asmr-luxury",
    title: "ASMR Luxury Reveal",
    category: "Viral Unboxing",
    description: "Slow elegant luxury packaging reveal, ASMR energy.",
    kind: "video",
    thumb: { from: "#1c1917", to: "#ca8a04", emoji: "🎁" },
    promptTemplate:
      "ASMR luxury unboxing video, slow elegant hands gently removing premium packaging layers, tissue paper rustling motion, gold ribbon being pulled, product revealed in dramatic slow-push camera, warm candle-glow lighting, aspirational luxury atmosphere. Subject: {subject}.",
    defaultAspect: "9:16",
    durationSec: 10,
    requiresUploadedImage: true,
    defaultSubject: "the premium product",
    badge: "New",
    tags: ["ASMR", "luxury", "unboxing"],
    glowColor: "rgba(202,138,4,0.4)",
  },

  // ── AI Influencer ──────────────────────────────────────────────────────────
  {
    id: "ai-model-influencer",
    title: "AI Influencer Portrait",
    category: "AI Influencer",
    description: "Photoreal AI influencer headshot, natural and warm.",
    kind: "image",
    thumb: { from: "#c4b5fd", to: "#5b21b6", emoji: "🤖" },
    promptTemplate:
      "Photorealistic AI influencer portrait, late-twenties, friendly genuine smile, soft window light from camera left, natural skin texture with visible pores and tiny imperfections, neutral linen outfit, plain warm beige backdrop, 85mm lens at f/1.8, magazine-quality. Subject character: {subject}.",
    negativeHints: ["plastic skin", "uncanny eyes", "extra fingers", "over-saturated"],
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "a friendly mixed-heritage woman with shoulder-length brown hair",
    badge: "Top Pick",
    featured: true,
    tags: ["AI model", "influencer", "portrait"],
    glowColor: "rgba(91,33,182,0.45)",
  },
  {
    id: "ai-model-asian-studio",
    title: "Asian Model Studio",
    category: "AI Influencer",
    description: "Studio portrait with sharp catchlights, ultra-detailed.",
    kind: "image",
    thumb: { from: "#fafaf9", to: "#525252", emoji: "📸" },
    promptTemplate:
      "Photorealistic Asian female model studio portrait, sharp clean catchlights in the eyes, subtle natural makeup, neutral grey backdrop, 85mm lens at f/2.0, beauty-dish key light camera-left with reflector fill, ultra-detailed skin and hair. Subject: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "an east-Asian woman in her early twenties with a black blazer",
    tags: ["Asian model", "studio", "portrait"],
    glowColor: "rgba(82,82,82,0.4)",
  },
  {
    id: "ai-influencer-talking",
    title: "Talking Influencer Video",
    category: "AI Influencer",
    description: "Subtle micro-expressions, engaging with camera.",
    kind: "video",
    thumb: { from: "#fbcfe8", to: "#9333ea", emoji: "🎤" },
    promptTemplate:
      "Subtle natural micro-expressions of a talking influencer to camera, gentle head movement, occasional blink, slight smile forming and relaxing, eyes engaging the lens, warm vlog lighting, smooth realistic mouth movement. Subject: {subject}.",
    defaultAspect: "9:16",
    durationSec: 5,
    requiresUploadedImage: true,
    defaultSubject: "the person",
    badge: "Pro",
    tags: ["talking", "video", "AI model"],
    glowColor: "rgba(147,51,234,0.45)",
  },

  // ── Documentary Style ─────────────────────────────────────────────────────
  {
    id: "doc-street-photo",
    title: "Documentary Street",
    category: "Documentary Style",
    description: "Gritty documentary street photography, raw authenticity.",
    kind: "image",
    thumb: { from: "#1c1917", to: "#78716c", emoji: "📷" },
    promptTemplate:
      "Documentary street photography style, gritty and authentic, 35mm black and white with subtle silver-halide grain, candid moment captured mid-action, high contrast shadows, urban environment, photojournalism quality, Henri Cartier-Bresson decisive moment aesthetic. Subject: {subject}.",
    negativeHints: ["posed", "studio", "glamorous", "clean"],
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "a candid street scene in a busy city",
    badge: "New",
    tags: ["documentary", "street", "B&W"],
    glowColor: "rgba(120,113,108,0.4)",
  },
  {
    id: "doc-portrait-environmental",
    title: "Environmental Portrait",
    category: "Documentary Style",
    description: "Authentic portrait in natural environment, raw and real.",
    kind: "image",
    thumb: { from: "#292524", to: "#57534e", emoji: "📰" },
    promptTemplate:
      "Environmental portrait documentary photography, subject shown in their natural setting/workspace/environment, shallow depth of field, natural available light, raw honest emotion, National Geographic magazine quality, 35mm film look. Subject: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "a craftsperson in their workshop",
    badge: "Quick",
    tags: ["environmental", "portrait", "raw"],
    glowColor: "rgba(87,83,78,0.4)",
  },

  // ── Drone Cinematic ───────────────────────────────────────────────────────
  {
    id: "drone-sunrise-flyover",
    title: "Sunrise Drone Flyover",
    category: "Drone Cinematic",
    description: "Breathtaking aerial golden hour orbit.",
    kind: "video",
    thumb: { from: "#7c2d12", to: "#fcd34d", emoji: "🚁" },
    promptTemplate:
      "Aerial drone cinematic flyover at golden sunrise, slowly orbiting above a breathtaking landscape, warm amber and orange tones, long shadows stretching across the terrain, ultra-smooth gimbal stabilisation, 4K aerial cinematography, DJI Inspire-quality shot. Location: {subject}.",
    defaultAspect: "16:9",
    durationSec: 5,
    requiresUploadedImage: false,
    defaultSubject: "a mountain valley at sunrise",
    badge: "Top Pick",
    featured: true,
    tags: ["aerial", "sunrise", "drone"],
    glowColor: "rgba(252,211,77,0.4)",
  },
  {
    id: "drone-city-night",
    title: "City Night Drone",
    category: "Drone Cinematic",
    description: "City lights from above, night aerial cinematic.",
    kind: "video",
    thumb: { from: "#020617", to: "#6366f1", emoji: "🌆" },
    promptTemplate:
      "Night aerial drone cinematography of a glittering city skyline, light trails of traffic below, neon building reflections, slow orbit descent, dramatic scale showing urban density, National Geographic documentary quality aerial shot. Location: {subject}.",
    defaultAspect: "16:9",
    durationSec: 5,
    requiresUploadedImage: false,
    defaultSubject: "a modern city skyline at night",
    badge: "New",
    tags: ["night", "city", "aerial"],
    glowColor: "rgba(99,102,241,0.45)",
  },

  // ── Neon Cyberpunk ─────────────────────────────────────────────────────────
  {
    id: "cyber-neon-portrait",
    title: "Neon Cyberpunk Portrait",
    category: "Neon Cyberpunk",
    description: "Neon-lit face, rain-slicked cyberpunk atmosphere.",
    kind: "image",
    thumb: { from: "#020617", to: "#a855f7", emoji: "🌃" },
    promptTemplate:
      "Cyberpunk portrait, neon pink and cyan light painting the face from opposing sides, rain-slicked surface reflections, holographic AR display elements in background, high-tech urban dystopia atmosphere, blade-runner inspired, ultra-detailed with neon wet-pavement reflections. Subject: {subject}.",
    negativeHints: ["natural lighting", "pastoral", "warm tones"],
    defaultAspect: "9:16",
    requiresUploadedImage: false,
    defaultSubject: "a cyberpunk character with neon face paint",
    badge: "Hot",
    featured: true,
    tags: ["neon", "cyberpunk", "portrait"],
    glowColor: "rgba(168,85,247,0.5)",
  },
  {
    id: "cyber-product-hologram",
    title: "Hologram Product",
    category: "Neon Cyberpunk",
    description: "Product shown as neon hologram, sci-fi ad.",
    kind: "image",
    thumb: { from: "#0c4a6e", to: "#22d3ee", emoji: "📡" },
    promptTemplate:
      "Product displayed as a holographic neon projection in a dark cyberpunk space, translucent blue-teal wireframe outlines surrounding the product, floating particle effects, grid floor reflection, futuristic tech advertisement aesthetic. Product: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the product",
    badge: "New",
    tags: ["hologram", "sci-fi", "neon"],
    glowColor: "rgba(34,211,238,0.5)",
  },
  {
    id: "cyber-city-scene",
    title: "Cyberpunk City",
    category: "Neon Cyberpunk",
    description: "Full cyberpunk cityscape, Blade Runner 2049 vibes.",
    kind: "image",
    thumb: { from: "#1e1b4b", to: "#f97316", emoji: "🏙️" },
    promptTemplate:
      "Epic cyberpunk cityscape in heavy rain, towering skyscrapers with neon advertising, flying vehicles leaving light trails, haze and atmospheric depth, inspired by Blade Runner 2049 and Ghost in the Shell, cinematic matte painting quality. Location: {subject}.",
    defaultAspect: "16:9",
    requiresUploadedImage: false,
    defaultSubject: "a futuristic megacity at night",
    badge: "Quick",
    tags: ["cityscape", "sci-fi", "cinematic"],
    glowColor: "rgba(249,115,22,0.4)",
  },

  // ── Studio Lighting Pro ────────────────────────────────────────────────────
  {
    id: "studio-beauty-dish",
    title: "Beauty Dish Pro",
    category: "Studio Lighting Pro",
    description: "Classic beauty dish — crisp catchlights, perfect skin.",
    kind: "image",
    thumb: { from: "#f5f5f4", to: "#44403c", emoji: "💡" },
    promptTemplate:
      "Professional beauty dish studio portrait, large circular catchlights in both eyes, sculpted cheekbone shadows, technically perfect skin texture, tight butterfly lighting pattern, high-fashion beauty editorial quality, Hasselblad H6 digital back aesthetic. Subject: {subject}.",
    negativeHints: ["outdoor light", "soft ambient", "no catchlights"],
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "a model with classic natural beauty",
    badge: "Pro",
    featured: true,
    tags: ["beauty dish", "studio", "portrait"],
    glowColor: "rgba(68,64,60,0.4)",
  },
  {
    id: "studio-clamshell",
    title: "Clamshell Beauty Light",
    category: "Studio Lighting Pro",
    description: "Clamshell softbox setup, zero shadows, ultra-flattering.",
    kind: "image",
    thumb: { from: "#fff7ed", to: "#c2410c", emoji: "🌟" },
    promptTemplate:
      "Classic clamshell beauty lighting setup portrait: large softbox above camera slightly forward + reflector below creating butterfly shadow under nose, zero harsh shadows on skin, classic beauty photography technical excellence, even and flattering illumination. Subject: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "a beauty model in front of a neutral backdrop",
    badge: "New",
    tags: ["clamshell", "beauty", "soft"],
    glowColor: "rgba(194,65,12,0.4)",
  },

  // ── Luxury Perfume Ad ──────────────────────────────────────────────────────
  {
    id: "perfume-floating-bottle",
    title: "Levitating Perfume Bottle",
    category: "Luxury Perfume Ad",
    description: "Levitating bottle, light prisms, pure luxury.",
    kind: "image",
    thumb: { from: "#4c1d95", to: "#fbbf24", emoji: "🌹" },
    promptTemplate:
      "Luxury perfume bottle floating in mid-air, light refraction prisms radiating outward from the glass, golden particles drifting around it, deep purple velvet background, single overhead beam spotlighting the bottle, Chanel and Dior commercial photography aesthetic. Product: {subject}.",
    negativeHints: ["clutter", "props", "casual setting"],
    defaultAspect: "9:16",
    requiresUploadedImage: true,
    defaultSubject: "the perfume bottle",
    badge: "Top Pick",
    featured: true,
    tags: ["perfume", "levitation", "luxury"],
    glowColor: "rgba(251,191,36,0.45)",
  },
  {
    id: "perfume-floral-spill",
    title: "Floral Perfume Editorial",
    category: "Luxury Perfume Ad",
    description: "Flowers and petals cascading around the bottle.",
    kind: "image",
    thumb: { from: "#fdf2f8", to: "#be185d", emoji: "🌺" },
    promptTemplate:
      "Luxury perfume editorial with a cascade of rose and jasmine petals spilling around and over the bottle, soft romantic morning light, delicate dewdrops on petals, deep red and gold color palette, Lancôme and Guerlain advertising aesthetic, editorial magazine quality. Product: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the perfume bottle",
    badge: "New",
    tags: ["floral", "editorial", "romantic"],
    glowColor: "rgba(190,24,93,0.4)",
  },
  {
    id: "perfume-pour-reveal",
    title: "Perfume Pour Video",
    category: "Luxury Perfume Ad",
    description: "Liquid pouring in slow-mo, sensory luxury reveal.",
    kind: "video",
    thumb: { from: "#1c1917", to: "#d97706", emoji: "💫" },
    promptTemplate:
      "Luxury perfume commercial video: slow-motion golden liquid pouring from the bottle neck, thick viscous fluid catching the backlight creating an amber glow, surface tension and droplets caught in perfect ultra-slow motion, cinematic depth of field. Product: {subject}.",
    defaultAspect: "1:1",
    durationSec: 5,
    requiresUploadedImage: true,
    defaultSubject: "the perfume bottle",
    badge: "Pro",
    tags: ["pour", "slow-mo", "video"],
    glowColor: "rgba(217,119,6,0.45)",
  },

  // ── Hand Model Showcase ────────────────────────────────────────────────────
  {
    id: "hand-jewelry-showcase",
    title: "Hand Jewelry Showcase",
    category: "Hand Model Showcase",
    description: "Elegant manicured hand with premium jewelry.",
    kind: "image",
    thumb: { from: "#fef9c3", to: "#a16207", emoji: "🤲" },
    promptTemplate:
      "Hand model jewelry showcase photograph: elegantly posed manicured hands displaying the jewelry piece, soft beauty light from camera-left, clean neutral marble or linen surface, perfect skin and nail presentation, luxury jewelry catalog aesthetic. Jewelry: {subject}.",
    negativeHints: ["rough hands", "harsh shadows", "busy background"],
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the jewelry item",
    badge: "Top Pick",
    featured: true,
    tags: ["hands", "jewelry", "luxury"],
    glowColor: "rgba(161,98,7,0.4)",
  },
  {
    id: "hand-product-editorial",
    title: "Premium Product Hold",
    category: "Hand Model Showcase",
    description: "Premium hand holding product for luxury editorial.",
    kind: "image",
    thumb: { from: "#f5f5f4", to: "#78716c", emoji: "👋" },
    promptTemplate:
      "Premium hand model product showcase: elegantly manicured female hand holding or presenting the product from a slight angle, clean white or pale backdrop, professional product photography lighting, luxury brand e-commerce quality. Product: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the product",
    badge: "New",
    tags: ["hand model", "editorial", "product"],
    glowColor: "rgba(120,113,108,0.4)",
  },
  {
    id: "hand-nail-art",
    title: "Nail Art Macro",
    category: "Hand Model Showcase",
    description: "Ultra-macro nail art editorial, vivid detail.",
    kind: "image",
    thumb: { from: "#fdf4ff", to: "#a855f7", emoji: "💅" },
    promptTemplate:
      "Ultra-macro nail art editorial photograph, extreme close-up of perfectly shaped nails with intricate nail art design, glitter catching light, soft blurred background, ring light catchlight in each nail, beauty editorial quality. Subject: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "gel nails with holographic chrome nail art",
    badge: "Quick",
    tags: ["nail", "macro", "beauty"],
    glowColor: "rgba(168,85,247,0.4)",
  },

  // ── Ecommerce Conversion Ads ───────────────────────────────────────────────
  {
    id: "ecom-white-clean",
    title: "Ecommerce White Clean",
    category: "Ecommerce Conversion Ads",
    description: "Marketplace pure white, listing-perfect standards.",
    kind: "image",
    thumb: { from: "#fff7ed", to: "#ea580c", emoji: "🛒" },
    promptTemplate:
      "Ecommerce marketplace product photo: pure #FFFFFF background, perfectly centered product, clear front-facing angle, even softbox lighting from both sides, no harsh shadows, ecommerce listing standard, sharp text legibility on packaging if present. Product: {subject}.",
    negativeHints: ["coloured background", "props", "lifestyle styling"],
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the product",
    badge: "Quick",
    tags: ["white bg", "marketplace", "clean"],
    glowColor: "rgba(234,88,12,0.4)",
  },
  {
    id: "ecom-lifestyle-in-use",
    title: "Lifestyle In-Use Shot",
    category: "Ecommerce Conversion Ads",
    description: "Product being used in real environment, conversion booster.",
    kind: "image",
    thumb: { from: "#ecfdf5", to: "#059669", emoji: "📦" },
    promptTemplate:
      "Ecommerce conversion lifestyle photo: product shown in use in its natural setting, aspirational home environment, warm natural light, relatable but aspirational scene, person interacting naturally with product (hands only if shown), high product visibility. Product: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: true,
    defaultSubject: "the product",
    badge: "Hot",
    featured: true,
    tags: ["lifestyle", "in-use", "conversion"],
    glowColor: "rgba(5,150,105,0.4)",
  },
  {
    id: "ecom-bundle-flatlay",
    title: "Bundle Flat Lay",
    category: "Ecommerce Conversion Ads",
    description: "Full product bundle overhead, shows complete value.",
    kind: "image",
    thumb: { from: "#f0f9ff", to: "#0369a1", emoji: "🎯" },
    promptTemplate:
      "Ecommerce bundle flat lay, all products in the set arranged aesthetically overhead on a clean pale surface, equal spacing, even lighting with zero harsh shadows, each item clearly visible, brand consistency in arrangement. Products: {subject}.",
    defaultAspect: "1:1",
    requiresUploadedImage: false,
    defaultSubject: "a bundle of complementary products arranged neatly",
    badge: "New",
    tags: ["bundle", "flatlay", "ecommerce"],
    glowColor: "rgba(3,105,161,0.4)",
  },
];

export function getPreset(id: string): ServerPreset | undefined {
  return PRESETS.find((p) => p.id === id);
}

/** Sanitised view sent to the client. NEVER includes promptTemplate or negativeHints. */
export function sanitizePreset(p: ServerPreset) {
  return {
    id: p.id,
    title: p.title,
    category: p.category,
    description: p.description,
    kind: p.kind,
    thumb: p.thumb,
    defaultAspect: p.defaultAspect,
    durationSec: p.durationSec,
    requiresUploadedImage: p.requiresUploadedImage,
    badge: p.badge,
    featured: p.featured,
    tags: p.tags,
    glowColor: p.glowColor,
  };
}

/**
 * Compose the final prompt from the preset + optional user text.
 * - {subject} is replaced with the user's text (or the preset's default).
 * - Negative hints are folded into the positive as `Avoid: …`.
 */
export function buildFinalPrompt(p: ServerPreset, userText?: string | null): string {
  const subject = (userText && userText.trim()) || p.defaultSubject;
  let prompt = p.promptTemplate.replace(/\{subject\}/g, subject).trim();
  if (p.negativeHints && p.negativeHints.length) {
    prompt += ` Avoid: ${p.negativeHints.join(", ")}.`;
  }
  return prompt;
}

/**
 * Advanced variant — incorporates optional camera motion, lighting override,
 * and extra negative phrases sent from the frontend settings panel.
 */
export function buildFinalPromptAdvanced(
  p: ServerPreset,
  userText?: string | null,
  opts?: {
    cameraMotion?: string;
    lightingOverride?: string;
    negativePhraseExtra?: string;
  },
): string {
  let prompt = buildFinalPrompt(p, userText);
  if (opts?.cameraMotion && opts.cameraMotion.trim()) {
    prompt += ` Camera movement: ${opts.cameraMotion.trim()}.`;
  }
  if (opts?.lightingOverride && opts.lightingOverride.trim()) {
    prompt += ` Lighting override: ${opts.lightingOverride.trim()}.`;
  }
  if (opts?.negativePhraseExtra && opts.negativePhraseExtra.trim()) {
    prompt += ` Also avoid: ${opts.negativePhraseExtra.trim()}.`;
  }
  return prompt;
}
