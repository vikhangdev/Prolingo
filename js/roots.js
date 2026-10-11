/* Gợi ý "tách gốc từ" để ghi nhớ từ vựng (giữ từ bản cũ) */
const ROOTS = [
  ["p", "cyber", "mạng, không gian số"], ["p", "micro", "nhỏ"], ["p", "macro", "lớn"], ["p", "multi", "nhiều"],
  ["p", "inter", "giữa, liên"], ["p", "auto", "tự động"], ["p", "crypto", "mật mã, ẩn"], ["p", "bio", "sinh học"],
  ["p", "tele", "từ xa"], ["p", "data", "dữ liệu"], ["p", "net", "mạng"], ["p", "web", "web, mạng"],
  ["p", "geo", "địa lý"], ["p", "re", "lại"], ["p", "de", "bỏ, giảm"], ["p", "sub", "dưới"],
  ["s", "ware", "phần (mềm/cứng)"], ["s", "able", "có thể"], ["s", "ability", "khả năng"], ["s", "ization", "sự hóa"],
  ["s", "ment", "sự, việc"], ["s", "tion", "sự, quá trình"], ["s", "ing", "đang, việc"], ["s", "ify", "làm cho"],
  ["s", "ize", "hóa"], ["s", "less", "không có"], ["s", "ful", "đầy"], ["s", "er", "người/thiết bị làm"],
  ["s", "ity", "tính chất"],
  ["i", "code", "mã"], ["i", "chain", "chuỗi"], ["i", "block", "khối"], ["i", "cloud", "đám mây"],
  ["i", "secur", "an toàn"], ["i", "graph", "đồ thị, ghi"], ["i", "scal", "quy mô"],
];

export function rootTip(en) {
  if (/[\s\/\(\)]/.test(en) || /^-|-$|\/o$/.test(en)) return null;
  const w = en.toLowerCase().replace(/^-|-$/g, "");
  const hits = [];
  ROOTS.forEach(([t, r, m]) => {
    if (w === r) return;
    if ((t === "p" && w.startsWith(r)) || (t === "s" && w.endsWith(r)) || (t === "i" && w.includes(r))) hits.push([r, m, t]);
  });
  if (!hits.length) return null;
  const seen = [], out = [];
  hits.sort((a, b) => b[0].length - a[0].length).forEach((h) => {
    if (seen.some((s) => s.includes(h[0]) || h[0].includes(s))) return;
    seen.push(h[0]);
    out.push(h);
  });
  return "Tách gốc từ: " + out.slice(0, 3).map((h) => (h[2] === "s" ? "-" : "") + h[0] + (h[2] === "p" ? "-" : "") + " = " + h[1]).join(" · ");
}
