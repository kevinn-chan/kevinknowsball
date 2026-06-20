"use client";

import { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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

const TOTAL_ROUNDS = 8;

function randomPair(): [string, string] {
  const a = Math.floor(Math.random() * ALL_TEAMS.length);
  let b = Math.floor(Math.random() * (ALL_TEAMS.length - 1));
  if (b >= a) b++;
  return [ALL_TEAMS[a], ALL_TEAMS[b]];
}

type Pick = "home" | "draw" | "away";

interface Round {
  home: string; away: string;
  userPick: Pick;
  aiHome: number; aiDraw: number; aiAway: number;
  aiPick: Pick;
  correct: boolean;
}

function aiPick(home: number, draw: number, away: number): Pick {
  if (home >= draw && home >= away) return "home";
  if (draw >= home && draw >= away) return "draw";
  return "away";
}

function Flag({ country }: { country: string }) {
  const iso = ISO2[country];
  if (!iso) return null;
  return (
    <img src={`https://flagcdn.com/w80/${iso}.png`} alt={country}
      width={48} height={32} style={{ objectFit:"cover", borderRadius:4, boxShadow:"0 2px 8px rgba(0,0,0,0.4)" }}
      onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
  );
}

const GRADE = (score: number, total: number) => {
  const pct = score / total;
  if (pct >= 0.875) return { label:"World Class Scout 🏆", color:"#FFD700" };
  if (pct >= 0.75)  return { label:"Reliable Analyst ✅",  color:"#4ADE80" };
  if (pct >= 0.5)   return { label:"Promising Coach 📋",   color:"#00D4FF" };
  return                   { label:"Youth Team Manager 😅", color:"#FF6B6B" };
};

export default function Minigame() {
  const [started, setStarted] = useState(false);
  const [pair, setPair] = useState<[string,string]>(randomPair);
  const [userPick, setUserPick] = useState<Pick | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [loading, setLoading] = useState(false);
  const [prediction, setPrediction] = useState<{home_win:number;draw:number;away_win:number}|null>(null);
  const [done, setDone] = useState(false);

  const score = rounds.filter(r => r.correct).length;
  const grade = GRADE(score, TOTAL_ROUNDS);

  const handlePick = useCallback((pick: Pick) => {
    if (loading || userPick) return;
    setUserPick(pick);
    setLoading(true);

    fetch(`${API}/predict`, {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ home: pair[0], away: pair[1] }),
    })
      .then(r => r.json())
      .then(data => {
        const ai = aiPick(data.home_win, data.draw, data.away_win);
        setRounds(prev => [...prev, {
          home:pair[0], away:pair[1], userPick:pick,
          aiHome:data.home_win, aiDraw:data.draw, aiAway:data.away_win,
          aiPick:ai, correct: pick === ai,
        }]);
        setPrediction(data);
        setLoading(false);
      })
      .catch(() => {
        // On error, give neutral 33/33/33 so game continues
        const neutral = { home_win:0.33, draw:0.34, away_win:0.33 };
        const ai = pick; // tie — count as correct so user isn't penalised for server error
        setRounds(prev => [...prev, {
          home:pair[0], away:pair[1], userPick:pick,
          aiHome:neutral.home_win, aiDraw:neutral.draw, aiAway:neutral.away_win,
          aiPick:ai, correct:true,
        }]);
        setPrediction(neutral);
        setLoading(false);
      });
  }, [loading, userPick, pair]);

  const handleNext = useCallback(() => {
    const nextCount = rounds.length;
    if (nextCount >= TOTAL_ROUNDS) { setDone(true); return; }
    setPair(randomPair());
    setUserPick(null);
    setPrediction(null);
  }, [rounds.length]);

  const restart = useCallback(() => {
    setRounds([]); setPair(randomPair());
    setUserPick(null); setPrediction(null);
    setDone(false); setStarted(true);
  }, []);

  // id="minigame" is ALWAYS on the outer section — never unmounts
  return (
    <section id="minigame" style={{
      padding:"60px 24px 80px",
      background:"linear-gradient(180deg,#050f08 0%,#0a1a0f 100%)",
      minHeight:480,
    }}>
      <div style={{ maxWidth:640, margin:"0 auto" }}>

        {/* Header */}
        <div style={{ textAlign:"center", marginBottom:36 }}>
          <p style={{ fontSize:11,letterSpacing:4,color:"#00D4FF",textTransform:"uppercase",marginBottom:8 }}>
            AI Challenge · {TOTAL_ROUNDS} Rounds
          </p>
          <h2 style={{
            fontSize:"clamp(28px,5vw,52px)",fontWeight:900,color:"#FFD700",
            textShadow:"0 0 30px rgba(255,215,0,0.35)",textTransform:"uppercase",
            letterSpacing:3,margin:"0 0 8px",
          }}>Beat the AI</h2>
          <p style={{ color:"rgba(255,255,255,0.35)",fontSize:13 }}>
            Pick the winner. See if your football IQ matches a Poisson model.
          </p>
        </div>

        <AnimatePresence mode="wait">

          {/* ── IDLE ── */}
          {!started && !done && (
            <motion.div key="idle" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}
              style={{ textAlign:"center" }}>
              <div style={{ fontSize:72, marginBottom:24 }}>🧠</div>
              <p style={{ color:"rgba(255,255,255,0.45)",fontSize:14,lineHeight:1.8,marginBottom:32 }}>
                Two teams. You pick who wins.<br/>
                The AI reveals its Poisson model probability.<br/>
                Agree with the model = point. 8 rounds total.
              </p>
              <motion.button onClick={() => setStarted(true)}
                whileHover={{scale:1.05}} whileTap={{scale:0.96}}
                style={{
                  padding:"16px 52px",borderRadius:50,border:"none",cursor:"pointer",
                  background:"linear-gradient(135deg,#FFD700,#e6a800)",
                  color:"#000",fontWeight:900,fontSize:18,letterSpacing:2,
                  textTransform:"uppercase",boxShadow:"0 0 40px rgba(255,215,0,0.25)",
                }}>
                Kick Off ⚽
              </motion.button>
            </motion.div>
          )}

          {/* ── GAME ── */}
          {started && !done && (
            <motion.div key="game" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}}>

              {/* Progress bar */}
              <div style={{ display:"flex",gap:6,marginBottom:24,alignItems:"center" }}>
                {Array.from({length:TOTAL_ROUNDS}).map((_,i) => (
                  <div key={i} style={{
                    flex:1, height:4, borderRadius:2,
                    background: i < rounds.length
                      ? (rounds[i].correct ? "#4ADE80" : "#FF6B6B")
                      : i === rounds.length ? "#FFD700" : "rgba(255,255,255,0.1)",
                    transition:"background 0.3s",
                  }} />
                ))}
                <span style={{ fontSize:12,color:"#FFD700",fontWeight:700,marginLeft:4,whiteSpace:"nowrap" }}>
                  {score}/{rounds.length}
                </span>
              </div>

              {/* Match card */}
              <div style={{
                background:"linear-gradient(135deg,rgba(15,35,22,0.97),rgba(8,18,12,0.97))",
                border:"1px solid rgba(255,215,0,0.15)",borderRadius:16,
                padding:"28px 24px",
              }}>
                <p style={{ fontSize:10,letterSpacing:3,color:"rgba(255,255,255,0.25)",
                  textTransform:"uppercase",textAlign:"center",marginBottom:24 }}>
                  Round {rounds.length + 1} of {TOTAL_ROUNDS} · Neutral venue
                </p>

                {/* Teams */}
                <div style={{ display:"flex",alignItems:"center",justifyContent:"center",gap:20,marginBottom:28 }}>
                  <div style={{ flex:1,textAlign:"center" }}>
                    <Flag country={pair[0]} />
                    <div style={{ marginTop:10,fontSize:15,fontWeight:800,color:"#fff" }}>{pair[0]}</div>
                  </div>
                  <div style={{ fontSize:16,color:"rgba(255,255,255,0.18)",fontWeight:700,flexShrink:0 }}>VS</div>
                  <div style={{ flex:1,textAlign:"center" }}>
                    <Flag country={pair[1]} />
                    <div style={{ marginTop:10,fontSize:15,fontWeight:800,color:"#fff" }}>{pair[1]}</div>
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  {/* Pick buttons */}
                  {!userPick && (
                    <motion.div key="pick" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}} exit={{opacity:0}}
                      style={{ display:"flex",gap:8 }}>
                      {(["home","draw","away"] as Pick[]).map(p => (
                        <motion.button key={p} onClick={() => handlePick(p)}
                          whileHover={{scale:1.04}} whileTap={{scale:0.96}}
                          style={{
                            flex:1,padding:"13px 8px",borderRadius:10,border:"none",cursor:"pointer",
                            background: p==="draw" ? "rgba(255,255,255,0.07)" : "rgba(255,215,0,0.1)",
                            color: p==="draw" ? "rgba(255,255,255,0.65)" : "#FFD700",
                            fontWeight:800,fontSize:12,letterSpacing:1,textTransform:"uppercase",
                          }}>
                          {p==="home" ? pair[0] : p==="away" ? pair[1] : "Draw"}
                        </motion.button>
                      ))}
                    </motion.div>
                  )}

                  {/* Loading */}
                  {userPick && loading && (
                    <motion.div key="loading" initial={{opacity:0}} animate={{opacity:1}}
                      style={{ textAlign:"center",padding:"16px 0",color:"rgba(255,255,255,0.35)",fontSize:13 }}>
                      <motion.span animate={{opacity:[0.4,1,0.4]}} transition={{repeat:Infinity,duration:1}}>
                        Consulting the model…
                      </motion.span>
                    </motion.div>
                  )}

                  {/* Reveal */}
                  {userPick && !loading && prediction && rounds.length > 0 && (
                    <motion.div key="reveal" initial={{opacity:0,y:8}} animate={{opacity:1,y:0}}>
                      {/* Prob bars */}
                      <div style={{ fontSize:10,color:"rgba(255,255,255,0.25)",letterSpacing:2,
                        textTransform:"uppercase",textAlign:"center",marginBottom:12 }}>
                        AI Model Probability
                      </div>
                      <div style={{ display:"flex",gap:6,marginBottom:16,height:52,alignItems:"flex-end" }}>
                        {[
                          {label:pair[0], val:prediction.home_win, pick:"home" as Pick, color:"#FFD700"},
                          {label:"Draw",  val:prediction.draw,     pick:"draw" as Pick, color:"rgba(255,255,255,0.5)"},
                          {label:pair[1], val:prediction.away_win, pick:"away" as Pick, color:"#00D4FF"},
                        ].map(({label,val,pick,color}) => {
                          const last = rounds[rounds.length-1];
                          const isUser = pick===userPick;
                          const isAI   = pick===last?.aiPick;
                          return (
                            <div key={pick} style={{ flex:1,textAlign:"center" }}>
                              <div style={{ fontSize:11,fontWeight:700,color,marginBottom:4 }}>
                                {(val*100).toFixed(0)}%
                              </div>
                              <motion.div
                                initial={{height:0}} animate={{height:`${val*44}px`}}
                                transition={{duration:0.6,ease:"easeOut"}}
                                style={{
                                  background:color,borderRadius:"3px 3px 0 0",minHeight:3,
                                  opacity:(isUser||isAI)?1:0.35,
                                  outline:isAI?`2px solid ${color}`:undefined,
                                }}
                              />
                              <div style={{ fontSize:8,color:"rgba(255,255,255,0.25)",marginTop:3,
                                letterSpacing:0.5,textTransform:"uppercase",
                                overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap" }}>
                                {label}
                              </div>
                              {isUser && <div style={{ fontSize:8,color,marginTop:1 }}>▲ you</div>}
                              {isAI   && <div style={{ fontSize:8,color,fontWeight:800,marginTop:1 }}>▲ AI</div>}
                            </div>
                          );
                        })}
                      </div>

                      {/* Result badge */}
                      {(() => {
                        const last = rounds[rounds.length-1];
                        return (
                          <div style={{
                            padding:"10px 14px",borderRadius:10,marginBottom:14,textAlign:"center",
                            background:last.correct?"rgba(74,222,128,0.1)":"rgba(255,107,107,0.1)",
                            border:`1px solid ${last.correct?"rgba(74,222,128,0.35)":"rgba(255,107,107,0.35)"}`,
                            color:last.correct?"#4ADE80":"#FF6B6B",
                            fontSize:13,fontWeight:700,
                          }}>
                            {last.correct
                              ? "✓ You agree with the AI!"
                              : `✗ AI picks ${last.aiPick==="home"?last.home:last.aiPick==="away"?last.away:"Draw"}`}
                          </div>
                        );
                      })()}

                      <motion.button onClick={handleNext}
                        whileHover={{scale:1.03}} whileTap={{scale:0.97}}
                        style={{
                          width:"100%",padding:"12px",borderRadius:10,
                          border:"1px solid rgba(255,215,0,0.25)",
                          background:"rgba(255,215,0,0.07)",color:"#FFD700",
                          fontWeight:800,fontSize:13,cursor:"pointer",letterSpacing:1,
                        }}>
                        {rounds.length >= TOTAL_ROUNDS ? "See Results →" : "Next Match →"}
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          )}

          {/* ── DONE ── */}
          {done && (
            <motion.div key="done" initial={{opacity:0,scale:0.92}} animate={{opacity:1,scale:1}}
              style={{ textAlign:"center" }}>
              <div style={{ fontSize:56, marginBottom:12 }}>🏆</div>
              <div style={{
                fontSize:"clamp(56px,12vw,88px)",fontWeight:900,lineHeight:1,
                color:grade.color,textShadow:`0 0 30px ${grade.color}55`,marginBottom:6,
              }}>
                {score}/{TOTAL_ROUNDS}
              </div>
              <div style={{ fontSize:20,fontWeight:800,color:grade.color,marginBottom:6 }}>{grade.label}</div>
              <p style={{ color:"rgba(255,255,255,0.4)",fontSize:13,marginBottom:28 }}>
                You agreed with the AI model {Math.round((score/TOTAL_ROUNDS)*100)}% of the time.
              </p>

              {/* Round dots */}
              <div style={{ display:"flex",gap:6,justifyContent:"center",marginBottom:28,flexWrap:"wrap" }}>
                {rounds.map((r,i) => (
                  <div key={i} style={{
                    width:36,height:36,borderRadius:"50%",display:"flex",
                    alignItems:"center",justifyContent:"center",fontSize:14,
                    background:r.correct?"rgba(74,222,128,0.15)":"rgba(255,107,107,0.12)",
                    border:`2px solid ${r.correct?"#4ADE80":"#FF6B6B"}`,
                    color:r.correct?"#4ADE80":"#FF6B6B",
                  }}>
                    {r.correct?"✓":"✗"}
                  </div>
                ))}
              </div>

              <motion.button onClick={restart}
                whileHover={{scale:1.04}} whileTap={{scale:0.97}}
                style={{
                  padding:"14px 44px",borderRadius:50,border:"none",cursor:"pointer",
                  background:"linear-gradient(135deg,#FFD700,#e6a800)",
                  color:"#000",fontWeight:900,fontSize:16,letterSpacing:2,
                  textTransform:"uppercase",boxShadow:"0 0 30px rgba(255,215,0,0.25)",
                }}>
                Play Again
              </motion.button>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </section>
  );
}
