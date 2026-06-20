"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Constants ─────────────────────────────────────────────────────────────────
const KICKS = 5;

// Zone layout: 3 cols × 2 rows = 6 zones
// index: 0=TL 1=TC 2=TR  3=BL 4=BC 5=BR
const ZONE_LABELS = ["Top Left", "Top Centre", "Top Right", "Bottom Left", "Bottom Centre", "Bottom Right"];
const ZONE_COLS = [0, 1, 2, 0, 1, 2]; // which column (L/C/R) each zone is in

// Keeper covers entire column: L covers 0+3, C covers 1+4, R covers 2+5
function keeperCoversZone(keeperCol: number, zone: number) {
  return ZONE_COLS[zone] === keeperCol;
}

// After a few shots, keeper learns your tendencies slightly
function chooseKeeperCol(shots: number[]): number {
  if (shots.length < 2) return Math.floor(Math.random() * 3);
  // Count which column user shot to most
  const colCount = [0, 0, 0];
  shots.forEach(z => colCount[ZONE_COLS[z]]++);
  const maxCol = colCount.indexOf(Math.max(...colCount));
  // 40% chance to dive toward user's favourite column, otherwise random
  return Math.random() < 0.4 ? maxCol : Math.floor(Math.random() * 3);
}

// 5% chance the ball hits the post (near miss on a goal)
const POST_CHANCE = 0.05;

type KickResult = "goal" | "saved" | "post";
interface Kick { zone: number; keeperCol: number; result: KickResult; }

const WC_TEAMS = [
  "Argentina", "France", "Spain", "Brazil", "England",
  "Germany", "Portugal", "Netherlands", "Mexico", "Colombia",
];

function randomTeam(exclude?: string) {
  const pool = exclude ? WC_TEAMS.filter(t => t !== exclude) : WC_TEAMS;
  return pool[Math.floor(Math.random() * pool.length)];
}

const KEEPER_EMOJI: Record<string, string> = {
  Argentina: "🇦🇷", France: "🇫🇷", Spain: "🇪🇸", Brazil: "🇧🇷", England: "🏴󠁧󠁢󠁥󠁮󠁧󠁿",
  Germany: "🇩🇪", Portugal: "🇵🇹", Netherlands: "🇳🇱", Mexico: "🇲🇽", Colombia: "🇨🇴",
};

const GRADE = (goals: number) => {
  if (goals === 5) return { title: "Penalty King 👑", sub: "Flawless. Ice in your veins.", color: "#FFD700" };
  if (goals === 4) return { title: "Clinical Finisher", sub: "Four out of five. Elite.", color: "#4ADE80" };
  if (goals === 3) return { title: "Decent from the Spot", sub: "Keeper got the better of you twice.", color: "#00D4FF" };
  if (goals === 2) return { title: "Bottled It", sub: "The keeper read you like a book.", color: "#FF8C00" };
  return { title: "Howler Season", sub: "Even the ball looked embarrassed.", color: "#FF6B6B" };
};

// ── Goal SVG ──────────────────────────────────────────────────────────────────
function Goal({
  hoveredZone, onPick, locked,
}: {
  hoveredZone: number | null;
  onPick: (z: number) => void;
  locked: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);

  const zones = [0, 1, 2, 3, 4, 5];
  const zoneX = (i: number) => (ZONE_COLS[i] * 160) + 10;
  const zoneY = (i: number) => i < 3 ? 10 : 90;

  return (
    <svg viewBox="0 0 490 190" style={{ width: "100%", maxWidth: 490 }}>
      {/* Posts */}
      <rect x={8} y={8} width={474} height={175} rx={4}
        fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={3} />
      {/* Crossbar top line */}
      <line x1={8} y1={8} x2={482} y2={8} stroke="white" strokeWidth={4} />
      {/* Left post */}
      <line x1={8} y1={8} x2={8} y2={183} stroke="white" strokeWidth={4} />
      {/* Right post */}
      <line x1={482} y1={8} x2={482} y2={183} stroke="white" strokeWidth={4} />
      {/* Net grid lines (faint) */}
      {[1, 2].map(col => (
        <line key={col} x1={8 + col * 158} y1={8} x2={8 + col * 158} y2={183}
          stroke="rgba(255,255,255,0.08)" strokeWidth={1} />
      ))}
      <line x1={8} y1={90} x2={482} y2={90}
        stroke="rgba(255,255,255,0.08)" strokeWidth={1} />

      {/* Clickable zones */}
      {zones.map(z => {
        const x = zoneX(z); const y = zoneY(z);
        const isHov = hovered === z;
        return (
          <rect key={z}
            x={x} y={y} width={150} height={72} rx={3}
            fill={isHov ? "rgba(255,215,0,0.18)" : "rgba(255,255,255,0.02)"}
            stroke={isHov ? "rgba(255,215,0,0.6)" : "rgba(255,255,255,0.06)"}
            strokeWidth={isHov ? 2 : 1}
            style={{ cursor: locked ? "default" : "pointer", transition: "fill 0.15s, stroke 0.15s" }}
            onMouseEnter={() => !locked && setHovered(z)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => !locked && onPick(z)}
          />
        );
      })}

      {/* Zone hint labels */}
      {!locked && zones.map(z => (
        <text key={z}
          x={zoneX(z) + 75} y={zoneY(z) + 40}
          textAnchor="middle" dominantBaseline="middle"
          fill={hovered === z ? "rgba(255,215,0,0.9)" : "rgba(255,255,255,0.12)"}
          fontSize={10} fontWeight={700} style={{ pointerEvents: "none", transition: "fill 0.15s" }}>
          {ZONE_LABELS[z].toUpperCase()}
        </text>
      ))}
    </svg>
  );
}

