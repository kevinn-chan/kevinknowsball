"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

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

interface Team {
  country: string;
  group?: string;
  full_elo?: number;
  hot_elo?: number;
  elo_volatility?: number;
  total_squad_value?: number;
  age_peak_score?: number;
  pct_elite_league?: number;
  avg_caps?: number;
  depth_overall?: number;
  formation?: string;
  has_elite_pedigree?: number;
  tactical_entropy?: number;
  avg_versatility?: number;
}

// Fallback static data if API is unavailable
const FALLBACK_TEAMS: Team[] = [
  { country: "France", group: "I", full_elo: 2003, formation: "4-3-3" },
  { country: "Spain", group: "H", full_elo: 1975, formation: "4-3-3" },
  { country: "England", group: "L", full_elo: 1960, formation: "4-2-3-1" },
  { country: "Argentina", group: "J", full_elo: 1950, formation: "4-3-3" },
  { country: "Brazil", group: "C", full_elo: 1945, formation: "4-4-2" },
  { country: "Germany", group: "E", full_elo: 1930, formation: "4-2-3-1" },
  { country: "Portugal", group: "K", full_elo: 1920, formation: "4-3-3" },
  { country: "Netherlands", group: "F", full_elo: 1910, formation: "4-3-3" },
  { country: "Morocco", group: "C", full_elo: 1870, formation: "4-1-4-1" },
  { country: "Belgium", group: "G", full_elo: 1860, formation: "4-3-3" },
  { country: "Japan", group: "F", full_elo: 1850, formation: "4-2-3-1" },
  { country: "Colombia", group: "K", full_elo: 1840, formation: "4-4-2" },
  { country: "Senegal", group: "I", full_elo: 1835, formation: "4-3-3" },
  { country: "Mexico", group: "A", full_elo: 1825, formation: "4-3-3" },
  { country: "Uruguay", group: "H", full_elo: 1820, formation: "4-4-2" },
  { country: "Switzerland", group: "B", full_elo: 1815, formation: "3-4-3" },
  { country: "United States", group: "D", full_elo: 1800, formation: "4-3-3" },
  { country: "Australia", group: "D", full_elo: 1775, formation: "4-2-3-1" },
  { country: "Croatia", group: "L", full_elo: 1780, formation: "4-3-3" },
  { country: "Ecuador", group: "E", full_elo: 1760, formation: "4-3-3" },
  { country: "Canada", group: "B", full_elo: 1750, formation: "4-3-3" },
  { country: "Norway", group: "I", full_elo: 1760, formation: "4-2-3-1" },
  { country: "Egypt", group: "G", full_elo: 1730, formation: "4-2-3-1" },
  { country: "Iran", group: "G", full_elo: 1720, formation: "4-5-1" },
  { country: "Ivory Coast", group: "E", full_elo: 1715, formation: "4-3-3" },
  { country: "South Korea", group: "A", full_elo: 1710, formation: "4-2-3-1" },
  { country: "Algeria", group: "J", full_elo: 1700, formation: "4-3-3" },
  { country: "Ghana", group: "L", full_elo: 1680, formation: "4-2-3-1" },
  { country: "Türkiye", group: "D", full_elo: 1675, formation: "4-2-3-1" },
  { country: "DR Congo", group: "K", full_elo: 1665, formation: "4-3-3" },
  { country: "Jordan", group: "J", full_elo: 1640, formation: "4-5-1" },
  { country: "Tunisia", group: "F", full_elo: 1635, formation: "4-3-3" },
  { country: "Paraguay", group: "D", full_elo: 1620, formation: "4-4-2" },
  { country: "Scotland", group: "C", full_elo: 1618, formation: "4-3-3" },
  { country: "Austria", group: "J", full_elo: 1615, formation: "3-4-3" },
  { country: "Uzbekistan", group: "K", full_elo: 1600, formation: "4-3-3" },
  { country: "Saudi Arabia", group: "H", full_elo: 1595, formation: "4-5-1" },
  { country: "Iraq", group: "I", full_elo: 1580, formation: "4-4-2" },
  { country: "Sweden", group: "F", full_elo: 1578, formation: "4-4-2" },
  { country: "Curaçao", group: "E", full_elo: 1420, formation: "4-3-3" },
  { country: "Senegal", group: "I", full_elo: 1835, formation: "4-3-3" },
  { country: "Qatar", group: "B", full_elo: 1460, formation: "4-3-3" },
  { country: "Haiti", group: "C", full_elo: 1440, formation: "4-4-2" },
  { country: "Cape Verde", group: "H", full_elo: 1480, formation: "4-3-3" },
  { country: "New Zealand", group: "G", full_elo: 1400, formation: "4-4-2" },
  { country: "South Africa", group: "A", full_elo: 1550, formation: "4-4-2" },
  { country: "Panama", group: "L", full_elo: 1490, formation: "4-5-1" },
  { country: "Bosnia and Herzegovina", group: "B", full_elo: 1560, formation: "4-3-3" },
  { country: "Czech Republic", group: "A", full_elo: 1600, formation: "4-2-3-1" },
];

