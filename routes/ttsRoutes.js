import express from 'express';
import axios from 'axios';

const router = express.Router();

// ─── Sarvam AI config ──────────────────────────────────────────────────────
const SARVAM_API_KEY   = process.env.SARVAM_API_KEY || 'sk_awpl39vs_6aFXGZaqedfDLvXZ00uUhXGM';
const SARVAM_TTS_URL   = 'https://api.sarvam.ai/text-to-speech';
const SARVAM_TRANS_URL = 'https://api.sarvam.ai/translate';

// Language code → Sarvam codes + recommended speaker
const LANG_CONFIG = {
  'en': { sarvamCode: 'en-IN', speaker: 'shubh'  },
  'hi': { sarvamCode: 'hi-IN', speaker: 'kabir'  },
  'te': { sarvamCode: 'te-IN', speaker: 'gokul'  },
  'ta': { sarvamCode: 'ta-IN', speaker: 'mani'   },
  'kn': { sarvamCode: 'kn-IN', speaker: 'vijay'  },
  'ml': { sarvamCode: 'ml-IN', speaker: 'roopa'  },
  'bn': { sarvamCode: 'bn-IN', speaker: 'rahul'  },
  'mr': { sarvamCode: 'mr-IN', speaker: 'anand'  },
  'gu': { sarvamCode: 'gu-IN', speaker: 'sunny'  },
  'pa': { sarvamCode: 'pa-IN', speaker: 'rehan'  },
  'or': { sarvamCode: 'od-IN', speaker: 'shubh'  },
};

// ─── Helper: call Sarvam Translate ─────────────────────────────────────────
async function translateText(text, targetLangCode) {
  // English stays as-is
  if (targetLangCode === 'en') return text;

  const config = LANG_CONFIG[targetLangCode] || LANG_CONFIG['en'];

  // Sarvam translate supports max ~1000 chars per call, so chunk if needed 
  const MAX_CHUNK = 900;
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    chunks.push(text.substring(i, i + MAX_CHUNK));
  }

  const translatedChunks = [];
  for (const chunk of chunks) {
    const response = await axios.post(SARVAM_TRANS_URL, {
      input: chunk,
      source_language_code: 'en-IN',
      target_language_code: config.sarvamCode,
      model: 'sarvam-translate:v1',
      mode: 'formal',
    }, {
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    });
    translatedChunks.push(response.data.translated_text || chunk);
  }

  return translatedChunks.join(' ');
}

// ─── POST /api/tts/translate ─────────────────────────────────────────────
/**
 * @desc    Translate a single English text to a target Indian language
 * @body    { text: string, targetLangCode: string }
 * @returns { success: bool, translatedText: string }
 */
router.post('/translate', async (req, res) => {
  try {
    const { text, targetLangCode = 'en' } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Text is required.' });
    }

    console.log(`[TRANSLATE] Translating ${text.length} chars to ${targetLangCode}`);

    const translatedText = await translateText(text.trim(), targetLangCode);

    res.json({
      success: true,
      translatedText,
      targetLangCode,
      sarvamCode: (LANG_CONFIG[targetLangCode] || LANG_CONFIG['en']).sarvamCode,
    });

  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message || 'Translation failed';
    console.error('[TRANSLATE] Error:', errMsg);
    res.status(error.response?.status || 500).json({ success: false, error: errMsg });
  }
});

// ─── POST /api/tts/translate-batch ───────────────────────────────────────
/**
 * @desc    Translate an array of English strings to a target language in parallel
 * @body    { texts: string[], targetLangCode: string }
 * @returns { success: bool, translatedTexts: string[] }
 */
