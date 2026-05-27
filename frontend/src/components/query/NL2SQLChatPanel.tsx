"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { aiApi, ChatMessage, NL2SQLResponse } from "@/lib/api/ai";
import { toast } from "sonner";
import {
  MessageSquare,
  Send,
  Sparkles,
  Copy,
  Check,
  ChevronUp,
  ChevronDown,
  Bot,
  User,
  Play,
  AlertCircle,
} from "lucide-react";

interface ChatPanelProps {
  connectionId: string;
  onSqlGenerated: (sql: string) => void;
  onExecuteSql?: (sql: string) => void;
}

interface Message extends ChatMessage {
  id: string;
  sql?: string;
  explanation?: string;
  confidence?: number;
  error?: boolean;
}

export function NL2SQLChatPanel({ connectionId, onSqlGenerated, onExecuteSql }: ChatPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const nl2sqlMutation = useMutation({
    mutationFn: (question: string) =>
      aiApi.nl2sql({
        connection_id: connectionId,
        question,
        conversation_history: messages
          .filter((m) => !m.error)
          .map((m) => ({ role: m.role, content: m.content })),
      }),
    onSuccess: (data: NL2SQLResponse, question: string) => {
      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: data.explanation || "Here's your SQL query:",
        sql: data.sql,
        explanation: data.explanation,
        confidence: data.confidence,
        error: data.error,
      };
      setMessages((prev) => [...prev, assistantMessage]);

      if (!data.error && data.sql) {
        onSqlGenerated(data.sql);
      }
    },
    onError: (error) => {
      const errorMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: error instanceof Error ? error.message : "Failed to generate SQL",
        error: true,
      };
      setMessages((prev) => [...prev, errorMessage]);
      toast.error("Failed to generate SQL", {
        description: error instanceof Error ? error.message : "Please try again",
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || nl2sqlMutation.isPending) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    nl2sqlMutation.mutate(input.trim());
    setInput("");
  };

  const handleCopy = async (sql: string, messageId: string) => {
    await navigator.clipboard.writeText(sql);
    setCopiedId(messageId);
    toast.success("SQL copied to clipboard");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleUseSql = (sql: string) => {
    onSqlGenerated(sql);
    toast.success("SQL applied to editor");
  };

  const handleExecute = (sql: string) => {
    if (onExecuteSql) {
      onExecuteSql(sql);
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return "text-green-600";
    if (confidence >= 0.5) return "text-amber-600";
    return "text-red-600";
  };

  return (
    <Card className="flex flex-col border-primary/20 bg-gradient-to-b from-primary/5 to-transparent">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center justify-between px-4 py-3 border-b hover:bg-muted/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-primary/10">
            <Sparkles className="h-4 w-4 text-primary" />
          </div>
          <span className="font-medium text-sm">AI SQL Assistant</span>
          <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
            Ask in plain English
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <>
          {/* Messages Area */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-80 min-h-40">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-6">
                <MessageSquare className="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p className="text-sm text-muted-foreground">
                  Ask a question in plain English
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  e.g., &quot;Show me all users who signed up last month&quot;
                </p>
              </div>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-3 ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {message.role === "assistant" && (
                    <div className="shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-primary" />
                    </div>
                  )}
                  <div
                    className={`max-w-[85%] rounded-lg px-3 py-2 ${
                      message.role === "user"
                        ? "bg-primary text-primary-foreground"
                        : message.error
                        ? "bg-destructive/10 border border-destructive/20"
                        : "bg-muted"
                    }`}
                  >
                    <p className="text-sm">{message.content}</p>

                    {message.sql && !message.error && (
                      <div className="mt-2 space-y-2">
                        <div className="bg-zinc-900 rounded-md p-3 font-mono text-xs text-zinc-100 overflow-x-auto">
                          <pre className="whitespace-pre-wrap">{message.sql}</pre>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1">
                            {message.confidence !== undefined && (
                              <span
                                className={`text-xs ${getConfidenceColor(message.confidence)}`}
                              >
                                {Math.round(message.confidence * 100)}% confidence
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleCopy(message.sql!, message.id)}
                            >
                              {copiedId === message.id ? (
                                <Check className="h-3 w-3 mr-1" />
                              ) : (
                                <Copy className="h-3 w-3 mr-1" />
                              )}
                              Copy
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              onClick={() => handleUseSql(message.sql!)}
                            >
                              Use SQL
                            </Button>
                            {onExecuteSql && (
                              <Button
                                size="sm"
                                variant="default"
                                className="h-7 px-2 text-xs"
                                onClick={() => handleExecute(message.sql!)}
                              >
                                <Play className="h-3 w-3 mr-1" />
                                Run
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {message.error && (
                      <div className="flex items-center gap-1 mt-1 text-destructive">
                        <AlertCircle className="h-3 w-3" />
                        <span className="text-xs">Error generating SQL</span>
                      </div>
                    )}
                  </div>
                  {message.role === "user" && (
                    <div className="shrink-0 h-7 w-7 rounded-full bg-primary flex items-center justify-center">
                      <User className="h-4 w-4 text-primary-foreground" />
                    </div>
                  )}
                </div>
              ))
            )}

            {nl2sqlMutation.isPending && (
              <div className="flex gap-3">
                <div className="shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                  <Bot className="h-4 w-4 text-primary animate-pulse" />
                </div>
                <div className="bg-muted rounded-lg px-3 py-2 space-y-2">
                  <Skeleton className="h-4 w-48" />
                  <Skeleton className="h-16 w-64" />
                </div>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form onSubmit={handleSubmit} className="border-t p-3">
            <div className="flex gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about your data..."
                className="flex-1 resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[40px] max-h-24"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
              />
              <Button
                type="submit"
                size="icon"
                disabled={!input.trim() || nl2sqlMutation.isPending || !connectionId}
                className="shrink-0"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Press Enter to send, Shift+Enter for new line
            </p>
          </form>
        </>
      )}
    </Card>
  );
}
