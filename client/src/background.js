import { env, pipeline, RawImage } from '@xenova/transformers';

env.allowLocalModels = false;

// Point to the local WASM files copied to the public folder
env.backends.onnx.wasm.wasmPaths = chrome.runtime.getURL('');

// Disable multi-threading due to Manifest V3 service worker restrictions
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;

let objectDetector = null;

// Prevent multiple agent loops from running at the same time
let agentRunning = false;

// The tab where the agent originally started
let agentTabId = null;


/* =========================================================
   AGENT STATUS
   ========================================================= */

async function updateAgentStatus(status, message = '') {

  const state = {
    running: status === 'running',
    status,
    message,
    updatedAt: Date.now()
  };

  await chrome.storage.local.set({
    agentState: state
  });

  console.log(
    `[Agent Status] ${status}: ${message}`
  );
}

async function finishAgentSuccess() {

  agentRunning = false;

  await updateAgentStatus(
    'completed',
    '✨ Task completed successfully!'
  );

  agentTabId = null;

  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: 'Vision Agent',
    message: 'Goal achieved successfully!'
  });
}

async function finishAgentError(message) {

  agentRunning = false;

  await updateAgentStatus(
    'error',
    message || 'Agent stopped because something went wrong.'
  );

  agentTabId = null;
}


/* =========================================================
   MODEL
   ========================================================= */

chrome.runtime.onInstalled.addListener(() => {

  console.log('SIH Vision Agent Installed!');

  initializeModel();
});


async function initializeModel() {

  if (!objectDetector) {

    console.log(
      "Loading Local AI Model (Transformers.js YOLOS-tiny)..."
    );

    objectDetector = await pipeline(
      'object-detection',
      'Xenova/yolos-tiny',
      {
        quantized: true
      }
    );

    console.log(
      "Model loaded successfully!"
    );
  }

  return objectDetector;
}


/* =========================================================
   MESSAGE HANDLER
   ========================================================= */

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    /*
      Popup asks to start agent
    */
    if (message.action === 'startAgentLoop') {

      if (agentRunning) {

        sendResponse({
          success: false,
          error: 'Agent is already running'
        });

        return true;
      }

      /*
        IMPORTANT:
        Capture the active tab ONCE.

        We don't repeatedly search for the active tab
        during the agent loop.
      */
      chrome.tabs.query(
        {
          active: true,
          currentWindow: true
        },
        async (tabs) => {

          if (!tabs || tabs.length === 0) {

            await finishAgentError(
              'Could not find the active browser tab.'
            );

            sendResponse({
              success: false,
              error: 'Could not find the active browser tab.'
            });

            return;
          }

          const tab = tabs[0];

          if (!tab.id) {

            await finishAgentError(
              'Could not identify the browser tab.'
            );

            sendResponse({
              success: false,
              error: 'Could not identify the browser tab.'
            });

            return;
          }

          /*
            Lock agent to this tab.
          */
          agentTabId = tab.id;

          agentRunning = true;

          await updateAgentStatus(
            'running',
            'Analyzing the page...'
          );

          /*
            Start background loop.

            We intentionally don't await this here because
            the popup must receive its response immediately.
          */
          runAgentLoop(
            agentTabId,
            message.command
          ).catch(async (error) => {

            console.error(
              '[Agent Loop] Unhandled error:',
              error
            );

            await finishAgentError(
              getFriendlyError(error)
            );
          });

          sendResponse({
            success: true
          });
        }
      );

      return true;
    }


    /*
      Popup asks for current agent state.
    */
    else if (message.action === 'getAgentStatus') {

      chrome.storage.local.get(
        ['agentState'],
        (result) => {

          sendResponse({
            success: true,
            state: result.agentState || {
              running: false,
              status: 'idle',
              message: ''
            }
          });
        }
      );

      return true;
    }


    /*
      Existing capture functionality
    */
    else if (message.action === 'captureAndRedact') {

      chrome.tabs.query(
        {
          active: true,
          currentWindow: true
        },
        (tabs) => {

          if (tabs.length > 0) {

            handleCaptureAndRedact(
              tabs[0].id,
              message.command
            ).then(sendResponse);

          } else {

            sendResponse({
              success: false,
              error: 'No active tab found.'
            });
          }
        }
      );

      return true;
    }
  }
);


