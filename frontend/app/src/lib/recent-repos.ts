// Tracks most-recently-opened repos (by id) in localStorage, so the picker grids
// can float the last-clicked repo to the front — handy once you have many.
const KEY = "rp-recent-repos";

export function getRecentOrder(): number[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "number") : [];
  } catch {
    return [];
  }
}

export function recordRecentRepo(id: number): void {
  try {
    const next = [id, ...getRecentOrder().filter((x) => x !== id)].slice(0, 50);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
