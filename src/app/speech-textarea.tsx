"use client";

import { useEffect, useRef, useState } from "react";

interface SpeechRecognitionResultEvent extends Event {
  resultIndex: number;
  results: {
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
    length: number;
  };
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionInstance;

const languages = [
  { label: "English", value: "en-US" },
  { label: "Spanish", value: "es-ES" },
  { label: "French", value: "fr-FR" },
  { label: "German", value: "de-DE" },
  { label: "Italian", value: "it-IT" },
  { label: "Portuguese", value: "pt-BR" },
];

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

function appendTranscript(currentText: string, transcript: string) {
  const spokenText = transcript.trim();

  if (!spokenText) {
    return currentText;
  }

  if (!currentText || /\s$/.test(currentText)) {
    return `${currentText}${spokenText}`;
  }

  return `${currentText} ${spokenText}`;
}

export function SpeechTextarea() {
  const [content, setContent] = useState("");
  const [language, setLanguage] = useState("en-US");
  const [isListening, setIsListening] = useState(false);
  const [message, setMessage] = useState("");
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    return () => recognitionRef.current?.abort();
  }, []);

  function toggleRecording() {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const SpeechRecognition =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMessage("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = language;
    recognition.onresult = (event) => {
      let transcript = "";

      for (let index = event.resultIndex; index < event.results.length; index++) {
        if (event.results[index].isFinal) {
          transcript += event.results[index][0].transcript;
        }
      }

      setContent((currentText) => appendTranscript(currentText, transcript));
    };
    recognition.onerror = (event) => {
      setMessage(
        event.error === "not-allowed"
          ? "Microphone access was denied. Allow it in your browser settings and try again."
          : "I could not recognize speech. Please try again.",
      );
    };
    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setMessage("");

    try {
      recognition.start();
      setIsListening(true);
    } catch {
      recognitionRef.current = null;
      setMessage("The microphone could not be started. Please try again.");
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="content" className="text-sm font-medium text-zinc-800">
          Text
        </label>
        <div className="flex items-center gap-2">
          <label htmlFor="speech-language" className="sr-only">
            Recording language
          </label>
          <select
            id="speech-language"
            value={language}
            onChange={(event) => setLanguage(event.target.value)}
            disabled={isListening}
            className="h-9 rounded-lg border border-zinc-300 bg-white px-3 text-sm text-zinc-800 outline-none transition focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-zinc-100"
          >
            {languages.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={toggleRecording}
            aria-pressed={isListening}
            className={`inline-flex h-9 items-center justify-center rounded-lg border px-3 text-sm font-semibold transition focus:outline-none focus:ring-4 ${
              isListening
                ? "border-red-300 bg-red-50 text-red-700 hover:bg-red-100 focus:ring-red-100"
                : "border-zinc-300 bg-white text-zinc-800 hover:border-emerald-400 hover:text-emerald-700 focus:ring-emerald-100"
            }`}
          >
            {isListening ? "Stop recording" : "Record voice"}
          </button>
        </div>
      </div>
      <textarea
        id="content"
        name="content"
        required
        rows={8}
        value={content}
        onChange={(event) => setContent(event.target.value)}
        placeholder="Paste text here or record your voice..."
        className="min-h-48 resize-y rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base leading-7 text-zinc-950 outline-none transition placeholder:text-zinc-400 focus:border-emerald-600 focus:ring-4 focus:ring-emerald-100"
      />
      <p aria-live="polite" className="min-h-5 text-sm text-zinc-500">
        {isListening ? "Listening… Speak now." : message}
      </p>
    </div>
  );
}