/* =========================================================
   CONTENT SCRIPT CONNECTION
   ========================================================= */

async function ensureContentScript(tabId) {

  try {

    await chrome.tabs.sendMessage(
      tabId,
      {
        action: 'ping'
      }
    );

    console.log(
      '[Content Script] Already connected.'
    );

  } catch (error) {

    console.log(
      '[Content Script] Not found. Injecting content script...'
    );

    try {

      await chrome.scripting.executeScript({
        target: {
          tabId
        },
        files: [
          'src/content.js'
        ]
      });

      console.log(
        '[Content Script] Successfully injected.'
      );

    } catch (injectionError) {

      console.error(
        '[Content Script] Injection failed:',
        injectionError
      );

      throw new Error(
        'Could not connect to the webpage.'
      );
    }
  }
}


/* =========================================================
   HELPERS
   ========================================================= */

function sleep(ms) {

  return new Promise(
    resolve => setTimeout(resolve, ms)
  );
}


function hasPageNavigated(
  beforeUrl,
  afterUrl
) {

  return beforeUrl !== afterUrl;
}


/*
  Convert technical errors into simple messages
  the user can understand.
*/
function getFriendlyError(error) {

  const message =
    error?.message ||
    String(error);

  if (
    message.includes(
      'Receiving end does not exist'
    )
  ) {

    return 'The webpage connection was lost. The agent stopped.';
  }

  if (
    message.includes(
      'Could not establish connection'
    )
  ) {

    return 'The agent could not connect to the webpage.';
  }

  if (
    message.includes(
      'Failed to fetch'
    )
  ) {

    return 'Could not connect to the AI server. Make sure the backend is running.';
  }

  if (
    message.includes(
      'Server returned'
    )
  ) {

    return 'The AI server returned an error. The agent stopped.';
  }

  if (
    message.includes(
      'Could not access contents of the page'
    )
  ) {

    return 'This webpage does not allow the agent to access its contents.';
  }

  return message;
}


/* =========================================================
   MULTI-STEP PLAN EXECUTOR
   ========================================================= */

async function executeActionPlan(
  tabId,
  actions
) {

  if (
    !Array.isArray(actions) ||
    actions.length === 0
  ) {

    return {
      success: false,
      shouldReplan: true,
      error: 'No actions received'
    };
  }

  const tabBeforePlan =
    await chrome.tabs.get(tabId);

  const startingUrl =
    tabBeforePlan.url;

  console.log(
    `[Plan Executor] Executing ${actions.length} planned action(s)`
  );


  for (
    let i = 0;
    i < actions.length;
    i++
  ) {

    const action = actions[i];

    if (
      !action ||
      action.action === 'done'
    ) {

      console.log(
        '[Plan Executor] Done action found.'
      );

      return {
        success: true,
        completed: true,
        shouldReplan: false
      };
    }


    /*
      Tell popup what is currently happening.
    */
    let actionName = action.action;

    if (actionName === 'click') {

      await updateAgentStatus(
        'running',
        `Executing click on element ${action.element_id}...`
      );

    } else if (actionName === 'type') {

      await updateAgentStatus(
        'running',
        `Executing typing on element ${action.element_id}...`
      );

    } else if (actionName === 'select') {

      await updateAgentStatus(
        'running',
        `Executing dropdown selection on element ${action.element_id}...`
      );

    } else {

      await updateAgentStatus(
        'running',
        `Executing ${actionName}...`
      );
    }


    console.log(
      `[Plan Executor] Step ${i + 1}/${actions.length}:`,
      action
    );


    try {

      const result =
        await chrome.tabs.sendMessage(
          tabId,
          {
            action: 'executeAction',
            command: action
          }
        );


      console.log(
        `[Plan Executor] Step ${i + 1} result:`,
        result
      );


      if (
        !result ||
        !result.success
      ) {

        console.warn(
          '[Plan Executor] Action failed. Replanning.'
        );

        return {
          success: false,
          shouldReplan: true,
          error:
            result?.error ||
            'Action execution failed'
        };
      }


      /*
        Allow page to update.
      */
      await sleep(1000);


      /*
        Check whether the original tab still exists.
      */
      let currentTab;

      try {

        currentTab =
          await chrome.tabs.get(tabId);

      } catch (error) {

        return {
          success: false,
          shouldReplan: false,
          error:
            'The browser tab was closed while the agent was running.'
        };
      }


      /*
        Navigation occurred.

        Stop the current plan because the old marker IDs
        may no longer be valid.
      */
      if (
        hasPageNavigated(
          startingUrl,
          currentTab.url
        )
      ) {

        console.log(
          '[Plan Executor] Navigation detected. Stopping current plan.'
        );

        return {
          success: true,
          shouldReplan: true,
          reason: 'navigation'
        };
      }
    }

    catch (error) {

      console.error(
        '[Plan Executor] Execution error:',
        error
      );

      return {
        success: false,
        shouldReplan: true,
        error: getFriendlyError(error)
      };
    }
  }


  /*
    Plan completed.

    Re-observe because DOM/page state may have changed.
  */
  return {
    success: true,
    shouldReplan: true,
    reason: 'plan-finished'
  };
}


