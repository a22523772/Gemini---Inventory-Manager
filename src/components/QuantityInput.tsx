import React from 'react';
import { Minus, Plus } from 'lucide-react';

interface QuantityInputProps {
  value: string | number;
  onChange: (val: string) => void;
  min?: number;
  max?: number;
  className?: string;
}

export default function QuantityInput({ value, onChange, min = 1, max, className = '' }: QuantityInputProps) {
  const handleMinus = () => {
    const current = Number(value) || 0;
    if (current > min) {
      onChange(String(current - 1));
    } else if (current === min && min < 0) {
      onChange(String(current - 1));
    } else {
      onChange(String(min));
    }
  };

  const handlePlus = () => {
    const current = Number(value) || 0;
    if (max !== undefined && current >= max) {
      onChange(String(max));
    } else {
      onChange(String(current + 1));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    onChange(val);
  };

  const handleBlur = () => {
    const current = Number(value);
    if (isNaN(current)) {
      onChange(String(min));
      return;
    }
    if (current < min) {
      onChange(String(min));
    } else if (max !== undefined && current > max) {
      onChange(String(max));
    }
  };

  return (
    <div className={`flex items-center w-full rounded-xl border border-white/10 bg-black/30 overflow-hidden focus-within:border-[var(--color-accent-blue)] focus-within:ring-1 focus-within:ring-[var(--color-accent-blue)] transition-all ${className}`}>
      <button
        type="button"
        onClick={handleMinus}
        className="px-4 py-3 h-full flex items-center justify-center text-[var(--color-text-dim)] hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors"
      >
        <Minus className="w-4 h-4" />
      </button>
      
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={(e) => e.target.select()}
        className="w-full bg-transparent text-center py-3 text-sm text-[var(--color-text-main)] outline-none"
      />
      
      <button
        type="button"
        onClick={handlePlus}
        className="px-4 py-3 h-full flex items-center justify-center text-[var(--color-text-dim)] hover:text-white hover:bg-white/5 active:bg-white/10 transition-colors"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );
}
