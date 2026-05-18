"use client";

import { useState, useRef, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import { TransactionParser } from "@/lib/services/TransactionParser";
import { TransactionManager } from "@/lib/services/TransactionManager";
import { TransactionData, InputSource } from "@/lib/models/Transaction";
import { ImageInputCollector, VoiceInputCollector } from "@/lib/services/InputCollector";
import { ocrImage, normalizeEditInput, normalizeItemVoice } from "@/lib/groq";

type Phase = "idle" | "processing" | "receipt" | "missing_fields" | "saved" | "error";

const parser = new TransactionParser();
const txManager = new TransactionManager();

function optionalDateTimeMissingFields(fields: string[] | undefined): string[] {
  return (fields || []).filter((field) => field !== "date" && field !== "time");
}

export default function ChatView({ onTransactionSaved }: { onTransactionSaved?: () => void }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [procText, setProcText] = useState("");
  const [procImage, setProcImage] = useState<string | null>(null);
  const [data, setData] = useState<TransactionData | null>(null);
  const [accText, setAccText] = useState("");
  const [src, setSrc] = useState<InputSource>("text");
  const [errMsg, setErrMsg] = useState("");
  const [topInput, setTopInput] = useState("");
  const [missingInput, setMissingInput] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const [isMissingRecording, setIsMissingRecording] = useState(false);
  const busy = useRef(false);
  const snapshotRef = useRef<TransactionData | null>(null);
  const voiceRef = useRef<VoiceInputCollector | null>(null);
  const missingVoiceRef = useRef<VoiceInputCollector | null>(null);
  const camRef = useRef<HTMLInputElement>(null);
  const uploadRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editField, setEditField] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");
  const [editIsRecording, setIsEditRecording] = useState(false);
  const editVoiceRef = useRef<VoiceInputCollector | null>(null);
  const [editLoading, setEditLoading] = useState(false);
  const [editItemIndex, setEditItemIndex] = useState<number | null>(null);
  const [editItemName, setEditItemName] = useState("");
  const [editItemQty, setEditItemQty] = useState("");
  const [editItemAmount, setEditItemAmount] = useState("");
  const [editItemCategory, setEditItemCategory] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [typeLockMsg, setTypeLockMsg] = useState(false);
  const [totalLockMsg, setTotalLockMsg] = useState(false);
  const [aiRepairs, setAiRepairs] = useState<Record<string, { input: string; aiValue: string }>>({});
  const [flashField, setFlashField] = useState<string | null>(null);
  const [voiceNormalized, setVoiceNormalized] = useState<Record<string, string>>({});
  const [currentTip] = useState(() => {
    const tips = [
      "Let's take a note a coffee that you just bought this morning",
      "Record your lunch expenses from today",
      "Did you pay any bills recently? Let's log them",
      "Track your grocery shopping from yesterday",
      "Add the Grab ride you took this afternoon",
      "Log the movie tickets you bought last weekend",
      "Record your monthly subscription payments",
      "Note down the petrol you pumped yesterday",
      "Add your online shopping purchases",
      "Track your GrabFood delivery from dinner",
    ];
    return tips[Math.floor(Math.random() * tips.length)];
  });

  const isIdle = phase === "idle";

  function getFieldContext(field: string, d: TransactionData): string {
    const base = `store: "${d.store}", type: "${d.type}", payment: "${d.payment_method}", total: RM${d.total}`;
    const hints: Record<string, string> = {
      payment_method: "Only Malaysian payment methods: TNG (Touch N' Go eWallet), GrabPay, Maybank, CIMB, Public Bank, RHB, Boost, ShopeePay, DuitNow, FPX, cash, credit card.",
      store: "Correct store/merchant name spelling, expand abbreviations.",
      item_name: "Correct item name spelling and capitalization.",
      notes: "Clean up notes while preserving meaning.",
    };
    return `${base}. ${hints[field] || ""}`.trim();
  }

  const reset = useCallback(() => {
    setPhase("idle");
    setProcText("");
    setProcImage(null);
    setData(null);
    setAccText("");
    setErrMsg("");
    setTopInput("");
    setMissingInput("");
    setIsEditing(false);
    setEditField(null);
    setEditInput("");
    setEditItemIndex(null);
    setEditItemName("");
    setEditItemQty("");
    setEditItemAmount("");
    setEditItemCategory("");
    setEditDate("");
    setEditTime("");
    setTypeLockMsg(false);
    setTotalLockMsg(false);
    setAiRepairs({});
    setFlashField(null);
    setVoiceNormalized({});
    snapshotRef.current = null;
    busy.current = false;
    parser.reset();
  }, []);

  async function process(text: string, source: InputSource) {
    if (busy.current) return;
    busy.current = true;
    setPhase("processing");
    setAccText(text);
    setSrc(source);

    try {
      const { data: d } = await parser.parse(text);

      if (!d) {
        setPhase("error");
        setErrMsg("Could not parse that as a transaction. Try being more specific.");
        busy.current = false;
        return;
      }
      if (d.error) {
        setPhase("error");
        setErrMsg(d.error);
        busy.current = false;
        return;
      }
      d.date = d.date || new Date().toISOString();
      d.missing_fields = optionalDateTimeMissingFields(d.missing_fields);
      if (d.type === "income" && d.missing_fields) {
        d.missing_fields = d.missing_fields.filter((f) => f !== "store");
      }
      if (d.missing_fields?.length) {
        setPhase("missing_fields");
        setData(d);
        busy.current = false;
        return;
      }
      if (d.total !== null && d.type) {
        setPhase("receipt");
        setData(d);
        busy.current = false;
      }
    } catch (e) {
      setPhase("error");
      setErrMsg(`Error: ${e instanceof Error ? e.message : "Something went wrong"}`);
      busy.current = false;
    }
  }

  function handleTopKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && topInput.trim() && (isIdle || phase === "saved")) {
      const t = topInput.trim();
      setTopInput("");
      process(t, "text");
    }
  }

  function handleImageFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    const url = URL.createObjectURL(file);
    setPhase("processing");
    setProcImage(url);
    setProcText("");

    (async () => {
      const collector = new ImageInputCollector(file, ocrImage);
      const text = await collector.collect();
      setProcText(text);
      URL.revokeObjectURL(url);
      setProcImage(null);
      process(text, "image");
    })();
  }

  async function handleTopMic() {
    if (phase !== "idle" && phase !== "saved") return;

    if (isRecording) {
      voiceRef.current?.stop();
      return;
    }

    setIsRecording(true);
    const collector = new VoiceInputCollector(async (blob) => {
      const { speechToText } = await import("@/lib/groq");
      return speechToText(blob);
    });
    voiceRef.current = collector;

    try {
      const text = await collector.collect();
      if (text.trim()) {
        setPhase("processing");
        setProcText(text);
        setProcImage(null);
        process(text.trim(), "voice");
      }
    } catch {
      // cancelled or failed
    } finally {
      setIsRecording(false);
    }
  }

  async function handleMissingSubmit(text: string) {
    if (busy.current) return;
    busy.current = true;
    setPhase("processing");
    setMissingInput("");

    try {
      const { data: d } = await parser.parse(text.trim());

      if (!d) {
        setPhase("error");
        setErrMsg("Could not parse that. Try again.");
        busy.current = false;
        return;
      }
      if (d.error) {
        setPhase("error");
        setErrMsg(d.error);
        busy.current = false;
        return;
      }
      d.date = d.date || new Date().toISOString();
      d.missing_fields = optionalDateTimeMissingFields(d.missing_fields);
      if (d.type === "income" && d.missing_fields) {
        d.missing_fields = d.missing_fields.filter((f) => f !== "store");
      }
      if (d.missing_fields?.length) {
        setPhase("missing_fields");
        setData(d);
        busy.current = false;
        return;
      }
      if (d.total !== null && d.type) {
        setPhase("receipt");
        setData(d);
        busy.current = false;
      }
    } catch (e) {
      setPhase("error");
      setErrMsg(`Error: ${e instanceof Error ? e.message : "Something went wrong"}`);
      busy.current = false;
    }
  }

  function handleMissingKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && missingInput.trim()) {
      handleMissingSubmit(missingInput.trim());
    }
  }

  async function handleMissingMic() {
    if (isMissingRecording) {
      missingVoiceRef.current?.stop();
      return;
    }

    setIsMissingRecording(true);
    const collector = new VoiceInputCollector(async (blob) => {
      const { speechToText } = await import("@/lib/groq");
      return speechToText(blob);
    });
    missingVoiceRef.current = collector;

    try {
      const text = await collector.collect();
      if (text.trim()) {
        handleMissingSubmit(text.trim());
      }
    } catch {
      // cancelled or failed
    } finally {
      setIsMissingRecording(false);
    }
  }

  async function handleConfirm() {
    if (!data) return;
    const ok = await txManager.save(data, accText, src);
    if (ok) {
      setPhase("saved");
      onTransactionSaved?.();
    } else {
      setPhase("error");
      setErrMsg("Failed to save transaction.");
    }
  }

  function handleCancel() {
    reset();
  }

  function handleEdit() {
    if (data) {
      snapshotRef.current = JSON.parse(JSON.stringify(data));
    }
    setIsEditing(true);
  }

  function handleFieldClick(field: string) {
    if (field === "type") {
      setTypeLockMsg(true);
      setTimeout(() => setTypeLockMsg(false), 2500);
      return;
    }
    if (field === "total") {
      setTotalLockMsg(true);
      setTimeout(() => setTotalLockMsg(false), 2500);
      return;
    }
    setEditField(field);
    setEditItemIndex(null);
    setEditInput("");
    if (field === "date" && data?.date) {
      const d = new Date(data.date);
      setEditDate(d.toISOString().slice(0, 10));
      setEditTime(d.toTimeString().slice(0, 5));
    } else if (field === "date") {
      const d = new Date();
      setEditDate(d.toISOString().slice(0, 10));
      setEditTime(d.toTimeString().slice(0, 5));
    }
  }

  function handleItemClick(index: number) {
    if (!data) return;
    setEditItemIndex(index);
    setEditField(null);
    setEditItemName(data.items[index]?.name || "");
    setEditItemQty(String(data.items[index]?.quantity || 1));
    setEditItemAmount(String(data.items[index]?.amount.toFixed(2) || "0.00"));
    setEditItemCategory(data.items[index]?.category || "");
  }

  function handleAddItem() {
    if (!data) return;
    const newIdx = data.items.length;
    const updated = { ...data, items: [...data.items, { name: "", amount: 0, quantity: 1, category: null }] };
    setData(updated);
    setEditItemIndex(newIdx);
    setEditField(null);
    setEditItemName("");
    setEditItemQty("1");
    setEditItemAmount("0.00");
  }

  function handleItemDelete() {
    if (!data || editItemIndex === null) return;
    const updated = { ...data, items: data.items.filter((_, i) => i !== editItemIndex) };
    setData(updated);
    setEditItemIndex(null);
    setEditItemName("");
    setEditItemQty("");
    setEditItemAmount("");
  }

  function handleAmountKey(key: string, current: string): string {
    const cents = Math.round(parseFloat(current || "0") * 100);
    if (key === "Backspace") {
      return (Math.floor(cents / 10) / 100).toFixed(2);
    }
    const digit = parseInt(key, 10);
    if (isNaN(digit)) return current;
    const newCents = cents * 10 + digit;
    if (newCents > 99999999) return current;
    return (newCents / 100).toFixed(2);
  }

  function handleEditKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && editInput.trim()) {
      handleEditSubmit(editInput.trim());
    }
  }

  async function handleEditSubmit(value: string) {
    if (!data) return;
    setEditLoading(true);
    try {
      if (editItemIndex !== null) {
        const name = editItemName.trim() || data.items[editItemIndex]?.name || "";
        const qty = Math.max(1, parseInt(editItemQty, 10) || 1);
        const amt = parseFloat(editItemAmount) || 0;
        const itemKey = `item-${editItemIndex}`;
        const categoryKey = `item-${editItemIndex}-category`;
        const isVoiceNormalized = voiceNormalized[itemKey] === name;
        const catIsVoiceNorm = voiceNormalized[categoryKey] === editItemCategory;
        let finalName = name;
        let finalCategory: string | null = editItemCategory || null;
        const context = `store: ${data.store}, type: ${data.type}, payment: ${data.payment_method}`;
        if (!isVoiceNormalized) {
          const nameResult = await normalizeEditInput("item_name", context, name);
          finalName = nameResult.normalized;
          if (nameResult.changed) {
            setAiRepairs((r) => ({ ...r, [itemKey]: { input: name, aiValue: nameResult.normalized } }));
            setFlashField(itemKey);
            setTimeout(() => setFlashField(null), 1500);
          }
        }
        if (editItemCategory && !catIsVoiceNorm) {
          const catResult = await normalizeEditInput("item_category", context, editItemCategory);
          finalCategory = catResult.normalized;
          if (catResult.changed) {
            setAiRepairs((r) => ({ ...r, [categoryKey]: { input: editItemCategory, aiValue: catResult.normalized } }));
            setFlashField(categoryKey);
            setTimeout(() => setFlashField(null), 1500);
          }
        }
        const items = [...data.items];
        items[editItemIndex] = { name: finalName, amount: amt, quantity: qty, category: finalCategory };
        const total = items.reduce((s, it) => s + it.amount * it.quantity, 0);
        setData({ ...data, items, total });
        setVoiceNormalized((r) => { const n = { ...r }; delete n[itemKey]; delete n[categoryKey]; return n; });
        setEditItemIndex(null);
        setEditItemName("");
        setEditItemQty("");
        setEditItemAmount("");
        setEditItemCategory("");
      } else if (editField) {
        const submitValue = value.trim() || String(data[editField as keyof TransactionData] ?? "");
        const isVoiceNormalized = voiceNormalized[editField] === submitValue;
        let finalValue: string | number = submitValue;
        if (!isVoiceNormalized) {
          const context = `store: ${data.store}, type: ${data.type}, payment: ${data.payment_method}, total: ${data.total}, notes: ${data.notes}`;
          const result = await normalizeEditInput(editField, context, submitValue);
          finalValue = editField === "total" ? Number(result.normalized) : result.normalized;
          if (result.changed) {
            setAiRepairs((r) => ({ ...r, [editField!]: { input: submitValue, aiValue: result.normalized } }));
            setFlashField(editField);
            setTimeout(() => setFlashField(null), 1500);
          }
        } else if (editField === "total") {
          finalValue = Number(submitValue);
        }
        const updated = { ...data, [editField]: finalValue };
        setData(updated);
        setVoiceNormalized((r) => { const n = { ...r }; delete n[editField!]; return n; });
        setEditField(null);
        setEditInput("");
      }
    } catch {
      if (editItemIndex !== null) {
        const name = editItemName.trim() || data.items[editItemIndex]?.name || "";
        const qty = Math.max(1, parseInt(editItemQty, 10) || 1);
        const amt = parseFloat(editItemAmount) || 0;
        const items = [...data.items];
        items[editItemIndex] = { name, amount: amt, quantity: qty, category: editItemCategory || null };
        const total = items.reduce((s, it) => s + it.amount * it.quantity, 0);
        setData({ ...data, items, total });
        setEditItemIndex(null);
        setEditItemName("");
        setEditItemQty("");
        setEditItemAmount("");
        setEditItemCategory("");
      } else if (editField) {
        const submitValue = value.trim() || String(data[editField as keyof TransactionData] ?? "");
        const val = editField === "total" ? Number(submitValue) : submitValue;
        setData({ ...data, [editField]: val });
        setEditField(null);
        setEditInput("");
      }
    } finally {
      setEditLoading(false);
    }
  }

  function handleRevert(fieldOrKey: string) {
    const repair = aiRepairs[fieldOrKey];
    if (!repair || !data) return;

    if (fieldOrKey.startsWith("item-") && fieldOrKey.endsWith("-category")) {
      const idx = parseInt(fieldOrKey.replace("-category", "").replace("item-", ""), 10);
      const items = [...data.items];
      if (!items[idx]) return;
      items[idx] = { ...items[idx], category: repair.input };
      setData({ ...data, items });
      setEditItemIndex(null);
      setEditItemName("");
      setEditItemQty("");
      setEditItemAmount("");
      setEditItemCategory("");
    } else if (fieldOrKey.startsWith("item-")) {
      const idx = parseInt(fieldOrKey.replace("item-", ""), 10);
      const items = [...data.items];
      if (!items[idx]) return;
      items[idx] = { ...items[idx], name: repair.input };
      const total = items.reduce((s, it) => s + it.amount * it.quantity, 0);
      setData({ ...data, items, total });
      setEditItemIndex(null);
      setEditItemName("");
      setEditItemQty("");
      setEditItemAmount("");
      setEditItemCategory("");
    } else {
      const val = fieldOrKey === "total" ? Number(repair.input) : repair.input;
      setData({ ...data, [fieldOrKey]: val });
      setEditField(null);
      setEditInput("");
    }
    setAiRepairs((r) => {
      const next = { ...r };
      delete next[fieldOrKey];
      return next;
    });
  }

  async function handleEditMic() {
    if (editIsRecording) {
      editVoiceRef.current?.stop();
      return;
    }

    setIsEditRecording(true);
    const collector = new VoiceInputCollector(async (blob) => {
      const { speechToText } = await import("@/lib/groq");
      return speechToText(blob);
    });
    editVoiceRef.current = collector;

    try {
      const sttText = await collector.collect();
      if (sttText.trim() && data) {
        if (editItemIndex !== null) {
          const context = getFieldContext("item_name", data);
          const currentItem = data.items[editItemIndex];
          const result = await normalizeItemVoice(
            context,
            currentItem.name,
            currentItem.quantity,
            currentItem.amount,
            sttText.trim()
          );
          setEditItemName(result.name);
          setEditItemQty(String(result.qty));
          setEditItemAmount(result.amount.toFixed(2));
          setVoiceNormalized((prev) => ({ ...prev, [`item-${editItemIndex}`]: result.name }));
        } else if (editField) {
          const context = getFieldContext(editField, data);
          const result = await normalizeEditInput(editField, context, sttText.trim());
          setEditInput(result.normalized);
          setVoiceNormalized((prev) => ({ ...prev, [editField]: result.normalized }));
        }
      }
    } catch {
      // cancelled or failed
    } finally {
      setIsEditRecording(false);
    }
  }

  function handleDateNow() {
    const d = new Date();
    setEditDate(d.toISOString().slice(0, 10));
    setEditTime(d.toTimeString().slice(0, 5));
  }

  function handleDateApply() {
    if (!data) return;
    const iso = `${editDate}T${editTime}:00.000Z`;
    setData({ ...data, date: iso });
    setEditField(null);
    setEditDate("");
    setEditTime("");
  }

  async function handleCategoryMic() {
    if (!data || editItemIndex === null) return;
    if (editIsRecording) {
      editVoiceRef.current?.stop();
      return;
    }

    setIsEditRecording(true);
    const collector = new VoiceInputCollector(async (blob) => {
      const { speechToText } = await import("@/lib/groq");
      return speechToText(blob);
    });
    editVoiceRef.current = collector;

    try {
      const sttText = await collector.collect();
      if (sttText.trim()) {
        const context = `store: ${data.store}, type: ${data.type}, payment: ${data.payment_method}`;
        const result = await normalizeEditInput("item_category", context, sttText.trim());
        setEditItemCategory(result.normalized);
        setVoiceNormalized((prev) => ({ ...prev, [`item-${editItemIndex}-category`]: result.normalized }));
      }
    } catch {
      // cancelled or failed
    } finally {
      setIsEditRecording(false);
    }
  }

  function handleUndo() {
    if (!snapshotRef.current) return;
    setData(snapshotRef.current);
    setAiRepairs({});
    setFlashField(null);
    setVoiceNormalized({});
    setIsEditing(false);
    setEditField(null);
    setEditInput("");
    setEditItemIndex(null);
    setEditItemName("");
    setEditItemQty("");
    setEditItemAmount("");
    setEditItemCategory("");
    setEditDate("");
    setEditTime("");
  }

  function handleSaveEdit() {
    setIsEditing(false);
    setEditField(null);
    setEditInput("");
    setEditItemIndex(null);
    setEditItemName("");
    setEditItemQty("");
    setEditItemAmount("");
    setEditItemCategory("");
    setEditDate("");
    setEditTime("");
  }

  const inputEnabled = isIdle || phase === "saved";

  return (
    <div className="relative flex flex-1 flex-col bg-zinc-50 dark:bg-[#0b141a]">
      {/* Persistent hidden inputs (rendered once) */}
      <input ref={camRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleImageFile} />
      <input ref={uploadRef} type="file" accept="image/*" className="hidden" onChange={handleImageFile} />

      {/* ── Layer A: Centered Logo + Tips + Input (idle) ── */}
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center transition-all duration-200 ease-out ${
          isIdle ? "opacity-100 z-10" : "opacity-0 z-0 pointer-events-none"
        }`}
      >
        <div className="mx-auto flex w-full max-w-sm flex-col items-center px-6">
          <h1 className="font-brand text-5xl tracking-wide text-[var(--brand)]">
            JokoPay
          </h1>
          <p className="mt-4 text-center text-sm leading-relaxed text-zinc-400">
            {currentTip}
          </p>
          <div className="mt-10 w-full">
            {renderInputBar({
              camRef,
              uploadRef,
              topInput,
              setTopInput,
              handleTopKeyDown,
              handleTopMic,
              isRecording,
              inputEnabled,
              phase,
              onCameraClick: () => camRef.current?.click(),
              onUploadClick: () => uploadRef.current?.click(),
            })}
          </div>
        </div>
      </div>

      {/* ── Layer B: Content + Bottom Input (active phases) ── */}
      <div
        className={`absolute inset-0 flex flex-col transition-all duration-200 ease-out ${
          isIdle ? "opacity-0 z-0 pointer-events-none" : "opacity-100 z-10"
        }`}
      >
        {/* Scrollable Content Area */}
        <div className="flex-1 overflow-y-auto px-6 py-8">
          <div className="mx-auto max-w-lg space-y-6">
            {phase === "processing" && (
              <div className="space-y-4">
                {procImage && (
                  <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-700">
                    <img src={procImage} alt="Captured" className="max-h-64 w-full object-contain" />
                  </div>
                )}
                {procText && !procImage && (
                  <div className="rounded-lg bg-zinc-100 p-4 font-mono text-sm dark:bg-zinc-800">
                    {procText}
                  </div>
                )}
                <div className="flex items-center justify-center gap-2 text-sm text-zinc-500">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-300 border-t-[var(--brand)]" />
                  Processing&hellip;
                </div>
              </div>
            )}

            {phase === "receipt" && data && (
              <ReceiptCard
                data={data}
                isEditing={isEditing}
                editField={editField}
                editItemIndex={editItemIndex}
                aiRepairs={aiRepairs}
                typeLockMsg={typeLockMsg}
                totalLockMsg={totalLockMsg}
                flashField={flashField}
                onFieldClick={handleFieldClick}
                onItemClick={handleItemClick}
                onAddItem={handleAddItem}
              />
            )}

            {phase === "missing_fields" && data && (
              <div className="space-y-6">
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                  <p className="mb-2 text-sm font-semibold text-amber-800 dark:text-amber-300">⚠ Missing information</p>
                  <ul className="list-inside list-disc space-y-1 text-sm text-amber-700 dark:text-amber-400">
                    {data.missing_fields.map((f) => (
                      <li key={f}>{f.replace(/_/g, " ")}</li>
                    ))}
                  </ul>
                  <div className="mt-3 border-t border-amber-200 pt-3 dark:border-amber-700">
                    <p className="mb-1 text-xs font-medium text-amber-600 dark:text-amber-400">Partially detected:</p>
                    <div className="space-y-0.5 font-mono text-xs text-amber-700 dark:text-amber-300">
                      {data.store && <div>Store: {data.store}</div>}
                      {data.type && <div>Type: {data.type}</div>}
                      {data.payment_method && <div>Payment: {data.payment_method}</div>}
                      {data.total !== null && <div>Total: RM {Number(data.total).toFixed(2)}</div>}
                      {data.items.length > 0 && <div>Items: {data.items.length} item(s)</div>}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex justify-center">
                    <button
                      onClick={handleMissingMic}
                      className={`flex h-14 w-14 items-center justify-center rounded-full text-white shadow-md transition ${
                        isMissingRecording
                          ? "bg-red-500 animate-pulse"
                          : "bg-[var(--brand)] hover:bg-[var(--brand-dark)]"
                      }`}
                      title={isMissingRecording ? "Stop recording" : "Provide via voice note"}
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-7 w-7">
                        <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                        <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 10Z" />
                      </svg>
                    </button>
                  </div>
                  <p className="text-center text-sm text-zinc-400">Or use manual text input below</p>
                  <div className="flex justify-center">
                    <input
                      type="text"
                      value={missingInput}
                      onChange={(e) => setMissingInput(e.target.value)}
                      onKeyDown={handleMissingKeyDown}
                      placeholder="Type the missing details..."
                      className="w-full max-w-md rounded-full border border-zinc-300 px-6 py-3 text-center text-base outline-none transition placeholder:text-zinc-400 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/30 dark:border-zinc-600 dark:bg-[#2a3942] dark:text-white dark:placeholder:text-zinc-500"
                    />
                  </div>
                  <div className="flex justify-center pt-2">
                    <button
                      onClick={handleCancel}
                      className="rounded-lg border border-zinc-300 px-5 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            )}

            {phase === "saved" && data && (
              <div className="space-y-4">
                <ReceiptCard
                  data={data}
                  isEditing={false}
                  editField={null}
                  editItemIndex={null}
                  aiRepairs={{}}
                  typeLockMsg={false}
                  totalLockMsg={false}
                  flashField={null}
                  onFieldClick={() => {}}
                  onItemClick={() => {}}
                />
                <div className="flex justify-center">
                  <button
                    onClick={reset}
                    className="rounded-lg bg-[var(--brand)] px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)]"
                  >
                    New Transaction
                  </button>
                </div>
              </div>
            )}

            {phase === "error" && (
              <div className="space-y-4">
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 dark:border-red-800 dark:bg-red-900/20">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300">❌ Error</p>
                  <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-red-600 dark:text-red-400">{errMsg}</pre>
                </div>
                <div className="flex justify-center">
                  <button
                    onClick={reset}
                    className="rounded-lg border border-zinc-300 px-6 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Action Bar (receipt phase only) ── */}
        {phase === "receipt" && (
          <div className="border-t border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-[#111b21]">
            <div className="mx-auto max-w-sm space-y-3">
              {editItemIndex !== null ? (
                <div className="space-y-3">
                    <input
                      type="text"
                      value={editItemName}
                      onChange={(e) => setEditItemName(e.target.value)}
                      placeholder={data!.items[editItemIndex]?.name || "Item name"}
                      disabled={editLoading}
                      className="w-full rounded-full border border-zinc-300 px-4 py-2 text-center text-sm outline-none transition placeholder:text-zinc-400 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/30 dark:border-zinc-600 dark:bg-[#2a3942] dark:text-white dark:placeholder:text-zinc-500"
                    />
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-400">Qty</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editItemQty}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, "");
                          if (v !== "") setEditItemQty(v);
                        }}
                        placeholder="1"
                        disabled={editLoading}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-right text-sm outline-none transition placeholder:text-zinc-400 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/30 dark:border-zinc-600 dark:bg-[#2a3942] dark:text-white dark:placeholder:text-zinc-500"
                      />
                    </div>
                    <div className="flex-[2]">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-400">Amount (RM)</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editItemAmount}
                        onKeyDown={(e) => {
                          if (e.key === "Backspace") {
                            e.preventDefault();
                            setEditItemAmount((prev) => handleAmountKey("Backspace", prev));
                          }
                        }}
                        onChange={(e) => {
                          const digit = e.target.value.slice(-1);
                          if (/^[0-9]$/.test(digit)) {
                            setEditItemAmount((prev) => handleAmountKey(digit, prev));
                          }
                        }}
                        placeholder="0.00"
                        disabled={editLoading}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-right text-sm outline-none transition placeholder:text-zinc-400 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/30 dark:border-zinc-600 dark:bg-[#2a3942] dark:text-white dark:placeholder:text-zinc-500"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-400">Category</label>
                      <input
                        type="text"
                        value={editItemCategory}
                        onChange={(e) => setEditItemCategory(e.target.value)}
                        placeholder={data!.items[editItemIndex]?.category || "Category (optional)"}
                        disabled={editLoading}
                        className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition placeholder:text-zinc-400 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/30 dark:border-zinc-600 dark:bg-[#2a3942] dark:text-white dark:placeholder:text-zinc-500"
                      />
                    </div>
                    {!editLoading && (
                      <button
                        onClick={handleCategoryMic}
                        className={`mt-5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white transition ${
                          editIsRecording
                            ? "bg-red-500 animate-pulse"
                            : "bg-[var(--brand)] hover:bg-[var(--brand-dark)]"
                        }`}
                        title={editIsRecording ? "Stop recording" : "Voice category"}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                          <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                          <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 10Z" />
                        </svg>
                      </button>
                    )}
                  </div>
                  {editItemIndex !== null && aiRepairs[`item-${editItemIndex}`] && (
                    <button
                      onClick={() => handleRevert(`item-${editItemIndex}`)}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      Revert name to &ldquo;{aiRepairs[`item-${editItemIndex}`].input}&rdquo;
                    </button>
                  )}
                  {editItemIndex !== null && aiRepairs[`item-${editItemIndex}-category`] && (
                    <button
                      onClick={() => handleRevert(`item-${editItemIndex}-category`)}
                      className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      Revert category to &ldquo;{aiRepairs[`item-${editItemIndex}-category`].input}&rdquo;
                    </button>
                  )}
                  <div className="flex justify-center gap-2">
                    <button
                      onClick={() => { setEditItemIndex(null); setEditItemName(""); setEditItemQty(""); setEditItemAmount(""); setEditItemCategory(""); }}
                      className="rounded-lg border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                    >
                      Back
                    </button>
                    {data && editItemIndex < data.items.length && (
                      <button
                        onClick={handleItemDelete}
                        className="rounded-lg border border-red-300 px-4 py-1.5 text-xs font-medium text-red-500 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                      >
                        Delete
                      </button>
                    )}
                    <button
                      onClick={() => handleEditSubmit("")}
                      disabled={editLoading}
                      className="rounded-lg bg-[var(--brand)] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-50"
                    >
                      {editLoading ? "Processing..." : "Apply"}
                    </button>
                  </div>
                </div>
              ) : editField ? (
                <div className="space-y-3">
                  {editField === "date" ? (
                    <>
                      <div className="flex items-end gap-3">
                        <div className="flex-1">
                          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-400">Date</label>
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/30 dark:border-zinc-600 dark:bg-[#2a3942] dark:text-white"
                          />
                        </div>
                        <div className="flex-1">
                          <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-zinc-400">Time</label>
                          <input
                            type="time"
                            value={editTime}
                            onChange={(e) => setEditTime(e.target.value)}
                            className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none transition focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/30 dark:border-zinc-600 dark:bg-[#2a3942] dark:text-white"
                          />
                        </div>
                      </div>
                      <div className="flex justify-center">
                        <button
                          onClick={handleDateNow}
                          className="rounded-lg border border-[var(--brand)] px-4 py-2 text-xs font-semibold text-[var(--brand)] transition hover:bg-[var(--brand)]/10"
                        >
                          Now
                        </button>
                      </div>
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => { setEditField(null); setEditDate(""); setEditTime(""); }}
                          className="rounded-lg border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                          Back
                        </button>
                        <button
                          onClick={handleDateApply}
                          className="rounded-lg bg-[var(--brand)] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-dark)]"
                        >
                          Apply
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {aiRepairs[editField] && (
                        <button
                          onClick={() => handleRevert(editField)}
                          className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-xs text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                          Revert &ldquo;{aiRepairs[editField].aiValue}&rdquo; to &ldquo;{aiRepairs[editField].input}&rdquo;
                        </button>
                      )}
                      <div className="flex items-center justify-center gap-4">
                        {!editLoading && (
                          <button
                            onClick={handleEditMic}
                            className={`flex h-12 w-12 items-center justify-center rounded-full text-white shadow-md transition ${
                              editIsRecording
                                ? "bg-red-500 animate-pulse"
                                : "bg-[var(--brand)] hover:bg-[var(--brand-dark)]"
                            }`}
                            title={editIsRecording ? "Stop recording" : "Voice note"}
                          >
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                              <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                              <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 10Z" />
                            </svg>
                          </button>
                        )}
                        <div className="flex-1">
                          <input
                            type="text"
                            value={editInput}
                            onChange={(e) => setEditInput(e.target.value)}
                            onKeyDown={handleEditKeyDown}
                            placeholder={editField ? String(data?.[editField as keyof TransactionData] ?? "") : "Edit value..."}
                            disabled={editLoading}
                            className="w-full rounded-full border border-zinc-300 px-5 py-2.5 text-center text-sm outline-none transition placeholder:text-zinc-400 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/30 disabled:opacity-50 dark:border-zinc-600 dark:bg-[#2a3942] dark:text-white dark:placeholder:text-zinc-500"
                          />
                        </div>
                      </div>
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => { setEditField(null); setEditInput(""); }}
                          className="rounded-lg border border-zinc-300 px-4 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                        >
                          Back
                        </button>
                        <button
                          onClick={() => handleEditSubmit(editInput)}
                          disabled={editLoading}
                          className="rounded-lg bg-[var(--brand)] px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-[var(--brand-dark)] disabled:opacity-50"
                        >
                          {editLoading ? "Processing..." : "Apply"}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ) : isEditing ? (
                <div className="space-y-2">
                  <button
                    onClick={handleSaveEdit}
                    className="flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)]"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
                      <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                    </svg>
                    Save edit
                  </button>
                  <button
                    onClick={handleUndo}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
                      <polyline points="1 4 1 10 7 10" />
                      <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
                    </svg>
                    Undo all
                  </button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <button
                    onClick={handleConfirm}
                    className="flex-1 rounded-lg bg-[var(--brand)] px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-[var(--brand-dark)]"
                  >
                    Confirm &#10003;
                  </button>
                  <button
                    onClick={handleCancel}
                    className="flex-1 rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-zinc-800"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleEdit}
                    className="flex items-center justify-center gap-1 rounded-lg border border-orange-300 px-3 py-2.5 text-sm font-medium text-orange-600 transition hover:bg-orange-50 dark:border-orange-700 dark:text-orange-400 dark:hover:bg-orange-900/20"
                    title="Edit"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                      <path d="M21.731 2.269a2.625 2.625 0 00-3.712 0l-1.157 1.157 3.712 3.712 1.157-1.157a2.625 2.625 0 000-3.712zM19.513 8.199l-3.712-3.712-12.15 12.15a5.25 5.25 0 00-1.32 2.214l-.8 2.685a.75.75 0 00.933.933l2.685-.8a5.25 5.25 0 002.214-1.32L19.513 8.2z" />
                    </svg>
                    Edit
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Bottom Input Bar */}
        {(phase !== "receipt" || !isEditing) && (
          <div className="border-t border-zinc-200 bg-white px-6 pb-4 pt-6 dark:border-zinc-800 dark:bg-[#111b21]">
            <div className="mx-auto max-w-lg">
              {renderInputBar({
                camRef,
                uploadRef,
                topInput,
                setTopInput,
                handleTopKeyDown,
                handleTopMic,
                isRecording,
                inputEnabled,
                phase,
                onCameraClick: () => camRef.current?.click(),
                onUploadClick: () => uploadRef.current?.click(),
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ───────── helpers ───────── */

function renderInputBar({
  camRef,
  uploadRef,
  topInput,
  setTopInput,
  handleTopKeyDown,
  handleTopMic,
  isRecording,
  inputEnabled,
  onCameraClick,
  onUploadClick,
}: {
  camRef: React.RefObject<HTMLInputElement | null>;
  uploadRef: React.RefObject<HTMLInputElement | null>;
  topInput: string;
  setTopInput: (v: string) => void;
  handleTopKeyDown: (e: React.KeyboardEvent) => void;
  handleTopMic: () => void;
  isRecording: boolean;
  inputEnabled: boolean;
  phase: string;
  onCameraClick: () => void;
  onUploadClick: () => void;
}) {
  return (
    <>
      <div className="flex justify-center gap-5">
        <button
          onClick={onCameraClick}
          disabled={!inputEnabled}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-md transition hover:bg-[var(--brand-dark)] disabled:opacity-30"
          title="Take a picture"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
            <path d="M12 9a3.75 3.75 0 1 0 0 7.5A3.75 3.75 0 0 0 12 9Z" />
            <path fillRule="evenodd" d="M9.344 3.071a49.52 49.52 0 0 1 5.312 0c.967.052 1.83.585 2.332 1.39l.821 1.317c.24.383.645.643 1.11.71.386.054.77.113 1.152.177 1.432.239 2.429 1.493 2.429 2.909V18a3 3 0 0 1-3 3H4.5a3 3 0 0 1-3-3V9.574c0-1.416.997-2.67 2.429-2.909.382-.064.766-.123 1.151-.178a1.56 1.56 0 0 0 1.11-.71l.822-1.315a2.942 2.942 0 0 1 2.332-1.39ZM6.75 12.75a5.25 5.25 0 1 1 10.5 0 5.25 5.25 0 0 1-10.5 0Zm12-1.5a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={onUploadClick}
          disabled={!inputEnabled}
          className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--brand)] text-white shadow-md transition hover:bg-[var(--brand-dark)] disabled:opacity-30"
          title="Upload image"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
            <path fillRule="evenodd" d="M1.5 6a2.25 2.25 0 0 1 2.25-2.25h16.5A2.25 2.25 0 0 1 22.5 6v12a2.25 2.25 0 0 1-2.25 2.25H3.75A2.25 2.25 0 0 1 1.5 18V6ZM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0 0 21 18v-1.94l-2.69-2.689a1.5 1.5 0 0 0-2.12 0l-.88.879.97.97a.75.75 0 1 1-1.06 1.06l-5.16-5.159a1.5 1.5 0 0 0-2.12 0L3 16.061Zm10.125-7.81a1.125 1.125 0 1 1 2.25 0 1.125 1.125 0 0 1-2.25 0Z" clipRule="evenodd" />
          </svg>
        </button>
        <button
          onClick={handleTopMic}
          disabled={!inputEnabled}
          className={`flex h-16 w-16 items-center justify-center rounded-full text-white shadow-md transition disabled:opacity-30 ${
            isRecording ? "bg-red-500 animate-pulse" : "bg-[var(--brand)] hover:bg-[var(--brand-dark)]"
          }`}
          title={isRecording ? "Stop recording" : "Voice note"}
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8">
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
            <path d="M19 10a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.93V20H8a1 1 0 1 0 0 2h8a1 1 0 1 0 0-2h-3v-3.07A7 7 0 0 0 19 10Z" />
          </svg>
        </button>
      </div>
      <p className="mt-4 text-center text-sm text-zinc-400">&hellip;or&hellip;</p>
      <div className="mt-2 flex justify-center">
        <input
          type="text"
          value={topInput}
          onChange={(e) => setTopInput(e.target.value)}
          onKeyDown={handleTopKeyDown}
          placeholder="Try with text input"
          disabled={!inputEnabled}
          className="w-full max-w-md rounded-full border border-zinc-300 px-6 py-3 text-center text-base outline-none transition placeholder:text-zinc-400 focus:border-[var(--brand)] focus:ring-2 focus:ring-[var(--brand)]/30 disabled:opacity-30 dark:border-zinc-600 dark:bg-[#2a3942] dark:text-white dark:placeholder:text-zinc-500"
        />
      </div>
    </>
  );
}

/* ───────── ReceiptCard Component ───────── */

function ReceiptCard({
  data,
  isEditing,
  editField,
  editItemIndex,
  aiRepairs,
  typeLockMsg,
  totalLockMsg,
  flashField,
  onFieldClick,
  onItemClick,
  onAddItem,
}: {
  data: TransactionData;
  isEditing: boolean;
  editField: string | null;
  editItemIndex: number | null;
  aiRepairs: Record<string, { input: string; aiValue: string }>;
  typeLockMsg: boolean;
  totalLockMsg: boolean;
  flashField: string | null;
  onFieldClick: (field: string) => void;
  onItemClick: (index: number) => void;
  onAddItem?: () => void;
}) {
  const noFieldSelected = isEditing && !editField && editItemIndex === null;

  function rowClass(key: string) {
    const base = "flex justify-between rounded-lg p-1.5 transition";
    if (!isEditing) return base;
    // Type can't be changed — no border, default cursor
    if (key === "type") return `${base} cursor-default`;
    const isActiveItem =
      key.startsWith("item-") && parseInt(key.replace("item-", ""), 10) === editItemIndex;
    const isActive = key === editField || isActiveItem;
    if (isActive || noFieldSelected) {
      return `${base} cursor-pointer border editable-border`;
    }
    return `${base} cursor-pointer border border-transparent opacity-30`;
  }

  function sparkleIcon() {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="ml-1 inline h-3 w-3 text-yellow-500 align-middle">
          <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
        </svg>
    );
  }

  const instructionText = typeLockMsg
    ? { text: "Transaction type can't be changed!", color: "text-red-500", blink: false }
    : totalLockMsg
    ? { text: "Total is auto-calculated!", color: "text-red-500", blink: false }
    : { text: "Choose what do you want to edit", color: "text-orange-500", blink: true };

  return (
    <div className="mx-auto max-w-sm rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <div className="mb-4 text-center">
        <div className="mb-1 text-3xl">🧾</div>
        <div className="font-brand text-2xl text-[var(--brand)]">JokoPay</div>
        <div className="text-xs font-semibold uppercase tracking-widest text-zinc-400">RECEIPT</div>
        {isEditing && (
          <p className={`mt-2 text-xs font-medium ${instructionText.color} ${instructionText.blink ? "animate-[edit-blink_1.5s_ease-in-out_infinite]" : ""}`}>
            {instructionText.text}
          </p>
        )}
      </div>

      <div className="border-t-2 border-dashed border-zinc-300 pt-3 dark:border-zinc-600" />

      <div className="mb-2 mt-2 space-y-1.5 font-mono text-sm">
        {data.date && (
          <div
            className={`${rowClass("date")} ${flashField === "date" ? "bg-gradient-to-r from-transparent via-orange-200/40 to-transparent bg-[length:200%_100%] animate-[flash-sweep_0.8s_ease-in-out]" : ""}`}
            onClick={() => isEditing && onFieldClick("date")}
          >
            <span className="text-zinc-400">Date</span>
            <span className="font-medium">
              {new Date(data.date).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
              &nbsp;
              {new Date(data.date).toLocaleTimeString("en-MY", { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
        )}
        {data.store && (
          <div
            className={`${rowClass("store")} ${flashField === "store" ? "bg-gradient-to-r from-transparent via-orange-200/40 to-transparent bg-[length:200%_100%] animate-[flash-sweep_0.8s_ease-in-out]" : ""}`}
            onClick={() => isEditing && onFieldClick("store")}
          >
            <span className="text-zinc-400">Store</span>
            <span className="font-medium">{data.store}{aiRepairs["store"] && sparkleIcon()}</span>
          </div>
        )}
        <div
          className={`${rowClass("type")} ${typeLockMsg ? "animate-[shake_0.4s_ease-in-out]" : ""}`}
          onClick={() => isEditing && onFieldClick("type")}
        >
          <span className="text-zinc-400">Type</span>
          <span className={`font-medium capitalize ${data.type === "expense" ? "text-red-500" : "text-green-500"}`}>
            {data.type}
          </span>
        </div>
        {data.payment_method && (
          <div
            className={`${rowClass("payment_method")} ${flashField === "payment_method" ? "bg-gradient-to-r from-transparent via-orange-200/40 to-transparent bg-[length:200%_100%] animate-[flash-sweep_0.8s_ease-in-out]" : ""}`}
            onClick={() => isEditing && onFieldClick("payment_method")}
          >
            <span className="text-zinc-400">Payment</span>
            <span className="font-medium">{data.payment_method}{aiRepairs["payment_method"] && sparkleIcon()}</span>
          </div>
        )}
      </div>

      {data.items.length > 0 && (
        <>
          <div className="border-t border-dashed border-zinc-200 dark:border-zinc-700" />
          <div className="mt-2 space-y-1 font-mono text-sm">
            {data.items.map((item, i) => {
              const itemKey = `item-${i}`;
              return (
                <div
                  key={i}
                  className={`${rowClass(itemKey)} ${flashField === itemKey ? "bg-gradient-to-r from-transparent via-orange-200/40 to-transparent bg-[length:200%_100%] animate-[flash-sweep_0.8s_ease-in-out]" : ""} ${flashField === `${itemKey}-category` ? "bg-gradient-to-r from-transparent via-orange-200/40 to-transparent bg-[length:200%_100%] animate-[flash-sweep_0.8s_ease-in-out]" : ""}`}
                  onClick={() => isEditing && onItemClick(i)}
                >
                  <span className="mr-2 truncate">
                    {item.name}{aiRepairs[itemKey] && sparkleIcon()}
                    {item.category && <span className="ml-1.5 text-[10px] text-zinc-400">({item.category})</span>}
                    {aiRepairs[`${itemKey}-category`] && sparkleIcon()}
                  </span>
                  <span className="shrink-0 text-zinc-500">
                    {item.quantity}&times;RM{Number(item.amount).toFixed(2)}
                  </span>
                </div>
              );
            })}
          </div>
          {isEditing && (
            <button
              onClick={onAddItem}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
                <path fillRule="evenodd" d="M12 3.75a.75.75 0 01.75.75v6.75h6.75a.75.75 0 010 1.5h-6.75v6.75a.75.75 0 01-1.5 0v-6.75H5.25a.75.75 0 010-1.5h6.75V4.5a.75.75 0 01.75-.75z" clipRule="evenodd" />
              </svg>
              Add item
            </button>
          )}
        </>
      )}

      {data.notes && (
        <div
          className={`mt-2 border-t border-dashed border-zinc-200 pt-2 dark:border-zinc-700 ${rowClass("notes")} ${flashField === "notes" ? "bg-gradient-to-r from-transparent via-orange-200/40 to-transparent bg-[length:200%_100%] animate-[flash-sweep_0.8s_ease-in-out]" : ""}`}
          onClick={() => isEditing && onFieldClick("notes")}
        >
          <p className="font-mono text-xs italic text-zinc-400">{data.notes}{aiRepairs["notes"] && sparkleIcon()}</p>
        </div>
      )}

      <div
        className={`mt-3 border-t-2 border-dashed border-zinc-300 pt-3 dark:border-zinc-600 ${totalLockMsg ? "animate-[shake_0.4s_ease-in-out]" : ""}`}
      >
        <div
          className={`flex justify-between font-mono text-lg font-bold ${isEditing ? "cursor-pointer rounded-lg p-1.5" : ""}`}
          onClick={() => isEditing && onFieldClick("total")}
        >
          <span>TOTAL</span>
          <span>RM {Number(data.total).toLocaleString("en", { minimumFractionDigits: 2 })}</span>
        </div>
      </div>
    </div>
  );
}
