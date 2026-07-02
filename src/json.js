export function safeJsonParse(text) {
  const trimmed = stripAnsi(String(text || "")).trim();
  try {
    return JSON.parse(trimmed);
  } catch (directError) {
    const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      try {
        return JSON.parse(fenced[1]);
      } catch {
        // Try balanced extraction.
      }
    }

    const extracted = extractBalancedJson(trimmed);
    if (extracted) {
      try {
        return JSON.parse(extracted);
      } catch (error) {
        throw new Error(`Model output contained JSON-like text but it did not parse: ${error.message}`);
      }
    }

    throw new Error(`Model output did not contain parseable JSON. First output bytes:\n${trimmed.slice(0, 800) || "(empty output)"}\n\nDirect parse error: ${directError.message}`);
  }
}

function extractBalancedJson(text) {
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "{" && text[index] !== "[") continue;
    const extracted = scanBalanced(text, index);
    if (extracted) return extracted;
  }
  return null;
}

function scanBalanced(text, startIndex) {
  const stack = [];
  let inString = false;
  let escaping = false;

  for (let index = startIndex; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escaping) escaping = false;
      else if (char === "\\") escaping = true;
      else if (char === "\"") inString = false;
      continue;
    }

    if (char === "\"") {
      inString = true;
    } else if (char === "{" || char === "[") {
      stack.push(char);
    } else if (char === "}" || char === "]") {
      const expectedOpen = char === "}" ? "{" : "[";
      if (stack.at(-1) !== expectedOpen) return null;
      stack.pop();
      if (stack.length === 0) return text.slice(startIndex, index + 1);
    }
  }
  return null;
}

function stripAnsi(text) {
  return text.replace(/\u001b\[[0-9;]*m/g, "");
}

export function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "research";
}
