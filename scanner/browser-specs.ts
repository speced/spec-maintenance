import z from 'zod';

const WebSpecs = z.object({
  categories: z.enum(["browser"]).array(),
  nightly: z.object({
    repository: z.string().url().optional(),
  })
}).array();

export type WebSpecs = z.infer<typeof WebSpecs>;
export type BrowserSpecs = WebSpecs;

export async function webSpecs() {
  return WebSpecs.parse(
    await fetch('https://w3c.github.io/browser-specs/index.json'
    ).then(response => response.json()));
}

export async function browserSpecs() {
  const allSpecs = await webSpecs();
  return allSpecs.filter(spec => spec.categories.includes("browser"));
}
