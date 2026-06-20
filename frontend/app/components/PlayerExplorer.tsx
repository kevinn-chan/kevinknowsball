"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

const ISO2: Record<string, string> = {
  France: "fr", Spain: "es", England: "gb-eng", Argentina: "ar", Brazil: "br",
  Germany: "de", Portugal: "pt", Netherlands: "nl", Morocco: "ma", Mexico: "mx",
  Uruguay: "uy", Japan: "jp", Belgium: "be", Colombia: "co", Senegal: "sn",
  Norway: "no", Ecuador: "ec", Switzerland: "ch", Türkiye: "tr", "South Korea": "kr",
  "United States": "us", Canada: "ca", Australia: "au", Croatia: "hr", Ghana: "gh",
  Panama: "pa", Algeria: "dz", Austria: "at", Jordan: "jo", "DR Congo": "cd",
  Uzbekistan: "uz", Scotland: "gb-sct", Haiti: "ht", "Cape Verde": "cv",
  "Saudi Arabia": "sa", Qatar: "qa", Egypt: "eg", Iran: "ir", Iraq: "iq",
  Sweden: "se", Tunisia: "tn", "New Zealand": "nz", Paraguay: "py",
  "Ivory Coast": "ci", "Curaçao": "cw", "Bosnia and Herzegovina": "ba",
  "Czech Republic": "cz", "South Africa": "za",
};

const COUNTRIES = [
  "Argentina","Australia","Algeria","Austria","Belgium","Bosnia and Herzegovina",
  "Brazil","Canada","Cape Verde","Colombia","Croatia","Curaçao","Czech Republic",
  "DR Congo","Ecuador","Egypt","England","France","Germany","Ghana","Haiti",
  "Iran","Iraq","Ivory Coast","Japan","Jordan","Mexico","Morocco","Netherlands",
  "New Zealand","Norway","Panama","Paraguay","Portugal","Qatar","Saudi Arabia",
  "Scotland","Senegal","South Africa","South Korea","Spain","Sweden","Switzerland",
  "Tunisia","Türkiye","United States","Uruguay","Uzbekistan",
];

const POSITIONS = ["All", "ATT", "MID", "DEF", "GK"];

const ROLE_COLORS: Record<string, string> = {
  "Poacher": "#FF6B35",
  "Inside Forward": "#FF6B35",
  "False Nine": "#FF6B35",
  "Traditional Winger": "#FF6B35",
  "Advanced Playmaker": "#00D4FF",
  "Attacking Midfielder": "#00D4FF",
  "Midfield Playmaker": "#00D4FF",
  "Wide Playmaker": "#00D4FF",
  "Box-to-Box": "#4ADE80",
  "Pressing CM": "#4ADE80",
  "Box-to-Box DM": "#4ADE80",
  "Deep-Lying Playmaker": "#4ADE80",
  "Stopper CB": "#A78BFA",
  "Traditional CB": "#A78BFA",
  "Full-Back": "#A78BFA",
  "Holding Full-Back": "#A78BFA",
  "Sweeper Keeper": "#FFD700",
  "Rushing Goalkeeper": "#FFD700",
};

interface Player {
  player_name: string;
  country: string;
  wc_group: string;
  club_team: string;
  age: number;
  general_position: string;
  specific_position: string;
  market_value: number;
  international_caps: number;
  international_goals: number;
  goals_per_90: number;
  assists_per_90: number;
  interceptions: number;
  tackles_won: number;
  crosses: number;
  role: string;
  versatility: number;
}

function fmBar(value: number, max: number, color: string) {
  const pct = Math.min(Math.round((value / max) * 100), 100);
  const fmScore = Math.round((value / max) * 20); // FM-style 1-20
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: "rgba(255,255,255,0.08)", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3,
          transition: "width 0.6s ease" }} />
      </div>
      <span style={{ width: 18, textAlign: "right", fontSize: 12, fontWeight: 700, color }}>{fmScore}</span>
    </div>
  );
}

