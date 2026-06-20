"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

// ── Config ────────────────────────────────────────────────────────────────────
const KICKS = 5;
const GOAL_W = 420;
const GOAL_H = 200;
// Aim: 5 zones across goal width (0 = far-left … 4 = far-right)
const ZONES = 5;
const ZONE_W = GOAL_W / ZONES; // 84px each
// Power: green = 35–65, yellow = 18–82, else miss
const GREEN = [35, 65] as const;
const YELLOW = [18, 82] as const;
// Aim sweeps at this many units per ms (units = 0..100)
const AIM_SPEED   = 0.045; // ~2.2s for full sweep
const POWER_SPEED = 0.070; // ~1.4s for full sweep

// Keeper covers: L(zones 0-1), C(zone 2), R(zones 3-4)
type KeeperSide = "L" | "C" | "R";
const KEEPER_X: Record<KeeperSide, number> = { L: GOAL_W * 0.22, C: GOAL_W * 0.5, R: GOAL_W * 0.78 };

function zoneFromAim(aim: number): number {
  return Math.min(ZONES - 1, Math.floor((aim / 100) * ZONES));
}

function keeperCovers(side: KeeperSide, zone: number): boolean {
  if (side === "L") return zone <= 1;
  if (side === "C") return zone === 2;
  return zone >= 3;
}

function chooseKeeper(history: number[]): KeeperSide {
  if (history.length < 2) {
    return (["L", "C", "R"] as KeeperSide[])[Math.floor(Math.random() * 3)];
  }
  // Lean 45% toward your most-used zone group
  const counts = { L: 0, C: 0, R: 0 };
  history.forEach(z => {
    if (z <= 1) counts.L++;
    else if (z === 2) counts.C++;
    else counts.R++;
  });
  const fav = (Object.entries(counts) as [KeeperSide, number][]).sort((a, b) => b[1] - a[1])[0][0];
  return Math.random() < 0.45 ? fav : (["L", "C", "R"] as KeeperSide[])[Math.floor(Math.random() * 3)];
}

// Where the ball lands (SVG coords) per zone
const BALL_TARGETS: [number, number][] = [
  [42, 45],   // zone 0 – top-left corner
  [126, 155], // zone 1 – bottom-left
  [210, 100], // zone 2 – center
  [294, 155], // zone 3 – bottom-right
  [378, 45],  // zone 4 – top-right corner
];

type KickResult = "goal" | "saved" | "post" | "miss";
interface Kick { zone: number; power: number; keeper: KeeperSide; result: KickResult; }

const RESULT_TEXT: Record<KickResult, string> = {
  goal: "⚽ GOLAZO!", saved: "🧤 SAVED!", post: "🚫 OFF THE POST!", miss: "😬 OFF TARGET!"
};
const RESULT_COLOR: Record<KickResult, string> = {
  goal: "#4ADE80", saved: "#FF6B6B", post: "#FF8C00", miss: "#FF8C00"
};

const GRADES = [
  { min: 5, label: "Penalty King 👑",       sub: "Nerve of steel. Perfect technique.",     color: "#FFD700" },
  { min: 4, label: "Clinical Finisher",      sub: "Four from five. The keeper had no chance.", color: "#4ADE80" },
  { min: 3, label: "Solid from the Spot",    sub: "Not bad — but the keeper read you twice.", color: "#00D4FF" },
  { min: 2, label: "Needs More Practice",    sub: "The wall was laughing.",                 color: "#FF8C00" },
  { min: 0, label: "Howler Season 😅",       sub: "We'll pretend this never happened.",     color: "#FF6B6B" },
];
const grade = (goals: number) => GRADES.find(g => goals >= g.min)!;

// ── Sub-components ────────────────────────────────────────────────────────────

