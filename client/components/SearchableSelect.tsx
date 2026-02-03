"use client";

import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";

interface SearchableSelectOption {
  value: string | number;
  label: string;
  searchText?: string; // Optional additional text to search in
}

interface SearchableSelectProps {
  options: SearchableSelectOption[];
  value: string | number;
  onChange: (value: string | number) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  required?: boolean;
  className?: string;
  disabled?: boolean;
  onCreateNew?: (searchTerm: string) => void; // Callback when "Create new" option is clicked
  createNewLabel?: (searchTerm: string) => string; // Custom label for create new option
  allowClear?: boolean; // Allow clearing the selected value
}

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  searchPlaceholder = "Type to search...",
  required = false,
  className = "",
  disabled = false,
  onCreateNew,
  createNewLabel,
  allowClear = false,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  // Get selected option label
  const selectedOption = options.find((opt) => opt.value === value);
  const displayValue = selectedOption ? selectedOption.label : placeholder;

  // Filter options based on search term
  const filteredOptions = options.filter((option) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    const labelMatch = option.label.toLowerCase().includes(searchLower);
    const searchTextMatch = option.searchText
      ? option.searchText.toLowerCase().includes(searchLower)
      : false;
    return labelMatch || searchTextMatch;
  });

  // Show "Create new" option if no matches found and onCreateNew is provided
  const showCreateNew = onCreateNew && searchTerm && filteredOptions.length === 0;

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && containerRef.current) {
      const updatePosition = () => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (rect) {
          setDropdownPosition({
            top: rect.bottom + 4, // Fixed positioning is relative to viewport
            left: rect.left,
            width: rect.width,
          });
        }
      };
      
      updatePosition();
      window.addEventListener("scroll", updatePosition, true);
      window.addEventListener("resize", updatePosition);
      
      return () => {
        window.removeEventListener("scroll", updatePosition, true);
        window.removeEventListener("resize", updatePosition);
      };
    }
  }, [isOpen]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isClickInsideContainer = containerRef.current?.contains(target);
      const isClickInsideDropdown = dropdownRef.current?.contains(target);
      
      if (!isClickInsideContainer && !isClickInsideDropdown) {
        setIsOpen(false);
        setSearchTerm("");
        setFocusedIndex(-1);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const maxIndex = filteredOptions.length + (showCreateNew ? 1 : 0) - 1;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev < maxIndex ? prev + 1 : prev));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : -1));
      } else if (e.key === "Enter" && focusedIndex >= 0) {
        e.preventDefault();
        if (focusedIndex < filteredOptions.length) {
          const option = filteredOptions[focusedIndex];
          if (option) {
            onChange(option.value);
            setIsOpen(false);
            setSearchTerm("");
            setFocusedIndex(-1);
          }
        } else if (showCreateNew && onCreateNew) {
          onCreateNew(searchTerm);
          setIsOpen(false);
          setSearchTerm("");
          setFocusedIndex(-1);
        }
      } else if (e.key === "Escape") {
        setIsOpen(false);
        setSearchTerm("");
        setFocusedIndex(-1);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, focusedIndex, filteredOptions, onChange, showCreateNew, onCreateNew, searchTerm]);

  // Scroll focused item into view
  useEffect(() => {
    if (focusedIndex >= 0 && listRef.current) {
      const totalItems = filteredOptions.length + (showCreateNew ? 1 : 0);
      if (focusedIndex < totalItems) {
        const focusedElement = listRef.current.children[focusedIndex] as HTMLElement;
        if (focusedElement) {
          focusedElement.scrollIntoView({
            block: "nearest",
            behavior: "smooth",
          });
        }
      }
    }
  }, [focusedIndex, filteredOptions.length, showCreateNew]);

  const handleSelect = (optionValue: string | number) => {
    onChange(optionValue);
    setIsOpen(false);
    setSearchTerm("");
    setFocusedIndex(-1);
  };

  const handleToggle = () => {
    if (disabled) return;
    setIsOpen(!isOpen);
    if (!isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 0);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled || required) return;
    onChange(typeof value === "number" ? 0 : "");
    setIsOpen(false);
    setSearchTerm("");
    setFocusedIndex(-1);
  };

  const canClear = allowClear && !required && selectedOption && !disabled;

  return (
    <div ref={containerRef} className={`relative z-[99999] ${className}`}>
      {/* Trigger Button */}
      <button
        type="button"
        onClick={handleToggle}
        disabled={disabled}
        className={`w-full rounded-lg border border-zinc-300 bg-white px-4 py-2 text-left text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 ${
          disabled
            ? "cursor-not-allowed opacity-50"
            : "cursor-pointer hover:border-zinc-400 dark:hover:border-zinc-600"
        } ${!selectedOption ? "text-zinc-500 dark:text-zinc-400" : ""}`}
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate flex-1">{displayValue}</span>
          <div className="flex items-center gap-1">
            {canClear && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded p-0.5 hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors"
                aria-label="Clear selection"
              >
                <svg
                  className="h-4 w-4 text-zinc-500 dark:text-zinc-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            )}
            <svg
              className={`h-5 w-5 text-zinc-400 transition-transform ${
                isOpen ? "rotate-180" : ""
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </div>
        </div>
      </button>

      {/* Dropdown - Rendered via Portal */}
      {isOpen && typeof document !== "undefined" && createPortal(
        <div
          ref={dropdownRef}
          className="fixed z-[99999] rounded-lg border border-zinc-300 bg-white shadow-2xl dark:border-zinc-700 dark:bg-zinc-800"
          style={{
            top: `${dropdownPosition.top}px`,
            left: `${dropdownPosition.left}px`,
            width: `${dropdownPosition.width}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search Input */}
          <div className="border-b border-zinc-200 p-2 dark:border-zinc-700">
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setFocusedIndex(-1);
              }}
              placeholder={searchPlaceholder}
              className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-zinc-600 dark:bg-zinc-900 dark:text-zinc-100"
            />
          </div>

          {/* Options List */}
          <ul
            ref={listRef}
            className="max-h-60 overflow-auto p-1"
            role="listbox"
          >
            {filteredOptions.length === 0 && !showCreateNew ? (
              <li className="px-3 py-2 text-sm text-zinc-500 dark:text-zinc-400">
                No options found
              </li>
            ) : (
              <>
                {filteredOptions.map((option, index) => (
                  <li
                    key={option.value}
                    role="option"
                    aria-selected={value === option.value}
                    onClick={() => handleSelect(option.value)}
                    onMouseEnter={() => setFocusedIndex(index)}
                    className={`cursor-pointer rounded-md px-3 py-2 text-sm transition-colors ${
                      value === option.value
                        ? "bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100"
                        : focusedIndex === index
                        ? "bg-zinc-100 text-zinc-900 dark:bg-zinc-700 dark:text-zinc-100"
                        : "text-zinc-900 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-zinc-700"
                    }`}
                  >
                    {option.label}
                  </li>
                ))}
                {showCreateNew && (
                  <li
                    role="option"
                    onClick={() => {
                      if (onCreateNew) {
                        onCreateNew(searchTerm);
                        setIsOpen(false);
                        setSearchTerm("");
                        setFocusedIndex(-1);
                      }
                    }}
                    onMouseEnter={() => setFocusedIndex(filteredOptions.length)}
                    className={`cursor-pointer rounded-md px-3 py-2 text-sm transition-colors ${
                      focusedIndex === filteredOptions.length
                        ? "bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-100"
                        : "text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-900/20"
                    }`}
                  >
                    <span className="font-medium">
                      {createNewLabel ? createNewLabel(searchTerm) : `Create "${searchTerm}"`}
                    </span>
                  </li>
                )}
              </>
            )}
          </ul>
        </div>,
        document.body
      )}

      {/* Hidden input for form validation */}
      {required && (
        <input
          type="hidden"
          value={value || ""}
          required={required}
          aria-hidden="true"
        />
      )}
    </div>
  );
}

