import { initializeCinematicIntro } from './cinematic.js';


const captureBtn =
  document.getElementById('captureBtn');

const status =
  document.getElementById('status');

const userCommand =
  document.getElementById('userCommand');


/* =========================================================
   POPUP UI
   ========================================================= */

function setAgentUI(state) {

  if (!captureBtn || !status) {
    return;
  }


  /*
    AGENT RUNNING
  */
  if (state.running) {

    captureBtn.disabled = true;

    /*
      Show current operation inside button
    */
    if (
      state.status === 'running'
    ) {

      if (
        state.message &&
        state.message.toLowerCase().includes(
          'executing'
        )
      ) {

        captureBtn.innerText =
          'Executing...';

      } else {

        captureBtn.innerText =
          'Analyzing...';
      }

    } else {

      captureBtn.innerText =
        'Analyzing...';
    }


    /*
      Status message below button
    */
    status.innerText =
      state.message ||
      'Agent Loop Started in Background! You can close this popup.';

    return;
  }


  /*
    AGENT COMPLETED
  */
  if (
    state.status === 'completed'
  ) {

    captureBtn.disabled = false;

    captureBtn.innerText =
      'Start Agent';

    status.innerText =
      '✨ Task completed successfully!';

    return;
  }


  /*
    AGENT ERROR
  */
  if (
    state.status === 'error'
  ) {

    captureBtn.disabled = false;

    captureBtn.innerText =
      'Start Agent';

    status.innerText =
      state.message ||
      'Agent stopped because something went wrong.';

    return;
  }


  /*
    IDLE
  */
  captureBtn.disabled = false;

  captureBtn.innerText =
    'Start Agent';

  status.innerText =
    state.message || '';
}


/* =========================================================
   GET CURRENT AGENT STATE
   ========================================================= */

function loadAgentState() {

  chrome.runtime.sendMessage(
    {
      action: 'getAgentStatus'
    },
    (response) => {

      if (
        chrome.runtime.lastError
      ) {

        console.log(
          'Could not get agent status:',
          chrome.runtime.lastError.message
        );

        return;
      }


      if (
        response &&
        response.success
      ) {

        setAgentUI(
          response.state
        );
      }
    }
  );
}


/* =========================================================
   START AGENT
   ========================================================= */

captureBtn.addEventListener(
  'click',
  async () => {

    /*
      Extra protection against double-clicking.
    */
    if (
      captureBtn.disabled
    ) {
      return;
    }


    const command =
      userCommand.value.trim();


    if (!command) {

      status.innerText =
        'Please enter a task for the agent first.';

      return;
    }


    /*
      Immediately disable button locally.

      This makes the UI react instantly before
      background.js responds.
    */
    captureBtn.disabled = true;

    captureBtn.innerText =
      'Analyzing...';

    status.innerText =
      'Agent Loop Started in Background! You can close this popup.';


    chrome.runtime.sendMessage(
      {
        action:
          'startAgentLoop',

        command:
          command
      },

      (response) => {

        /*
          Chrome runtime error
        */
        if (
          chrome.runtime.lastError
        ) {

          console.error(
            'Agent start error:',
            chrome.runtime.lastError.message
          );

          setAgentUI({
            running: false,
            status: 'error',
            message:
              'Could not start the agent.'
          });

          return;
        }


        /*
          Background rejected start
        */
        if (
          !response ||
          !response.success
        ) {

          setAgentUI({
            running: false,
            status: 'error',
            message:
              response?.error ||
              'The agent could not be started.'
          });

          return;
        }


        console.log(
          'Agent started.'
        );

        /*
          Background is now the source of truth.
        */
        loadAgentState();
      }
    );
  }
);


/* =========================================================
   REFRESH STATUS WHEN POPUP OPENS
   ========================================================= */

loadAgentState();


/*
  Keep checking while popup is open.

  This allows:
  Analyzing...
       ↓
  Executing...
       ↓
  Analyzing...
       ↓
  Completed
*/
const statusPoller =
  setInterval(
    loadAgentState,
    500
  );


/*
  Stop polling when popup closes.
*/
window.addEventListener(
  'unload',
  () => {
    clearInterval(
      statusPoller
    );
  }
);


/* =========================================================
   CINEMATIC INTRO
   ========================================================= */

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    initializeCinematicIntro
  );

} else {

  initializeCinematicIntro();
}