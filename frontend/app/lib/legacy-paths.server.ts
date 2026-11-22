// Exact legacy addresses may point only to their current local pages.
const legacyPaths = new Map([
  ["/archives", "/archive"],
]);

export function legacyDestination(pathname: string) {
  return legacyPaths.get(pathname.replace(/\/$/, ""));
}
