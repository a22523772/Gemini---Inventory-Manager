import React, { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, X, Check } from 'lucide-react';

export const FILTER_KEYWORD_PREFIX = '__kw__:';

export interface FilterSelectOption {
  value: string;
  label: string;
  hint?: string;
}

export function isKeywordFilter(value: string | undefined | null): boolean {
  return Boolean(value && value.startsWith(FILTER_KEYWORD_PREFIX));
}

export function extractFilterKeyword(value: string | undefined | null): string {
  if (!value) return '';
  return value.startsWith(FILTER_KEYWORD_PREFIX) ? value.slice(FILTER_KEYWORD_PREFIX.length) : value;
}

export function matchesSearchableFilter(
  filterValue: string | undefined | null,
  candidateValue: string | undefined | null,
  searchableText?: string,
  allValue = ''
): boolean {
  if (!filterValue || filterValue === allValue) return true;
  if (filterValue.startsWith(FILTER_KEYWORD_PREFIX)) {
    const kw = filterValue.slice(FILTER_KEYWORD_PREFIX.length).trim().toLowerCase();
    if (!kw) return true;
    const haystack = `${candidateValue || ''} ${searchableText || ''}`.toLowerCase();
    return haystack.includes(kw);
  }
  return (candidateValue || '') === filterValue;
}

interface SearchableFilterSelectProps {
  options: FilterSelectOption[];
  value: string;
  onChange: (newValue: string) => void;
  allValue?: string;
  allLabel: string;
  placeholder?: string;
  icon?: React.ReactNode;
  prefixLabel?: string;
  accentColor?: 'sky' | 'emerald' | 'indigo';
  className?: string;
  inputClassName?: string;
}

