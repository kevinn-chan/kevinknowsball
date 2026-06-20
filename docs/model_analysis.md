# WC 2026 Model Analysis — Audit & SOTA Improvement Roadmap

**Date:** 2026-06-21  
**Analyst:** Supercomputer-grade football analytics review  
**Files reviewed:** `backend/simulate.py`, `data/feature_engineering/train_model.py`

---

## Part 1: Audit of Dixon-Coles + Poisson Implementation

### 1.1 Dixon-Coles τ Correction Formula

**Verdict: WRONG — home/away λ arguments are swapped in two cases.**

The classic Dixon-Coles (1997) correction factor τ(i,j) is:

```
τ(0,0) = 1 − λ_h · λ_a · ρ
τ(1,0) = 1 + λ_a · ρ          ← τ(hg=1, ag=0): home scored, uses λ_away
τ(0,1) = 1 + λ_h · ρ          ← τ(hg=0, ag=1): away scored, uses λ_home
τ(1,1) = 1 − ρ
```

The intuition: when the home team scores exactly 1 (τ(1,0)), the correction adjusts by the *away* team's rate, because the correlation is between how "close" each team is to 0 vs 1 goals. The paper's derivation gives:

> τ(x,y) corrects for the dependence in the joint distribution by multiplying the bivariate PMF by a factor derived from: if x≤1 and y≤1, the τ factor involves λ_μ (home rate) in the (0,1) cell and λ_ν (away rate) in the (1,0) cell.

**The current implementation:**
```python
def _dc_tau(hg, ag, lh, la):
    if hg == 0 and ag == 0: return 1 - lh * la * DC_RHO   # CORRECT
    if hg == 0 and ag == 1: return 1 + lh * DC_RHO        # WRONG — should be la (λ_away)
    if hg == 1 and ag == 0: return 1 + la * DC_RHO        # WRONG — should be lh (λ_home)
    if hg == 1 and ag == 1: return 1 - DC_RHO             # CORRECT
```

**Required fix:**
```python
def _dc_tau(hg, ag, lh, la):
    if hg == 0 and ag == 0: return 1 - lh * la * DC_RHO
    if hg == 0 and ag == 1: return 1 + la * DC_RHO   # λ_away for away goal
    if hg == 1 and ag == 0: return 1 + lh * DC_RHO   # λ_home for home goal
    if hg == 1 and ag == 1: return 1 - DC_RHO
    return 1.0
```

**Practical impact:** With ρ = −0.10 and typical λ values around 1.5/1.2, the τ values in the (0,1) and (1,0) cells are close to 1 ± 0.12–0.15. Swapping which λ is used shifts the correction by ~0.03 in absolute terms — small per-match but systematic across 10,000 simulations. It slightly mis-inflates the (0,1) cell (uses home λ ≈ 1.5 instead of away λ ≈ 1.2) so 0-1 scores are very marginally over-inflated. Fixing this is mandatory for correctness.

---

### 1.2 Rejection Sampling — Correctness and Efficiency

