import React, { useEffect, useRef, useState } from "react";
import logo from "../assets/uplight-labs-logo.png";

/**
 * Sticky page header: logo + CTA only for now (the anchor-link nav was
 * removed at the user's request -- NAV_LINKS-style section links may come
 * back later once there's a real destination for each one).
 *
 * Hides on scroll-down, reappears on scroll-up -- the common "auto-hiding
 * header" pattern. Implemented with a raw scroll listener + rAF throttling
 * rather than a library since it's one small, self-contained behavior.
 */
export function TopNav() {
  const [hidden, setHidden] = useState(false);
  const lastScrollY = useRef(0);

  useEffect(() => {
    lastScrollY.current = window.scrollY;
    let ticking = false;

    function handleScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const currentY = window.scrollY;
        const delta = currentY - lastScrollY.current;

        // Ignore sub-pixel/momentum jitter, and never hide while still near
        // the very top of the page -- the header should stay put until
        // there's actually been a deliberate downward scroll past itself.
        if (Math.abs(delta) > 4) {
          if (delta > 0 && currentY > 120) {
            setHidden(true);
          } else if (delta < 0) {
            setHidden(false);
          }
        }
        lastScrollY.current = currentY;
        ticking = false;
      });
    }

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className={`top-nav-sticky${hidden ? " top-nav-sticky-hidden" : ""}`}>
      <nav className="top-nav" aria-label="Site header">
        <a href="#top" className="top-nav-logo-link" aria-label="Uplight Labs, back to top">
          <img src={logo} alt="Uplight Labs" className="top-nav-logo" />
        </a>
        <a
          className="top-nav-cta"
          href="https://www.uplight.com/contact"
          target="_blank"
          rel="noreferrer"
        >
          Contact Uplight
        </a>
      </nav>
    </div>
  );
}
