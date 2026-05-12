'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

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
  const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Position the portal dropdown below (or above if near bottom) the trigger
  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const winH = window.innerHeight;
    const maxH = 220;
    const spaceBelow = winH - rect.bottom - 8;
    const spaceAbove = rect.top - 8;

    if (spaceBelow >= Math.min(maxH, 120) || spaceBelow >= spaceAbove) {
      // Open downward
      setDropdownStyle({
        position: 'fixed',
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(spaceBelow, 80),
        zIndex: 99999,
      });
    } else {
      // Open upward
      setDropdownStyle({
        position: 'fixed',
        bottom: winH - rect.top + 4,
        left: rect.left,
        width: rect.width,
        maxHeight: Math.max(spaceAbove, 80),
        zIndex: 99999,
      });
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [isOpen, updatePosition]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        listRef.current?.contains(e.target as Node)
      ) return;
      setIsOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const selectedOption = options.find(opt => String(opt.value) === String(value));

  const dropdown = isOpen ? (
    <div
      ref={listRef}
      style={dropdownStyle}
      className="bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-medium)] rounded-[11px] overflow-y-auto py-1 animate-in fade-in slide-in-from-top-1 duration-150"
    >
      {options.length === 0 ? (
        <div className="px-4 py-2 text-[13px] text-[var(--text-tertiary)] italic">No options</div>
      ) : (
        options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onChange(opt.value);
              setIsOpen(false);
            }}
            className={`w-full text-left px-[14px] py-[9px] text-[14px] tracking-[-0.224px] transition-colors hover:bg-[var(--bg-neutral)] ${
              String(value) === String(opt.value)
                ? 'text-[var(--accent)] font-medium bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]'
                : 'text-[var(--text-primary)]'
            }`}
          >
            {opt.label}
          </button>
        ))
      )}
    </div>
  ) : null;

  return (
    <div className={`relative ${className}`}>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setIsOpen(prev => !prev);
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

      {typeof document !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  );
}
