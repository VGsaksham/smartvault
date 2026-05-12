'use client';

import React, { useState, useRef, useEffect } from 'react';

export interface SelectOption {
  label: string;
  value: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export function CustomSelect({ value, onChange, options, placeholder = 'Select...', className = '', disabled = false }: SelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(opt => String(opt.value) === String(value));

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-full bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-[10px] py-2.5 px-4 text-[14px] text-left text-[var(--text-primary)] focus:outline-none focus:border-[var(--accent)] transition-all flex items-center justify-between disabled:opacity-50"
      >
        <span className={selectedOption ? '' : 'text-[var(--text-tertiary)]'}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth="2" stroke="currentColor" className={`w-4 h-4 ml-2 flex-shrink-0 text-[var(--text-tertiary)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
          <path strokeLinecap="round" strokeLinejoin="round" d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute top-[calc(100%+4px)] left-0 w-full min-w-[120px] bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-medium)] rounded-[11px] overflow-hidden z-[9999] py-1 animate-in fade-in slide-in-from-top-1 duration-200 max-h-[250px] overflow-y-auto">
          {options.length === 0 ? (
            <div className="px-4 py-2 text-[13px] text-[var(--text-tertiary)] italic">No options</div>
          ) : (
            options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(opt.value);
                  setIsOpen(false);
                }}
                className={`w-full text-left px-[14px] py-[8px] text-[14px] tracking-[-0.224px] transition-colors hover:bg-[var(--bg-neutral)] ${String(value) === String(opt.value) ? 'text-[var(--accent)] font-medium bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]' : 'text-[var(--text-primary)]'}`}
              >
                {opt.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
