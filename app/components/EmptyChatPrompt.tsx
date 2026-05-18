"use client";

import { useState, useRef } from "react";
import { VoiceInputCollector } from "@/lib/services/InputCollector";

interface EmptyChatPromptProps {
  onSendMessage: (text: string) => void;
  onSendImage: (file: File) => void;
  onVoiceResult: (text: string) => void;
}

export default function EmptyChatPrompt({
  onSendMessage,
  onSendImage,
  onVoiceResult,
}: EmptyChatPromptProps) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const voiceCollectorRef = useRef<VoiceInputCollector | null>(null);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && text.trim()) {
      onSendMessage(text.trim());
      setText("");
    }
  }

  function handleImageSelected(e: React.ChangeEvent<HTMLInputElement>, fromCamera: boolean) {
    const file = e.target.files?.[0];
    if (file) {
      onSendImage(file);
    }
    if (fromCamera) {
      cameraInputRef.current!.value = "";
    } else {
      imageInputRef.current!.value = "";
    }
  }

  async function handleVoiceToggle() {
    if (isRecording) {
      voiceCollectorRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const collector = new VoiceInputCollector(async (blob) => {
      const { speechToText } = await import("@/lib/groq");
      return speechToText(blob);
    });

    voiceCollectorRef.current = collector;
    setIsRecording(true);

    try {
      const text = await collector.collect();
      if (text.trim()) {
        onVoiceResult(text.trim());
      }
    } catch {
      // Recording cancelled or failed silently
    } finally {
      setIsRecording(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
      <div className="flex flex-row items-center gap-6">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-lg transition hover:bg-[var(--brand-dark)]"
          title="Take a picture"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-9 w-9">
            <path d="M12 9a3.75 3.75 0 1 0 0 7.5A3.75 3.75 0 0 0 12 9Z" />
            <path fillRule="evenodd" d="M9.344 3.071a49.52 49.52 0 0 1 5.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 0 1-3 3H4.5a3 3 0 0 1-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 0 0 1.11-.71l.822-1.315a2.942 2.942 0 0 1 2.332-1.39ZM6.75 12.75a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0Zm12-1.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
          </svg>
        </button>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleImageSelected(e, true)}
        />
        <button
          type="button"
          onClick={() => imageInputRef.current?.click()}
          className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-lg transition hover:bg-[var(--brand-dark)]"
          title="Upload image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-9 w-9">
            <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <input
          ref={imageInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => handleImageSelected(e, false)}
        />
        <button
          type="button"
          onClick={handleVoiceToggle}
          className={`flex h-20 w-20 items-center justify-center rounded-full text-white shadow-lg transition ${
            isRecording
              ? "bg-red-500 animate-pulse hover:bg-red-600"
              : "bg-[var(--brand)] hover:bg-[var(--brand-dark)]"
          }`}
          title={isRecording ? "Stop recording" : "Voice note"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-9 w-9">
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 10Z" />
          </svg>
        </button>
      </div>
      <p className="text-sm text-zinc-400 dark:text-zinc-500">Or&hellip;</p>
      <div className="flex items-center justify-center transition-all duration-300">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={handleKeyDown}
          placeholder="Try with text input"
          className={`rounded-full border border-zinc-300 px-6 py-3 text-center text-base outline-none transition-all duration-300 placeholder:text-zinc-400 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/30 dark:border-zinc-600 dark:bg-[#2a3942] dark:text-white dark:placeholder:text-zinc-500 ${
            focused ? "w-80 text-left" : "w-64"
          }`}
        />
      </div>
    </div>
  );
}
