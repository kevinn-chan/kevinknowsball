"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// ── Shared types & helpers ────────────────────────────────────────────────────
interface Player {
  player_name: string; country: string; wc_group: string; club_team: string;
  age: number; general_position: string; specific_position: string;
  market_value: number; international_caps: number; international_goals: number;
  goals_per_90: number; assists_per_90: number; interceptions: number;
  tackles_won: number; crosses: number; role: string; versatility: number;
}

const ISO2: Record<string, string> = {
  France:"fr",Spain:"es",England:"gb-eng",Argentina:"ar",Brazil:"br",Germany:"de",
  Portugal:"pt",Netherlands:"nl",Morocco:"ma",Mexico:"mx",Uruguay:"uy",Japan:"jp",
  Belgium:"be",Colombia:"co",Senegal:"sn",Norway:"no",Ecuador:"ec",Switzerland:"ch",
  Türkiye:"tr","South Korea":"kr","United States":"us",Canada:"ca",Australia:"au",
  Croatia:"hr",Ghana:"gh",Panama:"pa",Algeria:"dz",Austria:"at",Jordan:"jo",
  "DR Congo":"cd",Uzbekistan:"uz",Scotland:"gb-sct",Haiti:"ht","Cape Verde":"cv",
  "Saudi Arabia":"sa",Qatar:"qa",Egypt:"eg",Iran:"ir",Iraq:"iq",Sweden:"se",
  Tunisia:"tn","New Zealand":"nz",Paraguay:"py","Ivory Coast":"ci","Curaçao":"cw",
  "Bosnia and Herzegovina":"ba","Czech Republic":"cz","South Africa":"za",
};

function Flag({ country, size = 20 }: { country: string; size?: number }) {
  const iso = ISO2[country];
  if (!iso) return null;
  return <img src={`https://flagcdn.com/w40/${iso}.png`} alt={country}
    width={size * 1.5} height={size} style={{ objectFit:"cover", borderRadius:2 }}
    onError={e => ((e.target as HTMLImageElement).style.display="none")} />;
}

function fmt(v: number) {
  if (v >= 1e8) return `€${(v/1e6).toFixed(0)}M`;
  if (v >= 1e6) return `€${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `€${(v/1e3).toFixed(0)}K`;
  return v > 0 ? `€${v}` : "—";
}

// ── Tab shell ─────────────────────────────────────────────────────────────────
type Tab = "squad" | "whoami" | "hol";
const TABS: { id: Tab; label: string; emoji: string }[] = [
  { id:"squad",  label:"€150M Squad Builder", emoji:"🏗" },
  { id:"whoami", label:"Who Am I?",            emoji:"🎭" },
  { id:"hol",    label:"Higher or Lower",      emoji:"📈" },
];

// ══════════════════════════════════════════════════════════════════════════════
// GAME 1 — €150M Squad Builder
// ══════════════════════════════════════════════════════════════════════════════
const POSITIONS = ["GK","DEF","MID","MID2","ATT"] as const;
type Pos = (typeof POSITIONS)[number];
const POS_LABEL: Record<Pos, string> = { GK:"Goalkeeper", DEF:"Defender", MID:"Midfielder", MID2:"Midfielder", ATT:"Attacker" };
const POS_API: Record<Pos, string> = { GK:"GK", DEF:"DEF", MID:"MID", MID2:"MID", ATT:"ATT" };
const BUDGET = 150_000_000;

function randPlayer(pool: Player[], exclude: string[]): Player {
  const eligible = pool.filter(p => !exclude.includes(p.player_name));
  return eligible[Math.floor(Math.random() * eligible.length)];
}

const MAX_SKIPS = 5;

function aiScoutLine(r: any): string {
  const s = r.score;
  const hasChem = r.chemistry_bonus > 0;
  const hasStar = r.star_bonus > 0;
  const overBudget = r.total_value > 150_000_000;
  if (s >= 85) return `An elite WC squad. ${hasChem ? "Strong team cohesion gives them an edge in high-pressure knockout games." : "Star power and depth — this side could go deep in the tournament."}`;
  if (s >= 70) return `Solid but not flawless. ${hasStar ? "The marquee signing carries real goal threat," : "Decent across the board,"} ${hasChem ? "and the chemistry bonus shows good squad harmony." : "though a shared club or nation would tighten the bond."}`;
  if (s >= 55) return `Mid-table WC material. ${overBudget ? "Overspent on names rather than roles — balance is key." : "A few shrewd picks but the squad lacks a defining quality."}`;
  if (s >= 40) return `Struggles ahead. The individual ratings don't add up to a cohesive unit — the group stage looks tricky.`;
  return `This squad wouldn't survive the group stage. No chemistry, no star power, questionable positional balance.`;
}

