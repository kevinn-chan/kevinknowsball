"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface TeamEntry {
  country: string;
  full_elo?: number;
  formation?: string;
  group?: string;
}

interface PredictResponse {
  home: string;
  away: string;
  home_win: number;
  draw: number;
  away_win: number;
  lambda_home: number;
  lambda_away: number;
}

interface SimulateResponse {
  home: string;
  away: string;
  lambda_home: number;
  lambda_away: number;
  model_probs: { home_win: number; draw: number; away_win: number };
  simulated_probs: { home_win: number; draw: number; away_win: number };
  top_scorelines: { score: string; probability: number }[];
}

function ArcGauge({ label, value, color }: { label: string; value: number; color: string }) {
  const radius = 52;
  const circumference = Math.PI * radius; // semicircle
  const offset = circumference * (1 - Math.min(value, 1));

  return (
    <div className="flex flex-col items-center gap-2">
      <svg width="130" height="75" viewBox="0 0 130 75">
        {/* Background arc */}
        <path
          d={`M 15 65 A ${radius} ${radius} 0 0 1 115 65`}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth="10"
          strokeLinecap="round"
        />
        {/* Foreground arc */}
        <motion.path
          d={`M 15 65 A ${radius} ${radius} 0 0 1 115 65`}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
        />
        {/* Value text */}
        <text x="65" y="58" textAnchor="middle" fill={color} fontSize="18" fontWeight="bold">
          {(value * 100).toFixed(1)}%
        </text>
      </svg>
      <span className="text-xs font-medium tracking-wide" style={{ color: "rgba(255,255,255,0.6)" }}>
        {label}
      </span>
    </div>
  );
}

