export abstract class InputCollector {
  abstract collect(): Promise<string>;
}

export class TextInputCollector extends InputCollector {
  constructor(private text: string) {
    super();
  }

  async collect(): Promise<string> {
    return this.text;
  }
}

export class VoiceInputCollector extends InputCollector {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  constructor(
    private onTranscribe: (blob: Blob) => Promise<string>
  ) {
    super();
  }

  async collect(): Promise<string> {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    this.chunks = [];

    return new Promise((resolve, reject) => {
      this.mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/mp4")
          ? "audio/mp4"
          : "audio/webm",
      });

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) this.chunks.push(e.data);
      };

      this.mediaRecorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(this.chunks, { type: this.mediaRecorder?.mimeType });
        try {
          const text = await this.onTranscribe(blob);
          resolve(text);
        } catch (err) {
          reject(err);
        }
      };

      this.mediaRecorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop());
        reject(new Error("Recording failed"));
      };

      this.mediaRecorder.start();
    });
  }

  stop() {
    if (this.mediaRecorder?.state === "recording") {
      this.mediaRecorder.stop();
    }
  }
}

export class ImageInputCollector extends InputCollector {
  constructor(
    private file: File,
    private onOcr: (base64: string) => Promise<string>
  ) {
    super();
  }

  async collect(): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(",")[1];
        try {
          const text = await this.onOcr(base64);
          resolve(text);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error("Failed to read image"));
      reader.readAsDataURL(this.file);
    });
  }
}
