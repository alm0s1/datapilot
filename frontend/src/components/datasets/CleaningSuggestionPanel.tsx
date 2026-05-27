"use client";

import { useState, useMemo } from "react";
import {
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  Shield,
  Zap,
  AlertOctagon,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type {
  CleaningSuggestion,
  CleaningAction,
  SuggestionSeverity,
} from "@/types/dataset";

interface CleaningSuggestionPanelProps {
  suggestions: CleaningSuggestion[];
  onApply: (actions: CleaningAction[]) => void;
  isApplying: boolean;
}

function confidenceColor(c: number) {
  if (c >= 0.8) return "text-emerald-400";
  if (c >= 0.5) return "text-amber-400";
  return "text-red-400";
}

function confidenceLabel(c: number) {
  if (c >= 0.8) return "High";
  if (c >= 0.5) return "Medium";
  return "Low";
}

function confidenceBg(c: number) {
  if (c >= 0.8) return "bg-emerald-500/10 border-emerald-500/30";
  if (c >= 0.5) return "bg-amber-500/10 border-amber-500/30";
  return "bg-red-500/10 border-red-500/30";
}

function impactColor(pct: number | undefined) {
  if (pct == null) return null;
  if (pct > 25) return { bg: "bg-red-500/10 border-red-500/30", text: "text-red-400", label: "High Impact" };
  if (pct > 5) return { bg: "bg-amber-500/10 border-amber-500/30", text: "text-amber-400", label: "Medium Impact" };
  return { bg: "bg-emerald-500/10 border-emerald-500/30", text: "text-emerald-400", label: "Low Impact" };
}

const ACTION_LABELS: Record<string, string> = {
  column_name_normalization: "Column Name Normalization",
  text_normalization: "Text Normalization",
  null_representation: "Null Representation Fix",
  smart_duplicates: "Duplicate Removal",
  outlier_detection: "Outlier Detection",
  date_correction: "Date Correction",
  categorical_normalization: "Categorical Normalization",
  missing_value_imputation: "Missing Value Imputation",
  unit_normalization: "Unit Normalization",
  format_validation: "Format Validation",
  impossible_value_detection: "Impossible Value Detection",
};

const ACTION_ICONS: Record<string, typeof Sparkles> = {
  column_name_normalization: Zap,
  text_normalization: Zap,
  null_representation: AlertTriangle,
  smart_duplicates: Shield,
  outlier_detection: AlertTriangle,
  date_correction: Zap,
  categorical_normalization: Sparkles,
  missing_value_imputation: Sparkles,
  unit_normalization: Zap,
  format_validation: Shield,
  impossible_value_detection: AlertOctagon,
};

interface SeverityGroup {
  key: SuggestionSeverity;
  label: string;
  icon: typeof AlertOctagon;
  headerClass: string;
  badgeClass: string;
  defaultOpen: boolean;
}

const SEVERITY_GROUPS: SeverityGroup[] = [
  {
    key: "critical",
    label: "Critical Issues",
    icon: AlertOctagon,
    headerClass: "text-red-400",
    badgeClass: "bg-red-500/15 text-red-400",
    defaultOpen: true,
  },
  {
    key: "warning",
    label: "Warnings",
    icon: AlertTriangle,
    headerClass: "text-amber-400",
    badgeClass: "bg-amber-500/15 text-amber-400",
    defaultOpen: true,
  },
  {
    key: "info",
    label: "Improvements",
    icon: Info,
    headerClass: "text-blue-400",
    badgeClass: "bg-blue-500/15 text-blue-400",
    defaultOpen: false,
  },
];

function groupBySeverity(suggestions: CleaningSuggestion[]) {
  const groups: Record<SuggestionSeverity, { suggestion: CleaningSuggestion; originalIndex: number }[]> = {
    critical: [],
    warning: [],
    info: [],
  };
  suggestions.forEach((s, i) => {
    const sev = s.severity || "info";
    groups[sev].push({ suggestion: s, originalIndex: i });
  });
  return groups;
}

export default function CleaningSuggestionPanel({
  suggestions,
  onApply,
  isApplying,
}: CleaningSuggestionPanelProps) {
  // Track approved/rejected state per suggestion index
  const [approvedMap, setApprovedMap] = useState<Record<number, boolean>>(() => {
    const map: Record<number, boolean> = {};
    suggestions.forEach((s, i) => {
      map[i] = s.confidence >= 0.8;
    });
    return map;
  });

  const [expandedMap, setExpandedMap] = useState<Record<number, boolean>>({});
  const [evidenceMap, setEvidenceMap] = useState<Record<number, boolean>>({});
  const [alternativesMap, setAlternativesMap] = useState<Record<number, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    SEVERITY_GROUPS.forEach((g) => {
      map[g.key] = !g.defaultOpen;
    });
    return map;
  });

  const approvedCount = useMemo(
    () => Object.values(approvedMap).filter(Boolean).length,
    [approvedMap]
  );

  const aiCount = useMemo(
    () => suggestions.filter((s) => s.ai_enhanced).length,
    [suggestions]
  );

  const grouped = useMemo(() => groupBySeverity(suggestions), [suggestions]);

  const toggleApproval = (index: number) => {
    setApprovedMap((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleExpand = (index: number) => {
    setExpandedMap((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleEvidence = (index: number) => {
    setEvidenceMap((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleAlternatives = (index: number) => {
    setAlternativesMap((prev) => ({ ...prev, [index]: !prev[index] }));
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const approveGroup = (items: { originalIndex: number }[]) => {
    setApprovedMap((prev) => {
      const next = { ...prev };
      items.forEach(({ originalIndex }) => {
        next[originalIndex] = true;
      });
      return next;
    });
  };

  const rejectGroup = (items: { originalIndex: number }[]) => {
    setApprovedMap((prev) => {
      const next = { ...prev };
      items.forEach(({ originalIndex }) => {
        next[originalIndex] = false;
      });
      return next;
    });
  };

  const approveAllHigh = () => {
    const map: Record<number, boolean> = {};
    suggestions.forEach((s, i) => {
      map[i] = s.confidence >= 0.8;
    });
    setApprovedMap(map);
  };

  const rejectAll = () => {
    const map: Record<number, boolean> = {};
    suggestions.forEach((_, i) => {
      map[i] = false;
    });
    setApprovedMap(map);
  };

  const handleApply = () => {
    const approved: CleaningAction[] = [];
    suggestions.forEach((s, i) => {
      if (approvedMap[i]) {
        approved.push(s.action);
      }
    });
    onApply(approved);
  };

  if (suggestions.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center">
        <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-400" />
        <p className="font-medium">No cleaning suggestions</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Your data looks clean! You can proceed to profiling.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Bulk actions bar */}
      <div className="flex items-center justify-between rounded-lg bg-muted/50 p-3">
        <div className="flex items-center gap-3 text-sm">
          <span>
            <span className="font-medium">{approvedCount}</span> of{" "}
            <span className="font-medium">{suggestions.length}</span> suggestions
            approved
          </span>
          {aiCount > 0 && (
            <span className="flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs text-violet-400">
              <Sparkles className="h-3 w-3" />
              {aiCount} AI-enhanced
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={approveAllHigh}>
            Approve High Confidence
          </Button>
          <Button variant="outline" size="sm" onClick={rejectAll}>
            Reject All
          </Button>
        </div>
      </div>

      {/* Severity-grouped suggestions */}
      {SEVERITY_GROUPS.map((group) => {
        const items = grouped[group.key];
        if (items.length === 0) return null;
        const isCollapsed = collapsedGroups[group.key] ?? false;
        const GroupIcon = group.icon;

        return (
          <div key={group.key} className="space-y-2">
            {/* Group header */}
            <button
              onClick={() => toggleGroup(group.key)}
              className="flex w-full items-center gap-2 rounded-lg bg-muted/30 px-3 py-2 hover:bg-muted/50 transition-colors"
            >
              {isCollapsed ? (
                <ChevronRight className={`h-4 w-4 ${group.headerClass}`} />
              ) : (
                <ChevronDown className={`h-4 w-4 ${group.headerClass}`} />
              )}
              <GroupIcon className={`h-4 w-4 ${group.headerClass}`} />
              <span className={`text-sm font-semibold ${group.headerClass}`}>
                {group.label}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-medium ${group.badgeClass}`}
              >
                {items.length}
              </span>
              <div className="flex-1" />
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  approveGroup(items);
                }}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer px-1"
              >
                Approve all
              </span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  rejectGroup(items);
                }}
                className="text-xs text-muted-foreground hover:text-foreground cursor-pointer px-1"
              >
                Reject all
              </span>
            </button>

            {/* Group items */}
            {!isCollapsed && (
              <div className="space-y-2 pl-2">
                {items.map(({ suggestion, originalIndex }) => {
                  const isApproved = approvedMap[originalIndex] ?? false;
                  const isExpanded = expandedMap[originalIndex] ?? false;
                  const isEvidenceOpen = evidenceMap[originalIndex] ?? false;
                  const isAlternativesOpen = alternativesMap[originalIndex] ?? false;
                  const Icon =
                    ACTION_ICONS[suggestion.action.action_type] || Sparkles;
                  const impact = impactColor(suggestion.impact_pct);

                  return (
                    <Card
                      key={originalIndex}
                      className={`transition-all ${
                        isApproved
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-border/50 opacity-70"
                      } ${
                        suggestion.is_destructive
                          ? "border-l-2 border-l-amber-500"
                          : ""
                      }`}
                    >
                      <CardContent className="p-4">
                        {/* Destructive warning banner */}
                        {suggestion.is_destructive && (
                          <div className="mb-2 flex items-center gap-1.5 rounded bg-amber-500/10 px-2 py-1 text-xs text-amber-400">
                            <AlertTriangle className="h-3 w-3" />
                            Destructive — this action may remove rows
                            {suggestion.impact_pct != null && suggestion.impact_pct > 50 && (
                              <span className="ml-1 font-semibold">
                                (affects {suggestion.impact_pct}% of dataset)
                              </span>
                            )}
                          </div>
                        )}

                        {/* Header row */}
                        <div className="flex items-start gap-3">
                          {/* Approve/Reject toggle */}
                          <button
                            onClick={() => toggleApproval(originalIndex)}
                            className="mt-0.5 shrink-0"
                          >
                            {isApproved ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-400" />
                            ) : (
                              <XCircle className="h-5 w-5 text-muted-foreground" />
                            )}
                          </button>

                          {/* Icon */}
                          <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />

                          {/* Content */}
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-sm">
                                {ACTION_LABELS[suggestion.action.action_type] ||
                                  suggestion.action.action_type}
                              </span>
                              {suggestion.action.target_column && (
                                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                                  {suggestion.action.target_column}
                                </code>
                              )}
                              {/* Confidence badge */}
                              <span
                                className={`rounded-full border px-2 py-0.5 text-xs font-medium ${confidenceBg(
                                  suggestion.confidence
                                )} ${confidenceColor(suggestion.confidence)}`}
                              >
                                {confidenceLabel(suggestion.confidence)}{" "}
                                {Math.round(suggestion.confidence * 100)}%
                              </span>
                              {/* Repair confidence badge */}
                              {suggestion.repair_confidence != null && (
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${confidenceBg(
                                    suggestion.repair_confidence
                                  )} ${confidenceColor(suggestion.repair_confidence)}`}
                                >
                                  Repair {Math.round(suggestion.repair_confidence * 100)}%
                                </span>
                              )}
                              {/* Detector agreement indicator */}
                              {suggestion.detector_agreement != null && (
                                <span className="rounded-full border border-purple-500/30 bg-purple-500/10 px-2 py-0.5 text-xs font-medium text-purple-400">
                                  Agreement {Math.round(suggestion.detector_agreement * 100)}%
                                </span>
                              )}
                              {/* Impact badge */}
                              {impact && suggestion.impact_pct != null && suggestion.impact_pct > 0 && (
                                <span
                                  className={`rounded-full border px-2 py-0.5 text-xs font-medium ${impact.bg} ${impact.text}`}
                                >
                                  {impact.label} ({suggestion.impact_pct}%)
                                </span>
                              )}
                              {/* AI-enhanced badge */}
                              {suggestion.ai_enhanced && (
                                <span className="flex items-center gap-1 rounded-full border border-violet-500/30 bg-violet-500/10 px-2 py-0.5 text-xs font-medium text-violet-400">
                                  <Sparkles className="h-3 w-3" />
                                  AI
                                </span>
                              )}
                            </div>

                            <p className="mt-1 text-sm text-muted-foreground">
                              {suggestion.reason}
                            </p>

                            {/* AI reasoning */}
                            {suggestion.ai_enhanced && suggestion.ai_reason && (
                              <p className="mt-1 flex items-start gap-1 text-xs text-violet-400/80">
                                <Sparkles className="mt-0.5 h-3 w-3 shrink-0" />
                                {suggestion.ai_reason}
                              </p>
                            )}

                            {/* Detection rationale */}
                            {suggestion.detection_rationale && (
                              <p className="mt-1 text-xs text-blue-400/80">
                                {suggestion.detection_rationale}
                              </p>
                            )}

                            {/* Risk notes */}
                            {suggestion.risk_notes && suggestion.risk_notes.length > 0 && (
                              <div className="mt-1.5 space-y-0.5">
                                {suggestion.risk_notes.map((note, ni) => (
                                  <div
                                    key={ni}
                                    className="flex items-center gap-1 text-xs text-amber-400/80"
                                  >
                                    <AlertTriangle className="h-3 w-3 shrink-0" />
                                    {note}
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Detectors used */}
                            {suggestion.detectors_used && suggestion.detectors_used.length > 0 && (
                              <div className="mt-1 flex flex-wrap gap-1">
                                {suggestion.detectors_used.map((d) => (
                                  <span
                                    key={d}
                                    className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                                  >
                                    {d}
                                  </span>
                                ))}
                              </div>
                            )}

                            {suggestion.estimated_rows_affected > 0 && (
                              <p className="mt-1 text-xs text-muted-foreground">
                                ~{suggestion.estimated_rows_affected.toLocaleString()}{" "}
                                rows affected
                              </p>
                            )}

                            {/* Action links row */}
                            <div className="mt-2 flex items-center gap-3">
                              {/* Before/after toggle */}
                              {(suggestion.before_sample.length > 0 ||
                                suggestion.after_sample.length > 0) && (
                                <button
                                  onClick={() => toggleExpand(originalIndex)}
                                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3" />
                                  )}
                                  {isExpanded ? "Hide" : "Show"} preview
                                </button>
                              )}
                              {/* Evidence toggle */}
                              {suggestion.evidence && Object.keys(suggestion.evidence).length > 0 && (
                                <button
                                  onClick={() => toggleEvidence(originalIndex)}
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                                >
                                  {isEvidenceOpen ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3" />
                                  )}
                                  {isEvidenceOpen ? "Hide" : "Show"} evidence
                                </button>
                              )}
                              {/* Alternatives toggle */}
                              {suggestion.alternative_strategies && suggestion.alternative_strategies.length > 0 && (
                                <button
                                  onClick={() => toggleAlternatives(originalIndex)}
                                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary hover:underline"
                                >
                                  {isAlternativesOpen ? (
                                    <ChevronDown className="h-3 w-3" />
                                  ) : (
                                    <ChevronRight className="h-3 w-3" />
                                  )}
                                  {isAlternativesOpen ? "Hide" : "Show"} alternatives
                                </button>
                              )}
                            </div>

                            {/* Before/after preview */}
                            {isExpanded && (
                              <div className="mt-2 grid grid-cols-2 gap-3 rounded bg-muted/50 p-3 text-xs">
                                <div>
                                  <p className="mb-1 font-medium text-muted-foreground">
                                    Before
                                  </p>
                                  {suggestion.before_sample.map((v, i) => (
                                    <div
                                      key={i}
                                      className="truncate text-red-400/80"
                                    >
                                      {String(v ?? "null")}
                                    </div>
                                  ))}
                                </div>
                                <div>
                                  <p className="mb-1 font-medium text-muted-foreground">
                                    After
                                  </p>
                                  {suggestion.after_sample.map((v, i) => (
                                    <div
                                      key={i}
                                      className="truncate text-emerald-400/80"
                                    >
                                      {String(v ?? "null")}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Evidence section */}
                            {isEvidenceOpen && suggestion.evidence && (
                              <div className="mt-2 rounded bg-muted/50 p-3 text-xs">
                                <p className="mb-1.5 font-medium text-muted-foreground">
                                  Evidence
                                </p>
                                <div className="space-y-1">
                                  {Object.entries(suggestion.evidence).map(
                                    ([key, value]) => (
                                      <div
                                        key={key}
                                        className="flex items-start gap-2"
                                      >
                                        <span className="shrink-0 font-mono text-muted-foreground">
                                          {key}:
                                        </span>
                                        <span className="text-foreground/80 break-all">
                                          {typeof value === "object"
                                            ? JSON.stringify(value, null, 0)
                                            : String(value)}
                                        </span>
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Alternatives section */}
                            {isAlternativesOpen && suggestion.alternative_strategies && (
                              <div className="mt-2 rounded bg-muted/50 p-3 text-xs">
                                <p className="mb-1.5 font-medium text-muted-foreground">
                                  Alternative Strategies Considered
                                </p>
                                <div className="space-y-1.5">
                                  {suggestion.alternative_strategies.map(
                                    (alt, ai) => (
                                      <div
                                        key={ai}
                                        className="flex items-start gap-2"
                                      >
                                        <code className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px]">
                                          {alt.method}
                                        </code>
                                        <span className="text-muted-foreground">
                                          {alt.reason}
                                        </span>
                                      </div>
                                    )
                                  )}
                                </div>
                                {suggestion.repair_rationale && (
                                  <p className="mt-2 border-t border-border/50 pt-2 text-muted-foreground">
                                    <span className="font-medium">Why chosen: </span>
                                    {suggestion.repair_rationale}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* Apply button */}
      <div className="flex justify-end pt-2">
        <Button
          onClick={handleApply}
          disabled={approvedCount === 0 || isApplying}
          className="min-w-[160px]"
        >
          {isApplying
            ? "Applying..."
            : `Apply ${approvedCount} Action${approvedCount !== 1 ? "s" : ""}`}
        </Button>
      </div>
    </div>
  );
}
