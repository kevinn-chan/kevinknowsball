"use client";

import { useState, useEffect } from "react";

const links = [
  { label: "Groups", href: "#groups" },
  { label: "Odds", href: "#odds" },
  { label: "Predictor", href: "#predictor" },
  { label: "Teams", href: "#teams" },
  { label: "Players", href: "#players" },
  { label: "Challenge", href: "#minigame" },
  { label: "Penalty", href: "#penalty" },
  { label: "Games", href: "#games" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    e.preventDefault();
    const el = document.querySelector(href);
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <nav
      className="fixed top-0 left-0 right-0 z-50 transition-all duration-300"
      style={{
        background: scrolled
          ? "rgba(10, 26, 15, 0.95)"
          : "rgba(10, 26, 15, 0.7)",
        backdropFilter: "blur(12px)",
        borderBottom: scrolled ? "1px solid rgba(255,215,0,0.2)" : "1px solid transparent",
      }}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <span className="text-2xl">⚽</span>
            <span
              className="font-bebas text-2xl tracking-widest"
              style={{ color: "#FFD700", letterSpacing: "0.15em" }}
            >
              WC2026 AI
            </span>
          </div>

          {/* Nav links */}
          <div className="hidden sm:flex items-center gap-6">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleClick(e, link.href)}
                className="text-sm font-medium tracking-wide transition-all duration-200"
                style={{ color: "rgba(255,255,255,0.7)" }}
                onMouseEnter={(e) => {
                  (e.target as HTMLElement).style.color = "#FFD700";
                }}
                onMouseLeave={(e) => {
                  (e.target as HTMLElement).style.color = "rgba(255,255,255,0.7)";
                }}
              >
                {link.label}
              </a>
            ))}
          </div>

          {/* Mobile hamburger placeholder */}
          <div className="sm:hidden flex items-center gap-4">
            {links.map((link) => (
              <a
                key={link.href}
                href={link.href}
                onClick={(e) => handleClick(e, link.href)}
                className="text-xs font-medium"
                style={{ color: "rgba(255,255,255,0.7)" }}
              >
                {link.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </nav>
  );
}
