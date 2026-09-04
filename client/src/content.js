console.log('SIH Vision Agent: Content script injected.');

let activeMasks = [];

// Helper to find sensitive DOM elements
function getSensitiveElements() {

  const elements = [];

  // 1. Password inputs
  document
    .querySelectorAll('input[type="password"]')
    .forEach(el => elements.push(el));

  // 2. Elements with sensitive IDs/Classes
  const sensitiveSelectors = [
    '[id*="credit"]',
    '[id*="card"]',
    '[name*="card"]',
    '[class*="ssn"]',
    '[id*="ssn"]',
    '[type="email"]'
  ];

  document
    .querySelectorAll(sensitiveSelectors.join(','))
    .forEach(el => {
      elements.push(el);
    });

  return elements;
}

// Draw black boxes over sensitive elements
function maskSensitiveElements() {

  const elements = getSensitiveElements();
  const masks = [];

  elements.forEach(el => {

    const rect = el.getBoundingClientRect();

    if (
      rect.width === 0 ||
      rect.height === 0
    ) {
      return;
    }

    const mask = document.createElement('div');

    mask.style.position = 'absolute';

    mask.style.left =
      `${rect.left + window.scrollX}px`;

    mask.style.top =
      `${rect.top + window.scrollY}px`;

    mask.style.width =
      `${rect.width}px`;

    mask.style.height =
      `${rect.height}px`;

    mask.style.backgroundColor = 'black';

    mask.style.zIndex = '999999';

    mask.className = 'sih-privacy-mask';

    document.body.appendChild(mask);

    masks.push(mask);
  });

  return masks;
}

function removeMasks(masks) {
  masks.forEach(mask => mask.remove());
}

// State
let privacyMasks = [];
let actionMarkers = [];
let interactiveElements = new Map();

// Main message listener
chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    if (message.action === 'applyMasks') {

      applyPrivacyMasks();
      applyActionMarkers();

      sendResponse({ success: true });

    } else if (message.action === 'removeMasks') {

      removePrivacyMasks();
      removeActionMarkers();

      sendResponse({ success: true });

    } else if (message.action === 'executeAction') {

      executeAction(message.command)
        .then(sendResponse);

      return true;

    } else if (message.action === 'showPreview') {

      showPreview(message.image);

      sendResponse({ success: true });
    }
  }
);

/*
  SET OF MARKS

  Added:
  - select

  This means dropdowns now receive numbered markers.
*/
function applyActionMarkers() {

  // Clear old mapping before creating a new one
  interactiveElements.clear();

  const elements = document.querySelectorAll(
    `
      a,
      button,
      input,
      textarea,
      select,
      [role="button"],
      [role="combobox"]
    `
  );

  let idCounter = 1;

  elements.forEach(el => {

    const rect = el.getBoundingClientRect();

    // Mark only visible elements inside viewport
    if (
      rect.width > 0 &&
      rect.height > 0 &&
      rect.top >= 0 &&
      rect.top <= window.innerHeight
    ) {

      const marker = document.createElement('div');

      marker.innerText = idCounter;

      marker.style.position = 'absolute';

      marker.style.top =
        `${rect.top + window.scrollY}px`;

      marker.style.left =
        `${rect.left + window.scrollX}px`;

      marker.style.backgroundColor = 'red';

      marker.style.color = 'white';

      marker.style.fontSize = '12px';

      marker.style.fontWeight = 'bold';

      marker.style.padding = '2px 4px';

      marker.style.borderRadius = '3px';

      marker.style.zIndex = '999998';

      marker.style.pointerEvents = 'none';

      marker.className = 'sih-action-marker';

      document.body.appendChild(marker);

      actionMarkers.push(marker);

      interactiveElements.set(
        idCounter,
        el
      );

      idCounter++;
    }
  });

  console.log(
    `[Set-of-Marks] Marked ${interactiveElements.size} interactive elements`
  );
}

function removeActionMarkers() {

  actionMarkers.forEach(
    marker => marker.remove()
  );

  actionMarkers = [];
}