function formatValue(v: number) {
  if (v >= 1e8) return `€${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e6) return `€${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `€${(v / 1e3).toFixed(0)}K`;
  return `€${v}`;
}

function PlayerCard({ p, index }: { p: Player; index: number }) {
  const [flipped, setFlipped] = useState(false);
  const iso = ISO2[p.country];
  const roleColor = ROLE_COLORS[p.role] ?? "rgba(255,255,255,0.5)";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.04 }}
      onClick={() => setFlipped(f => !f)}
      style={{ cursor: "pointer", perspective: 600 }}
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.4 }}
        style={{ position: "relative", transformStyle: "preserve-3d", minHeight: 220 }}
      >
        {/* Front */}
        <div style={{
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg, rgba(15,35,22,0.97), rgba(8,20,12,0.97))",
          border: `1px solid ${roleColor}33`,
          borderRadius: 12, padding: 14, overflow: "hidden",
        }}>
          {/* Position badge */}
          <div style={{ position: "absolute", top: 10, right: 10,
            background: `${roleColor}22`, border: `1px solid ${roleColor}44`,
            borderRadius: 6, padding: "2px 7px", fontSize: 9, fontWeight: 800,
            color: roleColor, letterSpacing: 1, textTransform: "uppercase" }}>
            {p.specific_position}
          </div>

          {/* Flag + name */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            {iso && <img src={`https://flagcdn.com/w40/${iso}.png`} width={22} height={15}
              style={{ borderRadius: 2, objectFit: "cover", flexShrink: 0 }}
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />}
            <div>
              <div style={{ fontSize: 13, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>{p.player_name}</div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>{p.club_team}</div>
            </div>
          </div>

          {/* Role pill */}
          <div style={{ display: "inline-block", background: `${roleColor}18`,
            border: `1px solid ${roleColor}55`, borderRadius: 20,
            padding: "2px 10px", fontSize: 10, color: roleColor, fontWeight: 700, marginBottom: 12 }}>
            {p.role}
          </div>

          {/* FM-style stats */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "4px 12px", fontSize: 10,
            color: "rgba(255,255,255,0.45)" }}>
            {p.goals_per_90 > 0 && (
              <div><div style={{ marginBottom: 2 }}>G/90</div>{fmBar(p.goals_per_90, 1.2, "#FF6B35")}</div>
            )}
            {p.assists_per_90 > 0 && (
              <div><div style={{ marginBottom: 2 }}>A/90</div>{fmBar(p.assists_per_90, 0.8, "#00D4FF")}</div>
            )}
            {p.tackles_won > 0 && (
              <div><div style={{ marginBottom: 2 }}>Tackles</div>{fmBar(p.tackles_won, 100, "#4ADE80")}</div>
            )}
            {p.interceptions > 0 && (
              <div><div style={{ marginBottom: 2 }}>Intercept</div>{fmBar(p.interceptions, 80, "#A78BFA")}</div>
            )}
            {p.crosses > 0 && (
              <div><div style={{ marginBottom: 2 }}>Crosses</div>{fmBar(p.crosses, 200, "#FFD700")}</div>
            )}
            <div><div style={{ marginBottom: 2 }}>Versatility</div>{fmBar(p.versatility, 1, "rgba(255,255,255,0.6)")}</div>
          </div>

          {/* Tap hint */}
          <div style={{ position: "absolute", bottom: 8, right: 10,
            fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: 1 }}>TAP FOR SCOUT REPORT</div>
        </div>

        {/* Back (scout report) */}
        <div style={{
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
          transform: "rotateY(180deg)",
          position: "absolute", inset: 0,
          background: "linear-gradient(135deg, rgba(10,25,15,0.98), rgba(5,15,8,0.98))",
          border: `1px solid ${roleColor}44`,
          borderRadius: 12, padding: 14,
        }}>
          <div style={{ fontSize: 11, color: roleColor, fontWeight: 800, letterSpacing: 2,
            textTransform: "uppercase", marginBottom: 10 }}>Scout Report</div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, fontSize: 11 }}>
            {[
              ["Age", p.age],
              ["Value", formatValue(p.market_value)],
              ["Caps", Math.round(p.international_caps)],
              ["Int'l Goals", Math.round(p.international_goals)],
              ["Group", p.wc_group],
              ["Versatility", `${(p.versatility * 100).toFixed(0)}%`],
            ].map(([label, val]) => (
              <div key={label as string}>
                <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 9, letterSpacing: 1, textTransform: "uppercase" }}>{label}</div>
                <div style={{ color: "#fff", fontWeight: 700, marginTop: 2 }}>{val}</div>
              </div>
            ))}
          </div>

          <div style={{ marginTop: 12, padding: "8px 10px",
            background: `${roleColor}12`, border: `1px solid ${roleColor}33`,
            borderRadius: 8, fontSize: 10, color: "rgba(255,255,255,0.6)", lineHeight: 1.5 }}>
            {p.country} · {p.specific_position} · {p.club_team}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