function HeatmapGrid({ lambdaHome, lambdaAway }: { lambdaHome: number; lambdaAway: number }) {
  const size = 5;
  const grid: number[][] = [];

  for (let away = 0; away < size; away++) {
    grid[away] = [];
    for (let home = 0; home < size; home++) {
      // Poisson PMF approximation
      const poissonH = (Math.exp(-lambdaHome) * Math.pow(lambdaHome, home)) /
        [1, 1, 2, 6, 24][home];
      const poissonA = (Math.exp(-lambdaAway) * Math.pow(lambdaAway, away)) /
        [1, 1, 2, 6, 24][away];
      grid[away][home] = poissonH * poissonA;
    }
  }

  const max = Math.max(...grid.flat());

  return (
    <div>
      <p className="text-xs mb-2 text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
        Score Probability Heatmap (Home → / Away ↓)
      </p>
      <div className="flex flex-col gap-1">
        {grid.map((row, away) => (
          <div key={away} className="flex gap-1 items-center">
            <span className="text-xs w-4 text-right" style={{ color: "rgba(255,255,255,0.4)" }}>
              {away}
            </span>
            {row.map((val, home) => {
              const intensity = val / max;
              return (
                <div
                  key={home}
                  title={`${home}-${away}: ${(val * 100).toFixed(2)}%`}
                  className="w-10 h-10 rounded flex items-center justify-center text-xs transition-all duration-200 cursor-default"
                  style={{
                    background: `rgba(255,215,0,${intensity * 0.9 + 0.05})`,
                    color: intensity > 0.5 ? "#0a1a0f" : "rgba(255,255,255,0.7)",
                    fontWeight: intensity > 0.3 ? "bold" : "normal",
                    fontSize: "10px",
                  }}
                >
                  {(val * 100).toFixed(1)}
                </div>
              );
            })}
          </div>
        ))}
        <div className="flex gap-1 mt-1">
          <span className="w-4" />
          {[0, 1, 2, 3, 4].map((h) => (
            <span key={h} className="w-10 text-center text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              {h}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function MatchPredictor() {
  const [teams, setTeams] = useState<string[]>([]);
  const [home, setHome] = useState("France");
  const [away, setAway] = useState("Argentina");
  const [prediction, setPrediction] = useState<PredictResponse | null>(null);
  const [simulation, setSimulation] = useState<SimulateResponse | null>(null);
  const [loadingPredict, setLoadingPredict] = useState(false);
  const [loadingSim, setLoadingSim] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API}/teams`)
      .then((r) => r.json())
      .then((data: TeamEntry[]) => {
        const names = data.map((t) => t.country).sort();
        setTeams(names);
      })
      .catch(() => {
        // Fallback list if /teams errors
        setTeams([
          "France", "Spain", "England", "Argentina", "Brazil", "Germany",
          "Portugal", "Netherlands", "Morocco", "Mexico", "Uruguay", "Japan",
          "Belgium", "Colombia", "Senegal", "Norway", "Ecuador", "Switzerland",
          "United States", "Canada", "Australia", "Croatia", "Ghana", "Egypt",
          "Ivory Coast", "South Korea", "Türkiye", "Algeria", "Austria", "Jordan",
          "DR Congo", "Uzbekistan", "Scotland", "Haiti", "Cape Verde",
          "Saudi Arabia", "Qatar", "Iran", "Iraq", "Sweden", "Tunisia",
          "New Zealand", "Paraguay", "Curaçao", "Bosnia and Herzegovina",
          "Czech Republic", "South Africa", "Panama",
        ].sort());
      });
  }, []);

  const handlePredict = async () => {
    setLoadingPredict(true);
    setError(null);
    try {
      const r = await fetch(`${API}/predict`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home, away }),
      });
      if (!r.ok) throw new Error("Prediction failed");
      const data = await r.json();
      setPrediction(data);
    } catch {
      setError("Failed to fetch prediction. Is the backend running?");
    } finally {
      setLoadingPredict(false);
    }
  };

  const handleSimulate = async () => {
    setLoadingSim(true);
    setError(null);
    try {
      const r = await fetch(`${API}/simulate/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ home, away, n: 5000 }),
      });
      if (!r.ok) throw new Error("Simulation failed");
      const data = await r.json();
      setSimulation(data);
      // Also set prediction from simulation data
      setPrediction({
        home: data.home,
        away: data.away,
        home_win: data.model_probs.home_win,
        draw: data.model_probs.draw,
        away_win: data.model_probs.away_win,
        lambda_home: data.lambda_home,
        lambda_away: data.lambda_away,
      });
    } catch {
      setError("Failed to run simulation.");
    } finally {
      setLoadingSim(false);
    }
  };

  const selectStyle: React.CSSProperties = {
    background: "rgba(26,58,42,0.8)",
    border: "1px solid rgba(255,215,0,0.3)",
    color: "#ffffff",
    borderRadius: "8px",
    padding: "10px 14px",
    width: "100%",
    fontSize: "14px",
    outline: "none",
    cursor: "pointer",
  };

  const chartData = simulation?.top_scorelines.map((s) => ({
    name: s.score,
    pct: Math.round(s.probability * 100),
  })) ?? [];

  return (
    <section
      id="predictor"
      className="py-20 px-4"
      style={{ background: "#0d2015" }}
    >
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-sm tracking-[0.3em] uppercase mb-3" style={{ color: "#00D4FF" }}>
            Poisson + Dixon-Coles Model
          </p>
          <h2
            className="font-bebas text-5xl md:text-7xl"
            style={{ color: "#FFD700", textShadow: "0 0 30px rgba(255,215,0,0.5)" }}
          >
            Match Predictor
          </h2>
          <p className="mt-3 text-base" style={{ color: "rgba(255,255,255,0.5)" }}>
            Select two teams and let the AI crunch the numbers.
          </p>
        </div>

        {/* Team selector */}
        <div
          className="rounded-2xl p-6 mb-8"
          style={{
            background: "rgba(15,35,25,0.9)",
            border: "1px solid rgba(255,215,0,0.2)",
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
            <div>
              <label className="block text-xs mb-2 tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
                Home Team
              </label>
              <select
                style={selectStyle}
                value={home}
                onChange={(e) => setHome(e.target.value)}
              >
                {teams.map((t) => (
                  <option key={t} value={t} style={{ background: "#0d2015" }}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="text-center">
              <span
                className="font-bebas text-4xl"
                style={{ color: "rgba(255,255,255,0.3)" }}
              >
                VS
              </span>
            </div>

            <div>
              <label className="block text-xs mb-2 tracking-widest uppercase" style={{ color: "rgba(255,255,255,0.4)" }}>
                Away Team
              </label>
              <select
                style={selectStyle}
                value={away}
                onChange={(e) => setAway(e.target.value)}
              >
                {teams.map((t) => (
                  <option key={t} value={t} style={{ background: "#0d2015" }}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex gap-3 mt-6 justify-center flex-wrap">
            <button
              onClick={handlePredict}
              disabled={loadingPredict || home === away}
              className="px-6 py-3 rounded-lg font-bebas text-lg tracking-widest transition-all duration-300 disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #FFD700, #FFA500)",
                color: "#0a1a0f",
                boxShadow: "0 0 20px rgba(255,215,0,0.4)",
              }}
            >
              {loadingPredict ? "Predicting…" : "⚡ Predict"}
            </button>
            <button
              onClick={handleSimulate}
              disabled={loadingSim || home === away}
              className="px-6 py-3 rounded-lg font-bebas text-lg tracking-widest border-2 transition-all duration-300 disabled:opacity-50"
              style={{
                borderColor: "#00D4FF",
                color: "#00D4FF",
                background: "transparent",
              }}
            >
              {loadingSim ? "Simulating…" : "🎲 Simulate 5,000 Matches"}
            </button>
          </div>

          {error && (
            <p className="text-center mt-4 text-sm" style={{ color: "#DC143C" }}>
              {error}
            </p>
          )}
        </div>

        {/* Results */}
        {prediction && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            {/* Probability arcs */}
            <div
              className="rounded-2xl p-6 mb-6"
              style={{
                background: "rgba(15,35,25,0.9)",
                border: "1px solid rgba(255,215,0,0.2)",
              }}
            >
              <h3 className="text-center font-bebas text-2xl mb-6" style={{ color: "#FFD700" }}>
                {prediction.home} vs {prediction.away}
              </h3>
              <div className="flex justify-around flex-wrap gap-6">
                <ArcGauge label={`${prediction.home} Win`} value={prediction.home_win} color="#FFD700" />
                <ArcGauge label="Draw" value={prediction.draw} color="#00D4FF" />
                <ArcGauge label={`${prediction.away} Win`} value={prediction.away_win} color="#DC143C" />
              </div>

              {/* Lambda */}
              <div className="flex justify-center gap-8 mt-6">
                <div className="text-center">
                  <p className="text-2xl font-bold" style={{ color: "#FFD700" }}>
                    {prediction.lambda_home.toFixed(2)}
                  </p>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                    λ {prediction.home} (xG)
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold" style={{ color: "#DC143C" }}>
                    {prediction.lambda_away.toFixed(2)}
                  </p>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
                    λ {prediction.away} (xG)
                  </p>
                </div>
              </div>
            </div>

            {/* Heatmap */}
            <div
              className="rounded-2xl p-6 mb-6 overflow-x-auto"
              style={{
                background: "rgba(15,35,25,0.9)",
                border: "1px solid rgba(255,255,255,0.08)",
              }}
            >
              <HeatmapGrid lambdaHome={prediction.lambda_home} lambdaAway={prediction.lambda_away} />
            </div>
          </motion.div>
        )}

        {/* Scoreline chart */}
        {simulation && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="rounded-2xl p-6"
            style={{
              background: "rgba(15,35,25,0.9)",
              border: "1px solid rgba(0,212,255,0.2)",
            }}
          >
            <h3 className="font-bebas text-2xl mb-1" style={{ color: "#00D4FF" }}>
              Simulated Scorelines (5,000 matches)
            </h3>
            <p className="text-sm mb-6" style={{ color: "rgba(255,255,255,0.4)" }}>
              Top 10 most likely outcomes
            </p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 0, right: 10, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="name"
                  tick={{ fill: "rgba(255,255,255,0.6)", fontSize: 12 }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  unit="%"
                />
                <Tooltip
                  contentStyle={{
                    background: "#0d2015",
                    border: "1px solid rgba(0,212,255,0.3)",
                    borderRadius: "8px",
                    color: "#fff",
                  }}
                  formatter={(v: unknown) => [`${v}%`, "Probability"]}
                />
                <Bar dataKey="pct" radius={[4, 4, 0, 0]}>
                  {chartData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === 0 ? "#FFD700" : i < 3 ? "#00D4FF" : "rgba(0,212,255,0.5)"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            {/* Simulated probs comparison */}
            <div className="mt-6 grid grid-cols-3 gap-4 text-center">
              {(["home_win", "draw", "away_win"] as const).map((key) => (
                <div key={key} className="rounded-lg p-3" style={{ background: "rgba(255,255,255,0.05)" }}>
                  <p className="text-xs mb-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                    {key === "home_win" ? simulation.home : key === "away_win" ? simulation.away : "Draw"}
                  </p>
                  <p className="text-xl font-bold" style={{ color: key === "draw" ? "#00D4FF" : "#FFD700" }}>
                    {(simulation.simulated_probs[key] * 100).toFixed(1)}%
                  </p>
                  <p className="text-xs" style={{ color: "rgba(255,255,255,0.3)" }}>
                    Model: {(simulation.model_probs[key] * 100).toFixed(1)}%
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </section>
  );
}
