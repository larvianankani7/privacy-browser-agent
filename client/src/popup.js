import { initializeCinematicIntro } from './cinematic.js';

document.getElementById('captureBtn').addEventListener('click', async () => {
  const status = document.getElementById('status');
  const userCommand = document.getElementById('userCommand').value;

  status.innerText = 'Agent Loop Started in Background! You can close this popup.';

  chrome.runtime.sendMessage(
    {
      action: 'startAgentLoop',
      command: userCommand
    },
    (response) => {
      if (response && response.success) {
        console.log("Agent started.");
      }
    }
  );
});

// Initialize cinematic
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeCinematicIntro);
} else {
    initializeCinematicIntro();
}
