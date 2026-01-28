"use client";

import React, { useState, useRef, useEffect } from "react";
import { Send, Keyboard } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TextInputProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function TextInput({
  onSubmit,
  disabled = false,
  placeholder = "Type your message...",
  className,
}: TextInputProps) {
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus input on mount
  useEffect(() => {
    if (inputRef.current && !disabled) {
      inputRef.current.focus();
    }
  }, [disabled]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim() && !disabled) {
      onSubmit(text.trim());
      setText("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn(
        "flex items-center gap-2 p-2 bg-muted/50 rounded-lg border",
        disabled && "opacity-50",
        className
      )}
    >
      <div className="flex items-center justify-center w-8 h-8 text-muted-foreground">
        <Keyboard className="w-4 h-4" />
      </div>

      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "flex-1 bg-transparent border-none outline-none text-sm",
          "placeholder:text-muted-foreground",
          "focus:ring-0"
        )}
      />

      <Button
        type="submit"
        size="sm"
        disabled={disabled || !text.trim()}
        className="h-8 w-8 p-0"
      >
        <Send className="w-4 h-4" />
      </Button>
    </form>
  );
}

export default TextInput;
