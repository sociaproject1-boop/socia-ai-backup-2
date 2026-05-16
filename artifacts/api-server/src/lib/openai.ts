import { generateImageBuffer, editImages } from "@workspace/integrations-openai-ai-server/image";
import { openai } from "@workspace/integrations-openai-ai-server";

/**
 * True image-to-image via gpt-image-1's edit endpoint.
 * `imageFilePath` must point to a local file (PNG preferred). Returns PNG bytes.
 */
export async function editImageWithPrompt(
  imageFilePath: string,
  prompt: string,
): Promise<Buffer> {
  return editImages([imageFilePath], prompt);
}

type ImageSize = "1024x1024" | "1024x1536" | "1536x1024";

/** Maps aspect ratio string to gpt-image-1 supported sizes */
function sizeFromAspect(aspect: string, quality: "standard" | "hd"): ImageSize {
  if (aspect === "9:16") return "1024x1536";
  if (aspect === "16:9") return "1536x1024";
  return "1024x1024";
}

/**
 * Generates a high-quality image using gpt-image-1.
 * Returns a Node.js Buffer (PNG).
 */
export async function generateImage(
  prompt: string,
  aspect: string,
  quality: "standard" | "hd" = "standard",
): Promise<Buffer> {
  const size = sizeFromAspect(aspect, quality);
  return generateImageBuffer(prompt, size);
}

/**
 * Uses gpt-5-mini to intelligently expand a short prompt into a detailed,
 * photorealistic scene description with lighting, camera, and texture cues.
 * Falls back to the raw prompt if enhancement fails.
 */
export async function expandPromptWithAI(
  rawPrompt: string,
  style: string,
): Promise<string> {
  const styleHint = style
    ? ` Visual style: ${style}.`
    : "";

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-5-mini",
      max_completion_tokens: 250,
      messages: [
        {
          role: "system",
          content:
            "You are an expert AI image prompt engineer specializing in photorealistic imagery. " +
            "Expand the user's idea into a highly detailed prompt optimized for gpt-image-1. " +
            "Include: camera lens (e.g. 85mm), lighting quality, depth of field, skin texture realism, " +
            "color grading, time of day, atmosphere, and compositional framing." +
            styleHint +
            " Return ONLY the improved prompt — no preamble, no explanation. Max 180 words.",
        },
        {
          role: "user",
          content: rawPrompt,
        },
      ],
    });
    return res.choices[0]?.message?.content?.trim() || rawPrompt;
  } catch {
    return rawPrompt;
  }
}
