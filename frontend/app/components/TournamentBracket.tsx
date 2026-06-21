"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

const GROUPS: Record<string, string[]> = {
  A: ["Mexico", "South Africa", "South Korea", "Czech Republic"],
  B: ["Canada", "Bosnia and Herzegovina", "Qatar", "Switzerland"],
  C: ["Brazil", "Morocco", "Haiti", "Scotland"],
  D: ["United States", "Paraguay", "Australia", "Türkiye"],
  E: ["Germany", "Curaçao", "Ivory Coast", "Ecuador"],
  F: ["Netherlands", "Japan", "Sweden", "Tunisia"],
  G: ["Belgium", "Egypt", "Iran", "New Zealand"],
  H: ["Spain", "Cape Verde", "Saudi Arabia", "Uruguay"],
  I: ["France", "Senegal", "Iraq", "Norway"],
  J: ["Argentina", "Algeria", "Austria", "Jordan"],
  K: ["Portugal", "DR Congo", "Uzbekistan", "Colombia"],
  L: ["England", "Croatia", "Ghana", "Panama"],
};

function Flag({ country, size = 20 }: { country: string; size?: number }) {
  const iso = ISO2[country];
  const abbr = (country || "?").slice(0, 3).toUpperCase();
  const placeholder = (
    <span style={{
      width: size, height: Math.round(size * 0.67), display: "inline-flex",
      alignItems: "center", justifyContent: "center",
      background: "rgba(255,255,255,0.12)", borderRadius: 2,
      fontSize: size * 0.35, color: "rgba(255,255,255,0.6)", flexShrink: 0,
    }}>{abbr}</span>
  );
  if (!iso) return placeholder;
  return (
    <img src={`https://flagcdn.com/w40/${iso}.png`} alt={country} width={size}
      height={Math.round(size * 0.67)}
      style={{ objectFit: "cover", borderRadius: 2, flexShrink: 0 }}
      onError={(e) => {
        const el = e.target as HTMLImageElement;
        el.style.display = "none";
        const span = document.createElement("span");
        span.textContent = abbr;
        Object.assign(span.style, {
          display: "inline-flex", alignItems: "center", justifyContent: "center",
          width: `${size}px`, height: `${Math.round(size * 0.67)}px`,
          background: "rgba(255,255,255,0.12)", borderRadius: "2px",
          fontSize: `${size * 0.35}px`, color: "rgba(255,255,255,0.6)", flexShrink: "0",
        });
        el.parentNode?.insertBefore(span, el.nextSibling);
      }} />
  );
}

interface Match {
  home: string; away: string; score: string; winner: string;
  home_win_prob: number; draw_prob: number; away_win_prob: number;
}
interface GroupTeam { team: string; pos: number; pts: number; gf: number; ga: number; gd: number; }
interface BracketData {
  group_stage: Record<string, GroupTeam[]>;
  best_thirds: string[];
  knockout: {
    round_of_32: Match[]; round_of_16: Match[];
    quarter_finals: Match[]; semi_finals: Match[];
    third_place: Match[]; final: Match[];
  };
  champion: string | null;
}

// ── Pre-simulation: group draw card (no results) ──────────────────────────
function GroupDrawCard({ group, teams }: { group: string; teams: string[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.03 * group.charCodeAt(0) - 2.1 }}
      style={{
        background: "rgba(8,20,12,0.85)",
        border: "1px solid rgba(255,255,255,0.07)",
        borderRadius: 10, overflow: "hidden",
      }}
    >
      <div style={{ background: "rgba(255,215,0,0.1)", padding: "5px 10px", fontSize: 11, fontWeight: 700, color: "#FFD700", letterSpacing: 2 }}>
        GROUP {group}
      </div>
      {teams.map((team, i) => (
        <div key={team} style={{
          display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
          borderBottom: i < teams.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none",
        }}>
          <span style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", width: 12 }}>{i + 1}</span>
          <Flag country={team} size={18} />
          <span style={{ fontSize: 13, color: "#ccc" }}>{team}</span>
        </div>
      ))}
    </motion.div>
  );
}