/** SVG goal with animated aim line, keeper, and ball */
function GoalSVG({
  aimPct,      // 0-100, position of aim indicator
  keeperX,     // pixel x of keeper
  ballPos,     // null = hidden, else [x,y] in SVG coords
  showBall,
  phase,
}: {
  aimPct: number;
  keeperX: number;
  ballPos: [number, number] | null;
  showBall: boolean;
  phase: string;
}) {
  const aimX = (aimPct / 100) * GOAL_W;
  const zone = zoneFromAim(aimPct);
  const zoneColor = ["#FF6B35","#FFD700","#4ADE80","#FFD700","#FF6B35"][zone];

  return (
    <svg viewBox={`-10 -10 ${GOAL_W + 20} ${GOAL_H + 20}`}
      style={{ width: "100%", maxWidth: GOAL_W, display: "block", margin: "0 auto" }}>

      {/* Net (faint grid) */}
      {Array.from({ length: 6 }).map((_, i) => (
        <line key={`v${i}`} x1={(i + 1) * (GOAL_W / 7)} y1={0} x2={(i + 1) * (GOAL_W / 7)} y2={GOAL_H}
          stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
      ))}
      {Array.from({ length: 3 }).map((_, i) => (
        <line key={`h${i}`} x1={0} y1={(i + 1) * (GOAL_H / 4)} x2={GOAL_W} y2={(i + 1) * (GOAL_H / 4)}
          stroke="rgba(255,255,255,0.05)" strokeWidth={1} />
      ))}

      {/* Goal box background */}
      <rect x={0} y={0} width={GOAL_W} height={GOAL_H}
        fill="rgba(0,40,15,0.6)" rx={2} />

      {/* Zone highlight (subtle) */}
      {phase === "aim" && (
        <rect x={zone * ZONE_W} y={0} width={ZONE_W} height={GOAL_H}
          fill={`${zoneColor}18`} />
      )}

      {/* Aim line */}
      {(phase === "aim") && (
        <>
          <line x1={aimX} y1={0} x2={aimX} y2={GOAL_H}
            stroke={zoneColor} strokeWidth={2.5} strokeDasharray="6 4" opacity={0.9} />
          {/* Arrow head */}
          <polygon
            points={`${aimX},${GOAL_H + 12} ${aimX - 8},${GOAL_H} ${aimX + 8},${GOAL_H}`}
            fill={zoneColor} opacity={0.9} />
        </>
      )}

      {/* Keeper */}
      <motion.g
        animate={{ x: keeperX - 22 }}
        transition={{ type: "spring", stiffness: 220, damping: 18 }}
      >
        {/* Keeper body */}
        <rect x={0} y={GOAL_H - 72} width={44} height={72} rx={8}
          fill="rgba(255,215,0,0.15)" stroke="rgba(255,215,0,0.35)" strokeWidth={1.5} />
        {/* Keeper gloves */}
        <circle cx={0}  cy={GOAL_H - 36} r={9} fill="rgba(255,215,0,0.4)" stroke="#FFD700" strokeWidth={1} />
        <circle cx={44} cy={GOAL_H - 36} r={9} fill="rgba(255,215,0,0.4)" stroke="#FFD700" strokeWidth={1} />
        {/* Keeper face */}
        <text x={22} y={GOAL_H - 30} textAnchor="middle" fontSize={26}>🧤</text>
      </motion.g>

      {/* Ball */}
      {showBall && ballPos && (
        <motion.text
          textAnchor="middle" dominantBaseline="middle" fontSize={24}
          initial={{ x: GOAL_W / 2, y: GOAL_H + 40 }}
          animate={{ x: ballPos[0], y: ballPos[1] }}
          transition={{ duration: 0.55, ease: [0.2, 0.8, 0.4, 1] }}
        >
          ⚽
        </motion.text>
      )}

      {/* Posts */}
      <line x1={0} y1={0} x2={0} y2={GOAL_H} stroke="white" strokeWidth={5} strokeLinecap="round" />
      <line x1={GOAL_W} y1={0} x2={GOAL_W} y2={GOAL_H} stroke="white" strokeWidth={5} strokeLinecap="round" />
      <line x1={0} y1={0} x2={GOAL_W} y2={0} stroke="white" strokeWidth={5} strokeLinecap="round" />

      {/* Post glow */}
      <line x1={0} y1={0} x2={0} y2={GOAL_H} stroke="rgba(255,255,255,0.15)" strokeWidth={12} />
      <line x1={GOAL_W} y1={0} x2={GOAL_W} y2={GOAL_H} stroke="rgba(255,255,255,0.15)" strokeWidth={12} />
    </svg>
  );
}