export default function PlayerExplorer() {
  const [players, setPlayers] = useState<Player[]>([]);
  const [country, setCountry] = useState("Argentina");
  const [position, setPosition] = useState("All");
  const [loading, setLoading] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const hasLoaded = useRef(false);
  const inView = useInView(sectionRef, { once: true, margin: "-100px" });

  const load = useCallback((c: string, p: string) => {
    setLoading(true);
    const pos = p === "All" ? "" : `&position=${p}`;
    fetch(`${API}/players?country=${encodeURIComponent(c)}${pos}&limit=24`)
      .then(r => r.json())
      .then(d => { setPlayers(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Only fire the initial fetch when section scrolls into view
  useEffect(() => {
    if (inView && !hasLoaded.current) {
      hasLoaded.current = true;
      load(country, position);
    }
  }, [inView, country, position, load]);

  // Re-fetch on filter change (only if already loaded)
  useEffect(() => {
    if (hasLoaded.current) load(country, position);
  }, [country, position, load]);

  return (
    <section id="players" ref={sectionRef} style={{ padding: "60px 24px", background: "linear-gradient(180deg, #0a1a0f 0%, #0d2015 100%)" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <p style={{ fontSize: 11, letterSpacing: 4, color: "#00D4FF", textTransform: "uppercase", marginBottom: 8 }}>
            FM26-Style Scout Data · {players.length} players
          </p>
          <h2 style={{ fontSize: "clamp(28px,5vw,56px)", fontWeight: 900, color: "#FFD700",
            textShadow: "0 0 30px rgba(255,215,0,0.4)", textTransform: "uppercase", letterSpacing: 3, margin: 0 }}>
            Squad Explorer
          </h2>
          <p style={{ color: "rgba(255,255,255,0.4)", marginTop: 8, fontSize: 13 }}>
            Tap any card for full scout report
          </p>
        </div>

        {/* Filters */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 28 }}>
          <select
            value={country}
            onChange={e => setCountry(e.target.value)}
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,215,0,0.2)",
              borderRadius: 8, color: "#fff", padding: "8px 14px", fontSize: 13, cursor: "pointer",
            }}
          >
            {COUNTRIES.map(c => <option key={c} value={c} style={{ background: "#0a1a0f" }}>{c}</option>)}
          </select>

          <div style={{ display: "flex", gap: 6 }}>
            {POSITIONS.map(p => (
              <button key={p} onClick={() => setPosition(p)} style={{
                padding: "8px 16px", borderRadius: 20, border: "none", cursor: "pointer",
                background: position === p ? "#FFD700" : "rgba(255,255,255,0.07)",
                color: position === p ? "#000" : "rgba(255,255,255,0.6)",
                fontWeight: 700, fontSize: 11, letterSpacing: 1, textTransform: "uppercase",
              }}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} style={{ height: 220, background: "rgba(255,255,255,0.04)",
                borderRadius: 12, animation: "pulse 1.5s ease-in-out infinite" }} />
            ))}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 14 }}>
            <AnimatePresence>
              {players.map((p, i) => <PlayerCard key={p.player_name} p={p} index={i} />)}
            </AnimatePresence>
          </div>
        )}
      </div>
    </section>
  );
}
