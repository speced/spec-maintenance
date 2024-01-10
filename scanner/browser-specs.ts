import z from 'zod';

// See https://github.com/w3c/browser-specs/blob/main/schema/index.json for the authoritative schema.
const WebSpecs = z.object({
  categories: z.enum(["browser"]).array(),
  standing: z.enum(["good", "pending", "discontinued"]),
  nightly: z.object({
    repository: z.string().url().optional(),
  })
}).array();

export type WebSpecs = z.infer<typeof WebSpecs>;
export type BrowserSpecs = WebSpecs;

export async function webSpecs() {
  const allSpecs = WebSpecs.parse(
    await fetch('https://w3c.github.io/browser-specs/index.json')
      .then(response => response.json()))
  return allSpecs.filter(spec => spec.standing !== "discontinued");
}

export async function browserSpecs() {
  const allSpecs = await webSpecs();
  return allSpecs.filter(spec => spec.categories.includes("browser"));
}
