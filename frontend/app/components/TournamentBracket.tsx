"use client";

import { useEffect, useState, useCallback } from "react";
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

function Flag({ country, size = 22 }: { country: string; size?: number }) {
  const iso = ISO2[country];
  if (!iso) return <span style={{ width: size, height: Math.round(size * 0.67), display: "inline-block", background: "rgba(255,255,255,0.1)", borderRadius: 2 }} />;
  return (
    <img
      src={`https://flagcdn.com/w40/${iso}.png`}
      alt={country}
      width={size}
      height={Math.round(size * 0.67)}
      style={{ objectFit: "cover", borderRadius: 2, flexShrink: 0 }}
      onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
    />
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

// ── Single match slot in the bracket tree ────────────────────────────────────
function BracketMatch({ match, flip = false }: { match: Match; flip?: boolean }) {
  const isPens = match.score?.includes("pens");
  const teams = [
    { name: match.home, prob: match.home_win_prob },
    { name: match.away, prob: match.away_win_prob },
  ];

  return (
    <div style={{
      background: "rgba(8,20,12,0.92)",
      border: "1px solid rgba(255,255,255,0.1)",
      borderRadius: 8,
      overflow: "hidden",
      width: 190,
      boxShadow: "0 2px 12px rgba(0,0,0,0.5)",
    }}>
      {teams.map(({ name, prob }) => {
        const isWinner = name === match.winner;
        return (
          <div key={name} style={{
            display: "flex", alignItems: "center", gap: 7,
            padding: "6px 9px",
            background: isWinner ? "rgba(255,215,0,0.08)" : "transparent",
            borderBottom: "1px solid rgba(255,255,255,0.05)",
            opacity: match.winner && !isWinner ? 0.45 : 1,
          }}>
            <Flag country={name} size={18} />
            <span style={{
              flex: 1, fontSize: 12, fontWeight: isWinner ? 700 : 400,
              color: isWinner ? "#FFD700" : "#ccc",
              whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            }}>{name || "TBD"}</span>
            {match.score && (
              <span style={{ fontSize: 11, color: isWinner ? "#FFD700" : "rgba(255,255,255,0.3)", fontWeight: 700, minWidth: 20, textAlign: "right" }}>
                {match.score.split("-")[name === match.home ? 0 : 1]?.split(" ")[0]}
              </span>
            )}
          </div>
        );
      })}
      {match.score && (
        <div style={{ textAlign: "center", fontSize: 9, color: isPens ? "#FF8C00" : "rgba(255,255,255,0.2)", padding: "2px 0" }}>
          {isPens ? "PENS" : match.score}
        </div>
      )}
    </div>
  );
}

// ── Pair of matches that feed into one next-round match ────────────────────
function MatchPair({ top, bottom, flip = false }: { top: Match; bottom: Match; flip?: boolean }) {
  const lineColor = "rgba(255,215,0,0.25)";
  const lw = 16; // connector arm width

  // Lines: vertical bar on the connector side, two horizontals to each match
  return (
    <div style={{ display: "flex", alignItems: "center", flexDirection: flip ? "row-reverse" : "row" }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <BracketMatch match={top} />
        <BracketMatch match={bottom} />
      </div>
      {/* Connector lines */}
      <div style={{ position: "relative", width: lw, alignSelf: "stretch" }}>
        {/* Top arm */}
        <div style={{
          position: "absolute", top: "25%", left: flip ? 0 : 0,
          width: lw, height: 1, background: lineColor,
          [flip ? "right" : "left"]: 0,
        }} />
        {/* Bottom arm */}
        <div style={{
          position: "absolute", bottom: "25%",
          width: lw, height: 1, background: lineColor,
        }} />
        {/* Vertical bar */}
        <div style={{
          position: "absolute", top: "25%", bottom: "25%",
          [flip ? "left" : "right"]: 0, width: 1, background: lineColor,
        }} />
      </div>
    </div>
  );
}

// ── Half of the bracket (left or right) ───────────────────────────────────
function HalfBracket({
  r32, r16, qf, sf, flip = false,
}: {
  r32: Match[]; r16: Match[]; qf: Match[]; sf: Match[]; flip?: boolean;
}) {
  const lc = "rgba(255,215,0,0.25)";
  const lw = 14;

  return (
    <div style={{ display: "flex", flexDirection: flip ? "row-reverse" : "row", alignItems: "center", gap: 0 }}>

      {/* R32 — 8 matches in 4 pairs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        {[0, 1, 2, 3].map((pi) => (
          <MatchPair key={pi} top={r32[pi * 2]} bottom={r32[pi * 2 + 1]} flip={flip} />
        ))}
      </div>

      {/* Connector R32→R16 */}
      <div style={{ display: "flex", flexDirection: "column", gap: 20, position: "relative" }}>
        {[0, 1, 2, 3].map((i) => (
          <div key={i} style={{ height: 96, width: lw, position: "relative" }}>
            <div style={{ position: "absolute", top: "50%", width: lw, height: 1, background: lc }} />
          </div>
        ))}
      </div>

      {/* R16 — 4 matches in 2 pairs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 52 }}>
        {[0, 1].map((pi) => (
          <MatchPair key={pi} top={r16[pi * 2]} bottom={r16[pi * 2 + 1]} flip={flip} />
        ))}
      </div>

      {/* Connector R16→QF */}
      <div style={{ display: "flex", flexDirection: "column", gap: 52, position: "relative" }}>
        {[0, 1].map((i) => (
          <div key={i} style={{ height: 96, width: lw, position: "relative" }}>
            <div style={{ position: "absolute", top: "50%", width: lw, height: 1, background: lc }} />
          </div>
        ))}
      </div>

      {/* QF — 2 matches in 1 pair */}
      <MatchPair top={qf[0]} bottom={qf[1]} flip={flip} />

      {/* Connector QF→SF */}
      <div style={{ height: 96, width: lw, position: "relative" }}>
        <div style={{ position: "absolute", top: "50%", width: lw, height: 1, background: lc }} />
      </div>

      {/* SF — 1 match */}
      <BracketMatch match={sf[0]} />

      {/* Arm to center */}
      <div style={{ width: 20, height: 1, background: lc }} />
    </div>
  );
}

// ── Group table ─────────────────────────────────────────────────────────────
function GroupTable({ group, teams, bestThirds }: { group: string; teams: GroupTeam[]; bestThirds: string[] }) {
  return (
    <div style={{
      background: "rgba(8,20,12,0.85)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10, overflow: "hidden",
    }}>
      <div style={{ background: "rgba(255,215,0,0.12)", padding: "5px 10px", fontSize: 11, fontWeight: 700, color: "#FFD700", letterSpacing: 2 }}>
        GROUP {group}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
        <thead>
          <tr style={{ color: "rgba(255,255,255,0.35)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
            <th style={{ padding: "4px 8px", textAlign: "left", fontWeight: 400 }}>Team</th>
            <th style={{ padding: "4px 4px", textAlign: "center", fontWeight: 400, width: 22 }}>P</th>
            <th style={{ padding: "4px 4px", textAlign: "center", fontWeight: 400, width: 30 }}>GD</th>
            <th style={{ padding: "4px 4px", textAlign: "center", fontWeight: 400, width: 30 }}>Pts</th>
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
                  <span style={{ color: qual ? "#e0e0e0" : "#999", fontWeight: qual ? 600 : 400, fontSize: 12 }}>
                    {t.team.length > 14 ? t.team.slice(0, 13) + "…" : t.team}
                  </span>
                </td>
                <td style={{ textAlign: "center", color: "rgba(255,255,255,0.5)", padding: "5px 4px" }}>3</td>
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

// ── Main component ──────────────────────────────────────────────────────────
export default function TournamentBracket() {
  const [data, setData] = useState<BracketData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warming, setWarming] = useState(false);
  const [tab, setTab] = useState<"groups" | "bracket">("groups");

  const simulate = useCallback(() => {
    setLoading(true);
    setError(null);
    fetch(`${API}/simulate/bracket`)
      .then((r) => { if (!r.ok) throw new Error(`API error ${r.status}`); return r.json(); })
      .then((d: BracketData) => { setData(d); setLoading(false); setWarming(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, []);

  useEffect(() => {
    // Show static fallback instantly
    fetch("/bracket-fallback.json")
      .then((r) => r.json())
      .then((d) => setData(d))
      .catch(() => {});

    // Poll until prediction cache is warm, then fetch fresh sim
    const poll = () =>
      fetch(`${API}/ready`)
        .then((r) => r.json())
        .then((s) => {
          if (s.bracket_ready) { simulate(); }
          else { setWarming(true); setTimeout(poll, 3000); }
        })
        .catch(() => { setWarming(true); setTimeout(poll, 5000); });
    poll();
  }, []);

  const ko = data?.knockout;

  return (
    <section style={{ padding: "40px 24px", maxWidth: 1600, margin: "0 auto" }}>
      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <p style={{ fontSize: 12, letterSpacing: 4, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 6 }}>
          2026 FIFA World Cup
        </p>
        <h2 style={{
          fontSize: "clamp(22px, 4vw, 40px)", fontWeight: 900, letterSpacing: 3,
          background: "linear-gradient(90deg, #FFD700, #fff 50%, #FFD700)",
          WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
          textTransform: "uppercase", margin: 0,
        }}>
          Projected Bracket
        </h2>
      </div>

      {/* Tabs + controls */}
      <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 28, flexWrap: "wrap" }}>
        {(["groups", "bracket"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: "7px 22px", borderRadius: 20, border: "none", cursor: "pointer",
            background: tab === t ? "#FFD700" : "rgba(255,255,255,0.08)",
            color: tab === t ? "#000" : "#fff",
            fontWeight: 700, fontSize: 12, letterSpacing: 1, textTransform: "uppercase",
          }}>
            {t === "groups" ? "Group Stage" : "Knockout Bracket"}
          </button>
        ))}
        <button onClick={() => simulate()} disabled={loading} style={{
          padding: "7px 22px", borderRadius: 20, border: "1px solid rgba(255,215,0,0.35)",
          background: "transparent", color: "#FFD700", fontWeight: 700,
          fontSize: 12, cursor: loading ? "not-allowed" : "pointer", letterSpacing: 1,
          opacity: loading ? 0.5 : 1,
        }}>
          {loading ? "Simulating…" : "🔄 Re-Simulate"}
        </button>
      </div>

      {error && !warming && (
        <p style={{ textAlign: "center", color: "#f87171", marginBottom: 20 }}>
          ⚠ {error} — is the backend running at {API}?
        </p>
      )}

      {/* Only show spinner if we have no data at all yet */}
      {(loading || warming) && !data && (
        <div style={{ textAlign: "center", padding: 60 }}>
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.4, ease: "linear" }}
            style={{ fontSize: 44, display: "inline-block" }}>⚽</motion.div>
          <p style={{ color: "rgba(255,255,255,0.5)", marginTop: 14, fontSize: 14, fontWeight: 600 }}>
            {warming ? "Waking up the server…" : "Running simulation…"}
          </p>
          <p style={{ color: "rgba(255,255,255,0.25)", marginTop: 6, fontSize: 12 }}>
            {warming ? "First visit after a quiet period takes ~30s. Hang tight ⚽" : "Simulating 104 matches"}
          </p>
        </div>
      )}

      <AnimatePresence mode="wait">
        {data && !loading && (
          <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>

            {/* ── GROUP STAGE ── */}
            {tab === "groups" && (
              <div>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                  gap: 14,
                }}>
                  {Object.entries(data.group_stage)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([grp, teams]) => (
                      <GroupTable key={grp} group={grp} teams={teams} bestThirds={data.best_thirds} />
                    ))}
                </div>
                <div style={{ display: "flex", gap: 20, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
                  {[
                    { color: "rgba(0,180,80,0.5)", label: "Qualified (Top 2)" },
                    { color: "rgba(255,165,0,0.5)", label: "Best 3rd (8 advance)" },
                    { color: "rgba(255,255,255,0.1)", label: "Eliminated" },
                  ].map(({ color, label }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: "rgba(255,255,255,0.45)" }}>
                      <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
                      {label}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── KNOCKOUT BRACKET ── */}
            {tab === "bracket" && ko && (() => {
              // Split 16 R32 into left (0-7) and right (8-15)
              const r32L = ko.round_of_32.slice(0, 8);
              const r32R = ko.round_of_32.slice(8, 16);
              const r16L = ko.round_of_16.slice(0, 4);
              const r16R = ko.round_of_16.slice(4, 8);
              const qfL  = ko.quarter_finals.slice(0, 2);
              const qfR  = ko.quarter_finals.slice(2, 4);
              const sfL  = ko.semi_finals.slice(0, 1);
              const sfR  = ko.semi_finals.slice(1, 2);
              const fin  = ko.final[0] ?? { home: "TBD", away: "TBD", score: "", winner: "", home_win_prob: 0.5, draw_prob: 0, away_win_prob: 0.5 };
              const tp   = ko.third_place[0] ?? fin;

              return (
                <div style={{ overflowX: "auto", paddingBottom: 20 }}>
                  {/* Champion */}
                  {data.champion && (
                    <motion.div initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                      style={{
                        textAlign: "center", marginBottom: 28,
                        padding: "16px 24px",
                        background: "linear-gradient(135deg, rgba(255,215,0,0.15), transparent)",
                        border: "1px solid rgba(255,215,0,0.35)", borderRadius: 14,
                      }}>
                      <div style={{ fontSize: 28, marginBottom: 4 }}>🏆</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", letterSpacing: 3, textTransform: "uppercase" }}>Simulated Champion</div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10, marginTop: 6 }}>
                        <Flag country={data.champion} size={36} />
                        <span style={{ fontSize: "clamp(20px, 4vw, 36px)", fontWeight: 900, color: "#FFD700", letterSpacing: 2 }}>
                          {data.champion}
                        </span>
                      </div>
                    </motion.div>
                  )}

                  {/* Bracket tree */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minWidth: "max-content", gap: 0 }}>
                    {/* LEFT half */}
                    <HalfBracket r32={r32L} r16={r16L} qf={qfL} sf={sfL} flip={false} />

                    {/* Center: Final + 3rd place */}
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20, padding: "0 12px" }}>
                      {/* Final */}
                      <div style={{ textAlign: "center" }}>
                        <div style={{ fontSize: 10, letterSpacing: 3, color: "#FFD700", textTransform: "uppercase", marginBottom: 6 }}>Final</div>
                        <div style={{
                          background: "linear-gradient(135deg, rgba(255,215,0,0.15), rgba(0,0,0,0.6))",
                          border: "1px solid rgba(255,215,0,0.45)",
                          borderRadius: 10, overflow: "hidden", width: 200,
                          boxShadow: "0 0 24px rgba(255,215,0,0.15)",
                        }}>
                          {[{ name: fin.home, prob: fin.home_win_prob }, { name: fin.away, prob: fin.away_win_prob }].map(({ name, prob }) => {
                            const isW = name === fin.winner;
                            return (
                              <div key={name} style={{
                                display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
                                borderBottom: "1px solid rgba(255,255,255,0.06)",
                                background: isW ? "rgba(255,215,0,0.1)" : "transparent",
                                opacity: fin.winner && !isW ? 0.45 : 1,
                              }}>
                                <Flag country={name} size={20} />
                                <span style={{ flex: 1, fontSize: 13, fontWeight: isW ? 700 : 400, color: isW ? "#FFD700" : "#ccc" }}>{name || "TBD"}</span>
                                {fin.score && <span style={{ fontSize: 12, fontWeight: 700, color: isW ? "#FFD700" : "rgba(255,255,255,0.3)" }}>
                                  {fin.score.split("-")[name === fin.home ? 0 : 1]?.split(" ")[0]}
                                </span>}
                              </div>
                            );
                          })}
                          {fin.score && <div style={{ textAlign: "center", fontSize: 9, color: "rgba(255,255,255,0.3)", padding: "3px 0" }}>{fin.score}</div>}
                        </div>
                      </div>

                      {/* 3rd place */}
                      <div style={{ textAlign: "center", opacity: 0.75 }}>
                        <div style={{ fontSize: 9, letterSpacing: 2, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", marginBottom: 4 }}>3rd Place</div>
                        <BracketMatch match={tp} />
                      </div>
                    </div>

                    {/* RIGHT half — mirrored */}
                    <HalfBracket r32={r32R} r16={r16R} qf={qfR} sf={sfR} flip={true} />
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
