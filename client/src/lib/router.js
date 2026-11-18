import { useEffect, useState } from "react";

// A tiny path router: the app has five screens, so no routing library.
// Vercel's rewrite (vercel.json) and Vite's dev server both serve index.html
// for unknown paths, so deep links like /admin work on a fresh load.
const NAV_EVENT = "paperhire:navigate";

export function navigate(path, { replace = false } = {}) {
  if (path === window.location.pathname) return;
  window.history[replace ? "replaceState" : "pushState"]({}, "", path);
  window.dispatchEvent(new Event(NAV_EVENT));
  window.scrollTo({ top: 0 });
}

export function usePath() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const update = () => setPath(window.location.pathname);
    window.addEventListener("popstate", update);
    window.addEventListener(NAV_EVENT, update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener(NAV_EVENT, update);
    };
  }, []);
  return path;
}

// Internal link: plain <a> for accessibility and middle-click, routed in-app on click.
export function linkProps(path) {
  return {
    href: path,
    onClick: (e) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      e.preventDefault();
      navigate(path);
    }
  };
}
