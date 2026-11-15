/** Match the configured Windows key vocabulary inside the preview window. */
export function matchesPreviewKey(shortcut: string, event: Pick<KeyboardEvent, "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey">): boolean {
  const numPlus = /(?:^|\+)Num\+$/i.test(shortcut);
  const parts = (numPlus ? shortcut.slice(0, -4) : shortcut).split("+").filter(Boolean);
  const key = (numPlus ? "Num+" : parts.pop() ?? "").trim().toLowerCase();
  const mods = parts.map(part => part.trim().toLowerCase());
  let token = event.key === " " ? "Space" : event.key.replace(/^Arrow/, "");
  if (/^Numpad[0-9]$/.test(event.code)) token = `Num${event.code.slice(-1)}`;
  else if (event.code === "NumpadAdd") token = "Num+";
  else if (event.code === "NumpadSubtract") token = "Num-";
  else if (event.code === "NumpadDivide") token = "Num/";
  else if (event.code === "NumpadDecimal") token = "Num.";
  else if (event.code === "NumpadEnter") token = "NumEnter";
  else if (/^Key[A-Z]$/.test(event.code)) token = event.code.slice(3);
  else if (/^Digit[0-9]$/.test(event.code)) token = event.code.slice(5);
  return key === token.toLowerCase() && event.ctrlKey === mods.includes("ctrl") && event.altKey === mods.includes("alt") && event.shiftKey === mods.includes("shift") && event.metaKey === mods.includes("win");
}
