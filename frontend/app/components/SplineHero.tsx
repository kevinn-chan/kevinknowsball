"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, useTransform, animate } from "framer-motion";

function CountUp({ to, suffix = "" }: { to: number; suffix?: string }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString() + suffix);
  useEffect(() => {
    const ctrl = animate(count, to, { duration: 2.2, ease: "easeOut", delay: 0.6 });
    return ctrl.stop;
  }, [to]);
  return <motion.span>{rounded}</motion.span>;
}

function PitchLines() {
  return (
    <svg viewBox="0 0 900 500" preserveAspectRatio="xMidYMid slice"
      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.05 }}>
      <rect x="40" y="30" width="820" height="440" fill="none" stroke="white" strokeWidth="2" />
      <line x1="450" y1="30" x2="450" y2="470" stroke="white" strokeWidth="2" />
      <circle cx="450" cy="250" r="80" fill="none" stroke="white" strokeWidth="2" />
      <circle cx="450" cy="250" r="4" fill="white" />
      <rect x="40" y="140" width="130" height="220" fill="none" stroke="white" strokeWidth="2" />
      <rect x="40" y="185" width="55" height="130" fill="none" stroke="white" strokeWidth="2" />
      <path d="M 170 185 Q 220 250 170 315" fill="none" stroke="white" strokeWidth="2" />
      <rect x="730" y="140" width="130" height="220" fill="none" stroke="white" strokeWidth="2" />
      <rect x="805" y="185" width="55" height="130" fill="none" stroke="white" strokeWidth="2" />
      <path d="M 730 185 Q 680 250 730 315" fill="none" stroke="white" strokeWidth="2" />
      <path d="M 40 50 Q 60 30 80 30" fill="none" stroke="white" strokeWidth="1.5" />
      <path d="M 820 50 Q 840 30 860 30" fill="none" stroke="white" strokeWidth="1.5" />
      <path d="M 40 450 Q 60 470 80 470" fill="none" stroke="white" strokeWidth="1.5" />
      <path d="M 820 450 Q 840 470 860 470" fill="none" stroke="white" strokeWidth="1.5" />
    </svg>
  );
}

// Animated football — rotates and bobs
function AnimatedBall() {
  return (
    <motion.div
      animate={{ y: [0, -18, 0], rotate: [0, 360] }}
      transition={{
        y: { repeat: Infinity, duration: 3, ease: "easeInOut" },
        rotate: { repeat: Infinity, duration: 8, ease: "linear" },
      }}
      style={{ fontSize: "clamp(120px, 18vw, 220px)", lineHeight: 1, userSelect: "none", filter: "drop-shadow(0 0 60px rgba(0,180,60,0.3))" }}
    >
      ⚽
    </motion.div>
  );
}

export default function SplineHero() {
  return (
    <section style={{
      position: "relative",
      minHeight: "clamp(480px, 85vh, 720px)",
      background: "radial-gradient(ellipse 130% 90% at 75% 40%, rgba(0,80,30,0.4) 0%, rgba(5,14,8,1) 60%)",
      overflow: "hidden",
      display: "flex",
      alignItems: "center",
    }}>
      <PitchLines />

      {/* Spotlight glow behind ball */}
      <div style={{
        position: "absolute", right: "10%", top: "50%", transform: "translateY(-50%)",
        width: "clamp(300px, 45vw, 560px)", height: "clamp(300px, 45vw, 560px)",
        borderRadius: "50%",
        background: "radial-gradient(circle, rgba(0,160,50,0.12) 0%, transparent 70%)",
        pointerEvents: "none",
      }} />

      {/* ── Left: editorial text ── */}
      <div style={{
        position: "relative", zIndex: 2,
        padding: "60px 0 60px clamp(24px, 6vw, 80px)",
        maxWidth: "clamp(280px, 50%, 560px)",
      }}>
        <motion.div
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5 }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "rgba(255,215,0,0.07)",
            border: "1px solid rgba(255,215,0,0.22)",
            borderRadius: 20, padding: "5px 14px", marginBottom: 24,
          }}
        >
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 6px #4ade80" }} />
          <span style={{ fontSize: 11, letterSpacing: 3, color: "rgba(255,255,255,0.55)", textTransform: "uppercase" }}>
            FIFA World Cup 2026
          </span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1 }}
          style={{ margin: 0, lineHeight: 0.9, letterSpacing: -1 }}
        >
          <span style={{ display: "block", fontSize: "clamp(56px, 9vw, 120px)", fontWeight: 900, color: "#fff", textTransform: "uppercase" }}>
            Joga
          </span>
          <span style={{
            display: "block", fontSize: "clamp(56px, 9vw, 120px)", fontWeight: 900, textTransform: "uppercase",
            background: "linear-gradient(135deg, #FFD700 0%, #ffec6e 40%, #e6a800 100%)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          }}>
            Bonito
          </span>
          <span style={{
            display: "block", fontSize: "clamp(13px, 1.8vw, 20px)", fontWeight: 300,
            color: "rgba(255,255,255,0.3)", letterSpacing: 7, textTransform: "uppercase", marginTop: 10,
          }}>
            AI · Predictor
          </span>
        </motion.h1>

        <motion.div
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.9, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            height: 1, originX: 0,
            background: "linear-gradient(90deg, rgba(255,215,0,0.5), transparent)",
            margin: "28px 0", maxWidth: 300,
          }}
        />

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.75 }}
          style={{ color: "rgba(255,255,255,0.4)", fontSize: 14, lineHeight: 1.75, margin: "0 0 32px", maxWidth: 380 }}
        >
          Monte Carlo simulation · Poisson distribution · Dixon-Coles correction.
          48 teams. 104 matches. One beautiful game.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.95 }}
          style={{ display: "flex", gap: 10, flexWrap: "wrap" }}
        >
          {[
            { label: "Teams", value: 48 },
            { label: "Simulations", value: 10000 },
            { label: "Matchups", value: 2256 },
          ].map(({ label, value }) => (
            <div key={label} style={{
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.07)",
              backdropFilter: "blur(10px)",
              borderRadius: 10, padding: "10px 16px",
            }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#FFD700", letterSpacing: -0.5 }}>
                <CountUp to={value} />
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 1.5, textTransform: "uppercase", marginTop: 3 }}>
                {label}
              </div>
            </div>
          ))}
        </motion.div>
      </div>

      {/* ── Right: animated ball ── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.7 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: "absolute", right: "clamp(5%, 10vw, 14%)",
          top: "50%", transform: "translateY(-50%)",
          zIndex: 1, pointerEvents: "none",
        }}
      >
        <AnimatedBall />
      </motion.div>

      {/* Bottom fade */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, right: 0, height: 80,
        background: "linear-gradient(to bottom, transparent, rgba(5,14,8,1))",
        pointerEvents: "none", zIndex: 3,
      }} />

      {/* Scroll hint */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ repeat: Infinity, duration: 2.2 }}
        style={{
          position: "absolute", bottom: 22, left: "50%", transform: "translateX(-50%)",
          zIndex: 4, display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          color: "rgba(255,255,255,0.18)", fontSize: 10, letterSpacing: 3, textTransform: "uppercase",
        }}
      >
        <span>Scroll</span>
        <svg width="14" height="9" viewBox="0 0 14 9" fill="none">
          <path d="M1 1L7 7L13 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </motion.div>
    </section>
  );
}
