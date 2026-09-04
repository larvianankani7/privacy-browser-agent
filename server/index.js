require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const port = 3000;

// Middleware
app.use(cors());

// High limit because screenshots are sent as base64
app.use(express.json({
  limit: '50mb'
}));

// Initialize Gemini
const genAI = new GoogleGenerativeAI(
  process.env.GEMINI_API_KEY
);

/*
  Simple validation helper.

  We don't force a complex schema here because
  Gemini already receives a strict JSON prompt.

  This just prevents obviously invalid responses
  from being returned as successful plans.
*/
function validateAgentResponse(text) {

  try {

    const cleaned = text
      .replace(/```json/g, '')
      .replace(/```/g, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    if (!parsed || typeof parsed !== 'object') {
      return {
        valid: false,
        error: 'Response is not an object'
      };
    }

    if (parsed.status === 'done') {
      return {
        valid: true,
        data: parsed
      };
    }

    /*
      New multi-step schema
    */
    if (Array.isArray(parsed.actions)) {

      return {
        valid: true,
        data: parsed
      };
    }

    /*
      Backward compatibility with old schema
    */
    if (parsed.action) {

      return {
        valid: true,
        data: parsed
      };
    }

    return {
      valid: false,
      error: 'No actions or status found'
    };

  } catch (error) {

    return {
      valid: false,
      error: error.message
    };
  }
}

app.post('/api/analyze', async (req, res) => {

  try {

    const {
      imageBase64,
      prompt
    } = req.body;

    if (!imageBase64) {

      return res.status(400).json({
        error: 'No image provided'
      });
    }

    /*
      Remove:
      data:image/png;base64,
    */
    const base64Data = imageBase64.replace(
      /^data:image\/\w+;base64,/,
      ''
    );

    const imagePart = {
      inlineData: {
        data: base64Data,
        mimeType: 'image/png'
      }
    };

    console.log(
      'Sending image to Gemini for analysis...'
    );

    /*
      Keep existing fallback strategy
    */
    const modelsToTry = [

      'gemini-3.6-flash',

      'gemini-3.5-flash',

      'gemini-3.5-flash-lite'
    ];

    let lastError = null;

    for (const modelName of modelsToTry) {

      try {

        console.log(
          `Attempting with model: ${modelName}...`
        );

        const modelConfig = {

          model: modelName,

          generationConfig: {
            responseMimeType: 'application/json'
          }
        };

        const model =
          genAI.getGenerativeModel(
            modelConfig
          );

        const result =
          await model.generateContent([

            prompt ||
              'Describe what is on this screen and what the user can do next.',

            imagePart
          ]);

        const response =
          await result.response;

        const text =
          response.text();

        /*
          Validate Gemini response
        */
        const validation =
          validateAgentResponse(text);

        if (!validation.valid) {

          console.warn(
            `Invalid JSON structure from ${modelName}:`,
            validation.error
          );

          throw new Error(
            `Invalid agent response: ${validation.error}`
          );
        }

        console.log(
          `Success! Received valid response from ${modelName}`
        );

        /*
          Return normalized JSON string.

          Background.js can continue using
          JSON.parse(data.result)
        */
        return res.json({

          success: true,

          result: JSON.stringify(
            validation.data
          )
        });

      } catch (error) {

        console.log(
          `Model ${modelName} failed:`,
          error.message
        );

        lastError = error;
      }
    }

    throw lastError;

  } catch (error) {

    console.error(
      'Error processing request:',
      error
    );

    res.status(500).json({
      error: 'Failed to analyze image',
      details: error.message
    });
  }
});

app.listen(port, () => {

  console.log(
    `SIH Vision Agent Server running at http://localhost:${port}`
  );

  console.log(
    'Ensure GEMINI_API_KEY is set in your .env file'
  );
});