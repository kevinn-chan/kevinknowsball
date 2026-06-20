import Navbar from "./components/Navbar";
import SplineHero from "./components/SplineHero";
import TournamentBracket from "./components/TournamentBracket";
import TournamentOdds from "./components/TournamentOdds";
import MatchPredictor from "./components/MatchPredictor";
import TeamExplorer from "./components/TeamExplorer";
import PlayerExplorer from "./components/PlayerExplorer";
import Minigame from "./components/Minigame";
import PenaltyGame from "./components/PenaltyGame";
import GameHub from "./components/GameHub";

export default function Home() {
  return (
    <main>
      <Navbar />
      <SplineHero />
      <TournamentBracket />
      <TournamentOdds />
      <MatchPredictor />
      <TeamExplorer />
      <PlayerExplorer />
      <Minigame />
      <PenaltyGame />
      <GameHub />

      {/* Footer */}
      <footer
        className="py-8 text-center text-sm"
        style={{
          background: "#060f09",
          borderTop: "1px solid rgba(255,215,0,0.1)",
          color: "rgba(255,255,255,0.3)",
        }}
      >
        <p>
          ⚽ WC 2026 AI Predictor · Built with Next.js, Framer Motion &amp; Monte Carlo Simulation
        </p>
        <p className="mt-1">
          Predictions are probabilistic models for entertainment purposes only.
        </p>
      </footer>
    </main>
  );
}
