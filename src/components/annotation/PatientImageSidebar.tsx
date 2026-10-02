"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, Upload, X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import {
  validateXrayFile,
  generateThumbnail,
  shouldConfirmNotXray,
  NOT_XRAY_CONFIRM_MESSAGE,
  type ImageDimensions,
} from "@/lib/xray-validation";
import { uploadXray } from "@/lib/xray-upload-client";

interface PatientXray {
  id: string;
  title: string | null;
  bodyRegion: string | null;
  viewType: string | null;
  fileUrl: string;
  thumbnailUrl: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
}

interface PatientImageSidebarProps {
  patientId: string;
  currentXrayId: string;
  /** X-ray IDs currently loaded in multi-view grid slots */
  loadedXrayIds?: string[];
  /** The X-ray ID in the currently active grid slot */
  activeGridXrayId?: string | null;
  onSelectXray: (xray: PatientXray) => void;
  isOpen: boolean;
  onToggle: () => void;
  /** When true, J/K and arrow keys cycle through the X-ray list */
  enableKeyboardCycling?: boolean;
}

type FileUploadStatus = "pending" | "validating" | "uploading" | "done" | "error";

interface UploadFileEntry {
  id: string;
  file: File;
  status: FileUploadStatus;
  progress: number;
  error: string | null;
}

