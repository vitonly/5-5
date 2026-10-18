/**
 * Подсветка текущего пункта меню.
 *
 * Раньше query-часть ссылки отбрасывалась, и на /profile подсвечивался пункт «Ачивки»
 * (/profile?tab=achievements). Теперь пункт с параметрами активен, только если параметры совпадают,
 * а пункт без параметров не активен, если в меню есть более точный пункт с теми же параметрами.
 */
export function isNavActive(
  pathname: string,
  search: URLSearchParams | null,
  href: string,
  siblings: string[] = []
): boolean {
  const [path, query = ""] = href.split("?");
  const samePath =
    path === "/" || path === "/admin"
      ? pathname === path
      : pathname === path || pathname.startsWith(path + "/");
  if (!samePath) return false;

  const want = new URLSearchParams(query);
  if ([...want.keys()].length) {
    for (const [k, v] of want) if (search?.get(k) !== v) return false;
    return true;
  }
  // Пункт без параметров уступает соседу с тем же путём, у которого параметры совпали
  return !siblings.some((s) => s !== href && s.split("?")[0] === path && s.includes("?") && isNavActive(pathname, search, s));
}
