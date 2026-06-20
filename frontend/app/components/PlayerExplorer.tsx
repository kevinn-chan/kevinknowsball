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
  // Attackers — orange
  "Poacher":            "#FF6B35",
  "Inside Forward":     "#FF6B35",
  "False Nine":         "#FF6B35",
  "Traditional Winger": "#FF6B35",
  "Complete Forward":   "#FF6B35",
  "Target Man":         "#FF6B35",
  // Attacking / creative midfield — cyan
  "Advanced Playmaker":    "#00D4FF",
  "Attacking Midfielder":  "#00D4FF",
  "Midfield Playmaker":    "#00D4FF",
  "Wide Playmaker":        "#00D4FF",
  "Trequartista":          "#00D4FF",
  // Defensive / central midfield — green
  "Box-to-Box":            "#4ADE80",
  "Pressing CM":           "#4ADE80",
  "Box-to-Box DM":         "#4ADE80",
  "Deep-Lying Playmaker":  "#4ADE80",
  "Anchor Man":            "#4ADE80",
  "Ball-Winning Midfielder":"#4ADE80",
  // Defenders — purple
  "Stopper CB":         "#A78BFA",
  "Traditional CB":     "#A78BFA",
  "Ball-Playing CB":    "#A78BFA",
  "Libero":             "#A78BFA",
  "Full-Back":          "#A78BFA",
  "Holding Full-Back":  "#A78BFA",
  "Wing-Back":          "#A78BFA",
  // Keepers — gold
  "Goalkeeper":         "#FFD700",
  "Sweeper Keeper":     "#FFD700",
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

function fmBar(label: string, value: number, max: number, color: string) {
  const pct = Math.min((value / max) * 100, 100);
  const score = Math.max(1, Math.round((value / max) * 20));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "52px 1fr 20px", alignItems: "center", gap: 6 }}>
      <span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 0.5 }}>{label}</span>
      <div style={{ height: 5, background: "rgba(255,255,255,0.07)", borderRadius: 3, overflow: "hidden" }}>
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.7, ease: "easeOut" }}
          style={{ height: "100%", background: color, borderRadius: 3 }}
        />
      </div>
      <span style={{ fontSize: 11, fontWeight: 800, color, textAlign: "right" }}>{score}</span>
    </div>
  );
}

