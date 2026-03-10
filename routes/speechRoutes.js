import express from 'express';
import multer from 'multer';
import axios from 'axios';
import FormData from 'form-data';
import llmService from '../services/llmService.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// ─── Sarvam AI config ──────────────────────────────────────────────────────
const SARVAM_API_KEY   = process.env.SARVAM_API_KEY || 'sk_awpl39vs_6aFXGZaqedfDLvXZ00uUhXGM';
const SARVAM_STT_URL   = 'https://api.sarvam.ai/speech-to-text';
const SARVAM_TTS_URL   = 'https://api.sarvam.ai/text-to-speech';
const SARVAM_TRANS_URL = 'https://api.sarvam.ai/translate';

// Language code → Sarvam BCP-47 + speaker
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

// Map from device locale (e.g. "hi_IN") to our 2-letter code
const LOCALE_TO_CODE = {
  'hi_IN': 'hi', 'hi-IN': 'hi',
  'te_IN': 'te', 'te-IN': 'te',
  'ta_IN': 'ta', 'ta-IN': 'ta',
  'kn_IN': 'kn', 'kn-IN': 'kn',
  'ml_IN': 'ml', 'ml-IN': 'ml',
  'bn_IN': 'bn', 'bn-IN': 'bn',
  'mr_IN': 'mr', 'mr-IN': 'mr',
  'gu_IN': 'gu', 'gu-IN': 'gu',
  'pa_IN': 'pa', 'pa-IN': 'pa',
  'or_IN': 'or', 'or-IN': 'or',
  'en_US': 'en', 'en_IN': 'en', 'en-IN': 'en', 'en-US': 'en',
};

function resolveCode(raw) {
  if (!raw) return 'en';
  return LOCALE_TO_CODE[raw] || raw.split(/[-_]/)[0].toLowerCase() || 'en';
}

// ─── Helper: Sarvam STT (Saaras v3) ───────────────────────────────────────
async function transcribeAudio(audioBuffer, mimeType, langCode) {
  const config = LANG_CONFIG[langCode] || LANG_CONFIG['en'];
  const form = new FormData();
  form.append('file', audioBuffer, {
    filename: 'audio.wav',
    contentType: mimeType || 'audio/wav',
  });
  form.append('model', 'saaras:v3');
  form.append('mode', 'transcribe');
  // Pass language hint only for non-English (for auto-detect on English)
  if (langCode !== 'en') {
    form.append('language_code', config.sarvamCode);
  }

  const response = await axios.post(SARVAM_STT_URL, form, {
    headers: {
      ...form.getHeaders(),
      'api-subscription-key': SARVAM_API_KEY,
    },
    timeout: 30000,
  });

  return {
    transcript: response.data.transcript || '',
    detectedLang: response.data.language_code || config.sarvamCode,
  };
}

