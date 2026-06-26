"use client";

import { useEffect, useState, useRef } from "react";
import { motion, useInView } from "framer-motion";

const ISO2_MAP: Record<string, string> = {
  France: "fr", Spain: "es", England: "gb-eng", Argentina: "ar", Brazil: "br",
  Germany: "de", Portugal: "pt", Netherlands: "nl", Morocco: "ma", Mexico: "mx",
  Uruguay: "uy", Japan: "jp", Belgium: "be", Colombia: "co", Senegal: "sn",
  Norway: "no", Ecuador: "ec", Switzerland: "ch", Turkey: "tr", "South Korea": "kr",
  USA: "us", "United States": "us", Canada: "ca", Australia: "au", Croatia: "hr",
  Ghana: "gh", Panama: "pa", Algeria: "dz", Austria: "at", Jordan: "jo",
  "DR Congo": "cd", Uzbekistan: "uz", Scotland: "gb-sct", Haiti: "ht",
  "Cape Verde": "cv", "Saudi Arabia": "sa", Qatar: "qa", Egypt: "eg",
  Iran: "ir", Iraq: "iq", Sweden: "se", Tunisia: "tn", "New Zealand": "nz",
  Paraguay: "py", "Ivory Coast": "ci", "Curaçao": "cw", "Bosnia and Herzegovina": "ba",
  "Bosnia": "ba", "Czech Republic": "cz", "South Africa": "za",
  "Türkiye": "tr",
};

interface TeamResult {
  rank: number;
  team: string;
  win: number;
  final: number;
  semi: number;
  quarter: number;
  r16: number;
  r32: number;
}

interface MonteCarloResponse {
  cached: boolean;
  n_simulations?: number;
  leaderboard?: TeamResult[];
  results?: Record<string, Omit<TeamResult, "rank" | "team">>;
  status?: string;
}

function StatBar({ value, color }: { value: number; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: "rgba(255,255,255,0.1)" }}>
        <motion.div
          className="h-full rounded-full"
          style={{ background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(value * 100, 100)}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </div>
      <span className="text-xs w-10 text-right" style={{ color: "rgba(255,255,255,0.6)" }}>
        {(value * 100).toFixed(1)}%
      </span>
    </div>
  );
}