function eloColor(elo: number) {
  if (elo >= 1900) return { color: "#FFD700", label: "Elite" };
  if (elo >= 1750) return { color: "#C0C0C0", label: "Strong" };
  return { color: "rgba(255,255,255,0.5)", label: "Competitive" };
}

function TeamCard({ team, index }: { team: Team; index: number }) {
  const [expanded, setExpanded] = useState(false);
  const iso2 = ISO2_MAP[team.country] ?? "un";
  const elo = team.full_elo ?? 1500;
  const ec = eloColor(elo);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.03 }}
      className="rounded-xl overflow-hidden cursor-pointer transition-all duration-300"
      style={{
        background: "rgba(15,35,25,0.9)",
        border: expanded ? "1px solid rgba(255,215,0,0.4)" : "1px solid rgba(255,255,255,0.08)",
        boxShadow: expanded ? "0 0 20px rgba(255,215,0,0.1)" : "none",
      }}
      onClick={() => setExpanded(!expanded)}
    >
      {/* Card header */}
      <div className="p-4 flex items-center gap-3">
        <img
          src={`https://flagcdn.com/w40/${iso2}.png`}
          alt={team.country}
          width={32}
          height={22}
          className="rounded-sm object-cover"
          style={{ minWidth: 32 }}
          onError={(e) => ((e.target as HTMLImageElement).style.display = "none")}
        />
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{team.country}</p>
          {team.group && (
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>
              Group {team.group}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-bebas text-xl" style={{ color: ec.color }}>
            {Math.round(elo)}
          </p>
          <p className="text-xs" style={{ color: ec.color, opacity: 0.7 }}>
            {ec.label}
          </p>
        </div>
        <span
          className="text-xs transition-transform duration-300"
          style={{
            color: "rgba(255,255,255,0.3)",
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            display: "inline-block",
          }}
        >
          ▼
        </span>
      </div>

      {/* Formation badge */}
      {team.formation && (
        <div className="px-4 pb-3 flex items-center gap-2">
          <span
            className="text-xs px-2 py-0.5 rounded font-mono"
            style={{ background: "rgba(0,212,255,0.1)", color: "#00D4FF", border: "1px solid rgba(0,212,255,0.2)" }}
          >
            {team.formation}
          </span>
        </div>
      )}

      {/* Expanded details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            style={{ overflow: "hidden" }}
          >
            <div
              className="px-4 pb-4 space-y-2"
              style={{ borderTop: "1px solid rgba(255,255,255,0.06)" }}
            >
              <div className="pt-3 grid grid-cols-2 gap-2 text-xs">
                {team.hot_elo !== undefined && (
                  <div>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Hot Elo: </span>
                    <span style={{ color: "#FFD700" }}>{Math.round(team.hot_elo)}</span>
                  </div>
                )}
                {team.total_squad_value !== undefined && (
                  <div>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Squad Value: </span>
                    <span style={{ color: "#00D4FF" }}>€{(team.total_squad_value / 1e6).toFixed(0)}M</span>
                  </div>
                )}
                {team.pct_elite_league !== undefined && (
                  <div>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Elite League: </span>
                    <span>{(team.pct_elite_league * 100).toFixed(0)}%</span>
                  </div>
                )}
                {team.avg_caps !== undefined && (
                  <div>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Avg Caps: </span>
                    <span>{team.avg_caps.toFixed(0)}</span>
                  </div>
                )}
                {team.depth_overall !== undefined && (
                  <div>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Squad Depth: </span>
                    <span>{team.depth_overall.toFixed(2)}</span>
                  </div>
                )}
                {team.has_elite_pedigree !== undefined && (
                  <div>
                    <span style={{ color: "rgba(255,255,255,0.4)" }}>Elite Pedigree: </span>
                    <span style={{ color: team.has_elite_pedigree ? "#FFD700" : "rgba(255,255,255,0.5)" }}>
                      {team.has_elite_pedigree ? "Yes ⭐" : "No"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

type SortKey = "elo" | "name" | "group";

export default function TeamExplorer() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortKey>("elo");
  const [filterGroup, setFilterGroup] = useState("All");

  useEffect(() => {
    fetch(`${API}/teams`)
      .then((r) => r.json())
      .then((data: Team[]) => setTeams(data))
      .catch(() => setTeams(FALLBACK_TEAMS))
      .finally(() => setLoading(false));
  }, []);

  const groups = ["All", ...Array.from(new Set(teams.map((t) => t.group).filter(Boolean))).sort()];

  const filtered = teams
    .filter((t) => {
      const matchSearch = t.country.toLowerCase().includes(search.toLowerCase());
      const matchGroup = filterGroup === "All" || t.group === filterGroup;
      return matchSearch && matchGroup;
    })
    .sort((a, b) => {
      if (sortBy === "elo") return (b.full_elo ?? 0) - (a.full_elo ?? 0);
      if (sortBy === "name") return a.country.localeCompare(b.country);
      if (sortBy === "group") return (a.group ?? "").localeCompare(b.group ?? "");
      return 0;
    });

  const inputStyle: React.CSSProperties = {
    background: "rgba(26,58,42,0.8)",
    border: "1px solid rgba(255,255,255,0.1)",
    color: "#ffffff",
    borderRadius: "8px",
    padding: "8px 14px",
    outline: "none",
    fontSize: "14px",
  };

  return (
    <section
      id="teams"
      className="py-20 px-4"
      style={{ background: "#0a1a0f" }}
    >
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <p className="text-sm tracking-[0.3em] uppercase mb-3" style={{ color: "#00D4FF" }}>
            48 Nations · Elo Ratings & Squad Data
          </p>
          <h2
            className="font-bebas text-5xl md:text-7xl"
            style={{ color: "#FFD700", textShadow: "0 0 30px rgba(255,215,0,0.5)" }}
          >
            Team Explorer
          </h2>
          <p className="mt-3 text-base" style={{ color: "rgba(255,255,255,0.5)" }}>
            Click any card to expand details. Sort and filter by group or Elo.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 mb-8 justify-center">
          <input
            type="text"
            placeholder="Search teams…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ ...inputStyle, width: "200px" }}
          />
          <select
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
            style={{ ...inputStyle, cursor: "pointer" }}
          >
            {groups.map((g) => (
              <option key={g} value={g} style={{ background: "#0d2015" }}>
                {g === "All" ? "All Groups" : `Group ${g}`}
              </option>
            ))}
          </select>
          <div className="flex rounded-lg overflow-hidden" style={{ border: "1px solid rgba(255,255,255,0.1)" }}>
            {(["elo", "name", "group"] as SortKey[]).map((key) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className="px-4 py-2 text-sm transition-all duration-200"
                style={{
                  background: sortBy === key ? "rgba(255,215,0,0.15)" : "rgba(26,58,42,0.8)",
                  color: sortBy === key ? "#FFD700" : "rgba(255,255,255,0.6)",
                  borderRight: key !== "group" ? "1px solid rgba(255,255,255,0.1)" : "none",
                }}
              >
                Sort: {key.charAt(0).toUpperCase() + key.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Stats summary */}
        <div className="flex gap-6 justify-center mb-8 flex-wrap">
          <div className="text-center">
            <p className="font-bebas text-3xl" style={{ color: "#FFD700" }}>
              {teams.filter((t) => (t.full_elo ?? 0) >= 1900).length}
            </p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Elite Teams (Elo ≥1900)</p>
          </div>
          <div className="text-center">
            <p className="font-bebas text-3xl" style={{ color: "#00D4FF" }}>
              {teams.filter((t) => (t.full_elo ?? 0) >= 1750 && (t.full_elo ?? 0) < 1900).length}
            </p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Strong Teams (Elo ≥1750)</p>
          </div>
          <div className="text-center">
            <p className="font-bebas text-3xl" style={{ color: "rgba(255,255,255,0.6)" }}>
              {filtered.length}
            </p>
            <p className="text-xs" style={{ color: "rgba(255,255,255,0.4)" }}>Showing</p>
          </div>
        </div>

        {/* Grid */}
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {Array.from({ length: 16 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl p-4 animate-pulse"
                style={{ background: "rgba(15,35,25,0.9)", border: "1px solid rgba(255,255,255,0.08)", height: 100 }}
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {filtered.map((team, i) => (
              <TeamCard key={team.country} team={team} index={i} />
            ))}
          </div>
        )}

        {!loading && filtered.length === 0 && (
          <p className="text-center py-12" style={{ color: "rgba(255,255,255,0.4)" }}>
            No teams match your search.
          </p>
        )}
      </div>
    </section>
  );
}