// ─── Helper: Sarvam Translate ──────────────────────────────────────────────
async function translateText(text, targetLangCode) {
  if (targetLangCode === 'en') return text;
  const config = LANG_CONFIG[targetLangCode] || LANG_CONFIG['en'];

  const MAX_CHUNK = 900;
  const chunks = [];
  for (let i = 0; i < text.length; i += MAX_CHUNK) {
    chunks.push(text.substring(i, i + MAX_CHUNK));
  }

  const translated = [];
  for (const chunk of chunks) {
    const res = await axios.post(SARVAM_TRANS_URL, {
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
    translated.push(res.data.translated_text || chunk);
  }
  return translated.join(' ');
}

// ─── Helper: Sarvam TTS (Bulbul v3) ───────────────────────────────────────
async function synthesizeSpeech(text, langCode) {
  const config = LANG_CONFIG[langCode] || LANG_CONFIG['en'];
  const trimmed = text.trim().substring(0, 2500);

  const response = await axios.post(SARVAM_TTS_URL, {
    text: trimmed,
    target_language_code: config.sarvamCode,
    speaker: config.speaker,
    model: 'bulbul:v3',
    pace: 1.0,
    speech_sample_rate: 22050,
    enable_preprocessing: true,
  }, {
    headers: {
      'api-subscription-key': SARVAM_API_KEY,
      'Content-Type': 'application/json',
    },
    timeout: 30000,
  });

  if (!response.data.audios || response.data.audios.length === 0) {
    throw new Error('No audio returned by Sarvam TTS');
  }
  return response.data.audios.join(''); // base64 string
}

// ─── Helper: Gemini LLM agriculture answer ────────────────────────────────
async function getAgriculturalAnswer(question, replyLangCode) {
  const langNames = {
    'en': 'English', 'hi': 'Hindi', 'te': 'Telugu', 'ta': 'Tamil',
    'kn': 'Kannada', 'ml': 'Malayalam', 'bn': 'Bengali', 'mr': 'Marathi',
    'gu': 'Gujarati', 'pa': 'Punjabi', 'or': 'Odia',
  };
  const langName = langNames[replyLangCode] || 'English';

  const systemPrompt = `You are CropAID, an expert agricultural assistant for Indian farmers.
Answer ONLY agriculture-related questions: crop diseases, pest control, soil health, irrigation, fertilizers, weather effects on crops, organic farming, crop rotation, plant health, and yield improvement.
If the question is not about farming or agriculture, politely say you can only help with farming topics.
Always reply in ${langName}. Keep your answer concise (4-6 sentences), practical, and farmer-friendly.
Do not use markdown formatting. Use plain text only.`;

  const answer = await llmService.chatWithAI(question, systemPrompt);
  return answer;
}


// ═══════════════════════════════════════════════════════════════════════════
// POST /api/speech/transcribe
// Transcribes audio using Sarvam Saaras v3 STT
// Body: multipart form — field "audio" (audio file), "langCode" (optional)
// ═══════════════════════════════════════════════════════════════════════════
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file provided.' });
    }

    const rawLang = req.body.langCode || req.body.languageCode || 'en';
    const langCode = resolveCode(rawLang);

    console.log(`[STT] Transcribing ${req.file.size} bytes, lang=${langCode}`);

    const { transcript, detectedLang } = await transcribeAudio(
      req.file.buffer,
      req.file.mimetype,
      langCode
    );

    console.log(`[STT] Transcript: "${transcript}" (detected: ${detectedLang})`);

    res.json({
      success: true,
      transcript,
      detectedLang,
      langCode,
    });

  } catch (error) {
    const errMsg = error.response?.data?.error?.message || error.message || 'Transcription failed';
    console.error('[STT] Error:', errMsg);
    res.status(error.response?.status || 500).json({ success: false, error: errMsg });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// POST /api/speech/voice-chat
// Full pipeline: Audio → STT → Gemini LLM → Translate → TTS
// Body: multipart form — field "audio" (audio file), "langCode" (locale string)
// Returns: { transcript, answer, audioBase64, langCode, detectedLang }
// ═══════════════════════════════════════════════════════════════════════════
router.post('/voice-chat', upload.single('audio'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No audio file provided.' });
    }

    const rawLang  = req.body.langCode || req.body.languageCode || 'en';
    const langCode = resolveCode(rawLang);

    console.log(`[VoiceChat] Starting pipeline for lang=${langCode}, audio=${req.file.size}bytes`);

    // ── STEP 1: Speech → Text (Sarvam Saaras v3) ──────────────────────────
    let transcript = '';
    let detectedLang = langCode;
    try {
      const sttResult = await transcribeAudio(req.file.buffer, req.file.mimetype, langCode);
      transcript   = sttResult.transcript;
      detectedLang = sttResult.detectedLang;
      console.log(`[VoiceChat] STT: "${transcript}" (detected: ${detectedLang})`);
    } catch (sttError) {
      console.error('[VoiceChat] STT failed:', sttError.message);
      return res.status(502).json({
        success: false,
        error: 'Speech recognition failed. Please speak clearly and try again.',
        step: 'stt',
      });
    }

    if (!transcript || transcript.trim().length === 0) {
      return res.json({
        success: false,
        error: 'No speech detected. Please speak clearly and try again.',
        step: 'stt',
      });
    }

    // ── STEP 2: Translate transcript to English for Gemini (if non-English) ─
    let questionForLLM = transcript;
    if (langCode !== 'en') {
      try {
        // Translate FROM native TO English so Gemini understands it precisely
        const transRes = await axios.post(SARVAM_TRANS_URL, {
          input: transcript,
          source_language_code: (LANG_CONFIG[langCode] || LANG_CONFIG['en']).sarvamCode,
          target_language_code: 'en-IN',
          model: 'sarvam-translate:v1',
          mode: 'formal',
        }, {
          headers: {
            'api-subscription-key': SARVAM_API_KEY,
            'Content-Type': 'application/json',
          },
          timeout: 20000,
        });
        questionForLLM = transRes.data.translated_text || transcript;
        console.log(`[VoiceChat] Translated question: "${questionForLLM}"`);
      } catch (transErr) {
        console.warn('[VoiceChat] Translation to English failed, using raw transcript:', transErr.message);
        // Continue with original transcript — Gemini handles many Indian languages directly
        questionForLLM = transcript;
      }
    }

    // ── STEP 3: Gemini LLM — generate agriculture answer ───────────────────
    let answerInEnglish = '';
    try {
      answerInEnglish = await getAgriculturalAnswer(questionForLLM, langCode);
      console.log(`[VoiceChat] LLM answer (en): "${answerInEnglish.substring(0, 80)}..."`);
    } catch (llmError) {
      console.error('[VoiceChat] LLM failed:', llmError.message);
      return res.status(502).json({
        success: false,
        error: 'AI assistant is unavailable. Please try again.',
        step: 'llm',
        transcript,
      });
    }

    // ── STEP 4: Translate LLM answer to target language ────────────────────
    let answerInLang = answerInEnglish;
    if (langCode !== 'en') {
      try {
        answerInLang = await translateText(answerInEnglish, langCode);
        console.log(`[VoiceChat] Translated answer (${langCode}): "${answerInLang.substring(0, 60)}..."`);
      } catch (transErr) {
        console.warn('[VoiceChat] Answer translation failed, using English:', transErr.message);
        answerInLang = answerInEnglish;
      }
    }

    // ── STEP 5: TTS — synthesize the answer ────────────────────────────────
    let audioBase64 = null;
    try {
      audioBase64 = await synthesizeSpeech(answerInLang, langCode);
      console.log(`[VoiceChat] TTS complete, audio length=${audioBase64.length}`);
    } catch (ttsError) {
      console.warn('[VoiceChat] TTS failed (non-fatal):', ttsError.message);
      // Continue — return text even if audio synthesis fails
    }

    // ── Return everything ───────────────────────────────────────────────────
    res.json({
      success: true,
      transcript,          // What the user said (in their language)
      answer: answerInLang, // AI answer in user's language
      audioBase64,          // Sarvam TTS audio (base64, may be null if TTS failed)
      langCode,
      detectedLang,
    });

  } catch (error) {
    console.error('[VoiceChat] Unhandled error:', error.message);
    res.status(500).json({
      success: false,
      error: 'An unexpected error occurred. Please try again.',
    });
  }
});


