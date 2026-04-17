"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  Camera,
  Loader2,
  Lock,
  Eye,
  EyeOff,
  Shield,
  User,
  KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import type { BranchRole } from "@prisma/client";

interface SettingsUser {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  phone: string | null;
  hasPassword: boolean;
  linkedProviders: string[];
  memberSince: string;
  branches: { id: string; name: string; role: BranchRole }[];
}

interface SettingsViewProps {
  user: SettingsUser;
}

function getInitials(name: string | null, email: string): string {
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return parts[0].slice(0, 2).toUpperCase();
  }
  return email.slice(0, 2).toUpperCase();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

export function SettingsView({ user: initialUser }: SettingsViewProps) {
  const [user, setUser] = useState(initialUser);
  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  // Account form
  const [name, setName] = useState(user.name ?? "");
  const [phone, setPhone] = useState(user.phone ?? "");
  const [savingAccount, setSavingAccount] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  const initials = getInitials(user.name, user.email);

  const hasAccountChanges = useCallback(() => {
    return (
      name !== (user.name ?? "") || phone !== (user.phone ?? "")
    );
  }, [name, phone, user]);

  const hasPasswordInput =
    newPassword.length > 0 || confirmPassword.length > 0;

  // Clear toast after 3s
  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  async function handleSaveAccount() {
    setSavingAccount(true);
    setToast(null);

    const data: Record<string, string | null> = {};
    if (name !== (user.name ?? "")) data.name = name || null;
    if (phone !== (user.phone ?? "")) data.phone = phone || null;

    try {
      const res = await fetch(`/api/doctors/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) {
        setToast({ type: "error", message: json.error ?? "Failed to save" });
      } else {
        setUser((prev) => ({
          ...prev,
          name: json.doctor?.name ?? prev.name,
          phone: json.doctor?.phone ?? prev.phone,
        }));
        setToast({ type: "success", message: "Account updated" });
      }
    } catch {
      setToast({ type: "error", message: "Network error" });
    }
    setSavingAccount(false);
  }

  async function handlePhotoUpload(file: File) {
    setUploadingPhoto(true);
    setToast(null);
    const formData = new FormData();
    formData.append("photo", file);

    try {
      const res = await fetch(`/api/doctors/${user.id}/photo`, {
        method: "POST",
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) {
        setToast({
          type: "error",
          message: json.error ?? "Failed to upload photo",
        });
      } else {
        setUser((prev) => ({ ...prev, image: json.imageUrl }));
        setToast({ type: "success", message: "Photo updated" });
      }
    } catch {
      setToast({ type: "error", message: "Network error" });
    }
    setUploadingPhoto(false);
  }

  async function handleChangePassword() {
    if (newPassword !== confirmPassword) {
      setToast({ type: "error", message: "Passwords don't match" });
      return;
    }
    if (newPassword.length < 8) {
      setToast({
        type: "error",
        message: "Password must be at least 8 characters",
      });
      return;
    }

    setSavingPassword(true);
    setToast(null);

    try {
      const res = await fetch("/api/settings/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          currentPassword: user.hasPassword ? currentPassword : undefined,
          newPassword,
          confirmPassword,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setToast({
          type: "error",
          message: json.error ?? "Failed to change password",
        });
      } else {
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setUser((prev) => ({ ...prev, hasPassword: true }));
        setToast({ type: "success", message: "Password updated" });
      }
    } catch {
      setToast({ type: "error", message: "Network error" });
    }
    setSavingPassword(false);
  }

  return (
    <div className="max-w-[720px]">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-2.5 rounded-[6px] text-[14px] font-medium shadow-md transition-all ${
            toast.type === "success"
              ? "bg-[#ecfdf5] text-[#059669] border border-[#a7f3d0]"
              : "bg-[#fef2f2] text-[#df1b41] border border-[#fecaca]"
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* ── Account Section ── */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <User className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
          <h2 className="text-[16px] font-medium text-[#061b31]">Account</h2>
        </div>

        <div className="rounded-[6px] border border-[#e5edf5] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_1px_rgba(0,0,0,0.03),0_3px_6px_rgba(18,42,66,0.02)]">
          {/* Avatar row */}
          <div className="flex items-center gap-4 p-5 border-b border-[#e5edf5]">
            <div className="relative group">
              <Avatar className="h-16 w-16">
                {user.image && (
                  <AvatarImage
                    src={user.image}
                    alt={user.name ?? "User"}
                  />
                )}
                <AvatarFallback className="bg-[#ededfc] text-[#533afd] text-[18px] font-medium">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingPhoto}
                className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                {uploadingPhoto ? (
                  <Loader2 className="h-5 w-5 text-white animate-spin" />
                ) : (
                  <Camera className="h-5 w-5 text-white" />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handlePhotoUpload(file);
                  e.target.value = "";
                }}
              />
            </div>
            <div>
              <p className="text-[15px] font-medium text-[#061b31]">
                {user.name ?? "Unnamed"}
              </p>
              <p className="text-[13px] text-[#64748d]">{user.email}</p>
              <p className="text-[12px] text-[#a3acb9] mt-0.5">
                Member since {formatDate(user.memberSince)}
              </p>
            </div>
          </div>

          {/* Form fields */}
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-[13px] font-medium text-[#64748d] mb-1.5">
                  Full Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Your full name"
                  maxLength={100}
                  className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[14px] text-[#061b31] focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd]"
                />
              </div>
              <div>
                <label className="block text-[13px] font-medium text-[#64748d] mb-1.5">
                  Phone Number
                </label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +60 12 345 6789"
                  maxLength={20}
                  className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[14px] text-[#061b31] focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd]"
                />
              </div>
            </div>
            <div>
              <label className="block text-[13px] font-medium text-[#64748d] mb-1.5">
                Email Address
              </label>
              <Input
                value={user.email}
                disabled
                className="h-9 rounded-[4px] border-[#e5edf5] bg-[#f6f9fc] text-[14px] text-[#64748d]"
              />
              <p className="text-[12px] text-[#a3acb9] mt-1">
                Email cannot be changed.
              </p>
            </div>

            {/* Branches */}
            {user.branches.length > 0 && (
              <div>
                <label className="block text-[13px] font-medium text-[#64748d] mb-1.5">
                  Branches
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {user.branches.map((b) => (
                    <Badge
                      key={b.id}
                      variant="secondary"
                      className="rounded-full bg-[#ededfc] text-[#533afd] text-[12px] font-medium border-0 hover:bg-[#ededfc]"
                    >
                      {b.role === "OWNER"
                        ? "Owner"
                        : b.role === "ADMIN"
                          ? "Admin"
                          : "Doctor"}{" "}
                      — {b.name}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Save bar */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#e5edf5]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setName(user.name ?? "");
                setPhone(user.phone ?? "");
              }}
              disabled={!hasAccountChanges() || savingAccount}
              className="rounded-[4px] border-[#e5edf5] text-[13px] cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleSaveAccount}
              disabled={!hasAccountChanges() || savingAccount}
              className="rounded-[4px] bg-[#533afd] hover:bg-[#4434d4] text-white text-[13px] cursor-pointer"
            >
              {savingAccount ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* ── Security Section ── */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
          <h2 className="text-[16px] font-medium text-[#061b31]">Security</h2>
        </div>

        <div className="rounded-[6px] border border-[#e5edf5] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_1px_rgba(0,0,0,0.03),0_3px_6px_rgba(18,42,66,0.02)]">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-4">
              <Lock className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
              <h3 className="text-[14px] font-medium text-[#061b31]">
                {user.hasPassword ? "Change Password" : "Set Password"}
              </h3>
            </div>

            {!user.hasPassword && (
              <p className="text-[13px] text-[#64748d] mb-4 px-0.5">
                You signed up with Google. Set a password to also log in with
                email and password.
              </p>
            )}

            <div className="space-y-3 max-w-[360px]">
              {user.hasPassword && (
                <div>
                  <label className="block text-[13px] font-medium text-[#64748d] mb-1.5">
                    Current Password
                  </label>
                  <div className="relative">
                    <Input
                      type={showCurrentPassword ? "text" : "password"}
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                      className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[14px] text-[#061b31] pr-9 focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd]"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setShowCurrentPassword(!showCurrentPassword)
                      }
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748d] hover:text-[#061b31] transition-colors cursor-pointer"
                    >
                      {showCurrentPassword ? (
                        <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                      ) : (
                        <Eye className="h-4 w-4" strokeWidth={1.5} />
                      )}
                    </button>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[13px] font-medium text-[#64748d] mb-1.5">
                  New Password
                </label>
                <div className="relative">
                  <Input
                    type={showNewPassword ? "text" : "password"}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[14px] text-[#061b31] pr-9 focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#64748d] hover:text-[#061b31] transition-colors cursor-pointer"
                  >
                    {showNewPassword ? (
                      <EyeOff className="h-4 w-4" strokeWidth={1.5} />
                    ) : (
                      <Eye className="h-4 w-4" strokeWidth={1.5} />
                    )}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-medium text-[#64748d] mb-1.5">
                  Confirm New Password
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  className="h-9 rounded-[4px] border-[#e5edf5] bg-[#F6F9FC] text-[14px] text-[#061b31] focus:border-[#533afd] focus:ring-1 focus:ring-[#533afd]"
                />
              </div>
            </div>
          </div>

          {/* Save bar */}
          <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#e5edf5]">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
              }}
              disabled={!hasPasswordInput || savingPassword}
              className="rounded-[4px] border-[#e5edf5] text-[13px] cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={handleChangePassword}
              disabled={!hasPasswordInput || savingPassword}
              className="rounded-[4px] bg-[#533afd] hover:bg-[#4434d4] text-white text-[13px] cursor-pointer"
            >
              {savingPassword ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  Updating...
                </>
              ) : user.hasPassword ? (
                "Update Password"
              ) : (
                "Set Password"
              )}
            </Button>
          </div>
        </div>
      </section>

      {/* ── Connected Accounts Section ── */}
      <section className="mb-8">
        <div className="flex items-center gap-2 mb-4">
          <KeyRound className="h-4 w-4 text-[#64748d]" strokeWidth={1.5} />
          <h2 className="text-[16px] font-medium text-[#061b31]">
            Connected Accounts
          </h2>
        </div>

        <div className="rounded-[6px] border border-[#e5edf5] bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.04),0_1px_1px_rgba(0,0,0,0.03),0_3px_6px_rgba(18,42,66,0.02)]">
          <div className="divide-y divide-[#e5edf5]">
            {/* Google */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[4px] bg-[#f6f9fc]">
                  <svg
                    className="h-5 w-5"
                    viewBox="0 0 24 24"
                    fill="none"
                  >
                    <path
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                      fill="#4285F4"
                    />
                    <path
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                      fill="#34A853"
                    />
                    <path
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                      fill="#FBBC05"
                    />
                    <path
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                      fill="#EA4335"
                    />
                  </svg>
                </div>
                <div>
                  <p className="text-[14px] font-medium text-[#061b31]">
                    Google
                  </p>
                  <p className="text-[12px] text-[#64748d]">
                    {user.linkedProviders.includes("google")
                      ? "Connected"
                      : "Not connected"}
                  </p>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={`rounded-full text-[12px] font-medium border-0 ${
                  user.linkedProviders.includes("google")
                    ? "bg-[#ecfdf5] text-[#059669]"
                    : "bg-[#f6f9fc] text-[#a3acb9]"
                }`}
              >
                {user.linkedProviders.includes("google")
                  ? "Connected"
                  : "Not linked"}
              </Badge>
            </div>

            {/* Email/Password */}
            <div className="flex items-center justify-between p-5">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[4px] bg-[#f6f9fc]">
                  <Lock
                    className="h-5 w-5 text-[#64748d]"
                    strokeWidth={1.5}
                  />
                </div>
                <div>
                  <p className="text-[14px] font-medium text-[#061b31]">
                    Email & Password
                  </p>
                  <p className="text-[12px] text-[#64748d]">
                    {user.hasPassword
                      ? "Password is set"
                      : "No password set"}
                  </p>
                </div>
              </div>
              <Badge
                variant="secondary"
                className={`rounded-full text-[12px] font-medium border-0 ${
                  user.hasPassword
                    ? "bg-[#ecfdf5] text-[#059669]"
                    : "bg-[#f6f9fc] text-[#a3acb9]"
                }`}
              >
                {user.hasPassword ? "Active" : "Not set"}
              </Badge>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