router.post('/translate-batch', async (req, res) => {
  try {
    const { texts, targetLangCode = 'en' } = req.body;

    if (!Array.isArray(texts) || texts.length === 0) {
      return res.status(400).json({ success: false, error: 'texts array is required.' });
    }

    console.log(`[TRANSLATE-BATCH] Translating ${texts.length} strings to ${targetLangCode}`);

    // Translate all strings in parallel (capped for rate limit safety)
    const CONCURRENCY = 3;
    const results = new Array(texts.length).fill('');
    
    for (let i = 0; i < texts.length; i += CONCURRENCY) {
      const batch = texts.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (text, batchIdx) => {
          if (!text || text.trim().length === 0) return text;
          try {
            return await translateText(text.trim(), targetLangCode);
          } catch (e) {
            console.error(`[TRANSLATE-BATCH] Failed item ${i + batchIdx}:`, e.message);
            return text; // Fallback to English on failure
          }
        })
      );
      batchResults.forEach((r, j) => { results[i + j] = r; });
    }

    res.json({ success: true, translatedTexts: results, targetLangCode });

  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message || 'Batch translation failed';
    console.error('[TRANSLATE-BATCH] Error:', errMsg);
    res.status(500).json({ success: false, error: errMsg });
  }
});

// ─── POST /api/tts/synthesize ─────────────────────────────────────────────
/**
 * @desc    Convert (already-translated) text to speech audio via Sarvam AI
 * @body    { text: string, languageCode: string, pace?: number }
 * @returns { success: bool, audioBase64: string, requestId: string }
 */
router.post('/synthesize', async (req, res) => {
  try {
    const { text, languageCode = 'en', pace = 1.0 } = req.body;

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Text is required.' });
    }

    // Truncate to Sarvam v3 limit (2500 chars)
    const trimmedText = text.trim().substring(0, 2500);
    const config = LANG_CONFIG[languageCode] || LANG_CONFIG['en'];

    console.log(`[TTS] Synthesizing ${trimmedText.length} chars in ${config.sarvamCode} with speaker ${config.speaker}`);

    let response;
    try {
      response = await axios.post(SARVAM_TTS_URL, {
        text: trimmedText,
        target_language_code: config.sarvamCode,
        speaker: config.speaker,
        model: 'bulbul:v3',
        pace: Math.max(0.5, Math.min(2.0, pace)),
        speech_sample_rate: 22050,
        enable_preprocessing: true,
      }, {
        headers: {
          'api-subscription-key': SARVAM_API_KEY,
          'Content-Type': 'application/json',
        },
        timeout: 30000,
      });
    } catch (axiosError) {
      const errData = axiosError.response?.data;
      console.error('[TTS] Sarvam API error:', errData || axiosError.message);
      return res.status(axiosError.response?.status || 500).json({
        success: false,
        error: errData?.error?.message || axiosError.message || 'Sarvam TTS API error',
        code: errData?.error?.code,
      });
    }

    const data = response.data;

    if (!data.audios || data.audios.length === 0) {
      return res.status(500).json({ success: false, error: 'No audio returned by Sarvam API.' });
    }

    const audioBase64 = data.audios.join('');

    res.json({
      success: true,
      audioBase64,
      requestId: data.request_id,
      languageCode: config.sarvamCode,
      speaker: config.speaker,
    });

  } catch (error) {
    console.error('[TTS] Route error:', error);
    res.status(500).json({ success: false, error: error.message || 'Internal server error' });
  }
});

// ─── GET /api/tts/languages ───────────────────────────────────────────────
router.get('/languages', (req, res) => {
  const languages = [
    { code: 'te', name: 'Telugu',    nativeName: 'తెలుగు',   sarvamCode: 'te-IN' },
    { code: 'ta', name: 'Tamil',     nativeName: 'தமிழ்',    sarvamCode: 'ta-IN' },
    { code: 'hi', name: 'Hindi',     nativeName: 'हिंदी',     sarvamCode: 'hi-IN' },
    { code: 'kn', name: 'Kannada',   nativeName: 'ಕನ್ನಡ',    sarvamCode: 'kn-IN' },
    { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം',   sarvamCode: 'ml-IN' },
    { code: 'en', name: 'English',   nativeName: 'English',  sarvamCode: 'en-IN' },
  ];
  res.json({ success: true, languages });
});

export default router;
