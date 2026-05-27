"""Unified confidence scoring: separates detection confidence from repair confidence.
Uses ensemble agreement, sample size reliability (Wilson score), and Bayesian updating."""

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

import numpy as np


@dataclass
class DetectorSignal:
    name: str  # e.g. "iqr", "mad", "zscore"
    detected: bool  # Did this detector flag the issue?
    raw_confidence: float  # Detector's own confidence (0-1)
    weight: float = 1.0  # Reliability weight


@dataclass
class ConfidenceResult:
    detection_confidence: float  # How sure we are the issue exists
    repair_confidence: float  # How sure we are the fix is correct
    agreement_score: float  # How much detectors agree
    reliability: float  # Sample size reliability
    detectors_used: List[str] = field(default_factory=list)
    rationale: str = ""


class UnifiedConfidenceModel:
    """Bayesian-inspired multi-signal confidence model."""

    # Base rates (priors) by issue type
    PRIORS: Dict[str, float] = {
        "outlier": 0.05,
        "null_representation": 0.10,
        "case_variation": 0.15,
        "duplicate": 0.05,
        "impossible_value": 0.02,
        "format_violation": 0.08,
        "date_inconsistency": 0.10,
        "default": 0.10,
    }

    # Repair difficulty penalties
    REPAIR_DIFFICULTY: Dict[str, float] = {
        "simple_replace": 0.02,  # e.g. null -> NaN
        "case_normalize": 0.03,  # e.g. "usa" -> "USA"
        "statistical_impute": 0.12,  # e.g. median fill
        "ml_impute": 0.18,  # e.g. MissForest
        "outlier_cap": 0.08,
        "outlier_remove": 0.05,
        "fuzzy_merge": 0.15,
        "date_reformat": 0.05,
        "flag_only": 0.01,
        "default": 0.10,
    }

    def compute(
        self,
        signals: List[DetectorSignal],
        sample_size: int,
        issue_type: str,
        repair_strategy: str,
        impact_pct: float,
    ) -> ConfidenceResult:
        # 1. Ensemble agreement
        n_detected = sum(1 for s in signals if s.detected)
        n_total = len(signals)
        agreement = n_detected / n_total if n_total > 0 else 0

        # 2. Weighted signal combination
        if n_total == 0:
            signal_conf = 0.5
        else:
            weights = [s.weight for s in signals if s.detected]
            confs = [s.raw_confidence for s in signals if s.detected]
            if weights:
                signal_conf = float(np.average(confs, weights=weights))
            else:
                signal_conf = 0.3  # No detector flagged

        # 3. Sample reliability (Wilson score interval width)
        reliability = self._wilson_reliability(sample_size, agreement)

        # 4. Bayesian update: prior * likelihood
        prior = self.PRIORS.get(issue_type, self.PRIORS["default"])
        posterior = self._bayes_update(prior, signal_conf, agreement)

        # 5. Detection confidence
        detection_conf = min(0.98, posterior * reliability)

        # 6. Repair confidence (always <= detection confidence)
        difficulty = self.REPAIR_DIFFICULTY.get(
            repair_strategy, self.REPAIR_DIFFICULTY["default"]
        )
        repair_conf = max(0.0, detection_conf - difficulty)

        # 7. Build rationale
        detectors_used = [s.name for s in signals if s.detected]
        rationale = self._build_rationale(
            detectors_used, agreement, reliability, detection_conf, repair_conf
        )

        return ConfidenceResult(
            detection_confidence=round(detection_conf, 3),
            repair_confidence=round(repair_conf, 3),
            agreement_score=round(agreement, 3),
            reliability=round(reliability, 3),
            detectors_used=detectors_used,
            rationale=rationale,
        )

    def _wilson_reliability(self, n: int, p: float) -> float:
        """Wilson score: reliability decreases with small samples."""
        if n == 0:
            return 0.5
        z = 1.96
        denominator = 1 + z**2 / n
        centre = (p + z**2 / (2 * n)) / denominator
        width = (
            z * np.sqrt(p * (1 - p) / n + z**2 / (4 * n**2)) / denominator
        )
        return max(0.5, min(1.0, 1 - 2 * float(width)))

    def _bayes_update(
        self, prior: float, likelihood: float, agreement: float
    ) -> float:
        """Simplified Bayesian update."""
        evidence = prior * likelihood + (1 - prior) * (1 - likelihood)
        if evidence == 0:
            return prior
        posterior = (prior * likelihood) / evidence
        # Boost by agreement
        posterior = posterior * (0.7 + 0.3 * agreement)
        return min(1.0, posterior)

    def _build_rationale(
        self,
        detectors: List[str],
        agreement: float,
        reliability: float,
        det_conf: float,
        rep_conf: float,
    ) -> str:
        parts = []
        if detectors:
            parts.append(f"Detected by: {', '.join(detectors)}")
        parts.append(f"Agreement: {agreement:.0%}")
        parts.append(f"Sample reliability: {reliability:.0%}")
        if det_conf != rep_conf:
            parts.append(f"Detection: {det_conf:.0%}, Repair: {rep_conf:.0%}")
        return ". ".join(parts)