// ── Post-simulation: group table with results ────────────────────────────
function GroupResultCard({ group, teams, bestThirds }: { group: string; teams: GroupTeam[]; bestThirds: string[] }) {
  return (
    <div style={{ background: "rgba(8,20,12,0.85)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
      <div style={{ background: "rgba(255,215,0,0.12)", padding: "5px 10px", fontSize: 11, fontWeight: 700, color: "#FFD700", letterSpacing: 2 }}>
        GROUP {group}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ color: "rgba(255,255,255,0.3)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <th style={{ padding: "3px 8px", textAlign: "left", fontWeight: 400 }}>Team</th>
            <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 400, width: 22 }}>P</th>
            <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 400, width: 30 }}>GD</th>
            <th style={{ padding: "3px 4px", textAlign: "center", fontWeight: 400, width: 30 }}>Pts</th>
          </tr>
        </thead>
        <tbody>
          {teams.map((t, i) => {
            const qual = i < 2;
            const bt = i === 2 && bestThirds.includes(t.team);
            return (
              <tr key={t.team} style={{
                background: qual ? "rgba(0,180,80,0.1)" : bt ? "rgba(255,165,0,0.1)" : "transparent",
                borderBottom: "1px solid rgba(255,255,255,0.04)",
              }}>
                <td style={{ padding: "5px 8px", display: "flex", alignItems: "center", gap: 6 }}>
                  <Flag country={t.team} size={15} />
                  <span style={{ color: qual ? "#e0e0e0" : "#888", fontWeight: qual ? 600 : 400 }}>
                    {t.team.length > 14 ? t.team.slice(0, 13) + "…" : t.team}
                  </span>
                </td>
                <td style={{ textAlign: "center", color: "rgba(255,255,255,0.4)", padding: "5px 4px" }}>3</td>
                <td style={{ textAlign: "center", color: t.gd >= 0 ? "#4ade80" : "#f87171", padding: "5px 4px" }}>
                  {t.gd > 0 ? "+" : ""}{t.gd}
                </td>
                <td style={{ textAlign: "center", fontWeight: 700, color: "#FFD700", padding: "5px 4px" }}>{t.pts}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Match card ────────────────────────────────────────────────────────────
function MatchCard({ match, highlight }: { match: Match; highlight?: boolean }) {
  const isPens = match.score?.includes("pens");
  return (
    <div style={{
      background: highlight ? "linear-gradient(135deg, rgba(255,215,0,0.12), rgba(0,0,0,0.6))" : "rgba(8,20,12,0.92)",
      border: `1px solid ${highlight ? "rgba(255,215,0,0.4)" : "rgba(255,255,255,0.08)"}`,
      borderRadius: 8, overflow: "hidden", width: 190,
      boxShadow: highlight ? "0 0 20px rgba(255,215,0,0.1)" : "0 2px 8px rgba(0,0,0,0.4)",
    }}>
      {[{ name: match.home, prob: match.home_win_prob }, { name: match.away, prob: match.away_win_prob }].map(({ name, prob }) => {
        const isW = name === match.winner;
        return (
          <div key={name} style={{
            display: "flex", alignItems: "center", gap: 7, padding: "6px 9px",
            background: isW ? "rgba(255,215,0,0.07)" : "transparent",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            opacity: match.winner && !isW ? 0.4 : 1,
          }}>
            <Flag country={name} size={17} />
            <span style={{ flex: 1, fontSize: 12, fontWeight: isW ? 700 : 400, color: isW ? "#FFD700" : "#ccc", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {name || "TBD"}
            </span>
            {match.score && <span style={{ fontSize: 11, color: isW ? "#FFD700" : "rgba(255,255,255,0.25)", fontWeight: 700 }}>
              {match.score.split("-")[name === match.home ? 0 : 1]?.split(" ")[0]}
            </span>}
          </div>
        );
      })}
      {match.score && <div style={{ textAlign: "center", fontSize: 9, color: isPens ? "#FF8C00" : "rgba(255,255,255,0.18)", padding: "2px 0" }}>
        {isPens ? "PENS" : match.score}
      </div>}
    </div>
  );
}

function MatchPair({ top, bottom }: { top: Match; bottom: Match }) {
  const lc = "rgba(255,215,0,0.2)";
  return (
    <div style={{ display: "flex", alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <MatchCard match={top} />
        <MatchCard match={bottom} />
      </div>
      <div style={{ position: "relative", width: 14, alignSelf: "stretch" }}>
        <div style={{ position: "absolute", top: "25%", width: 14, height: 1, background: lc }} />
        <div style={{ position: "absolute", bottom: "25%", width: 14, height: 1, background: lc }} />
        <div style={{ position: "absolute", top: "25%", bottom: "25%", right: 0, width: 1, background: lc }} />
      </div>
    </div>
  );
}

function HalfBracket({ r32, r16, qf, sf, flip = false }: { r32: Match[]; r16: Match[]; qf: Match[]; sf: Match[]; flip?: boolean }) {
  const lc = "rgba(255,215,0,0.2)";
  return (
    <div style={{ display: "flex", flexDirection: flip ? "row-reverse" : "row", alignItems: "center" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {[0,1,2,3].map(pi => <MatchPair key={pi} top={r32[pi*2]} bottom={r32[pi*2+1]} />)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {[0,1,2,3].map(i => <div key={i} style={{ height: 96, width: 14, position: "relative" }}><div style={{ position: "absolute", top: "50%", width: 14, height: 1, background: lc }} /></div>)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 50 }}>
        {[0,1].map(pi => <MatchPair key={pi} top={r16[pi*2]} bottom={r16[pi*2+1]} />)}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 50 }}>
        {[0,1].map(i => <div key={i} style={{ height: 96, width: 14, position: "relative" }}><div style={{ position: "absolute", top: "50%", width: 14, height: 1, background: lc }} /></div>)}
      </div>
      <MatchPair top={qf[0]} bottom={qf[1]} />
      <div style={{ height: 96, width: 14, position: "relative" }}><div style={{ position: "absolute", top: "50%", width: 14, height: 1, background: lc }} /></div>
      <MatchCard match={sf[0]} />
      <div style={{ width: 20, height: 1, background: lc }} />
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────
type Phase = "draw" | "revealing" | "done";

export default function TournamentBracket() {
  const [phase, setPhase] = useState<Phase>("draw");
  const [data, setData] = useState<BracketData | null>(null);
  const [tab, setTab] = useState<"groups" | "bracket">("groups");
  const [simulating, setSimulating] = useState(false);
  const resultRef = useRef<BracketData | null>(null);
  const readyRef = useRef(false);

  // Start fetching immediately on mount — user hasn't clicked anything yet
  useEffect(() => {
    const run = () => {
      fetch(`${API}/simulate/bracket`)
        .then(r => r.json())
        .then((d: BracketData) => { resultRef.current = d; readyRef.current = true; })
        .catch(() => {
          // Retry after 4s if server is cold
          setTimeout(run, 4000);
        });
    };

    // Poll /ready first so we fetch once the prediction cache is warm
    const poll = () =>
      fetch(`${API}/ready`)
        .then(r => r.json())
        .then(s => { if (s.bracket_ready) run(); else setTimeout(poll, 3000); })
        .catch(() => setTimeout(poll, 5000));
    poll();
  }, []);

  const handleSimulate = useCallback(() => {
    setSimulating(true);
    setPhase("revealing");

    const reveal = (d: BracketData) => {
      // Small artificial delay so the button animation feels satisfying
      setTimeout(() => {
        setData(d);
        setPhase("done");
        setSimulating(false);
      }, 800);
    };

    if (readyRef.current && resultRef.current) {
      reveal(resultRef.current);
    } else {
      // Still loading — wait for it
      const wait = setInterval(() => {
        if (readyRef.current && resultRef.current) {
          clearInterval(wait);
          reveal(resultRef.current);
        }
      }, 300);
    }
  }, []);

  const handleResim = useCallback(() => {
    setSimulating(true);
    readyRef.current = false;
    fetch(`${API}/simulate/bracket`)
      .then(r => r.json())
      .then((d: BracketData) => { setData(d); setSimulating(false); })
      .catch(() => setSimulating(false));
  }, []);

  const ko = data?.knockout;

  return (
    <section id="groups" style={{ padding: "40px 24px", maxWidth: 1600, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <p style={{ fontSize: 11, letterSpacing: 4, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: 6 }}>
          2026 FIFA World Cup
        </p>
        <h2 style={{
          fontSize: "clamp(22px, 4vw, 40px)", fontWeight: 900, letterSpacing: 3,
          background: "linear-gradient(90deg, #FFD700, #fff 50%, #FFD700)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          textTransform: "uppercase", margin: 0,
        }}>
          {phase === "done" ? "Projected Bracket" : "Group Draw"}
        </h2>
      </div>

      {/* ── DRAW PHASE: group cards + big CTA ── */}
      <AnimatePresence mode="wait">
        {phase === "draw" && (
          <motion.div key="draw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 14, marginBottom: 40 }}>
              {Object.entries(GROUPS).map(([grp, teams]) => (
                <GroupDrawCard key={grp} group={grp} teams={teams} />
              ))}
            </div>

            {/* Big simulate CTA */}
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <motion.button
                onClick={handleSimulate}
                whileHover={{ scale: 1.04 }}
                whileTap={{ scale: 0.97 }}
                style={{
                  padding: "18px 52px",
                  borderRadius: 50,
                  border: "none",
                  cursor: "pointer",
                  background: "linear-gradient(135deg, #FFD700, #e6a800)",
                  color: "#000",
                  fontWeight: 900,
                  fontSize: "clamp(15px, 2.5vw, 20px)",
                  letterSpacing: 2,
                  textTransform: "uppercase",
                  boxShadow: "0 0 40px rgba(255,215,0,0.3)",
                }}
              >
                ⚽ Simulate World Cup 2026
              </motion.button>
              <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, marginTop: 12, letterSpacing: 1 }}>
                Poisson · Monte Carlo · Dixon-Coles
              </p>
            </div>
          </motion.div>
        )}

        {/* ── REVEALING PHASE ── */}
        {phase === "revealing" && (
          <motion.div key="revealing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ textAlign: "center", padding: "60px 0" }}>
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
              style={{ fontSize: 56, display: "inline-block" }}
            >⚽</motion.div>
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              style={{ color: "#FFD700", fontSize: 18, fontWeight: 700, marginTop: 20, letterSpacing: 2, textTransform: "uppercase" }}
            >
              Running the simulation…
            </motion.p>
            <p style={{ color: "rgba(255,255,255,0.3)", fontSize: 12, marginTop: 8 }}>
              104 matches · Poisson distribution · Dixon-Coles correction
            </p>
          </motion.div>
        )}

        {/* ── DONE PHASE: full results ── */}
        {phase === "done" && data && (
          <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            {/* Tabs + re-simulate */}
            <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
              {(["groups", "bracket"] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  padding: "7px 22px", borderRadius: 20, border: "none", cursor: "pointer",
                  background: tab === t ? "#FFD700" : "rgba(255,255,255,0.08)",
                  color: tab === t ? "#000" : "#fff",
                  fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: "uppercase",
                }}>
                  {t === "groups" ? "Group Stage" : "Knockout Bracket"}
                </button>
              ))}
              <button onClick={handleResim} disabled={simulating} style={{
                padding: "7px 22px", borderRadius: 20, border: "1px solid rgba(255,215,0,0.35)",
                background: "transparent", color: "#FFD700", fontWeight: 700,
                fontSize: 12, cursor: simulating ? "not-allowed" : "pointer", opacity: simulating ? 0.5 : 1,
              }}>
                {simulating ? "Simulating…" : "🔄 Re-Simulate"}
              </button>
            </div>

            {/* Groups tab */}
            {tab === "groups" && (
              <div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))", gap: 14 }}>
                  {Object.entries(data.group_stage).sort(([a],[b]) => a.localeCompare(b)).map(([grp, teams]) => (
                    <GroupResultCard key={grp} group={grp} teams={teams} bestThirds={data.best_thirds} />
                  ))}
                </div>
                <div style={{ display: "flex", gap: 16, justifyContent: "center", marginTop: 16, flexWrap: "wrap" }}>
                  {[{ color: "rgba(0,180,80,0.5)", label: "Qualified (Top 2)" },
                    { color: "rgba(255,165,0,0.5)", label: "Best 3rd (8 advance)" },
                    { color: "rgba(255,255,255,0.08)", label: "Eliminated" }].map(({ color, label }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "rgba(255,255,255,0.4)" }}>
                      <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Bracket tab */}
            {tab === "bracket" && ko && (() => {
              const r32L = ko.round_of_32.slice(0,8), r32R = ko.round_of_32.slice(8,16);
              const r16L = ko.round_of_16.slice(0,4), r16R = ko.round_of_16.slice(4,8);
              const qfL = ko.quarter_finals.slice(0,2), qfR = ko.quarter_finals.slice(2,4);
              const sfL = ko.semi_finals.slice(0,1), sfR = ko.semi_finals.slice(1,2);
              const fin = ko.final[0];
              const tp = ko.third_place[0];
              const lc = "rgba(255,215,0,0.2)";
              return (
                <div>
                  {data.champion && (
                    <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      style={{ textAlign: "center", marginBottom: 28, padding: "16px 24px",
                        background: "linear-gradient(135deg, rgba(255,215,0,0.15), transparent)",
                        border: "1px solid rgba(255,215,0,0.35)", borderRadius: 14 }}>
                      <div style={{ fontSize: 28 }}>🏆</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 3, textTransform: "uppercase" }}>Simulated Champion</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 6 }}>
                        <Flag country={data.champion} size={36} />
                        <span style={{ fontSize: "clamp(20px, 4vw, 36px)", fontWeight: 900, color: "#FFD700", letterSpacing: 2 }}>{data.champion}</span>
                      </div>
                    </motion.div>
                  )}
                  <div style={{ overflowX: "auto", paddingBottom: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: "max-content" }}>
                      <HalfBracket r32={r32L} r16={r16L} qf={qfL} sf={sfL} />
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "0 12px" }}>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 10, letterSpacing: 3, color: "#FFD700", textTransform: "uppercase", marginBottom: 6 }}>Final</div>
                          {fin && <MatchCard match={fin} highlight />}
                        </div>
                        <div style={{ textAlign: "center", opacity: 0.7 }}>
                          <div style={{ fontSize: 9, letterSpacing: 2, color: "rgba(255,255,255,0.35)", textTransform: "uppercase", marginBottom: 4 }}>3rd Place</div>
                          {tp && <MatchCard match={tp} />}
                        </div>
                      </div>
                      <HalfBracket r32={r32R} r16={r16R} qf={qfR} sf={sfR} flip />
                    </div>
                  </div>
                </div>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}