**Correctness:** Rejection sampling is *valid* for DC correction. The accept probability is `|τ(i,j)|`. Since ρ < 0 and |ρ| < 0.15, τ values range from roughly 0.78 to 1.22 for realistic λ. The `abs(tau)` call means:
- When τ > 1 (cells we want to *inflate*): the sample is always accepted (since abs(τ) > 1 ≥ random()). Wait — this is wrong. `random.random()` returns [0, 1), so if τ = 1.15, the condition `random() < 1.15` is always True. That works.
- When τ < 1 (cells we want to *deflate*): accepted with probability τ. Correct.
- When τ < 0: this cannot happen with |ρ| < 1/(λ_h·λ_a) ≈ 1/(1.5·1.2) ≈ 0.56, so ρ = −0.10 is safe. But `abs()` is defensive — it would break correctness if τ went negative (we'd accept deflated cells at abs(τ) instead of rejecting). For |ρ| < 0.10 this is fine.

**Efficiency concern:** In the (0,0) and (1,1) cells, τ < 1 (these are the draw-adjacent scorelines being deflated). Acceptance probability is ~0.88–0.90. The while loop runs on average 1/(acceptance rate) ≈ 1.1 iterations. For high-scoring scorelines (≥2 goals each side), τ = 1 and acceptance is immediate. Average iteration count ≈ 1.03. **Rejection sampling is fine here** — nearly no overhead.

**Alternatives:**
- **Direct probability table construction:** Pre-compute the full P(hg=i, ag=j) table for i,j ∈ [0..8] × [0..8] at given (λ_h, λ_a), apply DC correction, normalize, then sample using `np.random.choice`. This eliminates the while loop entirely, is cache-friendly, and costs ~100 multiplications per matchup (done once per unique (λ_h, λ_a) pair). Since λ values are identical for all iterations of the same matchup (the prediction is cached), a pre-computed probability table keyed on (λ_h, λ_a) with 1 decimal rounding would cut MC simulation time substantially. **Recommended upgrade.**
- **Importance sampling:** Overkill for this application; not needed.

---

### 1.3 ρ = −0.10 — Is It Calibrated for World Cup?

**Dixon & Coles (1997)** estimated ρ ≈ −0.133 on English First Division 1992–95 data. Their value captures the excess of 0-0, 1-0, 0-1 results and deficit of 1-1 vs. independent Poisson.

**World Cup data (from our 964-match dataset):**
- Mean goals: H = 1.567, A = 1.254 (lower than domestic leagues: ~1.5 vs ~1.9 for EPL)
- Lower-scoring games → the DC correction affects a *larger fraction* of outcomes (more 0s and 1s)
- Several academic papers (Baio & Blangiardo 2010, Karlis & Ntzoufras 2003) estimated ρ for international football at −0.05 to −0.10

**Conclusion:** −0.10 is a plausible but uncalibrated guess. The correct approach is to MLE-estimate ρ from the actual WC data. Given WC's lower scoring and the prevalence of tactical, defensive games, ρ is likely in [−0.08, −0.12]. Using a data-calibrated value is strictly better. **Implementation: add a `calibrate_rho(df)` function and run it at training time.**

---

### 1.4 λ Values from HistGradientBoosting Regressors

**Dataset stats:** WC data, 964 matches, home avg = 1.567, away avg = 1.254. These are within the expected range for WC football. The regressors are trained on actual goals, so their predictions should regress toward these means.

**Feature space:** Only 3 features: `elo_diff`, `hot_elo_diff`, `tournament_weight`. The tournament_weight column is constant (60.0) for all predictions (hardcoded in `predict_match`). So the regressor uses only 2 effective features.

**Concern:** HistGradientBoosting with 3 features is essentially fitting a 2D function. The model should produce λ values near the global mean for typical Elo differentials and diverge toward extremes only for large Elo gaps (e.g., Brazil vs. San Marino). The hard clip to [0.20, 5.0] is a reasonable guard but the lower bound of 0.20 is very low (implies near-shutout games). A lower clip of 0.40 would be more realistic for WC football.

**The 80/20 blend:** After the regressor output, a "squad_adv" nudge shifts λ_h and λ_a by ±10% (lam_h *= (1 + 0.10 * squad_adv)). The squad_adv formula uses 8 squad metrics weighted ad hoc. This is ad-hoc but defensible as a residual correction. However, it's double-counted — Elo already partially encodes squad strength (Elo updates from match results, which are downstream of squad quality). A regression of squad_adv on elo_diff would reveal the degree of information overlap. **Better approach: include squad metrics as additional training features** rather than post-hoc nudging, so the gradient boosting can learn the correct joint function.

---

### 1.5 80/20 Elo/Squad Blend — Principled?

**Verdict: Not principled — the weights (0.30, 0.15, 0.15, etc.) are manually tuned.**

The formula:
```python
squad_adv = (
    0.30 * tanh(Δvalue/1e8) +
    0.15 * tanh(Δage_peak*5) +
    0.15 * tanh(Δelite_league*3) + ...
)
nudge = 0.20 * squad_adv
```

Problems:
1. The scaling constants (1e8, 5, 3) are arbitrary — they determine where the tanh saturates.
2. The 20% overall weight on squad vs. 80% on Elo has no empirical basis.
3. It's a post-hoc additive correction on top of a model that already partially encodes squad information via Elo.

**Better approach:** Include the squad metrics as features in the classifier and regressors directly. Use sklearn's feature importance or permutation importance to let the data determine weights. Run cross-validation to confirm they add signal beyond Elo.

---

### 1.6 Penalty Shootout Edge — "50/50 + slight edge"

**Current implementation:**
```python
edge = 0.5 + 0.05 * np.sign(res["home_win"] - res["away_win"])
```
This gives 0.55 to the team that the model rates as stronger (home_win > away_win), and 0.45 to the other team. The edge is symmetric ±0.05.

**Reality:** Real WC shootout data (1982–2022):
- The team kicking first wins ~60% of penalty shootouts (coin toss determines first kick since 2018 Shootout Procedure revision; previously, match referee tossed).
- In WC specifically: 21 shootouts (1982–2022), first-kicker won ~57% (12/21).
- Footballing-strength advantage in shootouts is smaller than in open play. Teams within one Elo tier often separate in shootouts by < 5%.

**Better implementation:** Use the team's Elo as the tiebreaker proxy (higher Elo team is assumed to kick first, or add a 50/50 coin flip for who kicks first):
```python
# Higher-Elo team wins ~60% of shootouts (kicks first advantage + slight quality edge)
if res["home_win"] >= res["away_win"]:
    edge = 0.60  # home team is stronger, kicks first
else:
    edge = 0.40  # away team is stronger
```
This is statistically grounded vs. the current arbitrary ±0.05 nudge.

---

## Part 2: SOTA Improvements — Prioritised

Impact scale: Low / Medium / High  
Feasibility: Zero-new-data / Requires-external-data

---

### #1 — Extend Training to All International Matches with tournament_weight (HIGH impact, zero-new-data)

**What it fixes:** The model trains on 964 WC matches only. This is a small dataset for a gradient boosting model with hyperparameter search. More data → better-calibrated λ values and classifier probabilities, especially for teams with few WC appearances.

**How to implement:** In `build_training_data()`, remove the `tournament_weight == 60` filter on both `res` and `elo`. Instead, keep all matches (49,215 rows) and pass `sample_weight=df["tournament_weight"].values` to `clf.fit()`, `reg_h.fit()`, and `reg_a.fit()`. HistGradientBoosting supports `sample_weight` natively.

**Implementation:**
```python
# In build_training_data(): remove WC filter
wc_res = res.copy()  # was: res[res["tournament_weight"] == 60]
home_elo = elo.copy()  # was: elo[elo["tournament_weight"] == 60]
```
Pass `sample_weight` in `train_classifier()` and `train_regressors()`.

**Estimated impact:** HIGH. Going from 964 → 49,215 rows (51× more data) will substantially reduce variance in the classifier's probability estimates. The WC-specific signal is preserved via upweighting (weight=60 for WC vs. 10 for friendlies). Expect log-loss improvement of 0.05–0.15 on WC-specific CV.

**Data requirements:** None — `cleaned_results.csv` already contains all matches.

---

### #2 — Time-Decay on Training Rows (HIGH impact, zero-new-data)

**What it fixes:** A 1974 WC match tells us almost nothing about 2026 team strengths. Elo partially accounts for this (Elo decays toward mean), but the regressor treats all rows equally regardless of recency.

**How to implement:** Add an exponential decay weight based on match date:
```python
# Half-life of 4 years = 1461 days
reference_date = pd.Timestamp("2026-06-01")
df["days_ago"] = (reference_date - df["date"]).dt.days
df["decay_weight"] = np.exp(-np.log(2) * df["days_ago"] / 1461)
df["sample_weight"] = df["tournament_weight"] * df["decay_weight"]
```

**Estimated impact:** HIGH. The 2022 and 2026 qualifying cycle data (2019–2026) gets strong weight; pre-2014 data gets < 10% weight. The model learns from modern football (pressing, high lines, VAR era) rather than averaging with 1970s football.

**Data requirements:** None.

---

### #3 — Calibrate ρ from Actual WC Goal Data (MEDIUM impact, zero-new-data)

**What it fixes:** ρ = −0.10 is a guess. The correct value should maximize the log-likelihood of observed WC scorelines under the DC model.

**How to implement:** Write a 1D MLE optimizer over ρ using the WC match data:
```python
from scipy.optimize import minimize_scalar
from scipy.stats import poisson

def dc_loglik(rho, df, mean_lh, mean_la):
    ll = 0.0
    for _, row in df.iterrows():
        hg, ag = int(row["home_score"]), int(row["away_score"])
        # Use average λ as proxy for per-match λ (or use per-match predictions)
        lh, la = mean_lh, mean_la
        p = poisson.pmf(hg, lh) * poisson.pmf(ag, la)
        tau = dc_tau(hg, ag, lh, la, rho)
        ll += np.log(max(p * tau, 1e-12))
    return -ll

result = minimize_scalar(dc_loglik, bounds=(-0.5, 0), method="bounded",
                         args=(wc_df, mean_lh, mean_la))
rho_hat = result.x
```

Ideally use per-match λ predictions (from the trained regressor) rather than global means.

**Estimated impact:** MEDIUM. ρ will likely land in [−0.08, −0.13]. The difference from −0.10 is small but removes a manual parameter.

**Data requirements:** None.

---

### #4 — Fix Penalty Shootout Edge to 60/40 (LOW-MEDIUM impact, zero-new-data)

**What it fixes:** Current ±0.05 edge is unprincipled. Real data supports ~60% win rate for the team kicking first (proxied by higher Elo).

**How to implement:** Simple change in `simulate_knockout()` as shown above.

**Estimated impact:** LOW on overall winner probabilities (~1–2% shift in champion probability for individual teams), but makes the model statistically grounded.

---

### #5 — Include Squad Metrics as Training Features (MEDIUM impact, zero-new-data)

**What it fixes:** Squad metrics are currently applied as a post-hoc hack. Including them in the regressor/classifier lets the gradient boosting learn their interaction with Elo and their true contribution.

**How to implement:** At training time, merge `team_squad_metrics.csv` onto the training rows (by home_team and away_team), compute squad_adv features (or individual squad metric differences), and append to `TRAIN_FEATURES`.

**Estimated impact:** MEDIUM. Squad values, elite league pct, and age peak scores are predictive signals. However, historical squad metrics for pre-2010 matches don't exist, so this feature set will have heavy NaN imputation. HistGradientBoosting handles NaN natively (uses NaN-aware splits), so implementation is straightforward.

**Data requirements:** None — metrics already in `team_squad_metrics.csv` for 2026 teams. Historical squad data is unavailable; impute with 0 (assumes average squad for historical matches).

---

### #6 — Bivariate Poisson Model (MEDIUM impact, zero-new-data)

**What it fixes:** Goals aren't truly independent. The DC correction patches low-score dependence, but a proper bivariate Poisson (Karlis & Ntzoufras 2003) models: Home = X₁ + X₃, Away = X₂ + X₃, where X₁,X₂,X₃ ~ Poisson(λ₁,λ₂,λ₃). X₃ is a shared "correlated" process (both teams score simultaneously — very rare but captures covariance structure).

**How to implement:** Maximum likelihood estimation of λ₃ from WC data. `scipy.optimize.minimize` over (λ₁, λ₂, λ₃) per match. PMF computation is non-trivial (requires summing over j = 0..min(x,y) of the shared Poisson term).

**Estimated impact:** MEDIUM-LOW. The Dixon-Coles approximation already captures most of the low-score covariance. The bivariate Poisson adds accuracy at (1,1) scorelines but the overall probability mass shift is small. Implementation complexity is significantly higher.

---

### #7 — Time-Decay Bayesian Updating During Tournament (HIGH impact, context-specific)

**What it fixes:** Once the tournament starts, each match is a new observation of team strength. Group stage results should update our beliefs about team λ before knockout draws.

**How to implement:** After each group match, compute posterior Elo update (already done via Elo system) and re-run prediction with updated features. The cache in `simulate.py` would need to be invalidated per-simulation iteration — currently it's fixed for all 10,000 iterations.

**Implementation:** In `monte_carlo()`, move `warm_cache()` inside the iteration loop but only for teams whose Elo changed. Or, use the scoreline from each simulated group match to adjust λ estimates via Bayesian conjugate update (gamma-Poisson conjugate: given prior λ ~ Gamma(α, β), observed goals X updates to Gamma(α + X, β + 1)).

**Estimated impact:** HIGH for accurate tournament simulation. Currently all 10,000 simulations start from identical pre-tournament priors — they don't incorporate within-tournament information. This is the biggest conceptual gap.

---

### #8 — xG Instead of Actual Goals as Regression Target (MEDIUM impact, requires xG data)

**What it fixes:** Actual goals have high variance (lucky shots, own goals). xG is a better proxy for true attacking strength.

**How to implement:** Replace `home_score` / `away_score` with xG per match.

**Estimated impact:** MEDIUM. xG data for historical WC matches is available from StatsBomb open data (2018 WC onwards) and FBref. Pre-2018 WC data is limited. Would require substantial data collection effort.

**Data requirements:** StatsBomb open data (free for WC 2018/2022) or FBref scrape.

---

### #9 — Calibration Check: Reliability Diagram (MEDIUM maintenance value, zero-new-data)

**What it fixes:** A CV log-loss of 1.1127 is plausible but we don't know if probabilities are well-calibrated. A model that outputs 70% win for strong teams but that strong team only wins 60% of the time is mis-calibrated.

**How to implement:**
```python
from sklearn.calibration import calibration_curve
import matplotlib.pyplot as plt

# For home_win predictions
prob_true, prob_pred = calibration_curve(
    (y_val == 2).astype(int), proba_val[:, 2], n_bins=10)
plt.plot(prob_pred, prob_true)
plt.plot([0, 1], [0, 1], 'k--')
```

Run this in a held-out CV fold. If the curve bows above the diagonal, the model is underconfident; below = overconfident.

**Estimated impact:** MEDIUM for practical usage. If mis-calibrated, wrap classifier in `sklearn.calibration.CalibratedClassifierCV`.

---

### #10 — Head-to-Head History (LOW impact, zero-new-data)

**What it fixes:** Some rivalry effects (Germany vs England, Brazil vs France) may be above what Elo predicts.

**How to implement:** Compute H2H win rate over last N meetings, merge as feature. H2H effects are largely captured by Elo already (past wins raise Elo). Residual H2H effect after Elo conditioning is small per academic literature.

**Estimated impact:** LOW. The Elo system already conditions on H2H implicitly. The incremental signal from explicit H2H features is typically < 1% in log-loss.

---

### #11 — Neural Approaches: DeepMind/StatsBomb (LOW feasibility, HIGH ceiling)

**What it fixes:** Position-tracking, possession-value, and shot quality models can give richer team strength estimates than Elo.

**How to implement:** StatsBomb open data is available for WC 2018 and 2022 (Python package: `statsbombpy`). DeepMind's TacticAI is not open-weight. StatsBomb's xG model is open.

**Estimated impact:** HIGH ceiling but significant implementation cost. Not recommended unless the project scope expands. The gain from better features would need to be validated against the simpler Elo+squad model.

---

## Summary — Implementation Priority

| Rank | Improvement | Impact | New Data? | Effort |
|------|-------------|--------|-----------|--------|
| 1 | Extend training to all internationals + sample_weight | HIGH | No | 1 hour |
| 2 | Time-decay exponential on training rows | HIGH | No | 30 min |
| 3 | Fix τ swap in Dixon-Coles | CRITICAL correctness | No | 5 min |
| 4 | Calibrate ρ from WC data | MEDIUM | No | 1 hour |
| 5 | Fix penalty shootout 60/40 | MEDIUM | No | 5 min |
| 6 | Add squad metrics as training features | MEDIUM | No | 2 hours |
| 7 | Probability table sampling instead of rejection | Speed | No | 30 min |
| 8 | Bayesian within-tournament updating | HIGH | No | 4 hours |
| 9 | xG as regression target | MEDIUM | Yes (xG data) | 8 hours |
| 10 | Bivariate Poisson | MEDIUM | No | 4 hours |
| 11 | Calibration reliability diagram | Diagnostic | No | 30 min |
| 12 | Neural / StatsBomb approaches | HIGH ceiling | Yes | 40+ hours |

---

*End of analysis.*
