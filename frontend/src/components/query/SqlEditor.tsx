"use client";

import { useRef, useEffect, useCallback } from "react";

interface SqlEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute?: () => void;
}

export function SqlEditor({ value, onChange, onExecute }: SqlEditorProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.max(200, textarea.scrollHeight) + "px";
    }
  }, [value]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ctrl/Cmd + Enter to execute
      if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        onExecute?.();
        return;
      }

      // Tab to insert spaces
      if (e.key === "Tab") {
        e.preventDefault();
        const start = e.currentTarget.selectionStart;
        const end = e.currentTarget.selectionEnd;
        const newValue = value.substring(0, start) + "  " + value.substring(end);
        onChange(newValue);
        // Set cursor position after the inserted spaces
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = start + 2;
            textareaRef.current.selectionEnd = start + 2;
          }
        }, 0);
      }
    },
    [value, onChange, onExecute]
  );

  return (
    <div className="relative rounded-lg border bg-zinc-950 overflow-hidden">
      {/* Line numbers gutter */}
      <div className="absolute left-0 top-0 bottom-0 w-12 bg-zinc-900 border-r border-zinc-800 pointer-events-none">
        <div className="pt-4 px-2 text-right font-mono text-xs text-zinc-500 leading-6">
          {value.split("\n").map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>
      </div>
      
      {/* Editor textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        className="w-full min-h-[200px] bg-transparent text-zinc-100 font-mono text-sm leading-6 p-4 pl-14 resize-none focus:outline-none focus:ring-1 focus:ring-primary/50"
        placeholder="-- Write your SQL query here..."
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
      />
      
      {/* Status bar */}
      <div className="flex items-center justify-between px-4 py-1.5 bg-zinc-900 border-t border-zinc-800 text-xs text-zinc-500">
        <span>SQL</span>
        <span>{value.split("\n").length} lines</span>
      </div>
    </div>
  );
}
