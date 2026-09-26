export function englishBoneName(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "Bones") return "";
  const right = /\.r\b/i.test(trimmed);
  const left = /\.l\b/i.test(trimmed);
  let name = trimmed.replace(/\.r\.?$/i, "").replace(/\.l\.?$/i, "").trim();
  name = name.replace(/\b2d\b/gi, "2nd").replace(/\b3d\b/gi, "3rd");
  if (!name) return "";
  if (right && !/\bright\b/i.test(name)) return `Right ${name}`;
  if (left && !/\bleft\b/i.test(name)) return `Left ${name}`;
  return name;
}
