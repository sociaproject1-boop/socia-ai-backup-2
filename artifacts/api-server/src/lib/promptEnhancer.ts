export const STYLE_MAP: Record<string, string> = {
  Cinematic:
    "cinematic color grading, anamorphic 2.39:1 lens, dramatic volumetric lighting, film grain, Hollywood blockbuster quality",
  Anime:
    "Studio Ghibli quality anime art, vibrant saturated colors, detailed cel shading, Japanese animation masterpiece, intricate character design",
  "3D Render":
    "Octane render, photorealistic CGI, subsurface scattering, global illumination, ray-traced reflections, Cinema 4D quality",
  Photoreal:
    "shot on Sony A7R IV, 85mm f/1.4 lens, natural bokeh, golden hour light, RAW format, professional photography",
  Surreal:
    "dreamlike surrealism, impossible physics, Salvador Dali influence, otherworldly atmosphere, ethereal floating elements",
  Glitch:
    "digital glitch art, datamoshing, chromatic aberration, CRT scan lines, corrupted pixel aesthetic",
  "Hyper Realistic":
    "hyperrealistic photography, Phase One camera, 100 megapixel sensor, ultra sharp focus, natural skin texture with visible pores, photojournalism quality",
  "Luxury Ad":
    "luxury brand advertising campaign, aspirational lifestyle photography, premium product focus, high-key studio lighting, Dior and Chanel aesthetic quality",
  "Fashion Editorial":
    "Vogue magazine editorial spread, avant-garde high fashion styling, dramatic editorial lighting, supermodel aesthetic, Paris fashion week runway quality",
  "Pixar 3D":
    "Pixar Studios 3D animation quality, heartwarming character design, subsurface scattering skin, soft global illumination, ray-traced Pixar-style environment",
  "Korean Aesthetic":
    "Korean aesthetic photography, soft pastel tones, natural dewy skincare glow, minimalist composition, K-beauty and K-drama vibes, warm luminous skin",
  "Dark Moody":
    "dark moody cinematic atmosphere, dramatic noir lighting, deep inky shadows, desaturated palette, psychological thriller mood, David Fincher style",
  Cyberpunk:
    "cyberpunk 2077 aesthetics, neon city lights, holographic UI elements, rain-slicked reflective streets, dystopian future, Blade Runner 2049 atmosphere",
  Minimalist:
    "ultra minimalist design, clean white seamless background, generous negative space, Scandinavian design sensibility, elegant simplicity, breathing room",
  "Street Photo":
    "street photography style, 35mm Kodak Portra 400 film grain, candid authentic moment, Leica M lens aesthetic, raw urban life, decisive moment",
  "Product Photo":
    "professional product photography, white seamless background, perfect 3-point lighting setup, commercial catalog quality, e-commerce hero shot, crisp clean shadows",
  "Jewelry Macro":
    "extreme macro jewelry photography, luxury pieces on velvet surface, specular highlights on gemstones, razor-sharp focus, Cartier Tiffany catalog quality",
  "Beauty Campaign":
    "beauty campaign photography, flawless glowing skin, professional makeup artistry, bright clamshell lighting, Maybelline L'Oreal campaign quality, commercial beauty",
  "Magazine Cover":
    "magazine cover quality portrait, celebrity editorial photography, dramatic Rembrandt lighting, bold graphic composition, newsstand visual impact, TIME Vogue quality",
  Futuristic:
    "futuristic sci-fi aesthetic, holographic interface elements, chrome and glass surfaces, advanced biopunk technology, year 2150 design language, speculative architecture",
  Dreamy:
    "dreamy ethereal soft atmosphere, pastel bokeh background, flower petals floating, warm golden haze, fairy tale mood, soft romantic studio lighting",
  "Vintage Film":
    "vintage analog film photography, Kodak Portra 400 grain texture, warm color shift, light leaks on edges, nostalgic faded tones, 1970s Polaroid feel",
  "AI Influencer":
    "AI influencer portrait, perfect facial symmetry, digital-native avatar aesthetic, hyper-detailed skin texture, social media optimized ring light beauty setup",
  "TikTok Viral":
    "TikTok viral content aesthetic, punchy dynamic composition, bold saturated colors, trend-worthy visual style, Gen-Z optimized energetic look, trending right now",
  "Apple Commercial":
    "Apple product commercial minimalism, pure white environment, perfect geometry drop shadows, aspirational lifestyle, iPhone Mac Studio aesthetic quality",
  "Nike Ad":
    "Nike advertising campaign energy, dynamic motion blur, athlete power and determination, bold graphic negative space for typography, inspirational sports photography",
};

const LIGHTING_MAP: Record<string, string> = {
  Natural: "soft natural daylight, outdoor ambient lighting",
  "Golden Hour": "golden hour warm light, magic hour sunset warm tones",
  Studio: "professional studio strobe lighting, softbox diffusion, even shadows",
  "Blue Hour": "cool blue hour twilight, atmospheric dusk tones",
  Neon: "vibrant neon glow lighting, colorful LED atmosphere, saturated colored light",
  Dramatic: "dramatic chiaroscuro lighting, high contrast deep shadows, Caravaggio style",
};

const LENS_MAP: Record<string, string> = {
  "24mm Wide": "24mm ultra wide angle lens, expansive environmental perspective",
  "35mm Street": "35mm lens, street photography natural perspective, slightly wide",
  "50mm Standard": "50mm standard lens, natural human eye perspective, balanced",
  "85mm Portrait": "85mm portrait lens, beautiful smooth bokeh, face compression flattery",
  "100mm Macro": "100mm macro lens, extreme close-up fine detail, razor sharp",
  "200mm Tele": "200mm telephoto lens, compressed perspective, isolated subject from background",
};

const REALISM_SUFFIX =
  "ultra realistic, photorealistic, 8K resolution, natural lighting, " +
  "professional composition, award-winning photography, masterpiece quality";

export function enhancePrompt(rawPrompt: string, style?: string): string {
  let prompt = rawPrompt.trim();
  if (!prompt) return "";

  prompt = prompt.charAt(0).toUpperCase() + prompt.slice(1).replace(/[,;.!?]+$/, "");
  prompt = prompt
    .replace(/\bi\b/g, "I")
    .replace(/\bim\b/g, "I'm")
    .replace(/\bwont\b/g, "won't")
    .replace(/\bcant\b/g, "can't");

  const styleTag = style && STYLE_MAP[style] ? `, ${STYLE_MAP[style]}` : "";
  return `${prompt}${styleTag}, ${REALISM_SUFFIX}`;
}

export function enhancePromptAdvanced(
  rawPrompt: string,
  opts: {
    style?: string;
    lightingStyle?: string;
    cameraLens?: string;
    negativePrompt?: string;
  },
): string {
  let prompt = enhancePrompt(rawPrompt, opts.style);

  if (opts.lightingStyle && LIGHTING_MAP[opts.lightingStyle]) {
    prompt += `, ${LIGHTING_MAP[opts.lightingStyle]}`;
  }
  if (opts.cameraLens && LENS_MAP[opts.cameraLens]) {
    prompt += `, ${LENS_MAP[opts.cameraLens]}`;
  }
  if (opts.negativePrompt?.trim()) {
    prompt += `. Strictly avoid: ${opts.negativePrompt.trim()}`;
  }

  return prompt;
}

export function expandShortPrompt(prompt: string): string {
  const wordCount = prompt.trim().split(/\s+/).length;
  if (wordCount >= 8) return prompt;
  return (
    `${prompt}, a stunning scene with professional studio lighting, ` +
    `detailed environment, rich textures, cinematic composition`
  );
}