function TeamCard({ team, index }: { team: TeamResult; index: number }) {
  const isTop8 = index < 8;
  const iso2 = ISO2_MAP[team.team] ?? "un";

  return (
    <motion.div
      initial={{ opacity: 0, x: -30 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="rounded-xl p-4 transition-all duration-300"
      style={{
        background: isTop8
          ? "linear-gradient(135deg, rgba(26,58,42,0.9), rgba(15,35,25,0.9))"
          : "rgba(15, 25, 18, 0.8)",
        border: isTop8
          ? "1px solid rgba(255,215,0,0.4)"
          : "1px solid rgba(255,255,255,0.08)",
        boxShadow: isTop8 ? "0 0 20px rgba(255,215,0,0.15)" : "none",
      }}
    >
      <div className="flex items-center gap-3 mb-3">
        {/* Rank */}
        <span
          className="font-bebas text-2xl w-8 text-center"
          style={{ color: isTop8 ? "#FFD700" : "rgba(255,255,255,0.4)" }}
        >
          {team.rank}
        </span>

        {/* Flag */}
        <img
          src={`https://flagcdn.com/w40/${iso2}.png`}
          alt={team.team}
          width={28}
          height={20}
          className="rounded-sm object-cover"
          style={{ minWidth: 28 }}
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />

        {/* Team name */}
        <span className="font-medium text-sm flex-1 truncate">{team.team}</span>

        {/* Win % badge */}
        {team.win > 0 && (
          <span
            className="font-bebas text-lg px-2 py-0.5 rounded"
            style={{
              background: "rgba(255,215,0,0.15)",
              color: "#FFD700",
              border: "1px solid rgba(255,215,0,0.3)",
            }}
          >
            {(team.win * 100).toFixed(1)}%
          </span>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          <span className="w-20">Win Trophy</span>
          <StatBar value={team.win} color="#FFD700" />
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          <span className="w-20">Reach Final</span>
          <StatBar value={team.final} color="#00D4FF" />
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          <span className="w-20">Reach Semi</span>
          <StatBar value={team.semi} color="rgba(255,255,255,0.5)" />
        </div>
      </div>
    </motion.div>
  );
}

function SkeletonCard() {
  return (
    <div
      className="rounded-xl p-4 animate-pulse"
      style={{ background: "rgba(15,25,18,0.8)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="w-8 h-6 rounded" style={{ background: "rgba(255,255,255,0.1)" }} />
        <div className="w-7 h-5 rounded" style={{ background: "rgba(255,255,255,0.1)" }} />
        <div className="flex-1 h-4 rounded" style={{ background: "rgba(255,255,255,0.1)" }} />
      </div>
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-3 rounded" style={{ background: "rgba(255,255,255,0.07)", width: `${80 - i * 10}%` }} />
        ))}
      </div>
    </div>
  );
}

export default function TournamentOdds() {
  const [leaderboard, setLeaderboard] = useState<TeamResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });

  useEffect(() => {
    if (!inView) return;  // wait until section is visible before firing
    const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

    const attempt = (retries = 8) => {
      fetch(`${API}/monte-carlo?n=1000`)
        .then((r) => r.json())
        .then((data: MonteCarloResponse) => {
          // Rank: win% → reach-final% → reach-semi% (each as tiebreaker)
          const byOdds = (a: TeamResult, b: TeamResult) =>
            b.win - a.win || b.final - a.final || b.semi - a.semi;
          if (data.leaderboard) {
            const ranked = [...data.leaderboard]
              .sort(byOdds)
              .map((t, i) => ({ ...t, rank: i + 1 }));
            setLeaderboard(ranked);
            setCached(data.cached);
            setLoading(false);
          } else if (data.results) {
            const ranked = Object.entries(data.results)
              .map(([team, stats]) => ({ rank: 0, team, ...stats }))
              .sort(byOdds)
              .map((t, i) => ({ ...t, rank: i + 1 }));
            setLeaderboard(ranked);
            setCached(data.cached);
            setLoading(false);
          } else if (data.status === "simulation_in_progress") {
            // Monte Carlo running — retry after 8s
            if (retries > 0) setTimeout(() => attempt(retries - 1), 8000);
            else { setError("Monte Carlo timed out — refresh to retry."); setLoading(false); }
          }
        })
        // Server warming up (502/network error) — retry silently
        .catch(() => {
          if (retries > 0) setTimeout(() => attempt(retries - 1), 5000);
          else { setError("Server unavailable — refresh to retry."); setLoading(false); }
        });
    };

    attempt();
  }, [inView]);

  return (
    <section
      id="odds"
      ref={ref}
      className="py-20 px-4"
      style={{ background: "linear-gradient(180deg, #0a1a0f 0%, #0d2015 50%, #0a1a0f 100%)" }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <motion.div
          className="text-center mb-12"
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
        >
          <p className="text-sm tracking-[0.3em] uppercase mb-3" style={{ color: "#00D4FF" }}>
            Monte Carlo Simulation · 5,000 Tournaments
          </p>
          <h2
            className="font-bebas text-5xl md:text-7xl"
            style={{
              color: "#FFD700",
              textShadow: "0 0 30px rgba(255,215,0,0.5)",
            }}
          >
            Tournament Odds
          </h2>
          <p className="mt-3 text-base" style={{ color: "rgba(255,255,255,0.5)" }}>
            Who wins it all? Based on Elo ratings & Poisson goal models.
            {cached && (
              <span className="ml-2 text-xs px-2 py-0.5 rounded" style={{ background: "rgba(0,212,255,0.1)", color: "#00D4FF" }}>
                Cached
              </span>
            )}
          </p>
        </motion.div>

        {error && (
          <div className="text-center py-12" style={{ color: "#DC143C" }}>
            {error}
          </div>
        )}

        {/* Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {loading
            ? Array.from({ length: 16 }).map((_, i) => <SkeletonCard key={i} />)
            : leaderboard.map((team, i) => (
                <TeamCard key={team.team} team={team} index={i} />
              ))}
        </div>
      </div>
    </section>
  );
}
