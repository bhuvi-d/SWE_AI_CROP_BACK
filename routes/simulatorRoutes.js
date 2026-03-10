import express from 'express';
import llmService from '../services/llmService.js';

const router = express.Router();

/**
 * POST /api/simulator/predict
 * Micro-Climate What-If Simulator — compares no-action vs with-remediation scenarios
 *
 * @body { crop, currentConditions, forecast, actions }
 * @returns { success, data: { noAction: {...}, withRemediation: {...} } }
 */
router.post('/predict', async (req, res) => {
  try {
    const { crop, currentConditions, forecast, actions } = req.body;

    if (!crop || !forecast || !Array.isArray(forecast)) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: crop and forecast array are required',
      });
    }

    const forecastSummary = forecast
      .map(
        (d) =>
          `${d.day}: ${d.temp}°C, ${d.humidity}% humidity`
      )
      .join('; ');

    const actionsText =
      actions && actions.length > 0
        ? actions.join(', ')
        : 'None';

    const prompt = `You are an expert agricultural climate-risk analyst. A farmer grows ${crop}.

Current conditions: Temperature ${currentConditions?.temperature ?? 25}°C, Humidity ${currentConditions?.humidity ?? 60}%, Soil moisture: ${currentConditions?.soilMoisture ?? 'Normal'}.

7-day humidity/weather forecast: ${forecastSummary}

Remediation actions the farmer is considering: ${actionsText}

Provide TWO scenario analyses in the following EXACT JSON format (no markdown, no code fences, just raw JSON):

{
  "noAction": {
    "survivalRate": <number 0-100>,
    "predictedOutcome": "<one sentence describing what happens if no action is taken>",
    "rationale": "<2-3 sentences explaining why this survival rate is expected based on the forecast>"
  },
  "withRemediation": {
    "survivalRate": <number 0-100>,
    "predictedOutcome": "<one sentence describing the expected outcome with the remediation actions>",
    "rationale": "<2-3 sentences explaining how the actions improve survival>",
    "recommendedFurtherActions": ["<action 1>", "<action 2>", "<action 3>"]
  }
}

Rules:
- The noAction survival rate should be LOWER than the withRemediation rate.
- If no remediation actions are selected, still provide optimistic withRemediation numbers assuming the farmer follows your recommendedFurtherActions.
- Base your analysis on real agricultural science and the humidity forecast.
- Keep all text concise and farmer-friendly.`;

    console.log(`🌱 [Simulator] Running prediction for ${crop} with actions: ${actionsText}`);

    const rawResponse = await llmService.chatWithAI(prompt);

    // Extract JSON from response (handle possible markdown fences)
    let jsonStr = rawResponse.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    const parsed = JSON.parse(jsonStr);

    // Validate structure
    if (!parsed.noAction || !parsed.withRemediation) {
      throw new Error('AI response missing required scenario fields');
    }

    // Ensure numeric survival rates
    parsed.noAction.survivalRate = Number(parsed.noAction.survivalRate) || 40;
    parsed.withRemediation.survivalRate = Number(parsed.withRemediation.survivalRate) || 75;
    parsed.withRemediation.recommendedFurtherActions =
      parsed.withRemediation.recommendedFurtherActions || [];

    res.json({ success: true, data: parsed });
  } catch (error) {
    console.error('❌ [Simulator] Prediction error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message || 'Failed to run simulation',
    });
  }
});

export default router;