export default function SearchableFilterSelect({
  options,
  value,
  onChange,
  allValue = '',
  allLabel,
  placeholder,
  icon,
  prefixLabel,
  accentColor = 'sky',
  className = '',
  inputClassName = '',
}: SearchableFilterSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [menuRect, setMenuRect] = useState<{
    top: number;
    left: number;
    width: number;
    maxHeight: number;
    openUpward: boolean;
  } | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedOption = useMemo(
    () => (value && value !== allValue && !isKeywordFilter(value) ? options.find(o => o.value === value) : undefined),
    [options, value, allValue]
  );

  const rawKeyword = isKeywordFilter(value) ? value.slice(FILTER_KEYWORD_PREFIX.length) : '';

  // Display text in the input field
  const displayValue = useMemo(() => {
    if (value === allValue || !value) return '';
    if (isKeywordFilter(value)) return rawKeyword;
    return selectedOption ? selectedOption.label : value;
  }, [value, allValue, rawKeyword, selectedOption]);

  // Query used to narrow options when user is typing
  const optionSearchQuery = isTyping
    ? (isKeywordFilter(value) ? rawKeyword : displayValue).trim().toLowerCase()
    : '';

  const filteredOptions = useMemo(() => {
    if (!optionSearchQuery) return options;
    return options.filter(opt => {
      const target = `${opt.label} ${opt.value} ${opt.hint || ''}`.toLowerCase();
      return target.includes(optionSearchQuery);
    });
  }, [options, optionSearchQuery]);

  // Reset typing flag when externally cleared
  useEffect(() => {
    if (!value || value === allValue) {
      setIsTyping(false);
    }
  }, [value, allValue]);

  const updateMenuPosition = () => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const spaceBelow = viewportHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const openUpward = spaceBelow < 200 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(140, Math.min(280, openUpward ? spaceAbove : spaceBelow));
    const width = Math.max(rect.width, 200);
    const left = Math.min(rect.left, Math.max(8, viewportWidth - width - 8));

    setMenuRect({
      top: openUpward ? rect.top - 6 : rect.bottom + 6,
      left,
      width,
      maxHeight,
      openUpward,
    });
  };

  useEffect(() => {
    if (!isOpen) return;
    updateMenuPosition();
    const handleScrollOrResize = () => updateMenuPosition();
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen, filteredOptions.length]);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setIsOpen(false);
      setIsTyping(false);
      setHighlightIdx(-1);
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [isOpen]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const nextText = e.target.value;
    setIsTyping(true);
    setIsOpen(true);
    setHighlightIdx(-1);
    if (nextText.trim() === '') {
      onChange(allValue);
    } else {
      onChange(`${FILTER_KEYWORD_PREFIX}${nextText}`);
    }
  };

  const handleSelectOption = (nextVal: string) => {
    setIsTyping(false);
    setIsOpen(false);
    setHighlightIdx(-1);
    onChange(nextVal);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setIsTyping(false);
    setHighlightIdx(-1);
    onChange(allValue);
    inputRef.current?.focus();
    setIsOpen(true);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setHighlightIdx(prev => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        setIsOpen(true);
        return;
      }
      setHighlightIdx(prev => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
    } else if (e.key === 'Enter') {
      if (isOpen && highlightIdx >= 0 && highlightIdx < filteredOptions.length) {
        e.preventDefault();
        handleSelectOption(filteredOptions[highlightIdx].value);
      } else {
        setIsOpen(false);
        setIsTyping(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
      setIsTyping(false);
      setHighlightIdx(-1);
    }
  };

  const ringClass =
    accentColor === 'emerald'
      ? 'focus-within:border-emerald-400 focus-within:ring-1 focus-within:ring-emerald-400/30'
      : accentColor === 'indigo'
      ? 'focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400/30'
      : 'focus-within:border-sky-400 focus-within:ring-1 focus-within:ring-sky-400/30';

  const activeOptionTextClass =
    accentColor === 'emerald'
      ? 'text-emerald-300 bg-emerald-500/15'
      : accentColor === 'indigo'
      ? 'text-indigo-300 bg-indigo-500/15'
      : 'text-sky-300 bg-sky-500/15';

  const hasActiveFilter = Boolean(value && value !== allValue);

  return (
    <div
      ref={containerRef}
      onClick={() => {
        inputRef.current?.focus();
        setIsOpen(true);
      }}
      className={`relative flex items-center gap-1.5 transition-all cursor-text ${ringClass} ${className}`}
    >
      {icon && <span className="shrink-0 flex items-center">{icon}</span>}
      {prefixLabel && (
        <span className="text-xs text-slate-400 font-bold shrink-0 whitespace-nowrap select-none">
          {prefixLabel}
        </span>
      )}

      <input
        ref={inputRef}
        type="text"
        value={displayValue}
        onChange={handleInputChange}
        onFocus={(e) => {
          setIsOpen(true);
          if (selectedOption) {
            e.target.select();
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder || allLabel}
        aria-label={prefixLabel || allLabel}
        className={`w-full min-w-0 bg-transparent outline-none truncate placeholder-slate-400 ${
          hasActiveFilter ? 'font-bold text-white' : 'text-slate-200'
        } ${inputClassName}`}
      />

      <div className="flex items-center gap-0.5 shrink-0">
        {hasActiveFilter && (
          <button
            type="button"
            onMouseDown={handleClear}
            title="清除篩選條件"
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isOpen) {
              setIsOpen(false);
              setIsTyping(false);
            } else {
              inputRef.current?.focus();
              setIsOpen(true);
            }
          }}
          title="展開選項"
          className="p-1 rounded-md text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen &&
        menuRect &&
        createPortal(
          <div
            ref={dropdownRef}
            style={{
              position: 'fixed',
              top: menuRect.openUpward ? undefined : menuRect.top,
              bottom: menuRect.openUpward ? window.innerHeight - menuRect.top : undefined,
              left: menuRect.left,
              width: menuRect.width,
              maxHeight: menuRect.maxHeight,
              zIndex: 9999,
            }}
            className="bg-[#0f172a] border border-white/15 rounded-xl shadow-2xl shadow-black/60 overflow-hidden flex flex-col backdrop-blur-xl animate-in fade-in duration-100"
          >
            {isKeywordFilter(value) && rawKeyword.trim() && (
              <div className="px-3 py-1.5 bg-sky-500/10 border-b border-white/10 text-[11px] text-sky-300 flex items-center justify-between gap-2 shrink-0">
                <span className="truncate">
                  已即時關鍵字篩選：「<strong className="text-white">{rawKeyword}</strong>」
                </span>
                <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                  {filteredOptions.length} 項符合
                </span>
              </div>
            )}

            <div className="overflow-y-auto py-1 custom-scrollbar">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectOption(allValue);
                }}
                className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  !hasActiveFilter ? activeOptionTextClass : 'text-slate-300 hover:bg-white/10'
                }`}
              >
                <span className="truncate font-bold">{allLabel}</span>
                {!hasActiveFilter && <Check className="w-3.5 h-3.5 shrink-0" />}
              </button>

              {filteredOptions.length === 0 ? (
                <div className="px-3 py-3 text-center text-xs text-slate-400">
                  找不到完全符合選項，目前正以「<span className="text-sky-300 font-bold">{rawKeyword}</span>」關鍵字篩選商品
                </div>
              ) : (
                filteredOptions.map((opt, idx) => {
                  const isSelected = value === opt.value;
                  const isHighlighted = idx === highlightIdx;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectOption(opt.value);
                      }}
                      className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isSelected
                          ? activeOptionTextClass
                          : isHighlighted
                          ? 'bg-white/15 text-white'
                          : 'text-slate-200 hover:bg-white/10'
                      }`}
                    >
                      <div className="min-w-0 flex-1 flex items-center gap-1.5">
                        <span className="truncate">{opt.label}</span>
                        {opt.hint && (
                          <span className="text-[10px] font-mono text-slate-400 shrink-0">{opt.hint}</span>
                        )}
                      </div>
                      {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                    </button>
                  );
                })
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
