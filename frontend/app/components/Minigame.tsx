"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

// All 48 teams for random matchup selection
const ALL_TEAMS = [
  "Argentina","Australia","Algeria","Austria","Belgium","Bosnia and Herzegovina",
  "Brazil","Canada","Cape Verde","Colombia","Croatia","Curaçao","Czech Republic",
  "DR Congo","Ecuador","Egypt","England","France","Germany","Ghana","Haiti",
  "Iran","Iraq","Ivory Coast","Japan","Jordan","Mexico","Morocco","Netherlands",
  "New Zealand","Norway","Panama","Paraguay","Portugal","Qatar","Saudi Arabia",
  "Scotland","Senegal","South Africa","South Korea","Spain","Sweden","Switzerland",
  "Tunisia","Türkiye","United States","Uruguay","Uzbekistan",
];

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

const TOTAL_ROUNDS = 8;

function Flag({ country, size = 28 }: { country: string; size?: number }) {
  const iso = ISO2[country];
  if (!iso) return <div style={{ width: size, height: Math.round(size * 0.67), background: "rgba(255,255,255,0.1)", borderRadius: 3 }} />;
  return <img src={`https://flagcdn.com/w80/${iso}.png`} alt={country} width={size * 1.5} height={size}
    style={{ objectFit: "cover", borderRadius: 3 }}
    onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />;
}

function randomPair(): [string, string] {
  const a = Math.floor(Math.random() * ALL_TEAMS.length);
  let b = Math.floor(Math.random() * (ALL_TEAMS.length - 1));
  if (b >= a) b++;
  return [ALL_TEAMS[a], ALL_TEAMS[b]];
}

type Pick = "home" | "draw" | "away";
interface Round {
  home: string;
  away: string;
  userPick: Pick;
  aiHome: number;
  aiDraw: number;
  aiAway: number;
  aiPick: Pick;
  correct: boolean; // user agreed with AI
}

function aiPick(home: number, draw: number, away: number): Pick {
  if (home >= draw && home >= away) return "home";
  if (draw >= home && draw >= away) return "draw";
  return "away";
}

