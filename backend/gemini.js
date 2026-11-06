import axios from "axios";

const VALID_TYPES = [
  "general",
  "google-search",
  "youtube-open",
  "youtube-search",
  "youtube-play",
  "calculator-open",
  "instagram-open",
  "facebook-open",
  "weather-show",
  "get-time",
  "get-date",
  "get-day",
  "get-month"
];

// Models tried in order when one is overloaded (503), rate limited (429) or times out.
// The model in GEMINI_API_URL is always tried first.
const FALLBACK_MODELS = [
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite"
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------------------------------------------------------------------------
// 1. Quick local commands - answered instantly, no Gemini call needed.
//    Keeps "open youtube", "what time is it" etc. working even if Gemini is down.
// ---------------------------------------------------------------------------
const matchLocalCommand = (command, assistantName) => {
  let text = command.toLowerCase();
  if (assistantName) {
    text = text.replace(new RegExp(escapeRegex(assistantName.toLowerCase()), "g"), " ");
  }
  text = text.replace(/[,.!?]/g, " ").replace(/\s+/g, " ").trim();

  const say = (type, response, userInput = text) => ({ type, userInput, response });

  // ---- YouTube ----
  // Handles: "play gehra hua song on youtube", "search cricket on youtube and play
  // the 1st video on the top", "play kesariya", "youtube pe arijit songs chalao", ...
  const mentionsYoutube = /\byou ?tube\b/.test(text);
  const wantsPlay =
    /^play\b/.test(text) ||
    (mentionsYoutube && /\b(play|chalao|chala|lagao|bajao|suna|sunao)\b/.test(text));
  const wantsSearch = mentionsYoutube && /\b(search|find|dhundo|khojo)\b/.test(text);

  if (wantsPlay || wantsSearch) {
    const query = text
      // "and play the 1st/first/top video (on the top)"
      .replace(/\b(and|then|aur)?\s*(play|open|chalao|lagao)\s+(the\s+)?(1st|first|top|pehla|pehli)\s+(one|video|result)?(\s+(on|at|from)\s+(the\s+)?top)?/g, " ")
      .replace(/\b(on|in|from)\s+you ?tube\b/g, " ")
      .replace(/\byou ?tube\s+(pe|par|me|mein)\b/g, " ")
      .replace(/\byou ?tube\b/g, " ")
      .replace(/\b(please|can you|could you|that|for me|search|find|play|chalao|chala|lagao|bajao|sunao|suna|dhundo|khojo|karo|kar do)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (!query) return say("youtube-open", "Opening YouTube");
    if (wantsPlay) return say("youtube-play", `Playing ${query} on YouTube`, query);
    return say("youtube-search", `Searching ${query} on YouTube`, query);
  }

  // search on Google
  const m = text.match(/^(?:search|google)\s+(?:for\s+)?(.+?)(?:\s+(?:on|in)\s+google)?$/);
  if (m && !/youtube/.test(text)) return say("google-search", `Searching ${m[1]} on Google`, m[1]);

  // open apps / sites
  const opens = text.match(/\b(open|kholo|khol|launch|start)\b/);
  if (opens) {
    if (/youtube/.test(text)) return say("youtube-open", "Opening YouTube");
    if (/instagram|insta\b/.test(text)) return say("instagram-open", "Opening Instagram");
    if (/facebook/.test(text)) return say("facebook-open", "Opening Facebook");
    if (/calculator/.test(text)) return say("calculator-open", "Opening calculator");
    if (/google/.test(text)) return say("google-search", "Opening Google", "");
  }

  if (/\bweather\b|mausam/.test(text)) return say("weather-show", "Showing the weather");
  if (/\btime\b|kitne baje|samay/.test(text)) return say("get-time", "");
  if (/\bdate\b|tarikh|taarikh/.test(text)) return say("get-date", "");
  if (/\bwhat day\b|which day|\bday is it\b|\btoday'?s day\b|kaun sa din/.test(text)) return say("get-day", "");
  if (/\bmonth\b|mahina/.test(text)) return say("get-month", "");

  return null;
};

// ---------------------------------------------------------------------------
// 2. Gemini call with retry + model fallback
// ---------------------------------------------------------------------------
const buildUrls = (apiUrl) => {
  const match = apiUrl.match(/models\/([^:]+):/);
  const configured = match ? match[1] : null;
  const models = [configured, ...FALLBACK_MODELS].filter(
    (m, i, arr) => m && arr.indexOf(m) === i
  );
  return models.map((m) => ({
    model: m,
    url: configured ? apiUrl.replace(`models/${configured}:`, `models/${m}:`) : apiUrl
  }));
};

const isRetryable = (error) => {
  const status = error.response?.status;
  return (
    status === 503 ||
    status === 429 ||
    status === 500 ||
    status === 404 || // model name not available -> try next model
    error.code === "ECONNABORTED" ||
    /timeout/i.test(error.message || "")
  );
};

const callGemini = async (prompt) => {
  const apiUrl = process.env.GEMINI_API_URL;
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiUrl || !apiKey) {
    throw new Error("GEMINI_API_URL or GEMINI_API_KEY is missing in .env");
  }

  let lastError;
  for (const { model, url } of buildUrls(apiUrl)) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const result = await axios.post(
          url,
          {
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { responseMimeType: "application/json" }
          },
          {
            headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
            timeout: 15000
          }
        );
        const text = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error("Empty response from Gemini API");
        return text;
      } catch (error) {
        lastError = error;
        console.warn(
          `Gemini [${model}] attempt ${attempt} failed:`,
          error.response?.status || "",
          error.response?.data?.error?.message || error.message
        );
        if (!isRetryable(error)) throw error; // bad key etc. - no point retrying
        if (error.response?.status === 404) break; // go straight to next model
        if (attempt === 1) await sleep(1000);
      }
    }
  }
  throw lastError;
};

const getGeminiResponse = async (command, assistantName = "Assistant", userName = "my creator") => {
  // Fast path for common commands
  const local = matchLocalCommand(command, assistantName);
  if (local) return local;

  const prompt = `
You are a voice-enabled virtual assistant named ${assistantName}, created by ${userName}.
You are not Google.

Understand the user's command and return ONLY valid JSON with this exact structure:
{
  "type": "general",
  "userInput": "user command",
  "response": "short response"
}

Available types: ${VALID_TYPES.join(", ")}

Type meanings:
- general: factual / informational questions or anything you can answer directly (give a short answer).
- google-search: user wants to search something on Google.
- youtube-open: user just wants to open YouTube.
- youtube-search: user wants to search something on YouTube.
- youtube-play: user wants to directly play a video or song.
- calculator-open / instagram-open / facebook-open: user wants to open that app or site.
- weather-show: user wants to know the weather.
- get-time / get-date / get-day / get-month: user asks for the current time / date / day / month.

Rules:
1. Understand English and Hinglish commands.
2. "userInput" is the user's sentence with your name (${assistantName}) removed. For google-search, youtube-search and youtube-play, put ONLY the text to search for in "userInput".
3. If someone asks who created you, say ${userName}.
4. Keep "response" short and voice-friendly.
5. Do not return Markdown or code fences. Return valid JSON only.

User command: ${command}
`;

  const responseText = await callGemini(prompt);

  const cleaned = responseText
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = { type: "general", userInput: command, response: cleaned };
  }

  if (!VALID_TYPES.includes(parsed.type)) parsed.type = "general";
  if (!parsed.userInput) parsed.userInput = command;
  if (!parsed.response) parsed.response = "Sorry, I didn't get that.";

  return parsed;
};

export default getGeminiResponse;
