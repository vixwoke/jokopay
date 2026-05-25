import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";

  try {
    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const audio = formData.get("audio") as File | null;
      if (!audio) {
        return NextResponse.json({ error: "No audio file provided" }, { status: 400 });
      }
      const transcription = await groq.audio.transcriptions.create({
        file: audio,
        model: "whisper-large-v3",
        language: "en",
      });
      return NextResponse.json({ text: transcription.text || "" });
    }

    const body = await req.json();
    const { messages, temperature, max_tokens: maxCompletionTokens, top_p, model, image } = body;
    const max_completion_tokens = maxCompletionTokens ?? 1024;

    if (image) {
      const completion = await groq.chat.completions.create({
        model: model || "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: messages[0]?.content || "" },
              { type: "image_url", image_url: { url: `data:image/jpeg;base64,${image}` } },
            ],
          },
        ],
        temperature: temperature ?? 0.1,
        max_completion_tokens,
        top_p: top_p ?? 1,
        stream: false,
      });
      return NextResponse.json({ content: completion.choices[0]?.message?.content || "" });
    }

    const completion = await groq.chat.completions.create({
      model: model || "meta-llama/llama-4-scout-17b-16e-instruct",
      messages,
      temperature: temperature ?? 0.1,
      max_completion_tokens,
      top_p: top_p ?? 1,
      stream: false,
    });
    return NextResponse.json({ content: completion.choices[0]?.message?.content || "" });
  } catch (err) {
    console.error("Groq API error:", err);
    return NextResponse.json({ error: "Groq API request failed" }, { status: 500 });
  }
}