function SquadBuilder({ allPlayers }: { allPlayers: Player[] }) {
  // candidate[pos] = the player currently shown for that slot (not yet accepted)
  const [squad, setSquad]       = useState<Record<Pos, Player|null>>({ GK:null, DEF:null, MID:null, MID2:null, ATT:null });
  const [candidate, setCandidate] = useState<Record<Pos, Player|null>>({ GK:null, DEF:null, MID:null, MID2:null, ATT:null });
  const [result, setResult]     = useState<any>(null);
  const [simming, setSimming]   = useState(false);
  const [activePos, setActivePos] = useState<Pos|null>(null);
  const [skipsLeft, setSkipsLeft] = useState(MAX_SKIPS);

  // Only WC participants
  const wcPlayers = allPlayers.filter(p => p.wc_group && p.wc_group !== "0");

  const acceptedNames = Object.values(squad).filter(Boolean).map(p => p!.player_name);
  const spent = Object.values(squad).reduce((s, p) => s + (p?.market_value ?? 0), 0);
  const remaining = BUDGET - spent;
  const full = Object.values(squad).every(Boolean);

  const poolFor = useCallback((pos: Pos) => {
    const apiPos = POS_API[pos];
    return wcPlayers.filter(p => p.general_position === apiPos && p.market_value > 0);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wcPlayers.length]);

  const deal = useCallback((pos: Pos) => {
    if (!allPlayers.length) return;
    const exclude = acceptedNames.concat(candidate[pos]?.player_name ?? []);
    const pool = poolFor(pos);
    const p = pool.filter(x => !exclude.includes(x.player_name));
    if (!p.length) return;
    const pick = p[Math.floor(Math.random() * p.length)];
    setCandidate(c => ({ ...c, [pos]: pick }));
    setActivePos(pos);
    setResult(null);
  }, [allPlayers, acceptedNames, candidate, poolFor]);

  const accept = (pos: Pos) => {
    const p = candidate[pos];
    if (!p) return;
    // Check budget: accepted value + this player
    const otherSpend = Object.entries(squad)
      .filter(([k]) => k !== pos)
      .reduce((s, [, v]) => s + (v?.market_value ?? 0), 0);
    if (otherSpend + p.market_value > BUDGET) return; // over budget — force reroll
    setSquad(s => ({ ...s, [pos]: p }));
    setCandidate(c => ({ ...c, [pos]: null }));
    setActivePos(null);
    setResult(null);
  };

  const reject = (pos: Pos) => {
    if (skipsLeft <= 0) return;
    setSkipsLeft(s => s - 1);
    deal(pos);
  };

  const clear = (pos: Pos) => {
    setSquad(s => ({ ...s, [pos]: null }));
    setCandidate(c => ({ ...c, [pos]: null }));
    setActivePos(null);
    setResult(null);
  };

  const resetAll = () => {
    setSquad({ GK:null, DEF:null, MID:null, MID2:null, ATT:null });
    setCandidate({ GK:null, DEF:null, MID:null, MID2:null, ATT:null });
    setSkipsLeft(MAX_SKIPS);
    setResult(null);
    setActivePos(null);
  };

  const simulate = async () => {
    if (!full) return;
    setSimming(true);
    try {
      const players = Object.values(squad).map(p => p!);
      const r = await fetch(`${API}/squad/score`, {
        method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ players }),
      });
      setResult(await r.json());
    } catch { /* ignore */ }
    setSimming(false);
  };

  const scoreColor = result ? (result.score >= 85 ? "#FFD700" : result.score >= 70 ? "#4ADE80" : result.score >= 55 ? "#00D4FF" : "#FF8C00") : "#FFD700";

  return (
    <div>
      {/* Budget bar */}
      <div style={{ marginBottom:16 }}>
        <div style={{ display:"flex", justifyContent:"space-between", fontSize:11,
          color:"rgba(255,255,255,0.4)", letterSpacing:1, textTransform:"uppercase", marginBottom:6 }}>
          <span>Budget · €150M</span>
          <div style={{ display:"flex", gap:12, alignItems:"center" }}>
            <span style={{ color: skipsLeft <= 1 ? "#FF6B6B" : skipsLeft <= 3 ? "#FFD700" : "rgba(255,255,255,0.4)" }}>
              {skipsLeft === 0 ? "NO SKIPS LEFT" : `${skipsLeft} skip${skipsLeft !== 1 ? "s" : ""} left`}
            </span>
            <span style={{ color: remaining < 0 ? "#FF6B6B" : "#4ADE80" }}>
              {remaining < 0 ? "OVER BUDGET" : `${fmt(remaining)} remaining`}
            </span>
          </div>
        </div>
        <div style={{ height:6, background:"rgba(255,255,255,0.07)", borderRadius:3, overflow:"hidden" }}>
          <motion.div animate={{ width:`${Math.min((spent/BUDGET)*100, 100)}%` }}
            transition={{ duration:0.4 }}
            style={{ height:"100%", borderRadius:3,
              background: remaining < 0 ? "#FF6B6B" : remaining < 20_000_000 ? "#FFD700" : "#4ADE80" }} />
        </div>
      </div>

      {/* Slots */}
      <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:16 }}>
        {POSITIONS.map(pos => {
          const player = squad[pos];
          const cand = candidate[pos];

          return (
            <div key={pos}>
              {/* Accepted row */}
              <div style={{
                display:"flex", alignItems:"center", gap:10, padding:"10px 14px",
                background: player ? "rgba(74,222,128,0.07)" : "rgba(255,255,255,0.03)",
                border: `1px solid ${player ? "rgba(74,222,128,0.2)" : "rgba(255,255,255,0.07)"}`,
                borderRadius: cand ? "10px 10px 0 0" : 10,
              }}>
                <div style={{ width:32, height:32, borderRadius:7, flexShrink:0,
                  background:"rgba(255,255,255,0.06)", display:"flex", alignItems:"center",
                  justifyContent:"center", fontSize:9, fontWeight:800, color:"rgba(255,215,0,0.6)",
                  letterSpacing:1 }}>
                  {pos === "MID2" ? "MID" : pos}
                </div>

                {player ? (
                  <>
                    <Flag country={player.country} size={15} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:700, color:"#fff",
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {player.player_name}
                      </div>
                      <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)" }}>
                        {player.club_team} · {player.specific_position}
                      </div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:"#4ADE80", flexShrink:0 }}>
                      {fmt(player.market_value)}
                    </span>
                    <button onClick={() => clear(pos)} style={{
                      background:"none", border:"none", color:"rgba(255,255,255,0.2)",
                      cursor:"pointer", fontSize:15, padding:"0 0 0 4px", lineHeight:1,
                    }}>✕</button>
                  </>
                ) : (
                  <>
                    <div style={{ flex:1, fontSize:11, color:"rgba(255,255,255,0.2)" }}>
                      {POS_LABEL[pos]} — empty
                    </div>
                    {!cand && (
                      <motion.button onClick={() => deal(pos)}
                        whileHover={{ scale:1.05 }} whileTap={{ scale:0.95 }}
                        style={{
                          padding:"5px 12px", borderRadius:20, border:"1px solid rgba(255,215,0,0.3)",
                          background:"rgba(255,215,0,0.07)", color:"#FFD700",
                          fontSize:10, fontWeight:800, cursor:"pointer", letterSpacing:1,
                        }}>
                        DRAW
                      </motion.button>
                    )}
                  </>
                )}
              </div>

              {/* Candidate reveal panel */}
              <AnimatePresence>
                {cand && !player && (
                  <motion.div
                    initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:"auto" }}
                    exit={{ opacity:0, height:0 }} transition={{ duration:0.2 }}
                    style={{
                      overflow:"hidden",
                      background:"rgba(255,215,0,0.05)",
                      border:"1px solid rgba(255,215,0,0.2)", borderTop:"none",
                      borderRadius:"0 0 10px 10px",
                    }}>
                    <div style={{ padding:"12px 14px", display:"flex", alignItems:"center", gap:10 }}>
                      <Flag country={cand.country} size={18} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:14, fontWeight:800, color:"#FFD700",
                          overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                          {cand.player_name}
                        </div>
                        <div style={{ fontSize:10, color:"rgba(255,255,255,0.4)" }}>
                          {cand.specific_position} · {cand.country} · {fmt(cand.market_value)}
                        </div>
                      </div>
                      <div style={{ display:"flex", gap:6, flexShrink:0 }}>
                        <motion.button onClick={() => accept(pos)}
                          whileHover={{ scale:1.08 }} whileTap={{ scale:0.93 }}
                          style={{
                            padding:"6px 14px", borderRadius:20, border:"none",
                            background:"#4ADE80", color:"#000",
                            fontSize:11, fontWeight:900, cursor:"pointer",
                          }}>
                          ✓ Keep
                        </motion.button>
                        <motion.button onClick={() => reject(pos)}
                          disabled={skipsLeft <= 0}
                          whileHover={skipsLeft > 0 ? { scale:1.08 } : {}} whileTap={skipsLeft > 0 ? { scale:0.93 } : {}}
                          style={{
                            padding:"6px 14px", borderRadius:20,
                            border:`1px solid ${skipsLeft > 0 ? "rgba(255,107,107,0.4)" : "rgba(255,255,255,0.1)"}`,
                            background: skipsLeft > 0 ? "rgba(255,107,107,0.1)" : "rgba(255,255,255,0.04)",
                            color: skipsLeft > 0 ? "#FF6B6B" : "rgba(255,255,255,0.2)",
                            fontSize:11, fontWeight:900, cursor: skipsLeft > 0 ? "pointer" : "not-allowed",
                          }}>
                          ✗ Skip {skipsLeft > 0 && `(${skipsLeft})`}
                        </motion.button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>

      {/* Simulate button */}
      <motion.button onClick={simulate} disabled={!full || simming || remaining < 0}
        whileHover={full && !simming ? { scale:1.02 } : {}}
        whileTap={full && !simming ? { scale:0.97 } : {}}
        style={{
          width:"100%", padding:"14px", borderRadius:12, border:"none", cursor: full ? "pointer" : "not-allowed",
          background: full && remaining >= 0 ? "linear-gradient(135deg,#FFD700,#e6a800)" : "rgba(255,255,255,0.06)",
          color: full && remaining >= 0 ? "#000" : "rgba(255,255,255,0.25)",
          fontWeight:900, fontSize:15, letterSpacing:2, textTransform:"uppercase",
          marginBottom: result ? 20 : 8,
        }}>
        {simming ? "Scouting Report Loading…" : full ? "🤖 Get AI Rating" : "Fill all 5 slots to get AI rating"}
      </motion.button>

      {(full || result) && (
        <button onClick={resetAll} style={{
          display:"block", margin:"0 auto", background:"none", border:"none",
          color:"rgba(255,255,255,0.2)", fontSize:11, cursor:"pointer", letterSpacing:1,
          textDecoration:"underline", marginBottom: result ? 12 : 0,
        }}>
          Reset Squad
        </button>
      )}

      {/* Result */}
      <AnimatePresence>
        {result && (
          <motion.div initial={{ opacity:0, y:12 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
            style={{
              background:`linear-gradient(135deg, rgba(15,35,22,0.97), rgba(8,18,12,0.97))`,
              border:`1px solid ${scoreColor}40`, borderRadius:14, padding:"20px 20px 16px",
            }}>
            {/* Score ring */}
            <div style={{ textAlign:"center", marginBottom:16 }}>
              <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", letterSpacing:3,
                textTransform:"uppercase", marginBottom:4 }}>🤖 AI Scouting Report</div>
              <div style={{ fontSize:72, fontWeight:900, lineHeight:1, color:scoreColor,
                textShadow:`0 0 32px ${scoreColor}55` }}>
                {result.score}
              </div>
              <div style={{ fontSize:16, fontWeight:800, color:scoreColor, marginTop:4 }}>{result.verdict}</div>
              <div style={{ fontSize:11, color:"rgba(255,255,255,0.4)", marginTop:10, lineHeight:1.6,
                padding:"0 8px", fontStyle:"italic" }}>
                {aiScoutLine(result)}
              </div>
            </div>

            {/* Bonuses */}
            {(result.chemistry_bonus > 0 || result.star_bonus > 0) && (
              <div style={{ display:"flex", gap:8, justifyContent:"center", marginBottom:14, flexWrap:"wrap" }}>
                {result.chemistry_bonus > 0 && (
                  <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20,
                    background:"rgba(0,212,255,0.12)", border:"1px solid rgba(0,212,255,0.3)", color:"#00D4FF" }}>
                    ⚗ Chemistry +{result.chemistry_bonus}
                  </span>
                )}
                {result.star_bonus > 0 && (
                  <span style={{ fontSize:11, padding:"3px 10px", borderRadius:20,
                    background:"rgba(255,215,0,0.12)", border:"1px solid rgba(255,215,0,0.3)", color:"#FFD700" }}>
                    ⭐ Star Player +{result.star_bonus}
                  </span>
                )}
              </div>
            )}

            {/* Breakdown */}
            <div style={{ display:"flex", flexDirection:"column", gap:4 }}>
              {Object.entries(result.breakdown).map(([name, s]: [string, any]) => (
                <div key={name} style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:11, color:"rgba(255,255,255,0.5)", flex:1,
                    overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{name}</span>
                  <div style={{ width:80, height:4, background:"rgba(255,255,255,0.07)", borderRadius:2, overflow:"hidden" }}>
                    <div style={{ width:`${(s/20)*100}%`, height:"100%", background:scoreColor, borderRadius:2 }} />
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:scoreColor, width:28, textAlign:"right" }}>{s}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GAME 2 — Who Am I? Blind Test
// ══════════════════════════════════════════════════════════════════════════════
function WhoAmI({ allPlayers }: { allPlayers: Player[] }) {
  const [player, setPlayer] = useState<Player|null>(null);
  const [options, setOptions] = useState<string[]>([]);
  const [picked, setPicked] = useState<string|null>(null);
  const [score, setScore] = useState(0);
  const [round, setRound] = useState(0);
  const [streak, setStreak] = useState(0);
  const [done, setDone] = useState(false);
  const ROUNDS = 8;

  const nextRound = useCallback(() => {
    if (allPlayers.length < 4) return;
    const valid = allPlayers.filter(p => p.market_value > 500_000 && p.international_caps > 3);
    const p = valid[Math.floor(Math.random() * valid.length)];
    const decoys = valid.filter(d => d.player_name !== p.player_name)
      .sort(() => Math.random() - 0.5).slice(0, 3).map(d => d.player_name);
    const opts = [...decoys, p.player_name].sort(() => Math.random() - 0.5);
    setPlayer(p); setOptions(opts); setPicked(null);
  }, [allPlayers]);

  useEffect(() => { if (allPlayers.length) nextRound(); }, [allPlayers.length]);

  const guess = (name: string) => {
    if (picked) return;
    setPicked(name);
    const correct = name === player?.player_name;
    if (correct) { setScore(s => s + 1); setStreak(s => s + 1); }
    else setStreak(0);
    setRound(r => r + 1);
  };

  const next = () => {
    if (round >= ROUNDS) { setDone(true); return; }
    nextRound();
  };

  const restart = () => {
    setScore(0); setRound(0); setStreak(0); setDone(false); setPicked(null);
    nextRound();
  };

  if (!player) return <div style={{ textAlign:"center", color:"rgba(255,255,255,0.3)", padding:"40px 0" }}>Loading…</div>;

  if (done) {
    const g = score >= 7 ? { l:"Elite Scout 🧠", c:"#FFD700" } : score >= 5 ? { l:"Good Eye 👁", c:"#4ADE80" } : score >= 3 ? { l:"Average Fan", c:"#00D4FF" } : { l:"Who? 😅", c:"#FF6B6B" };
    return (
      <motion.div initial={{ opacity:0, scale:0.92 }} animate={{ opacity:1, scale:1 }} style={{ textAlign:"center" }}>
        <div style={{ fontSize:56, marginBottom:10 }}>🎭</div>
        <div style={{ fontSize:64, fontWeight:900, color:g.c, textShadow:`0 0 28px ${g.c}55` }}>{score}/{ROUNDS}</div>
        <div style={{ fontSize:18, fontWeight:800, color:g.c, marginBottom:6 }}>{g.l}</div>
        <p style={{ color:"rgba(255,255,255,0.35)", fontSize:13, marginBottom:24 }}>
          You identified {score} out of {ROUNDS} players correctly.
        </p>
        <motion.button onClick={restart} whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}
          style={{
            padding:"13px 40px", borderRadius:50, border:"none", cursor:"pointer",
            background:"linear-gradient(135deg,#FFD700,#e6a800)",
            color:"#000", fontWeight:900, fontSize:15, letterSpacing:2, textTransform:"uppercase",
          }}>Play Again</motion.button>
      </motion.div>
    );
  }

  const statRows = [
    { label:"G / 90",   val:player.goals_per_90,   show: player.goals_per_90 > 0 },
    { label:"A / 90",   val:player.assists_per_90,  show: player.assists_per_90 > 0 },
    { label:"Tackles",  val:player.tackles_won,      show: player.tackles_won > 0 },
    { label:"Intercept",val:player.interceptions,    show: player.interceptions > 0 },
    { label:"Crosses",  val:player.crosses,          show: player.crosses > 0 },
  ].filter(r => r.show);

  return (
    <div>
      {/* Progress */}
      <div style={{ display:"flex", gap:5, marginBottom:20, alignItems:"center" }}>
        {Array.from({ length:ROUNDS }).map((_,i) => (
          <div key={i} style={{ flex:1, height:3, borderRadius:2,
            background: i < round ? "#4ADE80" : i === round ? "#FFD700" : "rgba(255,255,255,0.08)" }} />
        ))}
        <span style={{ fontSize:11, color:"#FFD700", fontWeight:700, marginLeft:4 }}>{score}/{round}</span>
      </div>

      {/* Player card (stats only, no name) */}
      <div style={{
        background:"rgba(8,20,12,0.9)", border:"1px solid rgba(255,215,0,0.15)",
        borderRadius:14, padding:"20px", marginBottom:16,
      }}>
        <div style={{ display:"flex", justifyContent:"space-between", marginBottom:14 }}>
          <div>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", letterSpacing:2,
              textTransform:"uppercase", marginBottom:4 }}>Position</div>
            <div style={{ fontSize:13, fontWeight:700, color:"#fff" }}>{player.specific_position}</div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div style={{ fontSize:10, color:"rgba(255,255,255,0.25)", letterSpacing:2,
              textTransform:"uppercase", marginBottom:4 }}>Role</div>
            <div style={{ fontSize:13, fontWeight:700, color:"#FFD700" }}>{player.role}</div>
          </div>
        </div>

        {/* Stats */}
        <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
          {statRows.map(r => (
            <div key={r.label} style={{ display:"grid", gridTemplateColumns:"70px 1fr 40px",
              alignItems:"center", gap:8, fontSize:11 }}>
              <span style={{ color:"rgba(255,255,255,0.4)", textTransform:"uppercase", letterSpacing:0.5 }}>{r.label}</span>
              <div style={{ height:5, background:"rgba(255,255,255,0.07)", borderRadius:3, overflow:"hidden" }}>
                <div style={{ height:"100%", borderRadius:3, background:"#00D4FF",
                  width:`${Math.min(r.val * 20, 100)}%` }} />
              </div>
              <span style={{ color:"#00D4FF", fontWeight:700, textAlign:"right" }}>{r.val.toFixed(2)}</span>
            </div>
          ))}
          <div style={{ display:"flex", justifyContent:"space-between", marginTop:4,
            paddingTop:10, borderTop:"1px solid rgba(255,255,255,0.05)", fontSize:11 }}>
            <span style={{ color:"rgba(255,255,255,0.35)" }}>Market Value</span>
            <span style={{ color:"#FFD700", fontWeight:700 }}>{fmt(player.market_value)}</span>
          </div>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:11 }}>
            <span style={{ color:"rgba(255,255,255,0.35)" }}>Int'l Caps</span>
            <span style={{ color:"#4ADE80", fontWeight:700 }}>{Math.round(player.international_caps)}</span>
          </div>
        </div>
      </div>

      {/* Options */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
        {options.map(name => {
          const correct = name === player.player_name;
          const isChosen = name === picked;
          let bg = "rgba(255,255,255,0.05)";
          let border = "1px solid rgba(255,255,255,0.1)";
          let color = "#fff";
          if (picked) {
            if (correct) { bg="rgba(74,222,128,0.15)"; border="1px solid rgba(74,222,128,0.4)"; color="#4ADE80"; }
            else if (isChosen) { bg="rgba(255,107,107,0.12)"; border="1px solid rgba(255,107,107,0.35)"; color="#FF6B6B"; }
            else { bg="rgba(255,255,255,0.02)"; color="rgba(255,255,255,0.25)"; }
          }
          return (
            <motion.button key={name} onClick={() => guess(name)} disabled={!!picked}
              whileHover={!picked ? { scale:1.02 } : {}} whileTap={!picked ? { scale:0.97 } : {}}
              style={{
                padding:"12px 10px", borderRadius:10, border, background:bg, color,
                fontWeight:700, fontSize:12, cursor:picked ? "default" : "pointer",
                textAlign:"center", transition:"all 0.2s", lineHeight:1.3,
              }}>
              {name}
            </motion.button>
          );
        })}
      </div>

      {picked && (
        <motion.button onClick={next} initial={{ opacity:0, y:8 }} animate={{ opacity:1, y:0 }}
          whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
          style={{
            width:"100%", marginTop:12, padding:"13px", borderRadius:10,
            border:"1px solid rgba(255,215,0,0.25)", background:"rgba(255,215,0,0.07)",
            color:"#FFD700", fontWeight:800, fontSize:13, cursor:"pointer", letterSpacing:1,
            textTransform:"uppercase",
          }}>
          {round >= ROUNDS ? "See Results →" : "Next Player →"}
        </motion.button>
      )}

      {streak >= 3 && !picked && (
        <div style={{ textAlign:"center", fontSize:11, color:"#FFD700", marginTop:8 }}>
          🔥 {streak} in a row!
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// GAME 3 — Higher or Lower
// ══════════════════════════════════════════════════════════════════════════════
const METRICS = [
  { key:"market_value",       label:"Market Value",     fmt:(v:number) => fmt(v) },
  { key:"goals_per_90",       label:"Goals per 90",     fmt:(v:number) => v.toFixed(2) },
  { key:"assists_per_90",     label:"Assists per 90",   fmt:(v:number) => v.toFixed(2) },
  { key:"tackles_won",        label:"Tackles Won",      fmt:(v:number) => Math.round(v).toString() },
  { key:"international_caps", label:"International Caps",fmt:(v:number) => Math.round(v).toString() },
  { key:"interceptions",      label:"Interceptions",    fmt:(v:number) => Math.round(v).toString() },
] as const;
type MetricKey = (typeof METRICS)[number]["key"];

function HigherOrLower({ allPlayers }: { allPlayers: Player[] }) {
  const [left, setLeft]   = useState<Player|null>(null);
  const [right, setRight] = useState<Player|null>(null);
  const [metric, setMetric] = useState<typeof METRICS[number]>(METRICS[0]);
  const [streak, setStreak] = useState(0);
  const [best, setBest]   = useState(0);
  const [reveal, setReveal] = useState(false);
  const [dead, setDead]   = useState(false);
  const [result, setResult] = useState<"correct"|"wrong"|null>(null);

  const deal = useCallback((keepLeft?: Player) => {
    if (allPlayers.length < 2) return;
    const m = METRICS[Math.floor(Math.random() * METRICS.length)];
    const valid = allPlayers.filter(p => (p[m.key as keyof Player] as number) > 0);
    if (valid.length < 2) return;
    const l = keepLeft ?? valid[Math.floor(Math.random() * valid.length)];
    let r = valid[Math.floor(Math.random() * valid.length)];
    while (r.player_name === l.player_name) r = valid[Math.floor(Math.random() * valid.length)];
    setLeft(l); setRight(r); setMetric(m);
    setReveal(false); setResult(null);
  }, [allPlayers]);

  useEffect(() => { if (allPlayers.length) deal(); }, [allPlayers.length]);

  const guess = (pick: "higher"|"lower") => {
    if (!left || !right || reveal) return;
    const lv = (left[metric.key as keyof Player] as number) ?? 0;
    const rv = (right[metric.key as keyof Player] as number) ?? 0;
    const correct =
      (pick === "higher" && rv >= lv) ||
      (pick === "lower"  && rv <= lv);
    setReveal(true);
    setResult(correct ? "correct" : "wrong");
    if (correct) {
      const ns = streak + 1;
      setStreak(ns);
      setBest(b => Math.max(b, ns));
      setTimeout(() => deal(right), 1200);
    } else {
      setDead(true);
    }
  };

  const restart = () => { setStreak(0); setDead(false); deal(); };

  if (!left || !right) return <div style={{ textAlign:"center", color:"rgba(255,255,255,0.3)", padding:"40px 0" }}>Loading…</div>;

  const lv = (left[metric.key as keyof Player] as number) ?? 0;
  const rv = (right[metric.key as keyof Player] as number) ?? 0;

  return (
    <div>
      {/* Streak */}
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:16, fontSize:12 }}>
        <div style={{ color:"rgba(255,255,255,0.35)" }}>
          Best streak: <span style={{ color:"#FFD700", fontWeight:700 }}>{best}</span>
        </div>
        <div style={{ color: streak > 0 ? "#4ADE80" : "rgba(255,255,255,0.35)" }}>
          {streak > 0 ? `🔥 ${streak} in a row` : "Start your streak"}
        </div>
      </div>

      {/* Metric label */}
      <div style={{ textAlign:"center", marginBottom:14 }}>
        <span style={{ fontSize:11, color:"#00D4FF", letterSpacing:2, textTransform:"uppercase",
          background:"rgba(0,212,255,0.1)", padding:"4px 12px", borderRadius:20,
          border:"1px solid rgba(0,212,255,0.25)" }}>
          Who has more {metric.label}?
        </span>
      </div>

      {/* Cards */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:8, alignItems:"center", marginBottom:16 }}>
        {/* Left player */}
        <div style={{
          background:"rgba(8,20,12,0.9)", border:"1px solid rgba(255,255,255,0.08)",
          borderRadius:12, padding:"16px 12px", textAlign:"center",
        }}>
          <Flag country={left.country} size={22} />
          <div style={{ fontSize:13, fontWeight:800, color:"#fff", marginTop:8, lineHeight:1.2,
            minHeight:36, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {left.player_name}
          </div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:4 }}>{left.specific_position}</div>
          <div style={{ marginTop:12, fontSize:18, fontWeight:900,
            color: reveal ? (lv >= rv ? "#4ADE80" : "#FF6B6B") : "#FFD700" }}>
            {reveal ? metric.fmt(lv) : metric.label}
          </div>
        </div>

        <div style={{ fontSize:14, fontWeight:800, color:"rgba(255,255,255,0.25)" }}>VS</div>

        {/* Right player */}
        <div style={{
          background:"rgba(8,20,12,0.9)", border:`1px solid ${reveal ? (rv >= lv ? "rgba(74,222,128,0.3)" : "rgba(255,107,107,0.25)") : "rgba(255,215,0,0.2)"}`,
          borderRadius:12, padding:"16px 12px", textAlign:"center",
          boxShadow: reveal ? undefined : "0 0 20px rgba(255,215,0,0.07)",
        }}>
          <Flag country={right.country} size={22} />
          <div style={{ fontSize:13, fontWeight:800, color:"#fff", marginTop:8, lineHeight:1.2,
            minHeight:36, display:"flex", alignItems:"center", justifyContent:"center" }}>
            {right.player_name}
          </div>
          <div style={{ fontSize:10, color:"rgba(255,255,255,0.3)", marginTop:4 }}>{right.specific_position}</div>
          <div style={{ marginTop:12, fontSize:18, fontWeight:900,
            color: reveal ? (rv >= lv ? "#4ADE80" : "#FF6B6B") : "#FFD700" }}>
            {reveal ? metric.fmt(rv) : "?"}
          </div>
        </div>
      </div>

      {/* Buttons or result */}
      <AnimatePresence mode="wait">
        {!reveal && !dead && (
          <motion.div key="btns" initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
            style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8 }}>
            {(["higher","lower"] as const).map(pick => (
              <motion.button key={pick} onClick={() => guess(pick)}
                whileHover={{ scale:1.03 }} whileTap={{ scale:0.96 }}
                style={{
                  padding:"14px", borderRadius:10, border:"none", cursor:"pointer", fontWeight:900,
                  fontSize:14, letterSpacing:1, textTransform:"uppercase",
                  background: pick==="higher" ? "rgba(74,222,128,0.12)" : "rgba(255,107,107,0.1)",
                  color: pick==="higher" ? "#4ADE80" : "#FF6B6B",
                }}>
                {pick==="higher" ? "▲ Higher" : "▼ Lower"}
              </motion.button>
            ))}
          </motion.div>
        )}

        {reveal && !dead && result && (
          <motion.div key="correct" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
            style={{ textAlign:"center", fontSize:16, fontWeight:900, color:"#4ADE80",
              padding:"12px 0", letterSpacing:2 }}>
            ✓ CORRECT — Next card loading…
          </motion.div>
        )}

        {dead && (
          <motion.div key="dead" initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }}
            style={{ textAlign:"center" }}>
            <div style={{ fontSize:16, fontWeight:900, color:"#FF6B6B", marginBottom:6, letterSpacing:2 }}>
              ✗ WRONG — Game Over
            </div>
            <div style={{ fontSize:12, color:"rgba(255,255,255,0.35)", marginBottom:14 }}>
              Streak: {streak} · Best: {best}
            </div>
            <motion.button onClick={restart} whileHover={{ scale:1.04 }} whileTap={{ scale:0.97 }}
              style={{
                padding:"12px 36px", borderRadius:50, border:"none", cursor:"pointer",
                background:"linear-gradient(135deg,#FFD700,#e6a800)",
                color:"#000", fontWeight:900, fontSize:14, letterSpacing:2, textTransform:"uppercase",
              }}>Try Again</motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Hub shell
