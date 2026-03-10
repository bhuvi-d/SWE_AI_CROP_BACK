import express from 'express';
import llmService from '../services/llmService.js';

const router = express.Router();

/**
 * POST /api/podcast/generate
 * Generate a daily AI podcast script predicting disease risks
 * based on humidity and wind forecast data.
 *
 * @body { region, crop, forecast: [{ day, temp, humidity, wind }] }
 * @returns { success, data: { title, date, script, riskLevels, weatherInsights } }
 */
router.post('/generate', async (req, res) => {
  try {
    const { region, crop, forecast } = req.body;

    if (!crop || !forecast || !Array.isArray(forecast)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: crop and forecast array are required',
      });
    }

    const regionText = region || 'your region';
    const today = new Date().toLocaleDateString('en-IN', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const forecastSummary = forecast
      .map(
        (d) =>
          `${d.day}: ${d.temp}°C, ${d.humidity}% humidity, wind ${d.wind || 'calm'} km/h`
      )
      .join('; ');

    const prompt = `You are a friendly agricultural radio host in India. Generate a daily farm podcast script for ${today} in ${regionText} about ${crop} disease risks.

7-day forecast: ${forecastSummary}

Produce the response in the following EXACT JSON format (no markdown, no code fences, raw JSON only):

{
  "title": "<catchy 5-8 word podcast episode title>",
  "script": "<FULL podcast script, 250-350 words. Include: 1) A warm greeting to farmers, 2) Today's weather summary and upcoming week overview, 3) Disease risk analysis based on humidity and wind patterns, 4) Specific actionable advice for ${crop} farmers, 5) A positive/encouraging closing. Use a conversational, warm, radio-host tone. Reference specific days from the forecast.>",
  "riskLevels": {
    "humidity": { "level": "<high|medium|low>", "explanation": "<one sentence why>" },
    "wind": { "level": "<high|medium|low>", "explanation": "<one sentence why>" },
    "disease": { "level": "<high|medium|low>", "explanation": "<one sentence about overall disease risk>" }
  },
  "weatherInsights": [
    "<key insight 1 about the forecast>",
    "<key insight 2>",
    "<key insight 3>"
  ]
}

Rules:
- Base disease risk DIRECTLY on the humidity and wind data provided.
- High humidity (>75%) increases fungal disease risk significantly.
- High wind (>20km/h) can spread bacterial/viral diseases.
- Keep the script warm, practical, and encouraging.
- Mention specific crop diseases relevant to ${crop}.`;

    console.log(`🎙️ [Podcast] Generating episode for ${crop} in ${regionText}`);

    const rawResponse = await llmService.chatWithAI(prompt);

    // Extract JSON
    let jsonStr = rawResponse.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Validate
    if (!parsed.script || !parsed.riskLevels) {
      throw new Error('AI response missing required podcast fields');
    }

    // Add metadata
    parsed.date = today;
    parsed.region = regionText;
    parsed.crop = crop;

    res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('❌ [Podcast] Generation error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to generate podcast',
    });
  }
});

export default router;
