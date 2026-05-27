"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Code2, Copy, Check } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SqlPreviewProps {
  sql: string | null;
}

export default function SqlPreview({ sql }: SqlPreviewProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!sql) return;
    try {
      await navigator.clipboard.writeText(sql);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  if (!sql) {
    return null;
  }

  return (
    <div className="rounded-lg border">
      {/* Header */}
      <button
        className="flex w-full items-center gap-2 p-3 text-left hover:bg-muted/50"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <Code2 className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium">Generated SQL</span>
      </button>

      {/* Content */}
      {isExpanded && (
        <div className="border-t">
          <div className="flex items-center justify-end border-b bg-muted/30 px-3 py-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 text-xs"
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-green-500" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Copy
                </>
              )}
            </Button>
          </div>
          <pre className="overflow-x-auto bg-muted/20 p-4 text-xs leading-relaxed">
            <code className="text-foreground">{sql}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
