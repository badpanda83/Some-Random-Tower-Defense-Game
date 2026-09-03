import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";

const outputDirectory = join(process.cwd(), "apps", "web", "dist");
const forbiddenText = [
  "Developer tools",
  "Grant test resources",
  "Confirm test grant",
  "TEST / DEVELOPMENT",
  "Test mission gold: 10,000",
  "dubious-realm-development-tools",
  "developer-tools",
  "developer-mission-badge",
];
const searchableExtensions = new Set([".css", ".html", ".js", ".json"]);

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? filesBelow(path) : [path];
      }),
    )
  ).flat();
}

const files = (await filesBelow(outputDirectory)).filter((file) =>
  searchableExtensions.has(extname(file)),
);
const leaks = [];
for (const file of files) {
  const content = await readFile(file, "utf8");
  for (const forbidden of forbiddenText) {
    if (content.includes(forbidden)) {
      leaks.push(`${forbidden} in ${file}`);
    }
  }
}

if (leaks.length > 0) {
  throw new Error(
    `Production output contains development-tool artifacts:\n${leaks.join("\n")}`,
  );
}

console.log(
  "Production output contains no development-tool UI or storage code.",
);
