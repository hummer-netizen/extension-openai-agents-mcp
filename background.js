// background.js — Position popup as floating widget, auto-open on session start

// Style the popup container
browser.browserAction.setPopupStyles({
  backgroundColor: "#FFFFFF00",
  borderRadius: "20px",
});

// Size and position (bottom-right corner)
browser.browserAction.resizePopup(420, 620);
browser.browserAction.setPopupPosition({
  bottom: "30px",
  right: "30px",
});

// Detach from the toolbar into a floating widget
browser.browserAction.detachPopup();

// Auto-open on session start
browser.browserAction.openPopup();

console.log("[OpenAI Agent] Extension loaded, popup positioned.");
