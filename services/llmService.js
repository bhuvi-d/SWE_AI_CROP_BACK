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
        const { crop, disease, severity, confidence, language } = diseaseData;

        // Language instruction
        const langInstructions = {
            'as': 'Provide the response in Assamese (অসমীয়া).',
            'bn': 'Provide the response in Bengali (বাংলা).',
            'gu': 'Provide the response in Gujarati (ગુજરાતી).',
            'hi': 'Provide the response in Hindi (हिंदी).',
            'kn': 'Provide the response in Kannada (ಕನ್ನಡ).',
            'ml': 'Provide the response in Malayalam (മലയാളം).',
            'mr': 'Provide the response in Marathi (मराठी).',
            'ne': 'Provide the response in Nepali (नेपाली).',
            'or': 'Provide the response in Odia (ଓଡ଼ିଆ).',
            'pa': 'Provide the response in Punjabi (ਪੰਜਾਬੀ).',
            'sa': 'Provide the response in Sanskrit (संस्कृतम्).',
            'ta': 'Provide the response in Tamil (தமிழ்).',
            'te': 'Provide the response in Telugu (తెలుగు).',
            'ur': 'Provide the response in Urdu (اردو).',
            'en': 'Provide the response in English.'
        };
        const langInstruction = langInstructions[language] || langInstructions['en'];

        // Create the prompt — enhanced with recovery timeline and prevention checklist
        const prompt = `You are an expert agricultural advisor. A farmer has a ${crop} plant infected with ${disease}. The severity is ${severity} and detection confidence is ${(confidence * 100).toFixed(0)}%.
${langInstruction}

Provide concise, practical advice in the following exact format (keep each point to one short sentence):

CAUSE: [State the primary cause in simple terms]

SYMPTOMS: [List 2-3 visible signs]

IMMEDIATE: [One quick action to stop the spread]

CHEMICAL: [One common pesticide/fungicide with dosage]

ORGANIC: [One natural remedy]

PREVENTION: [One simple tip to avoid future occurrence]

RECOVERY_TIMELINE: [Provide estimated recovery times in this exact format: "Initial improvement: X-Y days | Full recovery: X-Y days | Monitoring period: X days". Use realistic agricultural timelines based on the specific disease and severity level.]

PREVENTION_CHECKLIST:
1. [First actionable prevention tip specific to ${crop} and ${disease}]
2. [Second prevention tip about soil/water management]
3. [Third prevention tip about crop rotation or spacing]
4. [Fourth prevention tip about monitoring and early detection]

Keep the language simple and practical for farmers. Focus on actionable advice. If confidence is below 60%, mention a mild caution in the IMMEDIATE step. Make PREVENTION_CHECKLIST items specific to the ${crop} crop type.`;

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
            prevention: '',
            recoveryTimeline: {
                initialDays: '3-5',
                fullRecoveryDays: '14-21',
                monitoringDays: '30',
                description: ''
            },
            preventionChecklist: []
        };

        try {
            // Extract each field using regex
            const causeMatch = text.match(/CAUSE:\s*(.+?)(?=\n\n|SYMPTOMS:|$)/is);
            const symptomsMatch = text.match(/SYMPTOMS:\s*(.+?)(?=\n\n|IMMEDIATE:|$)/is);
            const immediateMatch = text.match(/IMMEDIATE:\s*(.+?)(?=\n\n|CHEMICAL:|$)/is);
            const chemicalMatch = text.match(/CHEMICAL:\s*(.+?)(?=\n\n|ORGANIC:|$)/is);
            const organicMatch = text.match(/ORGANIC:\s*(.+?)(?=\n\n|PREVENTION:|$)/is);
            const preventionMatch = text.match(/PREVENTION:\s*(.+?)(?=\n\n|RECOVERY_TIMELINE:|$)/is);
            const recoveryMatch = text.match(/RECOVERY_TIMELINE:\s*(.+?)(?=\n\n|PREVENTION_CHECKLIST:|$)/is);
            const checklistMatch = text.match(/PREVENTION_CHECKLIST:\s*\n?([\s\S]+?)(?=\n\n|$)/i);

            advice.cause = causeMatch ? causeMatch[1].trim() : 'Unable to determine cause';
            advice.symptoms = symptomsMatch ? symptomsMatch[1].trim() : 'Unable to determine symptoms';
            advice.immediate = immediateMatch ? immediateMatch[1].trim() : 'Consult agricultural expert';
            advice.chemical = chemicalMatch ? chemicalMatch[1].trim() : 'Consult local agriculture office';
            advice.organic = organicMatch ? organicMatch[1].trim() : 'Neem oil spray recommended';
            advice.prevention = preventionMatch ? preventionMatch[1].trim() : 'Maintain proper plant hygiene';

            // Parse recovery timeline
            if (recoveryMatch) {
                const recoveryText = recoveryMatch[1].trim();
                advice.recoveryTimeline.description = recoveryText;

                const initialMatch = recoveryText.match(/Initial\s*improvement:\s*(\d+[-–]\d+|\d+)\s*days?/i);
                const fullMatch = recoveryText.match(/Full\s*recovery:\s*(\d+[-–]\d+|\d+)\s*days?/i);
                const monitoringMatch = recoveryText.match(/Monitoring\s*period:\s*(\d+[-–]\d+|\d+)\s*days?/i);

                if (initialMatch) advice.recoveryTimeline.initialDays = initialMatch[1].replace('–', '-');
                if (fullMatch) advice.recoveryTimeline.fullRecoveryDays = fullMatch[1].replace('–', '-');
                if (monitoringMatch) advice.recoveryTimeline.monitoringDays = monitoringMatch[1].replace('–', '-');
            }

            // Parse prevention checklist
            if (checklistMatch) {
                const checklistText = checklistMatch[1].trim();
                const items = checklistText.split(/\n/).map(line => {
                    // Remove numbering like "1.", "2.", "- ", "* " etc.
                    return line.replace(/^\s*[\d]+[\.\)]\s*/, '').replace(/^\s*[-*]\s*/, '').trim();
                }).filter(item => item.length > 0);
                advice.preventionChecklist = items;
            }

            // Fallback: if checklist is empty, create from the prevention field
            if (advice.preventionChecklist.length === 0 && advice.prevention) {
                advice.preventionChecklist = [advice.prevention];
            }

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

    /**
     * Dynamic chatbot conversation using Gemini
     * @param {string} message - User question
     * @returns {Promise<string>} - AI response
     */
    async chatWithAI(message, systemPrompt = "") {
        try {
            console.log(`💬 Chatting with AI: ${message.substring(0, 50)}...`);

            const prompt = systemPrompt
                ? `${systemPrompt}\n\nUser Question: ${message}`
                : message;

            const response = await this.ai.models.generateContent({
                model: this.modelName,
                contents: [{ role: "user", parts: [{ text: prompt }] }],
            });

            return response.text;
        } catch (error) {
            console.error('❌ Error in AI chat:', error.message);
            throw new Error(`Failed to get response from Gemini AI: ${error.message}`);
        }
    }
}

// Export singleton instance
export default new LLMService();