function formatValue(v: number) {
  if (v >= 1e8) return `€${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e6) return `€${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `€${(v / 1e3).toFixed(0)}K`;
  return v > 0 ? `€${v}` : "—";
}

// Pick the 4 most meaningful stats for a player based on position
function pickStats(p: Player) {
  const pos = p.general_position;
  const all = [
    pos !== "GK" && p.goals_per_90 > 0   ? { label: "G / 90",  val: p.goals_per_90,    max: pos === "ATT" ? 1.0 : 0.5, color: "#FF6B35" } : null,
    pos !== "GK" && p.assists_per_90 > 0  ? { label: "A / 90",  val: p.assists_per_90,  max: 0.7,  color: "#00D4FF" } : null,
    p.tackles_won > 0                     ? { label: "Tackles", val: p.tackles_won,      max: 100,  color: "#4ADE80" } : null,
    p.interceptions > 0                   ? { label: "Intercpt",val: p.interceptions,    max: 80,   color: "#A78BFA" } : null,
    p.crosses > 0 && pos !== "GK"         ? { label: "Crosses", val: p.crosses,          max: 180,  color: "#FFD700" } : null,
    { label: "Versatil", val: p.versatility, max: 1, color: "rgba(200,200,200,0.7)" },
  ].filter(Boolean) as { label: string; val: number; max: number; color: string }[];

  // Prefer position-relevant stats: ATT → goals first, DEF → tackles first, else default order
  return all.slice(0, 4);
}

function PlayerCard({ p, index }: { p: Player; index: number }) {
  const [flipped, setFlipped] = useState(false);
  const iso = ISO2[p.country];
  const roleColor = ROLE_COLORS[p.role] ?? "#8B9EB0";
  const stats = pickStats(p);
  const shortName = p.player_name.length > 20 ? p.player_name.slice(0, 19) + "…" : p.player_name;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.035, 0.5) }}
      onClick={() => setFlipped(f => !f)}
      style={{ cursor: "pointer", perspective: 700, height: 240 }}
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.45, ease: "easeInOut" }}
        style={{ position: "relative", width: "100%", height: "100%", transformStyle: "preserve-3d" }}
      >
        {/* ── FRONT ── */}
        <div style={{
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
          position: "absolute", inset: 0,
          background: "linear-gradient(160deg, rgba(18,40,26,0.98) 0%, rgba(8,18,12,0.98) 100%)",
          border: `1px solid ${roleColor}40`,
          borderRadius: 14, padding: "14px 14px 12px",
          display: "flex", flexDirection: "column", gap: 10,
          boxShadow: `0 4px 24px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.04)`,
        }}>
          {/* Header row: flag + name/club + pos badge */}
          <div style={{ display: "flex", alignItems: "flex-start", gap: 9 }}>
            {iso && (
              <img src={`https://flagcdn.com/w40/${iso}.png`} width={26} height={18}
                style={{ borderRadius: 3, objectFit: "cover", flexShrink: 0, marginTop: 2,
                  boxShadow: "0 1px 4px rgba(0,0,0,0.4)" }}
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: "#fff", lineHeight: 1.15,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {shortName}
              </div>
              <div style={{ fontSize: 10, color: "rgba(255,255,255,0.32)", marginTop: 1,
                whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {p.club_team === "Unknown" ? p.country : p.club_team}
              </div>
            </div>
            {/* Position badge — right-aligned, doesn't overlap name */}
            <div style={{
              flexShrink: 0, background: `${roleColor}18`,
              border: `1px solid ${roleColor}50`, borderRadius: 5,
              padding: "2px 6px", fontSize: 8, fontWeight: 800,
              color: roleColor, letterSpacing: 0.8, textTransform: "uppercase",
              maxWidth: 70, textAlign: "center", lineHeight: 1.3,
            }}>
              {p.specific_position}
            </div>
          </div>

          {/* Role pill */}
          <div style={{
            display: "inline-flex", alignItems: "center", gap: 5,
            background: `${roleColor}15`, border: `1px solid ${roleColor}45`,
            borderRadius: 20, padding: "3px 10px", alignSelf: "flex-start",
          }}>
            <div style={{ width: 5, height: 5, borderRadius: "50%", background: roleColor, flexShrink: 0 }} />
            <span style={{ fontSize: 10, color: roleColor, fontWeight: 700 }}>{p.role || p.specific_position}</span>
          </div>

          {/* Stats */}
          <div style={{ display: "flex", flexDirection: "column", gap: 7, flex: 1 }}>
            {stats.map(s => fmBar(s.label, s.val, s.max, s.color))}
          </div>

          {/* Footer */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center",
            borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: 8 }}>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.18)", letterSpacing: 1.5,
              textTransform: "uppercase" }}>Tap · Scout Report</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>↺</span>
          </div>
        </div>

        {/* ── BACK (Scout Report) ── */}
        <div style={{
          backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden",
          transform: "rotateY(180deg)",
          position: "absolute", inset: 0,
          background: "linear-gradient(160deg, rgba(10,26,16,0.99) 0%, rgba(5,14,9,0.99) 100%)",
          border: `1px solid ${roleColor}55`,
          borderRadius: 14, padding: "14px 14px 12px",
          display: "flex", flexDirection: "column", gap: 10,
          boxShadow: `0 4px 24px rgba(0,0,0,0.6), 0 0 0 1px ${roleColor}20`,
        }}>
          {/* Scout report header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ fontSize: 9, color: roleColor, fontWeight: 800, letterSpacing: 2,
              textTransform: "uppercase" }}>Scout Report</span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.2)" }}>↺</span>
          </div>

          {/* Player name on back */}
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, color: "#fff", lineHeight: 1.1 }}>{p.player_name}</div>
            <div style={{ fontSize: 10, color: roleColor, marginTop: 2 }}>{p.country} · Group {p.wc_group}</div>
          </div>

          {/* Stats grid */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 12px", flex: 1 }}>
            {[
              { label: "Age",       val: p.age ? `${Math.round(p.age)} yrs` : "—" },
              { label: "Value",     val: formatValue(p.market_value) },
              { label: "Caps",      val: p.international_caps ? Math.round(p.international_caps) : "—" },
              { label: "Int'l G",   val: p.international_goals ? Math.round(p.international_goals) : "—" },
              { label: "Position",  val: p.specific_position },
              { label: "Versatil.", val: `${(p.versatility * 100).toFixed(0)}%` },
            ].map(({ label, val }) => (
              <div key={label}>
                <div style={{ fontSize: 8, color: "rgba(255,255,255,0.28)", letterSpacing: 1.2,
                  textTransform: "uppercase", marginBottom: 2 }}>{label}</div>
                <div style={{ fontSize: 12, color: "#fff", fontWeight: 700,
                  whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{val}</div>
              </div>
            ))}
          </div>

          {/* Club tag */}
          <div style={{ padding: "7px 10px",
            background: `${roleColor}10`, border: `1px solid ${roleColor}30`,
            borderRadius: 8, fontSize: 10, color: "rgba(255,255,255,0.5)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
            🏟 {p.club_team === "Unknown" ? "Club data unavailable" : p.club_team}
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

  useEffect(() => {
    if (!inView) return;
    hasLoaded.current = true;
    load(country, position);
  }, [inView, country, position, load]);

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