/*
  EXECUTE ACTION

  Supports:

  1. click
  2. type
  3. select  <-- NEW
*/
async function executeAction(command) {

  try {

    if (!command || !command.action) {

      return {
        success: false,
        error: 'Invalid action command'
      };
    }

    const elementId = Number(command.element_id);

    /*
      CLICK
    */
    if (
      command.action === 'click' &&
      elementId
    ) {

      const el = interactiveElements.get(
        elementId
      );

      if (!el) {

        return {
          success: false,
          error: `Element ${elementId} not found`
        };
      }

      el.focus?.();
      el.click();

      return {
        success: true,
        message: `Clicked element ${elementId}`
      };
    }

    /*
      TYPE
    */
    else if (
      command.action === 'type' &&
      elementId
    ) {

      const el = interactiveElements.get(
        elementId
      );

      if (!el) {

        return {
          success: false,
          error: `Element ${elementId} not found`
        };
      }

      if (
        !('value' in el)
      ) {

        return {
          success: false,
          error: `Element ${elementId} does not support typing`
        };
      }

      el.focus();

      // Clear previous value and type new value
      el.value = command.text_to_type || '';

      // Trigger events so React/Angular/Vue websites detect changes
      el.dispatchEvent(
        new Event('input', {
          bubbles: true
        })
      );

      el.dispatchEvent(
        new Event('change', {
          bubbles: true
        })
      );

      /*
        Optional Enter key.

        Preserving existing project behavior.
      */
      el.dispatchEvent(
        new KeyboardEvent(
          'keydown',
          {
            key: 'Enter',
            code: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true
          }
        )
      );

      return {
        success: true,
        message: `Typed into element ${elementId}`
      };
    }

    /*
      SELECT
      NEW ACTION

      Supports:
      - <select>
      - matching option by visible text
      - matching option by value
    */
    else if (
      command.action === 'select' &&
      elementId
    ) {

      const el = interactiveElements.get(
        elementId
      );

      if (!el) {

        return {
          success: false,
          error: `Element ${elementId} not found`
        };
      }

      if (el.tagName !== 'SELECT') {

        return {
          success: false,
          error: `Element ${elementId} is not a native select dropdown`
        };
      }

      const requestedOption =
        (command.option_text || '')
          .trim()
          .toLowerCase();

      if (!requestedOption) {

        return {
          success: false,
          error: 'No option_text provided for select action'
        };
      }

      const options = Array.from(el.options);

      /*
        First try exact match
      */
      let matchingOption = options.find(
        option =>
          option.text
            .trim()
            .toLowerCase() === requestedOption ||

          option.value
            .trim()
            .toLowerCase() === requestedOption
      );

      /*
        If exact match fails,
        try partial text match
      */
      if (!matchingOption) {

        matchingOption = options.find(
          option =>
            option.text
              .trim()
              .toLowerCase()
              .includes(requestedOption) ||

            requestedOption.includes(
              option.text
                .trim()
                .toLowerCase()
            )
        );
      }

      if (!matchingOption) {

        return {
          success: false,
          error:
            `Option "${command.option_text}" not found`
        };
      }

      el.focus();

      el.value = matchingOption.value;

      /*
        Trigger browser/framework events
      */
      el.dispatchEvent(
        new Event('input', {
          bubbles: true
        })
      );

      el.dispatchEvent(
        new Event('change', {
          bubbles: true
        })
      );

      return {
        success: true,
        message:
          `Selected "${matchingOption.text}" in element ${elementId}`
      };
    }

    return {
      success: false,
      error: `Unknown or unsupported action: ${command.action}`
    };

  } catch (error) {

    console.error(
      '[Action Executor] Error:',
      error
    );

    return {
      success: false,
      error: error.message
    };
  }
}

/*
  FLOATING REDACTED SCREENSHOT PREVIEW
*/
function showPreview(image) {

  let previewBox =
    document.getElementById(
      'sih-preview-box'
    );

  if (!previewBox) {

    previewBox =
      document.createElement('div');

    previewBox.id =
      'sih-preview-box';

    previewBox.style.position =
      'fixed';

    previewBox.style.bottom =
      '20px';

    previewBox.style.right =
      '20px';

    previewBox.style.width =
      '300px';

    previewBox.style.backgroundColor =
      'white';

    previewBox.style.border =
      '2px solid #1a73e8';

    previewBox.style.borderRadius =
      '8px';

    previewBox.style.boxShadow =
      '0 4px 12px rgba(0,0,0,0.3)';

    previewBox.style.zIndex =
      '9999999';

    previewBox.style.padding =
      '8px';

    const title =
      document.createElement('div');

    title.innerText =
      'AI Vision (Redacted)';

    title.style.fontWeight =
      'bold';

    title.style.marginBottom =
      '8px';

    title.style.color =
      '#1a73e8';

    title.style.fontSize =
      '14px';

    const img =
      document.createElement('img');

    img.id =
      'sih-preview-img';

    img.style.width =
      '100%';

    img.style.borderRadius =
      '4px';

    previewBox.appendChild(title);
    previewBox.appendChild(img);

    document.body.appendChild(
      previewBox
    );
  }

  document.getElementById(
    'sih-preview-img'
  ).src = image;
}

function applyPrivacyMasks() {
  activeMasks = maskSensitiveElements();
}

function removePrivacyMasks() {
  removeMasks(activeMasks);
  activeMasks = [];
}