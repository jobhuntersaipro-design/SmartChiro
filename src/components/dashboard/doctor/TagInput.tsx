"use client";

import { useState, useRef, type KeyboardEvent } from "react";
import { X } from "lucide-react";

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
  maxItems?: number;
  disabled?: boolean;
}

export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Type and press Enter...",
  maxItems = 20,
  disabled = false,
}: TagInputProps) {
  const [input, setInput] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const filtered = suggestions.filter(
    (s) =>
      s.toLowerCase().includes(input.toLowerCase()) &&
      !value.includes(s)
  );

  function addTag(tag: string) {
    const trimmed = tag.trim();
    if (!trimmed || value.includes(trimmed) || value.length >= maxItems) return;
    onChange([...value, trimmed]);
    setInput("");
    setShowSuggestions(false);
  }

  function removeTag(index: number) {
    onChange(value.filter((_, i) => i !== index));
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && input.trim()) {
      e.preventDefault();
      addTag(input);
    }
    if (e.key === "Backspace" && !input && value.length > 0) {
      removeTag(value.length - 1);
    }
  }

  return (
    <div className="relative">
      <div
        className="flex flex-wrap gap-1.5 min-h-[36px] px-2.5 py-1.5 rounded-[4px] border border-[#e5edf5] bg-[#F6F9FC] focus-within:border-[#533afd] focus-within:ring-1 focus-within:ring-[#533afd] transition-colors"
        onClick={() => inputRef.current?.focus()}
      >
        {value.map((tag, i) => (
          <span
            key={tag}
            className="inline-flex items-center gap-1 rounded-full bg-[#ededfc] px-2 py-0.5 text-[13px] text-[#533afd]"
          >
            {tag}
            {!disabled && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  removeTag(i);
                }}
                className="hover:text-[#df1b41] transition-colors cursor-pointer"
              >
                <X className="h-3 w-3" strokeWidth={2} />
              </button>
            )}
          </span>
        ))}
        {!disabled && value.length < maxItems && (
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              setShowSuggestions(true);
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
            onKeyDown={handleKeyDown}
            placeholder={value.length === 0 ? placeholder : ""}
            className="flex-1 min-w-[100px] bg-transparent text-[14px] text-[#061b31] outline-none placeholder:text-[#64748d]"
          />
        )}
      </div>

      {showSuggestions && filtered.length > 0 && input && (
        <div className="absolute z-10 mt-1 w-full rounded-[6px] border border-[#e5edf5] bg-white shadow-md max-h-[160px] overflow-y-auto">
          {filtered.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                addTag(suggestion);
              }}
              className="w-full text-left px-3 py-1.5 text-[14px] text-[#273951] hover:bg-[#f6f9fc] cursor-pointer"
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