export function PatientImageSidebar({
  patientId,
  currentXrayId,
  loadedXrayIds,
  activeGridXrayId,
  onSelectXray,
  isOpen,
  onToggle,
  enableKeyboardCycling = false,
}: PatientImageSidebarProps) {
  const [xrays, setXrays] = useState<PatientXray[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [uploadFiles, setUploadFiles] = useState<UploadFileEntry[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isUploadingRef = useRef(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const PAGE_SIZE = 20;

  const fetchXrays = useCallback(async (page = 1, append = false) => {
    try {
      if (append) setLoadingMore(true);
      const res = await fetch(`/api/xrays?patientId=${patientId}&limit=${PAGE_SIZE}&page=${page}`);
      if (!res.ok) return;
      const data = await res.json();
      const fetched: PatientXray[] = data.xrays ?? [];
      if (append) {
        setXrays((prev) => [...prev, ...fetched]);
      } else {
        setXrays(fetched);
      }
      setCurrentPage(page);
      setHasMore(fetched.length >= PAGE_SIZE);
    } catch {
      // Silently fail — sidebar is non-critical
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchXrays();
  }, [fetchXrays]);

  // Cycle the active X-ray with Page Up / Page Down (single-view mode only).
  // Skips when typing in inputs/textareas and ignores meta/ctrl/alt combos.
  useEffect(() => {
    if (!enableKeyboardCycling) return;
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable
      ) return;

      // Page Up / Page Down only: K is Calibrate and the arrow keys nudge the
      // selected shape, so neither may silently switch to another X-ray.
      let direction = 0;
      if (e.key === "PageUp") direction = -1;
      else if (e.key === "PageDown") direction = 1;
      if (direction === 0) return;

      if (xrays.length === 0) return;
      const idx = xrays.findIndex((x) => x.id === currentXrayId);
      if (idx < 0) return;
      const nextIdx = (idx + direction + xrays.length) % xrays.length;
      const next = xrays[nextIdx];
      if (next && next.id !== currentXrayId) {
        e.preventDefault();
        onSelectXray(next);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [enableKeyboardCycling, xrays, currentXrayId, onSelectXray]);

  // Infinite scroll — load more when near bottom
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el || !hasMore || loadingMore) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    if (nearBottom) {
      fetchXrays(currentPage + 1, true);
    }
  }, [hasMore, loadingMore, currentPage, fetchXrays]);

  const addFiles = useCallback((files: FileList | File[]) => {
    const fileArray = Array.from(files).slice(0, 20);
    const entries: UploadFileEntry[] = fileArray
      .filter((f) => f.type === "image/jpeg" || f.type === "image/png")
      .map((file) => ({
        id: `${file.name}-${Date.now()}-${Math.random()}`,
        file,
        status: "pending" as FileUploadStatus,
        progress: 0,
        error: null,
      }));
    if (entries.length > 0) {
      setUploadFiles((prev) => [...prev, ...entries]);
      setShowUpload(true);
    }
  }, []);

  const uploadSingleFile = useCallback(
    async (entry: UploadFileEntry): Promise<boolean> => {
      // Update status to validating
      setUploadFiles((prev) =>
        prev.map((f) =>
          f.id === entry.id ? { ...f, status: "validating" } : f
        )
      );

      let dimensions: ImageDimensions;
      try {
        dimensions = await validateXrayFile(entry.file);
      } catch (err) {
        setUploadFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id
              ? { ...f, status: "error", error: err instanceof Error ? err.message : "Validation failed" }
              : f
          )
        );
        return false;
      }

      let thumbnail: Blob;
      let colourScore: number;
      try {
        const result = await generateThumbnail(entry.file);
        thumbnail = result.thumbnail;
        colourScore = result.colourfulness;
      } catch {
        setUploadFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id
              ? { ...f, status: "error", error: "Thumbnail generation failed" }
              : f
          )
        );
        return false;
      }

      // A colour photo or phone screenshot is almost never a film — ask first.
      if (
        shouldConfirmNotXray(dimensions, colourScore) &&
        !window.confirm(`${entry.file.name}: ${NOT_XRAY_CONFIRM_MESSAGE}`)
      ) {
        setUploadFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id ? { ...f, status: "error", error: "Skipped — not uploaded" } : f
          )
        );
        return false;
      }

      // Upload
      setUploadFiles((prev) =>
        prev.map((f) =>
          f.id === entry.id ? { ...f, status: "uploading", progress: 0 } : f
        )
      );

      try {
        // Straight to storage with a presigned URL (see uploadXray); the
        // title defaults to the file name.
        await uploadXray({
          file: entry.file,
          thumbnail,
          width: dimensions.width,
          height: dimensions.height,
          patientId,
          onProgress: (pct) =>
            setUploadFiles((prev) =>
              prev.map((f) => (f.id === entry.id ? { ...f, progress: pct } : f))
            ),
        });

        setUploadFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id ? { ...f, status: "done", progress: 100 } : f
          )
        );
        return true;
      } catch (err) {
        setUploadFiles((prev) =>
          prev.map((f) =>
            f.id === entry.id
              ? { ...f, status: "error", error: err instanceof Error ? err.message : "Upload failed" }
              : f
          )
        );
        return false;
      }
    },
    [patientId]
  );

  // Process upload queue sequentially
  useEffect(() => {
    async function processQueue() {
      if (isUploadingRef.current) return;
      const pending = uploadFiles.find((f) => f.status === "pending");
      if (!pending) return;

      isUploadingRef.current = true;
      await uploadSingleFile(pending);
      isUploadingRef.current = false;

      // Check if all done — refresh xray list from page 1
      setUploadFiles((prev) => {
        const remaining = prev.filter((f) => f.status === "pending");
        if (remaining.length === 0) {
          fetchXrays(1, false);
        }
        return prev;
      });
    }
    processQueue();
  }, [uploadFiles, uploadSingleFile, fetchXrays]);

  const removeFromQueue = useCallback((id: string) => {
    setUploadFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
      }
    },
    [addFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        addFiles(e.target.files);
        e.target.value = "";
      }
    },
    [addFiles]
  );

  const allDone =
    uploadFiles.length > 0 &&
    uploadFiles.every((f) => f.status === "done" || f.status === "error");

  // Auto-clear successful uploads after 3 seconds
  useEffect(() => {
    if (!allDone) return;
    const hasErrors = uploadFiles.some((f) => f.status === "error");
    // If all succeeded (no errors), auto-clear entire list
    if (!hasErrors) {
      const timer = setTimeout(() => {
        setUploadFiles([]);
        setShowUpload(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
    // If mixed results, only auto-remove the successful ones after 3s
    const timer = setTimeout(() => {
      setUploadFiles((prev) => prev.filter((f) => f.status !== "done"));
    }, 3000);
    return () => clearTimeout(timer);
  }, [allDone, uploadFiles]);

  return (
    <div className="relative flex" style={{ height: "100%" }}>
      {/* Sidebar Panel */}
      {isOpen && (
        <div
          className="flex flex-col overflow-hidden"
          style={{
            width: 280,
            backgroundColor: "#FFFFFF",
            borderRight: "1px solid #e9e9e9",
          }}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          {/* Drag overlay */}
          {isDragOver && (
            <div
              className="absolute inset-0 z-20 flex items-center justify-center"
              style={{
                backgroundColor: "rgba(240, 238, 255, 0.9)",
                border: "2px dashed #7747ff",
                borderRadius: 10,
              }}
            >
              <div className="text-center">
                <Upload size={24} style={{ color: "#7747ff", margin: "0 auto" }} />
                <p className="mt-1 text-xs font-medium" style={{ color: "#7747ff" }}>
                  Drop X-rays here
                </p>
              </div>
            </div>
          )}

          {/* Header */}
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{ borderBottom: "1px solid #e9e9e9" }}
          >
            <ImageIcon size={14} style={{ color: "#585858" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#0b0b0b" }}>
              Patient X-Rays
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#585858",
                marginLeft: "auto",
              }}
            >
              {xrays.length}
            </span>
          </div>

          {/* Upload Button */}
          <div className="px-2 pt-2">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full items-center justify-center gap-1.5 py-1.5 text-xs font-medium transition-colors"
              style={{
                borderRadius: 10,
                border: "1px solid #e9e9e9",
                backgroundColor: "#FFFFFF",
                color: "#0b0b0b",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "#f8f8f8";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "#FFFFFF";
              }}
            >
              <Upload size={12} />
              Upload X-ray
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".jpg,.jpeg,.png,image/jpeg,image/png"
              multiple
              onChange={handleFileInput}
              className="hidden"
            />
          </div>

          {/* Upload Progress List */}
          {showUpload && uploadFiles.length > 0 && (
            <div
              className="mx-2 mt-2 flex flex-col gap-1 overflow-y-auto"
              style={{
                maxHeight: 160,
                borderRadius: 10,
                border: "1px solid #e9e9e9",
                padding: 6,
                backgroundColor: "#f8f8f8",
              }}
            >
              {uploadFiles.map((entry) => (
                <div key={entry.id} className="flex items-center gap-1.5">
                  {entry.status === "done" && (
                    <CheckCircle size={10} style={{ color: "#30B130", flexShrink: 0 }} />
                  )}
                  {entry.status === "error" && (
                    <AlertCircle size={10} style={{ color: "#DF1B41", flexShrink: 0 }} />
                  )}
                  {(entry.status === "pending" ||
                    entry.status === "validating" ||
                    entry.status === "uploading") && (
                    <Loader2
                      size={10}
                      className="animate-spin"
                      style={{
                        color: entry.status === "pending" ? "#a4a4a4" : "#7747ff",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate"
                      style={{ fontSize: 10, color: "#0b0b0b" }}
                    >
                      {entry.file.name}
                    </p>
                    {entry.status === "uploading" && (
                      <div
                        className="mt-0.5 h-1 overflow-hidden rounded-full"
                        style={{ backgroundColor: "#e9e9e9" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${entry.progress}%`,
                            backgroundColor: "#7747ff",
                          }}
                        />
                      </div>
                    )}
                    {entry.status === "error" && entry.error && (
                      <p style={{ fontSize: 9, color: "#DF1B41" }}>
                        {entry.error}
                      </p>
                    )}
                  </div>
                  {(entry.status === "pending" ||
                    entry.status === "done" ||
                    entry.status === "error") && (
                    <button
                      onClick={() => removeFromQueue(entry.id)}
                      className="shrink-0"
                      style={{ color: "#a4a4a4" }}
                    >
                      <X size={10} />
                    </button>
                  )}
                </div>
              ))}
              {allDone && (
                <button
                  onClick={() => {
                    setUploadFiles([]);
                    setShowUpload(false);
                  }}
                  className="mt-1 text-center text-xs font-medium"
                  style={{ color: "#7747ff" }}
                >
                  Clear
                </button>
              )}
            </div>
          )}

          {/* Thumbnail List — infinite scroll */}
          <div
            ref={scrollContainerRef}
            onScroll={handleScroll}
            className="flex-1 overflow-y-auto p-2"
            style={{ gap: 6, display: "flex", flexDirection: "column" }}
          >
            {loading && (
              <div className="flex items-center justify-center py-8">
                <span style={{ fontSize: 12, color: "#585858" }}>Loading...</span>
              </div>
            )}

            {!loading && xrays.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <span style={{ fontSize: 12, color: "#585858" }}>
                  No X-rays found
                </span>
              </div>
            )}

            {xrays.map((xray) => {
              const isCurrent = xray.id === currentXrayId;
              const isActive = activeGridXrayId ? xray.id === activeGridXrayId : isCurrent;
              const isLoadedInGrid = loadedXrayIds ? loadedXrayIds.includes(xray.id) : isCurrent;
              const src = xray.thumbnailUrl ?? xray.fileUrl;
              const date = new Date(xray.createdAt);
              const dateStr = date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });

              // Active = purple border + bg, loaded in grid = subtle purple border, default = gray border
              const borderStyle = isActive
                ? "2px solid #7747ff"
                : isLoadedInGrid
                  ? "2px solid rgba(83, 58, 253, 0.4)"
                  : "1px solid #e9e9e9";
              const bgColor = isActive
                ? "#ede7ff"
                : isLoadedInGrid
                  ? "#f5f3ff"
                  : "#FFFFFF";

              return (
                <button
                  key={xray.id}
                  onClick={() => onSelectXray(xray)}
                  onMouseEnter={(e) => { if (!isActive && !isLoadedInGrid) e.currentTarget.style.backgroundColor = "#f8f8f8"; }}
                  onMouseLeave={(e) => { if (!isActive && !isLoadedInGrid) e.currentTarget.style.backgroundColor = "#FFFFFF"; }}
                  className="flex flex-col overflow-hidden text-left transition-colors"
                  style={{
                    borderRadius: 10,
                    border: borderStyle,
                    backgroundColor: bgColor,
                    padding: 0,
                    flexShrink: 0,
                  }}
                >
                  {/* Thumbnail */}
                  <div
                    className="relative flex items-center justify-center overflow-hidden"
                    style={{
                      height: 160,
                      backgroundColor: "#171717",
                    }}
                  >
                    {/* `unoptimized` so Next.js doesn't transcode X-ray
                        thumbnails — clinicians want pixel-accurate previews
                        and the source is already a small JPEG/PNG. Using
                        `<Image fill>` instead of `<img>` to satisfy
                        @next/next/no-img-element. */}
                    <Image
                      src={src}
                      alt={xray.title ?? "X-ray"}
                      fill
                      className="object-contain"
                      draggable={false}
                      unoptimized
                      sizes="280px"
                    />
                  </div>

                  {/* Info */}
                  <div className="px-2 py-1.5">
                    <div
                      className="truncate"
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "#0b0b0b",
                      }}
                    >
                      {xray.title ?? "Untitled"}
                    </div>
                    <div
                      className="flex items-center gap-1"
                      style={{ fontSize: 11, color: "#585858" }}
                    >
                      {xray.bodyRegion && (
                        <span className="capitalize">
                          {xray.bodyRegion.toLowerCase().replace(/_/g, " ")}
                        </span>
                      )}
                      {xray.bodyRegion && xray.viewType && <span>·</span>}
                      {xray.viewType && <span>{xray.viewType}</span>}
                      {(xray.bodyRegion || xray.viewType) && <span>·</span>}
                      <span>{dateStr}</span>
                    </div>
                  </div>
                </button>
              );
            })}

            {/* Loading more indicator */}
            {loadingMore && (
              <div className="flex items-center justify-center py-3" style={{ flexShrink: 0 }}>
                <Loader2 size={14} className="animate-spin" style={{ color: "#585858" }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle Button (right edge) */}
      <button
        onClick={onToggle}
        onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = "#f8f8f8"; e.currentTarget.style.color = "#0b0b0b"; }}
        onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = "#FFFFFF"; e.currentTarget.style.color = "#585858"; }}
        className="absolute top-3 flex items-center justify-center transition-colors"
        style={{
          right: -16,
          width: 16,
          height: 32,
          backgroundColor: "#FFFFFF",
          borderRadius: "0 4px 4px 0",
          borderTop: "1px solid #e9e9e9",
          borderRight: "1px solid #e9e9e9",
          borderBottom: "1px solid #e9e9e9",
          color: "#585858",
          zIndex: 10,
        }}
        title={isOpen ? "Hide patient images" : "Show patient images"}
      >
        {isOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>
    </div>
  );
}
