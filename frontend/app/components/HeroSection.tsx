"use client";

import { useEffect, useRef } from "react";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";

const Football3D = dynamic(() => import("./Football3D"), { ssr: false });

// Pre-computed stable particle values (no Math.random at module level)
const PARTICLES = [
  { id: 0, x: 35.1, y: 68.5, size: 5.4, duration: 9.2, delay: 1.1 },
  { id: 1, x: 35.4, y: 62.4, size: 2.9, duration: 7.8, delay: 3.2 },
  { id: 2, x: 70.8, y: 46.4, size: 2.9, duration: 8.5, delay: 0.5 },
  { id: 3, x: 73.1, y: 85.2, size: 3.0, duration: 6.7, delay: 2.8 },
  { id: 4, x: 59.5, y: 80.3, size: 4.1, duration: 11.2, delay: 1.7 },
  { id: 5, x: 45.3, y: 14.9, size: 4.0, duration: 9.8, delay: 3.9 },
  { id: 6, x: 80.0, y: 28.6, size: 4.9, duration: 7.3, delay: 0.2 },
  { id: 7, x: 83.3, y: 56.6, size: 3.0, duration: 10.1, delay: 2.4 },
  { id: 8, x: 89.5, y: 7.3, size: 4.2, duration: 8.9, delay: 1.5 },
  { id: 9, x: 26.9, y: 47.1, size: 2.3, duration: 12.0, delay: 3.6 },
  { id: 10, x: 29.7, y: 33.8, size: 2.9, duration: 6.9, delay: 0.8 },
  { id: 11, x: 40.8, y: 95.8, size: 2.7, duration: 7.6, delay: 2.1 },
  { id: 12, x: 13.5, y: 15.8, size: 4.6, duration: 9.4, delay: 3.3 },
  { id: 13, x: 29.0, y: 42.6, size: 4.4, duration: 8.2, delay: 1.0 },
  { id: 14, x: 16.8, y: 29.7, size: 2.1, duration: 11.5, delay: 3.8 },
  { id: 15, x: 70.9, y: 38.5, size: 5.3, duration: 7.1, delay: 0.3 },
  { id: 16, x: 39.5, y: 0.5, size: 2.7, duration: 9.6, delay: 2.6 },
  { id: 17, x: 46.3, y: 85.0, size: 3.4, duration: 8.7, delay: 1.4 },
  { id: 18, x: 58.2, y: 85.9, size: 2.2, duration: 10.3, delay: 3.0 },
  { id: 19, x: 89.3, y: 91.2, size: 5.4, duration: 6.5, delay: 0.7 },
  { id: 20, x: 78.1, y: 90.6, size: 3.1, duration: 9.0, delay: 2.9 },
  { id: 21, x: 78.2, y: 41.3, size: 3.2, duration: 7.4, delay: 1.8 },
  { id: 22, x: 66.4, y: 2.6, size: 3.3, duration: 11.8, delay: 3.5 },
  { id: 23, x: 40.4, y: 42.5, size: 3.0, duration: 8.0, delay: 0.4 },
  { id: 24, x: 27.8, y: 41.6, size: 3.4, duration: 9.3, delay: 2.2 },
  { id: 25, x: 7.3, y: 60.3, size: 4.7, duration: 7.9, delay: 1.3 },
  { id: 26, x: 27.9, y: 71.7, size: 5.3, duration: 10.6, delay: 3.7 },
  { id: 27, x: 0.4, y: 53.0, size: 4.8, duration: 8.4, delay: 0.9 },
  { id: 28, x: 2.8, y: 10.8, size: 3.3, duration: 12.0, delay: 2.5 },
  { id: 29, x: 52.8, y: 50.4, size: 4.3, duration: 9.1, delay: 1.6 },
];