/** Oscillating horizontal meter bar */
function Meter({ value, label }: { value: number; label: string }) {
  const inGreen  = value >= GREEN[0]  && value <= GREEN[1];
  const inYellow = value >= YELLOW[0] && value <= YELLOW[1];
  const color = inGreen ? "#4ADE80" : inYellow ? "#FFD700" : "#FF6B6B";
  const pct = value;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6,
        fontSize: 10, color: "rgba(255,255,255,0.35)", letterSpacing: 2, textTransform: "uppercase" }}>
        <span>{label}</span>
        <span style={{ color }}>{inGreen ? "PERFECT" : inYellow ? "OK" : "OFF TARGET"}</span>
      </div>
      <div style={{ position: "relative", height: 20, borderRadius: 10, overflow: "hidden",
        background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)" }}>
        {/* Zone backgrounds */}
        <div style={{ position: "absolute", left: `${YELLOW[0]}%`, width: `${YELLOW[1] - YELLOW[0]}%`,
          height: "100%", background: "rgba(255,215,0,0.12)" }} />
        <div style={{ position: "absolute", left: `${GREEN[0]}%`, width: `${GREEN[1] - GREEN[0]}%`,
          height: "100%", background: "rgba(74,222,128,0.2)" }} />
        {/* Zone labels */}
        <div style={{ position: "absolute", left: `${GREEN[0] + 1}%`, top: 0, height: "100%",
          display: "flex", alignItems: "center", fontSize: 8, color: "rgba(74,222,128,0.7)",
          fontWeight: 700, letterSpacing: 1, pointerEvents: "none" }}>PERFECT</div>
        {/* Needle */}
        <motion.div
          style={{
            position: "absolute", top: 0, width: 4, height: "100%",
            background: color, borderRadius: 2, left: `${pct}%`,
            transform: "translateX(-50%)",
            boxShadow: `0 0 8px ${color}`,
          }}
        />
      </div>
    </div>
  );
}

// ── Main game ─────────────────────────────────────────────────────────────────
type Phase = "idle" | "aim" | "power" | "shooting" | "result" | "done";