// ═══════════════════════════════════════════════════════════════════════════
// POST /api/speech/text-chat
// Accepts a transcript (already captured by on-device STT) in the user's
// language, generates an agriculture LLM answer, translates it, synthesizes
// TTS audio, and returns everything.
//
// Body: { text: string, langCode: string }
// Returns: { success, answer, audioBase64, langCode }
// ═══════════════════════════════════════════════════════════════════════════
router.post('/text-chat', async (req, res) => {
  try {
    const { text, langCode: rawLang = 'en' } = req.body;
    const langCode = resolveCode(rawLang);

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'text is required.' });
    }

    console.log(`[TextChat] lang=${langCode}, text="${text.substring(0, 60)}..."`);

    // ── STEP 1: Translate user's text to English for Gemini ────────────────
    let questionForLLM = text.trim();
    if (langCode !== 'en') {
      try {
        const transRes = await axios.post(SARVAM_TRANS_URL, {
          input: questionForLLM,
          source_language_code: (LANG_CONFIG[langCode] || LANG_CONFIG['en']).sarvamCode,
          target_language_code: 'en-IN',
          model: 'sarvam-translate:v1',
          mode: 'formal',
        }, {
          headers: { 'api-subscription-key': SARVAM_API_KEY, 'Content-Type': 'application/json' },
          timeout: 20000,
        });
        questionForLLM = transRes.data.translated_text || questionForLLM;
        console.log(`[TextChat] Translated question: "${questionForLLM.substring(0, 60)}..."`);
      } catch (e) {
        console.warn('[TextChat] Translate-to-English failed:', e.message);
      }
    }

    // ── STEP 2: Gemini LLM ────────────────────────────────────────────────
    let answerInEnglish;
    try {
      answerInEnglish = await getAgriculturalAnswer(questionForLLM, langCode);
      console.log(`[TextChat] LLM answer: "${answerInEnglish.substring(0, 80)}..."`);
    } catch (e) {
      console.error('[TextChat] LLM failed:', e.message);
      return res.status(502).json({ success: false, error: 'AI assistant is unavailable. Please try again.' });
    }

    // ── STEP 3: Translate LLM answer to user's language ────────────────────
    let answerInLang = answerInEnglish;
    if (langCode !== 'en') {
      try {
        answerInLang = await translateText(answerInEnglish, langCode);
      } catch (e) {
        console.warn('[TextChat] Translate-answer failed:', e.message);
      }
    }

    // ── STEP 4: TTS ────────────────────────────────────────────────────────
    let audioBase64 = null;
    try {
      audioBase64 = await synthesizeSpeech(answerInLang, langCode);
    } catch (e) {
      console.warn('[TextChat] TTS failed (non-fatal):', e.message);
    }

    res.json({
      success: true,
      answer: answerInLang,
      audioBase64,
      langCode,
    });

  } catch (error) {
    console.error('[TextChat] Unhandled error:', error.message);
    res.status(500).json({ success: false, error: 'An unexpected error occurred. Please try again.' });
  }
});


export default router;
