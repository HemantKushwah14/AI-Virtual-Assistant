import axios from "axios";

// Finds the first (top) YouTube video for a search query and returns its watch URL.
//
// 1. If YOUTUBE_API_KEY is set in .env, the official YouTube Data API is used (most reliable).
// 2. Otherwise the normal YouTube search page is read and the first video id is taken from it
//    (no key needed).
// Returns null if nothing is found - the caller then falls back to the search results page.

const watchUrl = (videoId) => `https://www.youtube.com/watch?v=${videoId}&autoplay=1`;

const fromDataApi = async (query) => {
  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return null;

  const { data } = await axios.get("https://www.googleapis.com/youtube/v3/search", {
    params: { part: "snippet", q: query, type: "video", maxResults: 1, key },
    timeout: 8000
  });
  const videoId = data?.items?.[0]?.id?.videoId;
  return videoId ? watchUrl(videoId) : null;
};

const fromSearchPage = async (query) => {
  const { data: html } = await axios.get("https://www.youtube.com/results", {
    // sp=EgIQAQ%3D%3D -> filter "Type: Video" (skips channels, playlists, shorts shelves)
    params: { search_query: query, sp: "EgIQAQ==" },
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9"
    },
    timeout: 8000,
    responseType: "text"
  });

  // First normal video result (ads use a different renderer, so they are skipped)
  const match =
    html.match(/"videoRenderer":\{"videoId":"([\w-]{11})"/) ||
    html.match(/"videoId":"([\w-]{11})"/);

  return match ? watchUrl(match[1]) : null;
};

const getFirstVideoUrl = async (query) => {
  if (!query) return null;

  try {
    const url = await fromDataApi(query);
    if (url) return url;
  } catch (error) {
    console.warn("YouTube Data API failed:", error.response?.status || "", error.message);
  }

  try {
    return await fromSearchPage(query);
  } catch (error) {
    console.warn("YouTube search page lookup failed:", error.message);
    return null;
  }
};

export default getFirstVideoUrl;