// ══════════════════════════════════════════════════════════════════════════════
export default function GameHub() {
  const [tab, setTab] = useState<Tab>("whoami");
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loaded, setLoaded] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  const inView = useInView(sectionRef, { once: true, margin: "-100px" });

  useEffect(() => {
    if (!inView || loaded) return;
    // Load once — used by all 3 games client-side
    fetch(`${API}/players?limit=300`)
      .then(r => r.json())
      .then((d: Player[]) => { setAllPlayers(d); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, [inView, loaded]);

  return (
    <section id="games" ref={sectionRef} style={{
      padding:"60px 24px 80px",
      background:"linear-gradient(180deg,#040e07 0%,#08160c 100%)",
    }}>
      <div style={{ maxWidth:580, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:32 }}>
          <p style={{ fontSize:11, letterSpacing:4, color:"#00D4FF", textTransform:"uppercase", marginBottom:8 }}>
            Mini Games · Data-Powered
          </p>
          <h2 style={{
            fontSize:"clamp(26px,5vw,50px)", fontWeight:900, color:"#FFD700",
            textShadow:"0 0 28px rgba(255,215,0,0.35)", textTransform:"uppercase",
            letterSpacing:3, margin:"0 0 6px",
          }}>Game Zone</h2>
          <p style={{ fontSize:13, color:"rgba(255,255,255,0.3)", fontWeight:600, margin:"4px 0 0",
            letterSpacing:1, textTransform:"none" }}>(for the nerds)</p>
        </div>

        {/* Tabs */}
        <div style={{ display:"flex", gap:6, marginBottom:28, flexWrap:"wrap", justifyContent:"center" }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)} style={{
              padding:"8px 16px", borderRadius:20, border:"none", cursor:"pointer",
              background: tab===t.id ? "#FFD700" : "rgba(255,255,255,0.07)",
              color: tab===t.id ? "#000" : "rgba(255,255,255,0.55)",
              fontWeight:700, fontSize:11, letterSpacing:0.5, whiteSpace:"nowrap",
            }}>
              {t.emoji} {t.label}
            </button>
          ))}
        </div>

        {/* Game content */}
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity:0, y:10 }} animate={{ opacity:1, y:0 }}
            exit={{ opacity:0, y:-6 }} transition={{ duration:0.2 }}>
            {!loaded ? (
              <div style={{ textAlign:"center", padding:"40px 0", color:"rgba(255,255,255,0.25)", fontSize:13 }}>
                Loading player data…
              </div>
            ) : tab === "squad"  ? <SquadBuilder allPlayers={allPlayers} />
              : tab === "whoami" ? <WhoAmI allPlayers={allPlayers} />
              :                    <HigherOrLower allPlayers={allPlayers} />
            }
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