export default function Minigame() {
  const [phase, setPhase] = useState<"idle" | "playing" | "loading" | "reveal" | "done">("idle");
  const [pair, setPair] = useState<[string, string]>(["Argentina", "France"]);
  const [userPick, setUserPick] = useState<Pick | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [prediction, setPrediction] = useState<{ home_win: number; draw: number; away_win: number } | null>(null);

  const nextRound = useCallback(() => {
    setPair(randomPair());
    setUserPick(null);
    setPrediction(null);
    setPhase("playing");
  }, []);

  const handlePick = useCallback((pick: Pick) => {
    if (phase !== "playing" || userPick) return;
    setUserPick(pick);
    setPhase("loading");

    fetch(`${API}/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ home: pair[0], away: pair[1] }),
    })
      .then(r => r.json())
      .then(data => {
        setPrediction(data);
        const ai = aiPick(data.home_win, data.draw, data.away_win);
        const correct = pick === ai;
        setRounds(prev => [...prev, {
          home: pair[0], away: pair[1],
          userPick: pick, aiHome: data.home_win, aiDraw: data.draw, aiAway: data.away_win,
          aiPick: ai, correct,
        }]);
        setPhase("reveal");
      })
      .catch(() => setPhase("playing")); // retry on error
  }, [phase, userPick, pair]);

  const handleNext = useCallback(() => {
    if (rounds.length >= TOTAL_ROUNDS) {
      setPhase("done");
    } else {
      nextRound();
    }
  }, [rounds.length, nextRound]);

  const restart = useCallback(() => {
    setRounds([]);
    nextRound();
  }, [nextRound]);

  const score = rounds.filter(r => r.correct).length;

  // ── Idle screen ──────────────────────────────────────────────────────────────
  if (phase === "idle") {
    return (
      <section id="minigame" style={{ padding: "60px 24px", background: "linear-gradient(180deg, #050f08 0%, #0a1a0f 100%)" }}>
        <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" }}>
          <p style={{ fontSize: 11, letterSpacing: 4, color: "#00D4FF", textTransform: "uppercase", marginBottom: 10 }}>
            AI Challenge · {TOTAL_ROUNDS} Rounds
          </p>
          <h2 style={{ fontSize: "clamp(28px,5vw,56px)", fontWeight: 900, color: "#FFD700",
            textShadow: "0 0 30px rgba(255,215,0,0.4)", margin: "0 0 16px", textTransform: "uppercase" }}>
            Beat the AI
          </h2>
          <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 14, lineHeight: 1.7, marginBottom: 36 }}>
            Two teams. You pick the winner. The AI reveals its model probability.<br />
            Can your football IQ match a Poisson regression?
          </p>
          <motion.button
            onClick={nextRound}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            style={{
              padding: "16px 48px", borderRadius: 50, border: "none", cursor: "pointer",
              background: "linear-gradient(135deg, #FFD700, #e6a800)",
              color: "#000", fontWeight: 900, fontSize: 18, letterSpacing: 2,
              textTransform: "uppercase", boxShadow: "0 0 40px rgba(255,215,0,0.3)",
            }}
          >
            ⚽ Kick Off
          </motion.button>
        </div>
      </section>
    );
  }

  // ── Done screen ─────────────────────────────────────────────────────────────
  if (phase === "done") {
    const pct = Math.round((score / TOTAL_ROUNDS) * 100);
    const grade =
      pct >= 90 ? { label: "World Class Scout", color: "#FFD700" } :
      pct >= 70 ? { label: "Reliable Analyst", color: "#4ADE80" } :
      pct >= 50 ? { label: "Promising Coach", color: "#00D4FF" } :
                  { label: "Youth Team Manager", color: "#FF6B6B" };

    return (
      <section style={{ padding: "60px 24px", background: "linear-gradient(180deg, #050f08 0%, #0a1a0f 100%)" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
          <motion.div initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <div style={{ fontSize: 56, marginBottom: 16 }}>🏆</div>
            <p style={{ fontSize: 11, letterSpacing: 4, color: "#00D4FF", textTransform: "uppercase" }}>Final Score</p>
            <div style={{ fontSize: 80, fontWeight: 900, color: "#FFD700", lineHeight: 1 }}>{score}/{TOTAL_ROUNDS}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: grade.color, marginTop: 8, letterSpacing: 2 }}>
              {grade.label}
            </div>
            <p style={{ color: "rgba(255,255,255,0.4)", marginTop: 12, fontSize: 13 }}>
              You agreed with the AI model {pct}% of the time.
            </p>

            {/* Round breakdown */}
            <div style={{ display: "flex", gap: 6, justifyContent: "center", margin: "24px 0", flexWrap: "wrap" }}>
              {rounds.map((r, i) => (
                <div key={i} style={{
                  width: 36, height: 36, borderRadius: "50%",
                  background: r.correct ? "rgba(74,222,128,0.2)" : "rgba(255,107,107,0.2)",
                  border: `2px solid ${r.correct ? "#4ADE80" : "#FF6B6B"}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 14, color: r.correct ? "#4ADE80" : "#FF6B6B",
                }}>
                  {r.correct ? "✓" : "✗"}
                </div>
              ))}
            </div>

            <motion.button
              onClick={restart}
              whileHover={{ scale: 1.04 }}
              whileTap={{ scale: 0.97 }}
              style={{
                padding: "14px 40px", borderRadius: 50, border: "none", cursor: "pointer",
                background: "linear-gradient(135deg, #FFD700, #e6a800)",
                color: "#000", fontWeight: 900, fontSize: 16, letterSpacing: 2, textTransform: "uppercase",
              }}
            >
              Play Again
            </motion.button>
          </motion.div>
        </div>
      </section>
    );
  }

  // ── Playing / Loading / Reveal ───────────────────────────────────────────────
  const currentRound = rounds.length + 1;

  return (
    <section id="minigame" style={{ padding: "60px 24px", background: "linear-gradient(180deg, #050f08 0%, #0a1a0f 100%)" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", letterSpacing: 2, textTransform: "uppercase" }}>
            Round {currentRound} / {TOTAL_ROUNDS}
          </div>
          <div style={{ display: "flex", gap: 4 }}>
            {Array.from({ length: TOTAL_ROUNDS }).map((_, i) => (
              <div key={i} style={{
                width: 28, height: 4, borderRadius: 2,
                background: i < rounds.length
                  ? (rounds[i].correct ? "#4ADE80" : "#FF6B6B")
                  : i === rounds.length ? "#FFD700" : "rgba(255,255,255,0.1)",
              }} />
            ))}
          </div>
          <div style={{ fontSize: 13, color: "#FFD700", fontWeight: 700 }}>
            {score} / {rounds.length}
          </div>
        </div>

        {/* Match card */}
        <div style={{
          background: "linear-gradient(135deg, rgba(15,35,22,0.95), rgba(8,20,12,0.95))",
          border: "1px solid rgba(255,215,0,0.2)", borderRadius: 16, padding: "28px 24px",
          textAlign: "center",
        }}>
          <p style={{ fontSize: 10, letterSpacing: 3, color: "rgba(255,255,255,0.3)",
            textTransform: "uppercase", marginBottom: 20 }}>Who wins at a neutral venue?</p>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24 }}>
            {/* Home team */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <Flag country={pair[0]} size={40} />
              <div style={{ marginTop: 10, fontSize: 15, fontWeight: 800, color: "#fff" }}>{pair[0]}</div>
            </div>

            <div style={{ fontSize: 18, color: "rgba(255,255,255,0.2)", fontWeight: 700 }}>VS</div>

            {/* Away team */}
            <div style={{ flex: 1, textAlign: "center" }}>
              <Flag country={pair[1]} size={40} />
              <div style={{ marginTop: 10, fontSize: 15, fontWeight: 800, color: "#fff" }}>{pair[1]}</div>
            </div>
          </div>

          {/* Pick buttons */}
          <AnimatePresence mode="wait">
            {phase === "playing" && (
              <motion.div key="pick" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                style={{ display: "flex", gap: 10, marginTop: 28, justifyContent: "center" }}>
                {(["home", "draw", "away"] as Pick[]).map(p => (
                  <motion.button key={p} onClick={() => handlePick(p)}
                    whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.96 }}
                    style={{
                      flex: 1, maxWidth: 140, padding: "12px 8px", borderRadius: 10, border: "none",
                      cursor: "pointer",
                      background: p === "draw" ? "rgba(255,255,255,0.08)" : "rgba(255,215,0,0.1)",
                      color: p === "draw" ? "rgba(255,255,255,0.7)" : "#FFD700",
                      fontWeight: 800, fontSize: 12, letterSpacing: 1, textTransform: "uppercase",
                    }}>
                    {p === "home" ? pair[0] : p === "away" ? pair[1] : "Draw"}
                  </motion.button>
                ))}
              </motion.div>
            )}

            {phase === "loading" && (
              <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                style={{ marginTop: 28, color: "rgba(255,255,255,0.4)", fontSize: 13 }}>
                <motion.span animate={{ opacity: [0.4, 1, 0.4] }} transition={{ repeat: Infinity, duration: 1 }}>
                  Consulting the model…
                </motion.span>
              </motion.div>
            )}

            {phase === "reveal" && prediction && (
              <motion.div key="reveal" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                style={{ marginTop: 24 }}>
                {/* AI probability bars */}
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.3)", letterSpacing: 2,
                  textTransform: "uppercase", marginBottom: 12 }}>AI Model Probability</div>
                <div style={{ display: "flex", gap: 6, marginBottom: 20, height: 48, alignItems: "flex-end" }}>
                  {[
                    { label: pair[0], val: prediction.home_win, pick: "home" as Pick, color: "#FFD700" },
                    { label: "Draw", val: prediction.draw, pick: "draw" as Pick, color: "rgba(255,255,255,0.5)" },
                    { label: pair[1], val: prediction.away_win, pick: "away" as Pick, color: "#00D4FF" },
                  ].map(({ label, val, pick, color }) => {
                    const isUserPick = pick === userPick;
                    const isAiPick = pick === rounds[rounds.length - 1]?.aiPick;
                    return (
                      <div key={pick} style={{ flex: 1, textAlign: "center" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color, marginBottom: 4 }}>
                          {(val * 100).toFixed(0)}%
                        </div>
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${val * 40}px` }}
                          transition={{ duration: 0.6, ease: "easeOut" }}
                          style={{
                            background: color, borderRadius: "4px 4px 0 0", minHeight: 4,
                            opacity: (isUserPick || isAiPick) ? 1 : 0.4,
                            border: isAiPick ? `2px solid ${color}` : "none",
                          }}
                        />
                        <div style={{ fontSize: 9, color: "rgba(255,255,255,0.3)",
                          marginTop: 4, letterSpacing: 1, textTransform: "uppercase",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
                        {isUserPick && <div style={{ fontSize: 9, color }}>↑ Your pick</div>}
                        {isAiPick && <div style={{ fontSize: 9, color, fontWeight: 700 }}>AI pick ↑</div>}
                      </div>
                    );
                  })}
                </div>

                {/* Result badge */}
                {rounds.length > 0 && (() => {
                  const last = rounds[rounds.length - 1];
                  return (
                    <div style={{
                      padding: "10px 16px", borderRadius: 10, marginBottom: 16,
                      background: last.correct ? "rgba(74,222,128,0.1)" : "rgba(255,107,107,0.1)",
                      border: `1px solid ${last.correct ? "rgba(74,222,128,0.4)" : "rgba(255,107,107,0.4)"}`,
                      color: last.correct ? "#4ADE80" : "#FF6B6B",
                      fontSize: 13, fontWeight: 700,
                    }}>
                      {last.correct ? "✓ You agree with the AI!" : `✗ AI picks ${last.aiPick === "home" ? last.home : last.aiPick === "away" ? last.away : "Draw"}`}
                    </div>
                  );
                })()}

                <motion.button onClick={handleNext}
                  whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}
                  style={{
                    width: "100%", padding: "12px", borderRadius: 10, border: "1px solid rgba(255,215,0,0.3)",
                    background: "rgba(255,215,0,0.08)", color: "#FFD700",
                    fontWeight: 800, fontSize: 13, cursor: "pointer", letterSpacing: 1,
                  }}>
                  {rounds.length >= TOTAL_ROUNDS ? "See Results →" : "Next Match →"}
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}