/* =========================================================
   MAIN AGENT LOOP
   ========================================================= */

async function runAgentLoop(
  tabId,
  commandText
) {

  try {

    /*
      Check whether agent was stopped externally.
    */
    if (!agentRunning) {
      return;
    }


    /*
      Get the ORIGINAL tab.

      We no longer use getActiveTab().
    */
    let tab;

    try {

      tab =
        await chrome.tabs.get(tabId);

    } catch (error) {

      await finishAgentError(
        'The browser tab was closed while the agent was running.'
      );

      return;
    }


    /*
      Make sure content.js exists.
    */
    await ensureContentScript(tabId);


    /*
      Wait for page loading.
    */
    if (
      tab.status !== 'complete'
    ) {

      await updateAgentStatus(
        'running',
        'Waiting for the webpage to finish loading...'
      );

      await sleep(2000);

      return await runAgentLoop(
        tabId,
        commandText
      );
    }


    /*
      OBSERVE
    */
    await updateAgentStatus(
      'running',
      'Analyzing the page...'
    );


    console.log(
      `[Agent Loop] Goal: ${commandText}`
    );


    const response =
      await handleCaptureAndRedact(
        tabId,
        commandText
      );


    if (
      !response ||
      !response.success
    ) {

      const friendlyMessage =
        getFriendlyError({
          message:
            response?.error ||
            'Unknown capture error'
        });

      console.error(
        '[Agent Loop] Capture/analysis error:',
        friendlyMessage
      );

      await finishAgentError(
        friendlyMessage
      );

      return;
    }


    /*
      Clean Gemini response.
    */
    let cleanedText =
      response.analysis
        .replace(
          /```json/g,
          ''
        )
        .replace(
          /```/g,
          ''
        )
        .trim();


    let planResponse;


    try {

      planResponse =
        JSON.parse(cleanedText);

    } catch (error) {

      console.error(
        '[Agent Loop] Invalid JSON from Gemini:',
        cleanedText
      );

      /*
        Instead of killing the agent immediately,
        observe again once.
      */
      await updateAgentStatus(
        'running',
        'AI response was unclear. Analyzing again...'
      );

      await sleep(1000);

      return await runAgentLoop(
        tabId,
        commandText
      );
    }


    console.log(
      '[Agent Loop] Gemini thought:',
      planResponse.thought
    );


    /*
      BACKWARD COMPATIBILITY

      If Gemini sends old single-action format,
      convert it into actions[].
    */
    if (
      !Array.isArray(
        planResponse.actions
      ) &&
      planResponse.action
    ) {

      planResponse.actions = [

        {
          action:
            planResponse.action,

          element_id:
            planResponse.element_id,

          text_to_type:
            planResponse.text_to_type,

          option_text:
            planResponse.option_text
        }
      ];
    }


    /*
      TASK COMPLETE
    */
    if (
      planResponse.status === 'done' ||

      planResponse.action === 'done' ||

      (
        Array.isArray(
          planResponse.actions
        ) &&

        planResponse.actions.length === 0 &&

        planResponse.status === 'done'
      )
    ) {

      await finishAgentSuccess();

      return;
    }


    /*
      EXECUTE PLAN
    */
    const actions =
      planResponse.actions || [];


    if (
      actions.length === 0
    ) {

      console.warn(
        '[Agent Loop] Gemini returned no executable actions.'
      );

      await updateAgentStatus(
        'running',
        'AI could not determine the next action. Analyzing again...'
      );

      await sleep(1000);

      return await runAgentLoop(
        tabId,
        commandText
      );
    }


    console.log(
      '[Agent Loop] Executing multi-step plan:',
      actions
    );


    const executionResult =
      await executeActionPlan(
        tabId,
        actions
      );


    /*
      Explicit failure.
    */
    if (
      !executionResult.success &&
      !executionResult.shouldReplan
    ) {

      await finishAgentError(
        getFriendlyError({
          message:
            executionResult.error
        })
      );

      return;
    }


    /*
      If execution failed but can recover,
      re-observe.
    */
    if (
      !executionResult.success &&
      executionResult.shouldReplan
    ) {

      await updateAgentStatus(
        'running',
        'The page changed unexpectedly. Analyzing again...'
      );

    } else {

      await updateAgentStatus(
        'running',
        'Analyzing the updated page...'
      );
    }


    await sleep(1500);


    /*
      NEXT ITERATION
    */
    return await runAgentLoop(
      tabId,
      commandText
    );

  }

  catch (error) {

    console.error(
      '[Agent Loop] Exception:',
      error
    );

    await finishAgentError(
      getFriendlyError(error)
    );
  }
}


