import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isValidLocalPath } from "../electron/quick-preview-path.ts";
import { detectKind } from "../electron/quick-preview-formats.ts";

describe("Quick Preview: Format classification", () => {
  test("Images correctly identified", () => {
    assert.equal(detectKind(".png"), "image");
    assert.equal(detectKind(".jpg"), "image");
    assert.equal(detectKind(".jpeg"), "image");
    assert.equal(detectKind(".webp"), "image");
    assert.equal(detectKind(".gif"), "image");
    assert.equal(detectKind(".bmp"), "image");
    assert.equal(detectKind(".tiff"), "image");
    assert.equal(detectKind(".svg"), "image");
    assert.equal(detectKind(".PNG"), "image"); // Case-insensitive
  });

  test("PDF correctly identified", () => {
    assert.equal(detectKind(".pdf"), "pdf");
    assert.equal(detectKind(".PDF"), "pdf");
  });

  test("Text and source files correctly identified", () => {
    assert.equal(detectKind(".txt"), "text");
    assert.equal(detectKind(".md"), "text");
    assert.equal(detectKind(".ts"), "text");
    assert.equal(detectKind(".tsx"), "text");
    assert.equal(detectKind(".json"), "text");
    assert.equal(detectKind(".py"), "text");
    assert.equal(detectKind(".rs"), "text");
    assert.equal(detectKind(".log"), "text");
  });

  test("Audio files correctly identified", () => {
    assert.equal(detectKind(".mp3"), "audio");
    assert.equal(detectKind(".wav"), "audio");
    assert.equal(detectKind(".flac"), "audio");
    assert.equal(detectKind(".aac"), "audio");
  });

  test("Video files correctly identified", () => {
    assert.equal(detectKind(".mp4"), "video");
    assert.equal(detectKind(".webm"), "video");
    assert.equal(detectKind(".mkv"), "video");
  });

  test("PSD and provider-based formats are routed separately", () => {
    assert.equal(detectKind(".exe"), "unsupported");
    assert.equal(detectKind(".dll"), "unsupported");
    assert.equal(detectKind(".docx"), "document");
    assert.equal(detectKind(".psd"), "unsupported");
    assert.equal(detectKind(".zip"), "archive");
    assert.equal(detectKind(".cbz"), "archive");
    assert.equal(detectKind(".iso"), "unsupported");
    assert.equal(detectKind(""), "unsupported");
  });
});

describe("Quick Preview: Path safety validation", () => {
  test("Valid Windows absolute paths pass", () => {
    assert.ok(isValidLocalPath("C:\\Users\\User\\file.png"));
    assert.ok(isValidLocalPath("D:/Photos/vacation.jpg"));
    assert.ok(isValidLocalPath("\\\\server\\share\\document.pdf"));
  });

  test("Relative paths are rejected", () => {
    assert.ok(!isValidLocalPath("file.txt"));
    assert.ok(!isValidLocalPath("./folder/file.png"));
    assert.ok(!isValidLocalPath("../parent.md"));
  });

  test("Legal names remain usable and invalid Windows path characters are rejected", () => {
    assert.ok(isValidLocalPath("C:\\R&D; $draft`1.psd"));
    assert.ok(!isValidLocalPath("C:\\file.txt | powershell.exe"));
    assert.ok(!isValidLocalPath("C:\\file.txt:stream"));
    assert.ok(!isValidLocalPath("C:\\file.txt\""));
  });

  test("Non-string and empty inputs are rejected", () => {
    assert.ok(!isValidLocalPath(""));
    assert.ok(!isValidLocalPath(null));
    assert.ok(!isValidLocalPath(undefined));
    assert.ok(!isValidLocalPath(12345));
    assert.ok(!isValidLocalPath({}));
  });
});
