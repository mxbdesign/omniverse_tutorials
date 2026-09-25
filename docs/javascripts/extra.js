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

/* ==========================================================================
   Site Gate: password + drag-and-drop triangle puzzle
   Runs once per browser (until the unlock cookie expires). NOT real
   security — this is entirely client-side, so the password and the
   unlock logic are visible to anyone who opens dev tools. Use only as
   a light, fun "earn your way in" gate for interns, never for content
   that actually needs to stay private.
   ========================================================================== */
(function () {
  "use strict";

  const UNLOCK_COOKIE = "omniverse_site_unlocked";
  const UNLOCK_MAX_AGE_SECONDS = 31536000; // ~1 year — "just once" in practice

  // SHA-256 hash of the password, so the plaintext at least isn't sitting
  // in the file as a literal string. Still fully bypassable via dev tools —
  // this only raises the bar slightly above "read it straight off the page".
  // To set your own password: run this in any browser console —
  //   crypto.subtle.digest("SHA-256", new TextEncoder().encode("yourpassword"))
  //     .then(buf => console.log(Array.from(new Uint8Array(buf))
  //       .map(b => b.toString(16).padStart(2, "0")).join("")));
  // then paste the resulting hex string below.
  const PASSWORD_HASH_HEX =
    "REPLACE_WITH_YOUR_OWN_SHA256_HEX_HASH";

  // 6-piece triangle tangram. Each piece's home {x, y} is its target
  // top-left position (px) within the PUZZLE_W x PUZZLE_H composite.
  // clip is a CSS clip-path polygon carving the triangle out of that box.
  const PUZZLE_W = 200;
  const PUZZLE_H = 300;
  const SNAP_TOLERANCE = 16; // px

  const PIECES = [
    { id: "L1", x: 0, y: 0, w: 100, h: 300, clip: "polygon(0% 0%, 100% 0%, 0% 100%)" },
    { id: "L2", x: 0, y: 0, w: 100, h: 300, clip: "polygon(100% 0%, 100% 100%, 0% 100%)" },
    { id: "R1", x: 100, y: 0, w: 100, h: 300, clip: "polygon(0% 0%, 100% 0%, 50% 50%)" },
    { id: "R2", x: 100, y: 0, w: 100, h: 300, clip: "polygon(100% 0%, 100% 100%, 50% 50%)" },
    { id: "R3", x: 100, y: 0, w: 100, h: 300, clip: "polygon(100% 100%, 0% 100%, 50% 50%)" },
    { id: "R4", x: 100, y: 0, w: 100, h: 300, clip: "polygon(0% 100%, 0% 0%, 50% 50%)" }
  ];

  function getCookie(name) {
    const match = document.cookie.match(
      new RegExp("(?:^|; )" + name.replace(/([.$?*|{}()[\]\\/+^])/g, "\\$1") + "=([^;]*)")
    );
    return match ? decodeURIComponent(match[1]) : "";
  }

  function setCookie(name, value, maxAge) {
    document.cookie =
      name + "=" + encodeURIComponent(value) +
      "; max-age=" + maxAge + "; path=/; SameSite=Lax";
  }

  async function sha256Hex(text) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  function buildOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "omniverse-gate";
    overlay.innerHTML = `
      <div class="gate-card">
        <h2 class="gate-title">Access Restricted</h2>
        <p class="gate-subtitle">Reassemble the mark, then enter the passphrase.</p>

        <div class="gate-puzzle-wrap">
          <div class="gate-puzzle-target" id="gate-target" style="width:${PUZZLE_W}px;height:${PUZZLE_H}px;"></div>
          <div class="gate-puzzle-tray" id="gate-tray"></div>
        </div>

        <form id="gate-form" class="gate-form" autocomplete="off">
          <input type="password" id="gate-password" class="gate-input" placeholder="Passphrase" disabled />
          <button type="submit" class="gate-submit" disabled>Enter</button>
        </form>
        <p class="gate-error" id="gate-error" hidden>Puzzle incomplete or passphrase incorrect.</p>
      </div>
    `;
    document.body.appendChild(overlay);
    document.body.classList.add("gate-locked");
    return overlay;
  }

  function initPuzzle(overlay) {
    const target = overlay.querySelector("#gate-target");
    const tray = overlay.querySelector("#gate-tray");
    const passwordInput = overlay.querySelector("#gate-password");
    const submitBtn = overlay.querySelector(".gate-submit");

    let solvedCount = 0;
    const pieceEls = [];

    PIECES.forEach((piece) => {
      const el = document.createElement("div");
      el.className = "gate-piece";
      el.style.width = piece.w + "px";
      el.style.height = piece.h + "px";
      el.style.clipPath = piece.clip;

      // Scatter starting position randomly within the tray area
      const scrambleX = Math.random() * 220;
      const scrambleY = Math.random() * (PUZZLE_H - piece.h) + PUZZLE_H + 20;
      el.style.left = scrambleX + "px";
      el.style.top = scrambleY + "px";

      el.dataset.homeX = piece.x;
      el.dataset.homeY = piece.y;
      el.dataset.solved = "false";

      let dragging = false;
      let offsetX = 0;
      let offsetY = 0;

      el.addEventListener("pointerdown", (e) => {
        if (el.dataset.solved === "true") return;
        dragging = true;
        el.setPointerCapture(e.pointerId);
        const rect = el.getBoundingClientRect();
        offsetX = e.clientX - rect.left;
        offsetY = e.clientY - rect.top;
        el.classList.add("gate-piece--dragging");
      });

      el.addEventListener("pointermove", (e) => {
        if (!dragging) return;
        const wrapRect = tray.parentElement.getBoundingClientRect();
        el.style.left = e.clientX - wrapRect.left - offsetX + "px";
        el.style.top = e.clientY - wrapRect.top - offsetY + "px";
      });

      el.addEventListener("pointerup", () => {
        if (!dragging) return;
        dragging = false;
        el.classList.remove("gate-piece--dragging");

        const curLeft = parseFloat(el.style.left);
        const curTop = parseFloat(el.style.top);
        const homeX = parseFloat(el.dataset.homeX);
        const homeY = parseFloat(el.dataset.homeY);

        const dist = Math.hypot(curLeft - homeX, curTop - homeY);
        if (dist <= SNAP_TOLERANCE) {
          el.style.left = homeX + "px";
          el.style.top = homeY + "px";
          el.dataset.solved = "true";
          el.classList.add("gate-piece--solved");
          solvedCount += 1;
          if (solvedCount === PIECES.length) {
            passwordInput.disabled = false;
            submitBtn.disabled = false;
            passwordInput.focus();
          }
        }
      });

      tray.appendChild(el);
      pieceEls.push(el);
    });
  }

  async function handleSubmit(e, overlay) {
    e.preventDefault();
    const input = overlay.querySelector("#gate-password");
    const errorEl = overlay.querySelector("#gate-error");
    const enteredHash = await sha256Hex(input.value.trim());

    if (enteredHash === PASSWORD_HASH_HEX) {
      setCookie(UNLOCK_COOKIE, "true", UNLOCK_MAX_AGE_SECONDS);
      document.body.classList.remove("gate-locked");
      overlay.remove();
    } else {
      errorEl.hidden = false;
      input.value = "";
      input.focus();
    }
  }

  function init() {
    if (getCookie(UNLOCK_COOKIE) === "true") return; // already unlocked

    const run = () => {
      const overlay = buildOverlay();
      initPuzzle(overlay);
      overlay.querySelector("#gate-form").addEventListener("submit", (e) => handleSubmit(e, overlay));
    };

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", run);
    } else {
      run();
    }
  }

  init();
})();