/* =========================================================
   SCREEN CAPTURE + REDACTION
   ========================================================= */

async function handleCaptureAndRedact(
  tabId,
  userCommand
) {

  try {

    /*
      1. DOM MASKING
    */
    await chrome.tabs.sendMessage(
      tabId,
      {
        action: 'applyMasks'
      }
    );

    await sleep(150);


    /*
      2. CAPTURE
    */
    const dataUrl =
      await chrome.tabs.captureVisibleTab(
        null,
        {
          format: 'png'
        }
      );


    /*
      3. REMOVE DOM MASKS
    */
    await chrome.tabs.sendMessage(
      tabId,
      {
        action: 'removeMasks'
      }
    );


    /*
      4. DRAW IMAGE
    */
    const responseImage =
      await fetch(dataUrl);

    const blob =
      await responseImage.blob();

    const bitmap =
      await createImageBitmap(blob);


    const canvas =
      new OffscreenCanvas(
        bitmap.width,
        bitmap.height
      );


    const ctx =
      canvas.getContext(
        '2d',
        {
          willReadFrequently: true
        }
      );


    ctx.drawImage(
      bitmap,
      0,
      0
    );


    /*
      5. EXTRACT RGB PIXELS
    */
    const imageData =
      ctx.getImageData(
        0,
        0,
        canvas.width,
        canvas.height
      );


    const rgbData =
      new Uint8Array(
        canvas.width *
        canvas.height *
        3
      );


    for (
      let i = 0, j = 0;
      i < imageData.data.length;
      i += 4, j += 3
    ) {

      rgbData[j] =
        imageData.data[i];

      rgbData[j + 1] =
        imageData.data[i + 1];

      rgbData[j + 2] =
        imageData.data[i + 2];
    }


    const rawImage =
      new RawImage(
        rgbData,
        canvas.width,
        canvas.height,
        3
      );


    /*
      6. LOCAL AI REDACTION
    */
    console.log(
      'Running local AI vision model for visual redaction...'
    );


    const detector =
      await initializeModel();


    const detections =
      await detector(
        rawImage,
        {
          threshold: 0.1
        }
      );


    console.log(
      'AI Detections:',
      detections
    );


    /*
      7. DRAW REDACTIONS
    */
    ctx.fillStyle =
      'black';


    let aiRedactionsCount =
      0;


    detections.forEach(
      det => {

        if (
          det.label === 'person' ||
          det.label === 'face'
        ) {

          const {
            xmin,
            ymin,
            xmax,
            ymax
          } = det.box;


          const width =
            xmax - xmin;

          const height =
            ymax - ymin;


          ctx.fillRect(
            xmin,
            ymin,
            width,
            height
          );


          aiRedactionsCount++;
        }
      }
    );


    console.log(
      `Applied ${aiRedactionsCount} AI visual redactions.`
    );


    /*
      8. REDACTED IMAGE → BASE64
    */
    const redactedBlob =
      await canvas.convertToBlob({
        type: 'image/png'
      });


    const reader =
      new FileReader();


    const redactedDataUrl =
      await new Promise(
        resolve => {

          reader.onloadend =
            () => resolve(
              reader.result
            );

          reader.readAsDataURL(
            redactedBlob
          );
        }
      );


    /*
      9. PREVIEW
    */
    chrome.tabs.sendMessage(
      tabId,
      {
        action: 'showPreview',
        image: redactedDataUrl
      }
    ).catch(() => {});


    /*
      10. GEMINI PROMPT
    */
    const promptString =
      userCommand
        ? `
You are the planning brain of a privacy-aware autonomous browser agent.

USER GOAL:
"${userCommand}"

You are looking at the CURRENT webpage screenshot.

The webpage contains RED NUMBERED MARKERS placed over interactive elements.
You MUST use only the visible marker IDs when referring to elements.

Your task is to generate a SHORT executable plan for the current page.

AVAILABLE ACTIONS:

1. click
   - Click an interactive element.
   - Requires: element_id

2. type
   - Type text into an input or textarea.
   - Requires: element_id and text_to_type

3. select
   - Select an option from a dropdown/select element.
   - Requires: element_id and option_text

4. done
   - Use only when the user's entire goal has been achieved.

IMPORTANT RULES:

- Return ONLY valid JSON.
- Do NOT return markdown.
- Create a SHORT plan of 1 to 3 actions.
- Only plan actions that make sense based on the CURRENT visible screen.
- Do NOT invent element IDs.
- Do NOT reference elements that are not marked.
- Prefer short safe plans because the webpage can change after actions.
- If navigation or a major page change is likely after an action, do not plan unnecessary future actions beyond that point.
- If the goal is already achieved, return status "done".
- Do not expose or reason about information hidden by black redaction boxes.

RETURN FORMAT:

{
  "thought": "Short explanation of what should happen next",
  "status": "in_progress",
  "actions": [
    {
      "action": "type",
      "element_id": 1,
      "text_to_type": "example text"
    },
    {
      "action": "click",
      "element_id": 2
    }
  ]
}

FOR DROPDOWNS:

{
  "action": "select",
  "element_id": 5,
  "option_text": "Option Name"
}

WHEN GOAL IS COMPLETE:

{
  "thought": "The goal has been achieved",
  "status": "done",
  "actions": []
}
`
        : `
Analyze this screen.
It contains sensitive information and faces redacted with black boxes.
Describe the primary purpose of the page.
`;


    /*
      11. SEND TO SERVER
    */
    console.log(
      'Sending redacted image to local server...'
    );


    const response =
      await fetch(
        'http://localhost:3000/api/analyze',
        {
          method: 'POST',

          headers: {
            'Content-Type':
              'application/json'
          },

          body: JSON.stringify({
            imageBase64:
              redactedDataUrl,

            prompt:
              promptString
          })
        }
      );


    if (!response.ok) {

      throw new Error(
        `Server returned ${response.status}`
      );
    }


    const data =
      await response.json();


    return {
      success: true,

      image:
        redactedDataUrl,

      analysis:
        data.result
    };

  }

  catch (error) {

    console.error(
      'Error in capture flow:',
      error
    );


    /*
      Best effort cleanup
    */
    chrome.tabs.sendMessage(
      tabId,
      {
        action: 'removeMasks'
      }
    ).catch(() => {});


    return {
      success: false,
      error: error.message
    };
  }
}