export default function PenaltyGame() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [kicks, setKicks] = useState<Kick[]>([]);
  const [lockedAim, setLockedAim]     = useState(50);
  const [lockedPower, setLockedPower] = useState(50);
  const [keeperSide, setKeeperSide]   = useState<KeeperSide>("C");
  const [lastResult, setLastResult]   = useState<KickResult | null>(null);
  const [showBall, setShowBall]       = useState(false);

  // Live oscillating values (displayed each frame)
  const [aimVal,   setAimVal]   = useState(0);
  const [powerVal, setPowerVal] = useState(0);

  const aimRef   = useRef(0);
  const aimDir   = useRef(1);
  const powerRef = useRef(0);
  const powerDir = useRef(1);
  const rafRef   = useRef<number>(0);
  const lastT    = useRef<number>(0);

  const zoneHistory = kicks.map(k => k.zone);
  const goals = kicks.filter(k => k.result === "goal").length;

  // RAF oscillation loop
  useEffect(() => {
    if (phase !== "aim" && phase !== "power") {
      cancelAnimationFrame(rafRef.current);
      return;
    }
    lastT.current = 0;

    const tick = (t: number) => {
      const dt = lastT.current ? t - lastT.current : 16;
      lastT.current = t;

      if (phase === "aim") {
        aimRef.current += aimDir.current * AIM_SPEED * dt;
        if (aimRef.current >= 100) { aimRef.current = 100; aimDir.current = -1; }
        if (aimRef.current <= 0)   { aimRef.current = 0;   aimDir.current =  1; }
        setAimVal(aimRef.current);
      } else {
        powerRef.current += powerDir.current * POWER_SPEED * dt;
        if (powerRef.current >= 100) { powerRef.current = 100; powerDir.current = -1; }
        if (powerRef.current <= 0)   { powerRef.current = 0;   powerDir.current =  1; }
        setPowerVal(powerRef.current);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [phase]);

  // Click: lock aim → lock power → shoot
  const handleClick = useCallback(() => {
    if (phase === "aim") {
      setLockedAim(aimRef.current);
      setPhase("power");
    } else if (phase === "power") {
      const power = powerRef.current;
      setLockedPower(power);

      const zone   = zoneFromAim(aimRef.current);
      const keeper = chooseKeeper(zoneHistory);
      setKeeperSide(keeper);

      // Outcome logic
      let result: KickResult;
      if (power < YELLOW[0] || power > YELLOW[1]) {
        result = "miss";
      } else if (power < GREEN[0] || power > GREEN[1]) {
        // Yellow zone: 35% chance of post instead of goal
        const covers = keeperCovers(keeper, zone);
        result = covers ? "saved" : Math.random() < 0.35 ? "post" : "goal";
      } else {
        // Green zone: keeper must be exactly on zone to save
        result = keeperCovers(keeper, zone) ? "saved" : "goal";
      }

      setLastResult(result);
      setPhase("shooting");
      setShowBall(true);

      setTimeout(() => {
        const next: Kick[] = [...kicks, { zone, power, keeper, result }];
        setKicks(next);
        setShowBall(false);

        if (next.length >= KICKS) {
          setTimeout(() => setPhase("done"), 600);
        } else {
          setPhase("result");
        }
      }, 900);
    }
  }, [phase, kicks, zoneHistory]);

  const nextKick = useCallback(() => {
    setLastResult(null);
    aimRef.current = 0; aimDir.current = 1;
    powerRef.current = 0; powerDir.current = 1;
    setAimVal(0); setPowerVal(0);
    setKeeperSide("C");
    setPhase("aim");
  }, []);

  const restart = useCallback(() => {
    setKicks([]); setLastResult(null); setShowBall(false);
    aimRef.current = 0; aimDir.current = 1;
    powerRef.current = 0; powerDir.current = 1;
    setAimVal(0); setPowerVal(0);
    setKeeperSide("C");
    setPhase("idle");
  }, []);

  const currentZone  = zoneFromAim(phase === "power" || phase === "shooting" || phase === "result" ? lockedAim : aimVal);
  const displayAim   = phase === "power" || phase === "shooting" || phase === "result" ? lockedAim : aimVal;
  const keeperTarget = phase === "shooting" || phase === "result" ? KEEPER_X[keeperSide] : KEEPER_X["C"];
  const ballTarget   = showBall ? BALL_TARGETS[zoneFromAim(lockedAim)] : null;

  const g = grade(goals);

  return (
    <section id="penalty" style={{
      padding: "60px 24px 80px",
      background: "linear-gradient(180deg, #050f08 0%, #0a1a0f 60%, #050f08 100%)",
    }}>
      <div style={{ maxWidth: 540, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <p style={{ fontSize: 11, letterSpacing: 4, color: "#00D4FF", textTransform: "uppercase", marginBottom: 8 }}>
            Penalty Shootout · Best of {KICKS}
          </p>
          <h2 style={{
            fontSize: "clamp(26px,5vw,50px)", fontWeight: 900, color: "#FFD700",
            textShadow: "0 0 28px rgba(255,215,0,0.35)", textTransform: "uppercase",
            letterSpacing: 3, margin: "0 0 6px",
          }}>Take the Penalty</h2>
        </div>

        <AnimatePresence mode="wait">

          {/* ── IDLE ── */}
          {phase === "idle" && (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ textAlign: "center" }}>
              <div style={{ fontSize: 64, marginBottom: 20 }}>⚽</div>
              <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 14, lineHeight: 1.8, marginBottom: 10 }}>
                <strong style={{ color: "#FFD700" }}>Step 1</strong> — Click to aim (stop the moving line)<br />
                <strong style={{ color: "#4ADE80" }}>Step 2</strong> — Click to shoot (hit the green zone)<br />
                Don&apos;t be predictable — the keeper learns your patterns.
              </p>
              <p style={{ color: "rgba(255,255,255,0.2)", fontSize: 11, marginBottom: 28 }}>5 kicks · Best of 5</p>
              <motion.button onClick={() => setPhase("aim")}
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

          {/* ── GAME PHASES ── */}
          {(phase === "aim" || phase === "power" || phase === "shooting" || phase === "result") && (
            <motion.div key="game" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>

              {/* Kick tracker */}
              <div style={{ display: "flex", gap: 6, justifyContent: "center", marginBottom: 20 }}>
                {Array.from({ length: KICKS }).map((_, i) => {
                  const k = kicks[i];
                  return (
                    <div key={i} style={{
                      width: 38, height: 38, borderRadius: "50%",
                      display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16,
                      background: k
                        ? k.result === "goal" ? "rgba(74,222,128,0.2)" : "rgba(255,107,107,0.15)"
                        : i === kicks.length ? "rgba(255,215,0,0.15)" : "rgba(255,255,255,0.04)",
                      border: `2px solid ${k
                        ? k.result === "goal" ? "#4ADE80" : "#FF6B6B"
                        : i === kicks.length ? "rgba(255,215,0,0.6)" : "rgba(255,255,255,0.1)"}`,
                      transition: "all 0.3s",
                    }}>
                      {k ? (k.result === "goal" ? "⚽" : k.result === "post" ? "🚫" : "🧤") : (i === kicks.length ? "🎯" : "")}
                    </div>
                  );
                })}
              </div>

              {/* Goal */}
              <div style={{
                background: "rgba(0,0,0,0.4)", borderRadius: 14, overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.08)",
                boxShadow: "0 8px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)",
                marginBottom: 16,
              }}>
                <GoalSVG
                  aimPct={displayAim}
                  keeperX={keeperTarget}
                  ballPos={ballTarget}
                  showBall={showBall}
                  phase={phase}
                />
              </div>

              {/* Instructions / meters */}
              <AnimatePresence mode="wait">
                {phase === "aim" && (
                  <motion.div key="aim-ui" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <p style={{ textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.3)",
                      letterSpacing: 2, textTransform: "uppercase", marginBottom: 10 }}>
                      Click to lock your aim
                    </p>
                    <motion.button onClick={handleClick}
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      style={{
                        width: "100%", padding: "16px", borderRadius: 12, border: "2px solid rgba(255,215,0,0.35)",
                        background: "rgba(255,215,0,0.08)", color: "#FFD700",
                        fontWeight: 900, fontSize: 16, cursor: "pointer", letterSpacing: 2,
                        textTransform: "uppercase",
                      }}>
                      🎯 AIM HERE
                    </motion.button>
                  </motion.div>
                )}

                {phase === "power" && (
                  <motion.div key="power-ui" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                    <div style={{ marginBottom: 14 }}>
                      <Meter value={powerVal} label="Shot Power" />
                    </div>
                    <motion.button onClick={handleClick}
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      style={{
                        width: "100%", padding: "16px", borderRadius: 12, border: "2px solid rgba(74,222,128,0.4)",
                        background: "rgba(74,222,128,0.1)", color: "#4ADE80",
                        fontWeight: 900, fontSize: 16, cursor: "pointer", letterSpacing: 2,
                        textTransform: "uppercase",
                      }}>
                      ⚽ SHOOT!
                    </motion.button>
                  </motion.div>
                )}

                {phase === "shooting" && (
                  <motion.div key="shooting-ui" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                    style={{ textAlign: "center", padding: "12px 0", fontSize: 13,
                      color: "rgba(255,255,255,0.25)", letterSpacing: 2, textTransform: "uppercase" }}>
                    …
                  </motion.div>
                )}

                {phase === "result" && lastResult && (
                  <motion.div key="result-ui" initial={{ opacity: 0, scale: 0.88 }} animate={{ opacity: 1, scale: 1 }}>
                    <div style={{
                      textAlign: "center", padding: "14px 0", marginBottom: 12,
                      fontSize: "clamp(18px,4vw,26px)", fontWeight: 900, letterSpacing: 2,
                      color: RESULT_COLOR[lastResult],
                      textShadow: `0 0 20px ${RESULT_COLOR[lastResult]}80`,
                    }}>
                      {RESULT_TEXT[lastResult]}
                    </div>
                    <motion.button onClick={nextKick}
                      whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}
                      style={{
                        width: "100%", padding: "14px", borderRadius: 12,
                        border: "1px solid rgba(255,215,0,0.25)",
                        background: "rgba(255,215,0,0.07)", color: "#FFD700",
                        fontWeight: 800, fontSize: 13, cursor: "pointer", letterSpacing: 1,
                        textTransform: "uppercase",
                      }}>
                      {kicks.length + 1 <= KICKS ? `Next Kick (${kicks.length + 1}/${KICKS}) →` : "See Results →"}
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}

          {/* ── DONE ── */}
          {phase === "done" && (
            <motion.div key="done" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
              style={{ textAlign: "center" }}>
              <div style={{ fontSize: 60, marginBottom: 10 }}>{goals >= 4 ? "🏆" : goals >= 3 ? "⚽" : "😅"}</div>
              <div style={{
                fontSize: "clamp(56px,12vw,84px)", fontWeight: 900, lineHeight: 1,
                color: g.color, textShadow: `0 0 32px ${g.color}55`, marginBottom: 4,
              }}>
                {goals}/{KICKS}
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: g.color, marginBottom: 6 }}>{g.label}</div>
              <p style={{ color: "rgba(255,255,255,0.35)", fontSize: 13, marginBottom: 28 }}>{g.sub}</p>

              {/* Breakdown */}
              <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 28, flexWrap: "wrap" }}>
                {kicks.map((k, i) => (
                  <div key={i} style={{
                    padding: "6px 12px", borderRadius: 8, fontSize: 11, fontWeight: 700,
                    background: k.result === "goal" ? "rgba(74,222,128,0.12)" : "rgba(255,107,107,0.1)",
                    border: `1px solid ${k.result === "goal" ? "rgba(74,222,128,0.35)" : "rgba(255,107,107,0.3)"}`,
                    color: k.result === "goal" ? "#4ADE80" : "#FF6B6B",
                  }}>
                    {k.result === "goal" ? "⚽" : k.result === "post" ? "🚫" : k.result === "miss" ? "↗" : "🧤"}{" "}
                    Kick {i + 1}
                  </div>
                ))}
              </div>

              <motion.button onClick={restart}
                whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                style={{
                  padding: "14px 44px", borderRadius: 50, border: "none", cursor: "pointer",
                  background: "linear-gradient(135deg, #FFD700, #e6a800)",
                  color: "#000", fontWeight: 900, fontSize: 16, letterSpacing: 2,
                  textTransform: "uppercase", boxShadow: "0 0 28px rgba(255,215,0,0.25)",
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