// ── Keeper dive animation ─────────────────────────────────────────────────────
function KeeperDiv({ keeperCol, flag }: { keeperCol: number; flag: string }) {
  // keeperCol: 0=L, 1=C, 2=R → translate to x offset
  const xPct = keeperCol === 0 ? "0%" : keeperCol === 1 ? "50%" : "100%";
  return (
    <div style={{ position: "relative", height: 56, overflow: "hidden" }}>
      <motion.div
        key={keeperCol}
        initial={{ x: "50%" }}
        animate={{ x: xPct }}
        transition={{ type: "spring", stiffness: 280, damping: 22 }}
        style={{ position: "absolute", fontSize: 36, transform: "translateX(-50%)" }}
      >
        🧤
      </motion.div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Minigame() {
  const [phase, setPhase] = useState<"idle" | "kicking" | "result" | "done">("idle");
  const [kicks, setKicks] = useState<Kick[]>([]);
  const [lastKick, setLastKick] = useState<Kick | null>(null);
  const [myTeam]  = useState(() => randomTeam());
  const [oppTeam] = useState(() => randomTeam(myTeam));
  const [locked, setLocked] = useState(false);

  const goals = kicks.filter(k => k.result === "goal").length;
  const shots  = kicks.map(k => k.zone);

  const handlePick = useCallback((zone: number) => {
    if (locked || kicks.length >= KICKS) return;
    setLocked(true);

    const keeperCol = chooseKeeperCol(shots);
    const saved = keeperCoversZone(keeperCol, zone);
    const post  = !saved && Math.random() < POST_CHANCE;
    const result: KickResult = saved ? "saved" : post ? "post" : "goal";
    const kick: Kick = { zone, keeperCol, result };

    setLastKick(kick);
    setPhase("result");

    setTimeout(() => {
      const next = [...kicks, kick];
      setKicks(next);
      if (next.length >= KICKS) {
        setTimeout(() => setPhase("done"), 400);
      } else {
        setPhase("kicking");
        setLocked(false);
        setLastKick(null);
      }
    }, 1600);
  }, [kicks, locked, shots]);

  const restart = useCallback(() => {
    setKicks([]); setLastKick(null); setLocked(false); setPhase("kicking");
  }, []);

  const grade = GRADE(goals);

  return (
    <section id="minigame" style={{
      padding: "60px 24px 80px",
      background: "linear-gradient(180deg, #050f08 0%, #0a1a0f 60%, #050f08 100%)",
      minHeight: 520,
    }}>
      <div style={{ maxWidth: 560, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <p style={{ fontSize: 11, letterSpacing: 4, color: "#00D4FF", textTransform: "uppercase", marginBottom: 8 }}>
            Penalty Shootout · Best of {KICKS}
          </p>
          <h2 style={{
            fontSize: "clamp(28px,5vw,52px)", fontWeight: 900, color: "#FFD700",
            textShadow: "0 0 30px rgba(255,215,0,0.35)", textTransform: "uppercase",
            letterSpacing: 3, margin: "0 0 6px",
          }}>
            Take the Penalty
          </h2>
          <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 12 }}>
            {myTeam} 🆚 {oppTeam} — You're shooting. Pick your spot.
          </p>
        </div>

        {/* Idle screen */}
        <AnimatePresence mode="wait">
          {phase === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ textAlign: "center" }}>
              <div style={{ fontSize: 72, marginBottom: 20 }}>⚽</div>
              <p style={{ color: "rgba(255,255,255,0.45)", marginBottom: 32, fontSize: 14, lineHeight: 1.7 }}>
                5 kicks. You pick the corner.<br />
                The keeper learns your tendencies. Don't be predictable.
              </p>
              <motion.button onClick={() => setPhase("kicking")}
                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
                style={{
                  padding: "16px 52px", borderRadius: 50, border: "none", cursor: "pointer",
                  background: "linear-gradient(135deg, #FFD700, #e6a800)",
                  color: "#000", fontWeight: 900, fontSize: 18, letterSpacing: 2,
                  textTransform: "uppercase", boxShadow: "0 0 40px rgba(255,215,0,0.25)",
                }}>
                Step Up ⚽
              </motion.button>
            </motion.div>
          )}

          {/* Kicking / Result */}
          {(phase === "kicking" || phase === "result") && (
            <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

              {/* Score tracker */}
              <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 20 }}>
                {Array.from({ length: KICKS }).map((_, i) => {
                  const k = kicks[i];
                  const isCurrent = i === kicks.length && phase === "result" && lastKick;
                  const displayKick = isCurrent ? lastKick : k;
                  return (
                    <motion.div key={i}
                      animate={isCurrent ? { scale: [1, 1.3, 1] } : {}}
                      transition={{ duration: 0.4 }}
                      style={{
                        width: 40, height: 40, borderRadius: "50%", display: "flex",
                        alignItems: "center", justifyContent: "center", fontSize: 18,
                        background: displayKick
                          ? displayKick.result === "goal" ? "rgba(74,222,128,0.2)" : "rgba(255,107,107,0.2)"
                          : i === kicks.length ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.05)",
                        border: `2px solid ${displayKick
                          ? displayKick.result === "goal" ? "#4ADE80" : "#FF6B6B"
                          : i === kicks.length ? "rgba(255,215,0,0.5)" : "rgba(255,255,255,0.1)"}`,
                      }}>
                      {displayKick ? (displayKick.result === "goal" ? "⚽" : displayKick.result === "post" ? "🚫" : "🧤") : (i === kicks.length ? "🎯" : "")}
                    </motion.div>
                  );
                })}
              </div>

              {/* Keeper */}
              <div style={{
                background: "rgba(255,255,255,0.03)", borderRadius: 12,
                border: "1px solid rgba(255,255,255,0.07)", padding: "12px 16px", marginBottom: 8,
              }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.25)", letterSpacing: 2,
                  textTransform: "uppercase", marginBottom: 8, textAlign: "center" }}>
                  {phase === "result" && lastKick ? `Keeper dives ${["left", "centre", "right"][lastKick.keeperCol]}` : "Keeper is watching…"}
                </div>
                {phase === "result" && lastKick ? (
                  <KeeperDiv keeperCol={lastKick.keeperCol} flag={KEEPER_EMOJI[oppTeam] ?? "🧤"} />
                ) : (
                  <div style={{ height: 56, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32 }}>🧤</div>
                )}
              </div>

              {/* Result flash */}
              <AnimatePresence>
                {phase === "result" && lastKick && (
                  <motion.div key="flash"
                    initial={{ opacity: 0, scale: 0.8, y: -8 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.8 }}
                    style={{
                      textAlign: "center", padding: "10px 0", marginBottom: 8,
                      fontSize: 22, fontWeight: 900, letterSpacing: 2,
                      color: lastKick.result === "goal" ? "#4ADE80" : lastKick.result === "post" ? "#FF8C00" : "#FF6B6B",
                    }}>
                    {lastKick.result === "goal" ? "⚽ GOAL!" : lastKick.result === "post" ? "🚫 POST!" : "🧤 SAVED!"}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Goal grid */}
              <div style={{ position: "relative" }}>
                <Goal hoveredZone={null} onPick={handlePick} locked={locked} />
              </div>

              {/* Kick count */}
              <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.2)",
                marginTop: 10, letterSpacing: 1 }}>
                Kick {Math.min(kicks.length + 1, KICKS)} of {KICKS} · {goals} goal{goals !== 1 ? "s" : ""} scored
              </p>
            </motion.div>
          )}

          {/* Done */}
          {phase === "done" && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              style={{ textAlign: "center" }}>
              <div style={{ fontSize: 64, marginBottom: 12 }}>
                {goals >= 4 ? "🏆" : goals >= 3 ? "⚽" : "😅"}
              </div>
              <div style={{
                fontSize: "clamp(48px,10vw,80px)", fontWeight: 900, lineHeight: 1,
                color: grade.color, textShadow: `0 0 30px ${grade.color}55`, marginBottom: 4,
              }}>
                {goals} / {KICKS}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: grade.color, marginBottom: 6 }}>{grade.title}</div>
              <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 13, marginBottom: 28 }}>{grade.sub}</p>

              {/* Kick breakdown */}
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 28, flexWrap: "wrap" }}>
                {kicks.map((k, i) => (
                  <div key={i} style={{
                    padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                    background: k.result === "goal" ? "rgba(74,222,128,0.15)" : "rgba(255,107,107,0.12)",
                    border: `1px solid ${k.result === "goal" ? "rgba(74,222,128,0.4)" : "rgba(255,107,107,0.3)"}`,
                    color: k.result === "goal" ? "#4ADE80" : "#FF6B6B",
                  }}>
                    {k.result === "goal" ? "⚽" : k.result === "post" ? "🚫" : "🧤"} {ZONE_LABELS[k.zone]}
                  </div>
                ))}
              </div>

              <motion.button onClick={restart}
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                style={{
                  padding: "14px 44px", borderRadius: 50, border: "none", cursor: "pointer",
                  background: "linear-gradient(135deg, #FFD700, #e6a800)",
                  color: "#000", fontWeight: 900, fontSize: 16, letterSpacing: 2,
                  textTransform: "uppercase", boxShadow: "0 0 30px rgba(255,215,0,0.25)",
                }}>
                Try Again
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}
