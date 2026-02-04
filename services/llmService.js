import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

class LLMService {
    constructor() {
        // Initialize Gemini client with @google/genai
        const apiKey = process.env.GEMINI_API_KEY || '';
        if (!apiKey) {
            console.warn('⚠️  Warning: GEMINI_API_KEY not found in environment variables');
        } else {
            console.log('✓ Gemini API Key loaded');
        }

        this.ai = new GoogleGenAI(apiKey);
        this.modelName = 'gemini-2.5-flash';
        console.log(`✓ Gemini AI initialized with model: ${this.modelName}`);
    }

    /**
     * Generate crop disease advice using Gemini AI
     * @param {Object} diseaseData - { crop, disease, severity, confidence }
     * @returns {Promise<Object>} - Structured advice object
     */
    async generateCropAdvice(diseaseData) {
        const { crop, disease, severity, confidence } = diseaseData;

        // Create the prompt
        const prompt = `You are an expert agricultural advisor. A farmer has a ${crop} plant infected with ${disease}. The severity is ${severity} and detection confidence is ${(confidence * 100).toFixed(0)}%.

Provide concise, practical advice in the following exact format (keep each point to one short sentence):

CAUSE: [State the primary cause in simple terms]

SYMPTOMS: [List 2-3 visible signs]

IMMEDIATE: [One quick action to stop the spread]

CHEMICAL: [One common pesticide/fungicide with dosage]

ORGANIC: [One natural remedy]

PREVENTION: [One simple tip to avoid future occurrence]

Keep the language simple and practical for farmers. Focus on actionable advice. If confidence is below 60%, mention a mild caution in the IMMEDIATE step.`;

        try {
            console.log(`🤖 Generating AI advice for ${crop} - ${disease}...`);

            const response = await this.ai.models.generateContent({
                model: this.modelName,
                contents: [
                    {
                        role: "user",
                        parts: [{ text: prompt }]
                    }
                ],
            });

            const output = response.text;
            console.log('✅ AI response received successfully');

            // Parse the response
            const advice = this.parseAdviceResponse(output);

            // Add metadata
            advice.metadata = {
                crop,
                disease,
                severity,
                confidence,
                generatedAt: new Date().toISOString(),
                // source: 'gemini-ai',
                model: this.modelName
            };

            return advice;
        } catch (error) {
            console.error('❌ Error generating crop advice with Gemini API:', error.message);
            if (error.status) {
                console.error('   Status:', error.status, error.statusText);
            }

            // Throw error instead of using fallback
            throw new Error(`Failed to generate advice from Gemini AI: ${error.message}`);
        }
    }

    /**
     * Parse the LLM response into structured format
     * @param {string} text - Raw LLM response
     * @returns {Object} - Parsed advice object
     */
    parseAdviceResponse(text) {
        const advice = {
            cause: '',
            symptoms: '',
            immediate: '',
            chemical: '',
            organic: '',
            prevention: ''
        };

        try {
            // Extract each field using regex
            const causeMatch = text.match(/CAUSE:\s*(.+?)(?=\n\n|SYMPTOMS:|$)/is);
            const symptomsMatch = text.match(/SYMPTOMS:\s*(.+?)(?=\n\n|IMMEDIATE:|$)/is);
            const immediateMatch = text.match(/IMMEDIATE:\s*(.+?)(?=\n\n|CHEMICAL:|$)/is);
            const chemicalMatch = text.match(/CHEMICAL:\s*(.+?)(?=\n\n|ORGANIC:|$)/is);
            const organicMatch = text.match(/ORGANIC:\s*(.+?)(?=\n\n|PREVENTION:|$)/is);
            const preventionMatch = text.match(/PREVENTION:\s*(.+?)(?=\n\n|$)/is);

            advice.cause = causeMatch ? causeMatch[1].trim() : 'Unable to determine cause';
            advice.symptoms = symptomsMatch ? symptomsMatch[1].trim() : 'Unable to determine symptoms';
            advice.immediate = immediateMatch ? immediateMatch[1].trim() : 'Consult agricultural expert';
            advice.chemical = chemicalMatch ? chemicalMatch[1].trim() : 'Consult local agriculture office';
            advice.organic = organicMatch ? organicMatch[1].trim() : 'Neem oil spray recommended';
            advice.prevention = preventionMatch ? preventionMatch[1].trim() : 'Maintain proper plant hygiene';

        } catch (error) {
            console.error('⚠️  Error parsing advice response:', error);
            throw new Error('Failed to parse AI response');
        }

        return advice;
    }

    /**
     * Batch generate advice for multiple diseases
     * @param {Array} diseaseDataArray
     * @returns {Promise<Array>}
     */
    async generateBatchAdvice(diseaseDataArray) {
        const promises = diseaseDataArray.map(data => this.generateCropAdvice(data));
        return Promise.all(promises);
    }
}

// Export singleton instance
export default new LLMService();
