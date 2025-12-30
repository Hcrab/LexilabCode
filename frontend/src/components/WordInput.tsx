import { useState } from "react";

interface Props {
  word: string;
}

export default function WordInput({ word }: Props) {
  const [sentence, setSentence] = useState("");
  const [loading, setLoading] = useState(false);
  const [showWarn, setShowWarn] = useState(false);
  const [result, setResult] = useState<{
    score?: number;
    feedback?: string;
    error?: string;
  }>({});

  const MAX_LEN = 1000;
  const WARN_LEN = 500;

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let value = e.target.value;

    // truncate to MAX_LEN
    if (value.length > MAX_LEN) value = value.slice(0, MAX_LEN);

    setSentence(value);
    setShowWarn(value.length > WARN_LEN);

    // auto-resize
    e.target.style.height = "auto";
    e.target.style.height = `${e.target.scrollHeight}px`;
  };

  const scoreSentence = async () => {
    if (!sentence.trim()) return;

    const endpoint = process.env.NEXT_PUBLIC_API_BASE
      ? `${process.env.NEXT_PUBLIC_API_BASE}/ai/sentence-score`
      : "/api/ai/sentence-score";

    setLoading(true);
    setResult({});

    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ word, sentence }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "Scoring failed");
      setResult(data);
    } catch (e: any) {
      setResult({ error: e.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl bg-white/80 backdrop-blur-sm shadow-lg ring-1 ring-[#E8DCB5] p-6">
      <label className="block text-[#5B4636] font-medium mb-3">{word}</label>

      <div className="flex flex-col gap-3">
        <textarea
          rows={1}
          className="flex-grow px-4 py-2 rounded-md border border-[#D5B895] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#C19770] transition overflow-hidden resize-none"
          placeholder={`Write a sentence using "${word}"`}
          value={sentence}
          onChange={handleChange}
        />

        {showWarn && (
          <p className="text-xs text-red-600">
            are you sure you want to write this much?
          </p>
        )}

        <button
          className="self-start px-5 py-2 rounded-md font-medium text-white bg-[#C19770] hover:bg-[#A67A5B] active:scale-95 transition disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={scoreSentence}
          disabled={loading}
        >
          {loading ? "Scoring…" : "Score"}
        </button>
      </div>

      {result.score !== undefined && (
        <div className="mt-4 text-[#5B4636] space-x-3">
          <span className="text-green-700 font-semibold">
            Score: {result.score}/4
          </span>
          <span className="text-sm italic">{result.feedback}</span>
        </div>
      )}

      {result.error && (
        <div className="mt-4 px-4 py-2 border-l-4 border-red-500 bg-red-50 text-red-700 text-sm rounded-md">
          ⚠️ Error: {result.error}
        </div>
      )}
    </div>
  );
}
