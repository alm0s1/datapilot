"use client";

import { useCallback, useState } from "react";
import { Upload, FileSpreadsheet, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";

interface FileUploaderProps {
  onFileSelected: (file: File) => void;
  isUploading?: boolean;
  uploadProgress?: number;
  accept?: string;
  maxSizeMB?: number;
}

const ALLOWED_TYPES = [
  "text/csv",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];

const ALLOWED_EXTENSIONS = [".csv", ".xlsx", ".xls"];

export default function FileUploader({
  onFileSelected,
  isUploading = false,
  uploadProgress,
  accept = ".csv,.xlsx,.xls",
  maxSizeMB = 500,
}: FileUploaderProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validateFile = useCallback(
    (file: File): string | null => {
      const ext = "." + file.name.split(".").pop()?.toLowerCase();
      if (!ALLOWED_EXTENSIONS.includes(ext)) {
        return `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(", ")}`;
      }
      if (file.size > maxSizeMB * 1024 * 1024) {
        return `File too large. Maximum: ${maxSizeMB} MB`;
      }
      return null;
    },
    [maxSizeMB]
  );

  const handleFile = useCallback(
    (file: File) => {
      const err = validateFile(file);
      if (err) {
        setError(err);
        setSelectedFile(null);
        return;
      }
      setError(null);
      setSelectedFile(file);
    },
    [validateFile]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragActive(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-4">
      <div
        className={cn(
          "relative flex flex-col items-center justify-center rounded-lg border-2 border-dashed p-12 transition-colors",
          dragActive
            ? "border-primary bg-primary/5"
            : "border-muted-foreground/25 hover:border-primary/50",
          isUploading && "pointer-events-none opacity-60"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setDragActive(true);
        }}
        onDragLeave={() => setDragActive(false)}
        onDrop={handleDrop}
      >
        <Upload className="mb-4 h-10 w-10 text-muted-foreground" />
        <p className="mb-2 text-sm font-medium">
          Drag and drop your file here, or{" "}
          <label className="cursor-pointer text-primary underline">
            browse
            <input
              type="file"
              className="hidden"
              accept={accept}
              onChange={handleChange}
              disabled={isUploading}
            />
          </label>
        </p>
        <p className="text-xs text-muted-foreground">
          Supports CSV, XLSX, XLS (up to {maxSizeMB} MB)
        </p>
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 px-4 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {selectedFile && (
        <div className="flex items-center gap-3 rounded-lg border p-4">
          <FileSpreadsheet className="h-8 w-8 shrink-0 text-green-600" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{selectedFile.name}</p>
            <p className="text-xs text-muted-foreground">
              {formatSize(selectedFile.size)} &middot;{" "}
              {selectedFile.name.split(".").pop()?.toUpperCase()}
            </p>
            {isUploading && uploadProgress !== undefined && (
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            )}
          </div>
          {!isUploading && (
            <button
              onClick={() => {
                setSelectedFile(null);
                setError(null);
              }}
              className="shrink-0 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      )}

      {selectedFile && !isUploading && (
        <Button
          onClick={() => onFileSelected(selectedFile)}
          className="w-full"
          size="lg"
        >
          <Upload className="mr-2 h-4 w-4" />
          Upload File
        </Button>
      )}
    </div>
  );
}
