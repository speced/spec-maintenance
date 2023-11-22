import z from 'zod';

const BrowserSpecs = z.object({
  nightly: z.object({
    repository: z.string().url().optional(),
  })
}).array();

export type BrowserSpecs = z.infer<typeof BrowserSpecs>;

export async function browserSpecs() {
  return BrowserSpecs.parse(
    await fetch('https://raw.githubusercontent.com/w3c/browser-specs/browser-specs%40latest/index.json'
    ).then(response => response.json()));
}
