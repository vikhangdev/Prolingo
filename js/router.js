/* Router rất nhỏ dùng #hash (hợp với GitHub Pages, không cần cấu hình server) */
const routes = [];
let notFound = () => {};
let before = () => true;
let token = 0;

export function route(pattern, handler) {
  const keys = [];
  const re = new RegExp(
    "^" + pattern.replace(/\/:(\w+)(\?)?/g, (_, k, opt) => { keys.push(k); return opt ? "(?:/([^/]+))?" : "/([^/]+)"; }) + "/?$"
  );
  routes.push({ re, keys, handler, pattern });
}
export const onNotFound = (fn) => { notFound = fn; };
export const beforeEach = (fn) => { before = fn; };
export const path = () => (location.hash.replace(/^#/, "") || "/").split("?")[0];
export const go = (p) => { if (path() === p) resolve(); else location.hash = "#" + p; };

export async function resolve() {
  const p = path();
  const my = ++token;
  for (const r of routes) {
    const m = r.re.exec(p);
    if (!m) continue;
    const params = {};
    r.keys.forEach((k, i) => (params[k] = m[i + 1] ? decodeURIComponent(m[i + 1]) : undefined));
    if ((await before(p, r)) === false) return;
    if (my !== token) return;
    return r.handler(params, () => my === token); // tham số 2: "còn là trang hiện tại?"
  }
  notFound(p);
}
export const startRouter = () => { addEventListener("hashchange", resolve); return resolve(); };
