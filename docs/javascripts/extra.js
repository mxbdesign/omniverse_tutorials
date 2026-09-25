/* ==========================================================================
   Omniverse Intern Docs — extra.js
   Tracks visited tutorial pages via a cookie and marks them "completed"
   in the Material sidebar navigation.

   Works with MkDocs Material's "instant loading" (navigation.instant),
   which swaps page content via fetch/history API instead of full page
   reloads — so logic is wrapped in a function and re-run on the
   document$ observable if instant loading is enabled. Falls back to a
   plain DOMContentLoaded listener otherwise.
   ========================================================================== */

(function () {
  "use strict";

  const COOKIE_NAME = "omniverse_intern_progress";
  const COOKIE_MAX_AGE_SECONDS = 2592000; // exactly 30 days

  /**
   * Normalize a URL to a path-only key so cookie entries stay stable
   * regardless of host/protocol changes (e.g. localhost vs. prod domain).
   */
  function normalizePath(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      // Strip trailing slash (except root) and any hash fragment
      let path = parsed.pathname.replace(/\/index\.html$/, "/");
      if (path.length > 1 && path.endsWith("/")) {
        path = path.slice(0, -1);
      }
      return path;
    } catch (e) {
      return url;
    }
  }

  /** Read a cookie value by name. Returns "" if not found. */
  function getCookie(name) {
    const match = document.cookie.match(
      new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)")
    );
    return match ? decodeURIComponent(match[1]) : "";
  }

  /** Write the cookie with a 30-day (2592000s) max-age. */
  function setCookie(name, value) {
    document.cookie =
      name +
      "=" +
      encodeURIComponent(value) +
      "; max-age=" +
      COOKIE_MAX_AGE_SECONDS +
      "; path=/" +
      "; SameSite=Lax";
  }

  /** Get the current list of visited paths as a de-duplicated array. */
  function getVisitedList() {
    const raw = getCookie(COOKIE_NAME);
    if (!raw) return [];
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /**
   * Append the current page to the progress cookie if not already present.
   * Cookie stores a comma-separated list of normalized paths.
   */
  function recordVisit() {
    const currentPath = normalizePath(window.location.href);
    const visited = getVisitedList();

    if (!visited.includes(currentPath)) {
      visited.push(currentPath);
      setCookie(COOKIE_NAME, visited.join(","));
    } else {
      // Refresh the cookie's expiry on every visit ("rolling" 30 days)
      setCookie(COOKIE_NAME, visited.join(","));
    }

    return visited;
  }

  /**
   * Walk every link in the sidebar navigation and tag matching entries
   * with `.completed-step` if their href is in the visited list.
   */
  function markCompletedSteps(visited) {
    const visitedSet = new Set(visited);

    // Material's primary nav lives under one of these selectors depending
    // on version/layout; query broadly to stay compatible.
    const navLinks = document.querySelectorAll(
      ".md-nav--primary .md-nav__link, .md-sidebar--primary a.md-nav__link"
    );

    navLinks.forEach((link) => {
      const href = link.getAttribute("href");
      if (!href) return;

      const linkPath = normalizePath(link.href || href);

      if (visitedSet.has(linkPath)) {
        link.classList.add("completed-step");
      } else {
        link.classList.remove("completed-step");
      }
    });
  }

  /** Optional: render a lightweight progress bar if a mount point exists. */
  function renderProgressBar(visited) {
    const mount = document.getElementById("omniverse-progress");
    if (!mount) return;

    const totalLinks = document.querySelectorAll(
      ".md-nav--primary .md-nav__link"
    ).length;
    const completedCount = visited.length;
    const pct = totalLinks
      ? Math.min(100, Math.round((completedCount / totalLinks) * 100))
      : 0;

    mount.innerHTML =
      '<div class="omniverse-progress-label">Mission Progress: ' +
      pct +
      '%</div>' +
      '<div class="omniverse-progress-track">' +
      '<div class="omniverse-progress-fill" style="width: ' +
      pct +
      '%;"></div>' +
      "</div>";
  }

  /** Main entry point run on every page load / instant-nav transition. */
  function init() {
    const visited = recordVisit();
    markCompletedSteps(visited);
    renderProgressBar(visited);
  }

  // --- Wire up execution ---------------------------------------------------
  // If Material's instant loading is enabled (navigation.instant), the page
  // never fully reloads on internal navigation, so we hook document$.
  if (window.document$ && typeof window.document$.subscribe === "function") {
    window.document$.subscribe(function () {
      init();
    });
  } else {
    // Standard multi-page navigation
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }
})();