export default function HeroSection() {
  const handleCTA = () => {
    const el = document.querySelector("#odds");
    if (el) el.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <section
      className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0a1a0f 0%, #0f2318 50%, #0a1a0f 100%)" }}
    >
      {/* Pitch SVG background */}
      <svg
        className="absolute inset-0 w-full h-full opacity-10"
        viewBox="0 0 1200 800"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Pitch outline */}
        <rect x="60" y="40" width="1080" height="720" fill="none" stroke="#FFD700" strokeWidth="2" />
        {/* Halfway line */}
        <line x1="600" y1="40" x2="600" y2="760" stroke="#FFD700" strokeWidth="2" />
        {/* Center circle */}
        <circle cx="600" cy="400" r="120" fill="none" stroke="#FFD700" strokeWidth="2" />
        <circle cx="600" cy="400" r="4" fill="#FFD700" />
        {/* Left penalty area */}
        <rect x="60" y="220" width="180" height="360" fill="none" stroke="#FFD700" strokeWidth="1.5" />
        {/* Right penalty area */}
        <rect x="960" y="220" width="180" height="360" fill="none" stroke="#FFD700" strokeWidth="1.5" />
        {/* Left goal area */}
        <rect x="60" y="320" width="60" height="160" fill="none" stroke="#FFD700" strokeWidth="1" />
        {/* Right goal area */}
        <rect x="1080" y="320" width="60" height="160" fill="none" stroke="#FFD700" strokeWidth="1" />
        {/* Left penalty arc */}
        <path d="M 240 280 A 120 120 0 0 1 240 520" fill="none" stroke="#FFD700" strokeWidth="1.5" />
        {/* Right penalty arc */}
        <path d="M 960 280 A 120 120 0 0 0 960 520" fill="none" stroke="#FFD700" strokeWidth="1.5" />
        {/* Corner arcs */}
        <path d="M 60 60 A 30 30 0 0 1 90 40" fill="none" stroke="#FFD700" strokeWidth="1" />
        <path d="M 1140 60 A 30 30 0 0 0 1110 40" fill="none" stroke="#FFD700" strokeWidth="1" />
        <path d="M 60 740 A 30 30 0 0 0 90 760" fill="none" stroke="#FFD700" strokeWidth="1" />
        <path d="M 1140 740 A 30 30 0 0 1 1110 760" fill="none" stroke="#FFD700" strokeWidth="1" />
      </svg>

      {/* Particles */}
      {PARTICLES.map((p) => (
        <motion.div
          key={p.id}
          className="absolute rounded-full pointer-events-none"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            background: p.id % 3 === 0 ? "#FFD700" : p.id % 3 === 1 ? "#00D4FF" : "#ffffff",
            opacity: 0.4,
          }}
          animate={{
            y: [-20, 20, -20],
            x: [-10, 10, -10],
            opacity: [0.2, 0.6, 0.2],
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* 3D Football */}
      <div className="absolute right-16 top-1/2 -translate-y-1/2 w-64 h-64 opacity-70 hidden lg:block">
        <Football3D />
      </div>

      {/* Content */}
      <div className="relative z-10 text-center px-4 max-w-5xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.2 }}
        >
          <p
            className="text-sm font-medium tracking-[0.3em] uppercase mb-4"
            style={{ color: "#00D4FF" }}
          >
            Powered by Monte Carlo Simulation
          </p>
        </motion.div>

        <motion.h1
          className="font-bebas leading-none mb-6"
          style={{
            fontSize: "clamp(3.5rem, 10vw, 9rem)",
            color: "#FFD700",
            textShadow: "0 0 40px rgba(255,215,0,0.7), 0 0 80px rgba(255,215,0,0.3)",
            letterSpacing: "0.05em",
          }}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.4 }}
        >
          WC 2026
          <br />
          <span style={{ color: "#ffffff", textShadow: "0 0 30px rgba(255,255,255,0.4)" }}>
            AI PREDICTOR
          </span>
        </motion.h1>

        <motion.p
          className="text-xl md:text-2xl mb-10 font-light"
          style={{ color: "rgba(255,255,255,0.7)" }}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.7 }}
        >
          48 teams.{" "}
          <span style={{ color: "#FFD700" }}>104 matches.</span>{" "}
          <span style={{ color: "#00D4FF" }}>10,000 simulated universes.</span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 1 }}
          className="flex flex-col sm:flex-row gap-4 justify-center"
        >
          <button
            onClick={handleCTA}
            className="px-8 py-4 font-bebas text-xl tracking-widest rounded-lg transition-all duration-300"
            style={{
              background: "linear-gradient(135deg, #FFD700, #FFA500)",
              color: "#0a1a0f",
              boxShadow: "0 0 30px rgba(255,215,0,0.5)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 50px rgba(255,215,0,0.8)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(-2px)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px rgba(255,215,0,0.5)";
              (e.currentTarget as HTMLElement).style.transform = "translateY(0)";
            }}
          >
            View Tournament Odds →
          </button>
          <button
            onClick={() => {
              const el = document.querySelector("#predictor");
              if (el) el.scrollIntoView({ behavior: "smooth" });
            }}
            className="px-8 py-4 font-bebas text-xl tracking-widest rounded-lg border-2 transition-all duration-300"
            style={{
              borderColor: "#00D4FF",
              color: "#00D4FF",
              background: "transparent",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(0,212,255,0.1)";
              (e.currentTarget as HTMLElement).style.boxShadow = "0 0 30px rgba(0,212,255,0.4)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "transparent";
              (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
          >
            Predict a Match
          </button>
        </motion.div>

        {/* Scroll indicator */}
        <motion.div
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          style={{ color: "rgba(255,255,255,0.4)" }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </motion.div>
      </div>
    </section>
  );
}
