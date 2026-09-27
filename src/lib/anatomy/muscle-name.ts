export function englishPartName(raw: string): string {
  let name = raw.replace(/_\d+$/, "").replace(/[()]/g, "");
  const right = /\.r$/i.test(name) || /_r$/i.test(name);
  const left = /\.l$/i.test(name) || /_l$/i.test(name);
  name = name
    .replace(/\.r$|\.l$/i, "")
    .replace(/_r$|_l$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+muscle\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (right && !/\bright\b/i.test(name)) return `Right ${name}`;
  if (left && !/\bleft\b/i.test(name)) return `Left ${name}`;
  return name;
}
