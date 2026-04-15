"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, ImageIcon, Upload, X, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import {
  validateXrayFile,
  generateThumbnail,
  type ImageDimensions,
} from "@/lib/xray-validation";

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
  userId: string;
  currentXrayId: string;
  /** X-ray IDs currently loaded in multi-view grid slots */
  loadedXrayIds?: string[];
  /** The X-ray ID in the currently active grid slot */
  activeGridXrayId?: string | null;
  onSelectXray: (xray: PatientXray) => void;
  isOpen: boolean;
  onToggle: () => void;
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
  userId,
  currentXrayId,
  loadedXrayIds,
  activeGridXrayId,
  onSelectXray,
  isOpen,
  onToggle,
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
      try {
        thumbnail = await generateThumbnail(entry.file);
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

      // Upload
      setUploadFiles((prev) =>
        prev.map((f) =>
          f.id === entry.id ? { ...f, status: "uploading", progress: 0 } : f
        )
      );

      const formData = new FormData();
      formData.append("file", entry.file);
      formData.append(
        "thumbnail",
        new File([thumbnail], "thumbnail.jpg", { type: "image/jpeg" })
      );
      formData.append("patientId", patientId);
      formData.append("uploadedById", userId);
      formData.append("width", String(dimensions.width));
      formData.append("height", String(dimensions.height));

      try {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("POST", "/api/xrays/upload");
          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setUploadFiles((prev) =>
                prev.map((f) =>
                  f.id === entry.id ? { ...f, progress: pct } : f
                )
              );
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed (${xhr.status})`));
          };
          xhr.onerror = () => reject(new Error("Upload failed"));
          xhr.send(formData);
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
    [patientId, userId]
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
            borderRight: "1px solid #e5edf5",
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
                border: "2px dashed #533afd",
                borderRadius: 4,
              }}
            >
              <div className="text-center">
                <Upload size={24} style={{ color: "#533afd", margin: "0 auto" }} />
                <p className="mt-1 text-xs font-medium" style={{ color: "#533afd" }}>
                  Drop X-rays here
                </p>
              </div>
            </div>
          )}

          {/* Header */}
          <div
            className="flex items-center gap-2 px-3 py-2"
            style={{ borderBottom: "1px solid #e5edf5" }}
          >
            <ImageIcon size={14} style={{ color: "#64748d" }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: "#061b31" }}>
              Patient X-Rays
            </span>
            <span
              style={{
                fontSize: 11,
                color: "#64748d",
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
                borderRadius: 4,
                border: "1px solid #e5edf5",
                backgroundColor: "#FFFFFF",
                color: "#273951",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.backgroundColor = "#f6f9fc";
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
                borderRadius: 4,
                border: "1px solid #e5edf5",
                padding: 6,
                backgroundColor: "#f6f9fc",
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
                        color: entry.status === "pending" ? "#A3ACB9" : "#533afd",
                        flexShrink: 0,
                      }}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate"
                      style={{ fontSize: 10, color: "#061b31" }}
                    >
                      {entry.file.name}
                    </p>
                    {entry.status === "uploading" && (
                      <div
                        className="mt-0.5 h-1 overflow-hidden rounded-full"
                        style={{ backgroundColor: "#e5edf5" }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-300"
                          style={{
                            width: `${entry.progress}%`,
                            backgroundColor: "#533afd",
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
                      className="flex-shrink-0"
                      style={{ color: "#A3ACB9" }}
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
                  style={{ color: "#533afd" }}
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
                <span style={{ fontSize: 12, color: "#64748d" }}>Loading...</span>
              </div>
            )}

            {!loading && xrays.length === 0 && (
              <div className="flex items-center justify-center py-8">
                <span style={{ fontSize: 12, color: "#64748d" }}>
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
                ? "2px solid #533afd"
                : isLoadedInGrid
                  ? "2px solid rgba(83, 58, 253, 0.4)"
                  : "1px solid #e5edf5";
              const bgColor = isActive
                ? "#ededfc"
                : isLoadedInGrid
                  ? "#f5f3ff"
                  : "#FFFFFF";

              return (
                <button
                  key={xray.id}
                  onClick={() => onSelectXray(xray)}
                  className="flex flex-col overflow-hidden text-left transition-colors"
                  style={{
                    borderRadius: 4,
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
                      backgroundColor: "#1A1F36",
                    }}
                  >
                    <img
                      src={src}
                      alt={xray.title ?? "X-ray"}
                      className="h-full w-full object-contain"
                      draggable={false}
                    />
                  </div>

                  {/* Info */}
                  <div className="px-2 py-1.5">
                    <div
                      className="truncate"
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: "#061b31",
                      }}
                    >
                      {xray.title ?? "Untitled"}
                    </div>
                    <div
                      className="flex items-center gap-1"
                      style={{ fontSize: 11, color: "#64748d" }}
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
                <Loader2 size={14} className="animate-spin" style={{ color: "#64748d" }} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* Toggle Button (right edge) */}
      <button
        onClick={onToggle}
        className="absolute top-3 flex items-center justify-center transition-colors"
        style={{
          right: -16,
          width: 16,
          height: 32,
          backgroundColor: "#FFFFFF",
          borderRadius: "0 4px 4px 0",
          borderTop: "1px solid #e5edf5",
          borderRight: "1px solid #e5edf5",
          borderBottom: "1px solid #e5edf5",
          color: "#64748d",
          zIndex: 10,
        }}
        title={isOpen ? "Hide patient images" : "Show patient images"}
      >
        {isOpen ? <ChevronLeft size={12} /> : <ChevronRight size={12} />}
      </button>
    </div>
  );
}
