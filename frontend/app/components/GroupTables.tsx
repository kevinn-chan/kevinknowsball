"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";

const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
  "Bosnia": "ba", "Czech Republic": "cz", "South Africa": "za", "Türkiye": "tr",
};

interface TeamStanding {
  team: string;
  pos: number;
  pts: number;
  gf: number;
  ga: number;
  gd: number;
  w?: number;
  d?: number;
  l?: number;
}

type GroupData = Record<string, TeamStanding[]>;

function rowColor(pos: number) {
  if (pos === 1) return "rgba(0,212,255,0.12)";
  if (pos === 2) return "rgba(0,212,255,0.07)";
  if (pos === 3) return "rgba(255,165,0,0.07)";
  return "rgba(220,20,60,0.07)";
}

function rowBadge(pos: number) {
  if (pos <= 2) return { bg: "rgba(0,212,255,0.2)", color: "#00D4FF", label: "✓ Advance" };
  if (pos === 3) return { bg: "rgba(255,165,0,0.15)", color: "#FFA500", label: "Playoff" };
  return { bg: "rgba(220,20,60,0.12)", color: "#DC143C", label: "Eliminated" };
}

function GroupTable({ group, teams }: { group: string; teams: TeamStanding[] }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="rounded-xl overflow-hidden"
      style={{
        background: "rgba(15,35,25,0.9)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      {/* Group header */}
      <div
        className="px-4 py-3 flex items-center justify-between"
        style={{
          background: "linear-gradient(135deg, rgba(26,58,42,0.9), rgba(15,35,25,0.9))",
          borderBottom: "1px solid rgba(255,215,0,0.2)",
        }}
      >
        <span className="font-bebas text-2xl" style={{ color: "#FFD700" }}>
          Group {group}
        </span>
        <span className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
          Pts · W · D · L · GF · GA · GD
        </span>
      </div>

      {/* Rows */}
      {teams.map((team) => {
        const iso2 = ISO2_MAP[team.team] ?? "un";
        const badge = rowBadge(team.pos);
        return (
          <div
            key={team.team}
            className="flex items-center gap-2 px-4 py-2.5 border-b transition-all duration-200"
            style={{
              background: rowColor(team.pos),
              borderBottomColor: "rgba(255,255,255,0.04)",
            }}
          >
            <span className="text-xs w-3" style={{ color: "rgba(255,255,255,0.4)" }}>
              {team.pos}
            </span>
            <img
              src={`https://flagcdn.com/w40/${iso2}.png`}
              alt={team.team}
              width={20}
              height={14}
              className="rounded-sm object-cover"
              style={{ minWidth: 20 }}
              onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
            />
            <span className="flex-1 text-sm truncate">{team.team}</span>

            <div className="flex gap-3 text-xs font-mono" style={{ color: "rgba(255,255,255,0.7)" }}>
              <span className="w-5 text-center font-bold" style={{ color: "#FFD700" }}>{team.pts}</span>
              <span className="w-4 text-center">{team.w ?? "—"}</span>
              <span className="w-4 text-center">{team.d ?? "—"}</span>
              <span className="w-4 text-center">{team.l ?? "—"}</span>
              <span className="w-5 text-center">{team.gf}</span>
              <span className="w-5 text-center">{team.ga}</span>
              <span className="w-6 text-center" style={{ color: team.gd > 0 ? "#00D4FF" : team.gd < 0 ? "#DC143C" : "inherit" }}>
                {team.gd > 0 ? `+${team.gd}` : team.gd}
              </span>
            </div>
          </div>
        );
      })}

      {/* Legend */}
      <div className="px-4 py-2 flex gap-3 flex-wrap">
        {[1, 2, 3, 4].map((pos) => {
          const b = rowBadge(pos);
          return (
            <span
              key={pos}
              className="text-xs px-2 py-0.5 rounded"
              style={{ background: b.bg, color: b.color }}
            >
              {b.label}
            </span>
          );
        })}
      </div>
    </motion.div>
  );
}

function SkeletonGroup() {
  return (
    <div
      className="rounded-xl overflow-hidden animate-pulse"
      style={{ background: "rgba(15,35,25,0.9)", border: "1px solid rgba(255,255,255,0.08)" }}
    >
      <div className="h-12 px-4 py-3" style={{ background: "rgba(26,58,42,0.9)" }} />
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="px-4 py-3 flex gap-3 items-center border-b" style={{ borderBottomColor: "rgba(255,255,255,0.04)" }}>
          <div className="w-4 h-3 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="w-5 h-3 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="flex-1 h-3 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
          <div className="w-24 h-3 rounded" style={{ background: "rgba(255,255,255,0.08)" }} />
        </div>
      ))}
    </div>
  );
}

export default function GroupTables() {
  const [groups, setGroups] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch(`${API}/groups`);
      if (!r.ok) throw new Error("Failed");
      const data: GroupData = await r.json();
      setGroups(data);
    } catch {
      setError("Failed to load group tables.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
  }, [fetchGroups]);

  const groupKeys = groups ? Object.keys(groups).sort() : [];

  return (
    <section
      id="groups"
      className="py-20 px-4"
      style={{ background: "linear-gradient(180deg, #0a1a0f 0%, #0d2015 100%)" }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-sm tracking-[0.3em] uppercase mb-3" style={{ color: "#00D4FF" }}>
            Simulated Group Stage
          </p>
          <h2
            className="font-bebas text-5xl md:text-7xl"
            style={{ color: "#FFD700", textShadow: "0 0 30px rgba(255,215,0,0.5)" }}
          >
            Group Tables
          </h2>
          <p className="mt-3 text-base" style={{ color: "rgba(255,255,255,0.5)" }}>
            12 groups · 48 teams · One simulated universe
          </p>

          <button
            onClick={fetchGroups}
            disabled={loading}
            className="mt-5 px-6 py-2 rounded-lg text-sm font-medium border transition-all duration-300 disabled:opacity-50"
            style={{
              borderColor: "rgba(255,215,0,0.3)",
              color: "#FFD700",
              background: "rgba(255,215,0,0.05)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,215,0,0.12)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLElement).style.background = "rgba(255,215,0,0.05)";
            }}
          >
            {loading ? "🔄 Simulating…" : "🎲 Re-Simulate"}
          </button>
        </div>

        {error && (
          <p className="text-center mb-8" style={{ color: "#DC143C" }}>
            {error}
          </p>
        )}

        {/* Groups grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {loading
            ? Array.from({ length: 12 }).map((_, i) => <SkeletonGroup key={i} />)
            : groupKeys.map((g) => (
                <GroupTable key={g} group={g} teams={groups![g]} />
              ))}
        </div>
      </div>
    </section>
  );
}
